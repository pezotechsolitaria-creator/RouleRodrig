import "server-only";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";

// ── Enqueue: the only thing business code should ever call ──────────────────
//
// The rule this enforces: a notification must NEVER be able to fail, slow, or
// roll back the thing that caused it. Today /api/merchant/orders/[id] awaits a
// send inside the request and swallows the error — honest, but if the provider
// blinks the customer is simply never told, and nothing remembers to retry.
//
// enqueueNotification() writes a row and returns. The cron worker delivers it.
// A provider outage leaves rows pending instead of losing the message.

// Category constants moved to ./categories so CLIENT components can import
// them without dragging this server-only module (and the service-role client)
// into the browser bundle. Re-exported here so every existing server-side
// import keeps working unchanged.
export {
  NOTIFICATION_CATEGORIES,
  isNotificationCategory,
  CATEGORY_LABEL,
} from "./categories";
export type { NotificationCategory } from "./categories";
import type { NotificationCategory } from "./categories";

export type EnqueueInput = {
  /** Machine event name, e.g. "order.placed" or "delivery.offered". */
  type: string;
  category: NotificationCategory;
  message: string;
  payload?: Record<string, unknown>;
  /**
   * Idempotency. Supply a stable key derived from the real-world event
   * ("order.placed:<orderId>") and a retried caller cannot produce a second
   * WhatsApp message. The database appends the slot id, so fan-out to three
   * recipients is three messages but a repeat is still zero.
   */
  dedupeKey?: string;
  orderId?: string;
  bookingId?: string;
};

/**
 * Queue a message for every active slot subscribed to this category.
 *
 * Returns the number of recipients queued, or 0 when the queue is unavailable.
 * NEVER throws: a caller in the middle of a checkout must not be brought down
 * by the notification layer, which is the entire reason this indirection
 * exists. Failures are logged and swallowed on purpose.
 */
export async function enqueueNotification(input: EnqueueInput): Promise<number> {
  if (!hasServiceRole()) {
    // Local dev has no service key — see rr-local-dev-gotchas. Say so once
    // rather than failing the caller.
    console.warn("enqueueNotification skipped: SUPABASE_SERVICE_ROLE_KEY is unset");
    return 0;
  }
  try {
    const admin = await getPrivileged();
    const { data, error } = await admin.rpc("enqueue_notification", {
      p_type: input.type,
      p_category: input.category,
      p_message: input.message,
      p_payload: input.payload ?? {},
      p_dedupe_key: input.dedupeKey ?? null,
      p_order_id: input.orderId ?? null,
      p_booking_id: input.bookingId ?? null,
    });
    if (error) {
      console.error("enqueue_notification failed", { type: input.type, error });
      return 0;
    }
    const queued = (data as number | null) ?? 0;
    if (queued < 0) {
      // M118. -1 is NOT "nothing to do". It is "no active slot takes this
      // category", so this message reached nobody and neither will the next
      // one. Distinct from 0, which means the recipients already had it — and
      // 0 needs no log here, because the row that won the dedupe key now
      // carries suppressed_count and /admin/notifications renders it.
      //
      // This is not hypothetical: on 2026-08-09 the ticketing-reserve alarm was
      // raised into a database with zero notification_slots, returned 0 with no
      // error, and was destroyed after its once-per-day claim had been spent.
      //
      // Routed to Sentry rather than a new channel — Sentry is already what
      // gets watched, and already scrubs. A category name is not PII.
      console.error("enqueue_notification: no active slot takes this category", {
        type: input.type,
        category: input.category,
      });
      // Imported lazily on purpose. A static import pulls @sentry/nextjs into
      // every module graph that reaches this file — and one of them is
      // lib/email/send.ts -> alerts.ts -> here, which pushed lib/email's test
      // import past its 30s budget. This branch is a misconfiguration, so the
      // cost of resolving it here is irrelevant.
      try {
        const Sentry = await import("@sentry/nextjs");
        Sentry.captureMessage(
          `notification dropped: no active slot takes category "${input.category}"`,
          {
            level: "error",
            tags: { check: "notification-enqueue", notification_category: input.category },
          },
        );
      } catch {
        // Sentry unavailable (local dev, or the SDK failed to load). The
        // console.error above is still on the record.
      }
      // Normalised, so the public contract stays exactly "how many recipients
      // were queued". No caller learns a new number, and none has to.
      return 0;
    }
    return queued;
  } catch (err) {
    console.error("enqueue_notification threw", err);
    return 0;
  }
}

// ── Message templates ───────────────────────────────────────────────────────
//
// WhatsApp has no subject line and is read on a lock screen, so the first line
// has to carry the whole meaning. Kept here rather than at the call sites so
// every alert reads like the same product.

export function formatWhatsAppMessage(opts: {
  title: string;
  lines?: (string | null | undefined)[];
  action?: string;
}): string {
  const body = (opts.lines ?? []).filter(Boolean).join("\n");
  return [opts.title, body, opts.action].filter(Boolean).join("\n\n");
}
