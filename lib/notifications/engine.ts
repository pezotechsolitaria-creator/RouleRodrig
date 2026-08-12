import "server-only";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { pushToCustomer, pushToDriverEndpoints } from "@/lib/push/send";
import { enqueueNotification, formatWhatsAppMessage } from "./queue";
import { dispatchNotification } from "./dispatch";
import type { EmailType } from "@/lib/email/types";
import { templateFor, type NotificationType, type TemplateContext } from "./registry";

// ── The notification engine ────────────────────────────────────────────────
//
//   domain event → notify() → recipients → channels → dispatch → record
//
// One call site per business event, instead of sendEmail/sendPush/sendWhatsApp
// scattered through the app (§19). The caller says WHAT happened and to WHOM;
// the registry decides how loud it is and which channels are allowed; this
// module does the sending.
//
// EMAIL IS DELEGATED, NOT DUPLICATED. dispatchNotification owns provider
// failover, the daily quota ceiling, templates and per-recipient idempotency.
// The engine calls it with channels:["email"] rather than reimplementing any of
// that, so there is one email path, not two that drift.
//
// The twelve existing dispatchNotification call sites still call it directly.
// That is deliberate: each one must be moved deliberately, verifying its
// emailType maps to the right template, because the failure mode is silent —
// a customer simply never receives their receipt.

export type NotifyTarget = {
  /** Signed-in recipient. Required for the in-app feed — it is keyed on auth.uid(). */
  userId?: string | null;
  /**
   * Guest recipient. Guests have no account, and guest checkout is the default
   * path here, so push is keyed on the email their order carries.
   */
  email?: string | null;
  /** A driver, for the push endpoints attached to their delivery. */
  driverEndpoints?: { endpoint: string; p256dh: string; auth: string }[];
  /** WhatsApp, when the recipient has their own CallMeBot key configured. */
  whatsapp?: { phone: string; apiKey: string }[];
};

export type NotifyResult = {
  /** False when this exact event was already delivered — see the dedupe note below. */
  fresh: boolean;
  inApp: boolean;
  pushed: number;
  whatsapp: number;
  emailed: boolean;
};

const NOTHING: NotifyResult = { fresh: false, inApp: false, pushed: 0, whatsapp: 0, emailed: false };

/** Emails need a full URL; every link in the registry is a path. */
function absoluteUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://roulerodrig.com";
  return path.startsWith("http") ? path : `${base}${path}`;
}

/**
 * Raise a notification for a domain event.
 *
 * `dedupeKey` is required, not optional. That is the whole of §17: the in-app
 * insert carries a unique constraint on it, so a cron that runs twice or a
 * webhook that retries writes ONE row. When the insert reports the row already
 * existed, every other channel is skipped too — which is why a duplicate
 * webhook cannot produce twenty identical pushes.
 */
