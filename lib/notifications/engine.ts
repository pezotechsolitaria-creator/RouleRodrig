import "server-only";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { pushToCustomer, pushToDriverEndpoints } from "@/lib/push/send";
import { enqueueNotification, formatWhatsAppMessage } from "./queue";
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
// SCOPE, STATED HONESTLY. This engine owns in-app, push and WhatsApp. Email
// still flows through the existing `dispatchNotification` router, which already
// owns templates, provider failover and per-recipient idempotency keys. Routing
// email through here too would mean either duplicating that router or
// double-sending from the twelve call sites that already use it. Migrating
// those is a separate, reversible step — not something to do blind.

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
};

const NOTHING: NotifyResult = { fresh: false, inApp: false, pushed: 0, whatsapp: 0 };

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
  opts: { dedupeKey: string; orderId?: string | null },
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

    return { fresh: true, inApp, pushed, whatsapp };
  } catch (err) {
    // A notification must never fail the transaction that caused it. Every
    // caller sits downstream of an already-committed write.
    console.error("notify failed", { type, err });
    return NOTHING;
  }
}