export async function notify(
  type: NotificationType,
  target: NotifyTarget,
  ctx: TemplateContext,
  opts: {
    dedupeKey: string;
    orderId?: string | null;
    /**
     * Rich email content, when the caller has better copy than a template can
     * hold.
     *
     * This is what makes migrating existing senders SAFE. The order lifecycle
     * emails are hand-written per event, carry a detail table, and pick their
     * CTA based on whether the buyer is a guest — a guest cannot open
     * /orders/[id], which filters on customer_id = auth.uid(). Flattening all
     * of that into a registry one-liner would have been a visible downgrade to
     * the highest-value mail the marketplace sends.
     *
     * The registry still decides WHETHER email is allowed, the priority, and
     * every other channel. This only overrides what the message says.
     */
    email?: {
      subject?: string;
      title?: string;
      body?: string;
      details?: [string, string][];
      cta?: { url: string; label: string };
      emailType?: string;
      /** Overrides the derived key when a caller already has a stable one. */
      idempotencyKey?: string;
    };
  },
): Promise<NotifyResult> {
  try {
    if (!hasServiceRole()) return NOTHING;
    const t = templateFor(type);
    const admin = await getPrivileged();

    const title = t.title(ctx);
    const body = t.body(ctx);
    const link = t.link(ctx);

    // ── 1. In-app, which is also the idempotency gate ──────────────────────
    let fresh = true;
    let inApp = false;

    if (t.channels.includes("in_app") && target.userId) {
      const { data, error } = await admin.rpc("emit_notification", {
        p_recipient_id: target.userId,
        p_recipient_type: t.audience,
        p_type: type,
        p_title: title,
        p_body: body,
        p_category: t.category,
        p_priority: t.priority,
        p_link: link,
        p_dedupe_key: opts.dedupeKey,
        p_order_id: opts.orderId ?? null,
        p_data: {},
      });
      if (error) {
        console.error("emit_notification failed", { type, error });
      } else if (data) {
        inApp = true;
      } else {
        // Null means one of two things, and both mean "send nothing else":
        // the key already existed (duplicate event), or the recipient muted
        // this category at a non-critical priority.
        fresh = false;
      }
    }

    if (!fresh) return { ...NOTHING, fresh: false };

    // ── 2. Push ────────────────────────────────────────────────────────────
    // pushBody exists so the lock screen can say less than the app does. Money,
    // failures and identities stay behind authentication (§16).
    const pushPayload = {
      title,
      body: t.pushBody ? t.pushBody(ctx) : body,
      url: link,
      // Per subject, so a burst about one order replaces itself instead of
      // stacking five entries in the tray.
      tag: `${t.category}:${ctx.id ?? ctx.ref ?? type}`,
      urgent: t.priority === "critical" || t.priority === "high",
    };

    let pushed = 0;
    if (t.channels.includes("push")) {
      if (target.driverEndpoints?.length) {
        pushed += await pushToDriverEndpoints(target.driverEndpoints, pushPayload);
      }
      if (target.userId || target.email) {
        pushed += await pushToCustomer(
          { userId: target.userId ?? null, email: target.email ?? null },
          pushPayload,
        );
      }
    }

    // ── 3. WhatsApp ────────────────────────────────────────────────────────
    // Queued rather than sent inline: CallMeBot is slow and occasionally
    // refuses, and the queue already owns retries, backoff and its own dedupe.
    let whatsapp = 0;
    if (t.channels.includes("whatsapp")) {
      const queued = await enqueueNotification({
        type,
        category: t.category,
        message: formatWhatsAppMessage({ title, lines: [body] }),
        dedupeKey: `wa:${opts.dedupeKey}`,
        orderId: opts.orderId ?? undefined,
        payload: { link },
      });
      whatsapp = queued;
    }

    // ── 4. Email ───────────────────────────────────────────────────────────
    // DELEGATED, not reimplemented. dispatchNotification already owns provider
    // failover (Brevo → Resend), the quota ceiling, templates and per-recipient
    // idempotency keys. Rebuilding any of that here would give the platform two
    // email paths that drift; calling it with channels:["email"] gives the
    // engine one entry point without a second implementation.
    let emailed = false;
    if (t.channels.includes("email") && target.email) {
      const e = opts.email;
      const sent = await dispatchNotification({
        recipientType: t.audience === "merchant" ? "merchant" : "customer",
        recipientEmail: target.email,
        orderNumber: ctx.ref ?? opts.dedupeKey,
        type: "order_status_changed",
        title: e?.title ?? title,
        body: e?.body ?? body,
        details: e?.details,
        channels: ["email"],
        emailType: (e?.emailType ?? t.emailType) as EmailType | undefined,
        // The caller's CTA wins: only it knows whether this buyer can open a
        // signed-in page.
        cta: e?.cta ?? { url: absoluteUrl(link), label: "View details" },
        // Same key as the in-app row, so a retried event cannot re-email even
        // if the in-app insert is later removed.
        idempotencyKey: e?.idempotencyKey ?? `email:${opts.dedupeKey}`,
        orderId: opts.orderId ?? null,
      });
      emailed = Boolean(sent);
    }

    return { fresh: true, inApp, pushed, whatsapp, emailed };
  } catch (err) {
    // A notification must never fail the transaction that caused it. Every
    // caller sits downstream of an already-committed write.
    console.error("notify failed", { type, err });
    return NOTHING;
  }
}
