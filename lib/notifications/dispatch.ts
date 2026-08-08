import "server-only";
import { sendOrderNotificationEmail } from "@/lib/email";
import { sendOwnerWhatsApp } from "@/lib/whatsapp";
import type { EmailType } from "@/lib/email/types";

// ── Best-effort external notification dispatch (Milestone 4) ────────────────
// The AUTHORITATIVE, atomic in-app notification is written by the
// update_order_status() RPC directly into the `notifications` table in the
// same transaction as the status change — that record can never be lost.
//
// This module is a SEPARATE, best-effort fan-out to external channels
// (email today; WhatsApp/web-push/mobile-push are stubbed for later), called
// from the API route layer AFTER the RPC has already committed — the same
// "DB write first, side-channel notify second" pattern this codebase already
// uses for sendBookingEmails(). A channel failing here never fails the
// request and never rolls back the order status change.
export interface NotificationEvent {
  recipientType: "merchant" | "customer";
  recipientEmail?: string | null;
  orderNumber: string;
  type: "order_status_changed" | "order_created";
  title: string;
  body: string;
  /** Extra key/value rows for the email's detail card (items, totals, deadlines). */
  details?: [string, string][];
  /** Action button for the email (dashboard / tracking link). */
  cta?: { url: string; label: string };
  /**
   * Restrict this event to specific channels. Needed by the order-placed
   * fan-out: one email event PER staff member, but the WhatsApp owner ping
   * must fire exactly once per order — not once per staff member.
   */
  channels?: ChannelName[];
  /**
   * Routing type for the email channel (M41). One template serves the whole
   * order lifecycle, but "order placed", "payment confirmed" and "order
   * expired" are different email types with different priorities — so the
   * caller, which knows WHICH event this is, names it.
   */
  emailType?: EmailType;
  /**
   * Stable per-event key, e.g. `marketplace_order_status:<orderId>:accepted`.
   *
   * This is a SECOND layer under the M17 claim, not a replacement for it, and it
   * fixes a real gap the claim leaves: when a customer send fails, M17 releases
   * the whole claim so the order is re-swept — which previously re-emailed every
   * merchant staff member who had already been told. Per-recipient keys mean the
   * retry reaches only whoever was actually missed.
   */
  idempotencyKey?: string | null;
  orderId?: string | null;
}

export type ChannelName = "email" | "whatsapp" | "web-push" | "mobile-push";

interface NotificationChannel {
  name: ChannelName;
  send(event: NotificationEvent): Promise<boolean>;
}

const emailChannel: NotificationChannel = {
  name: "email",
  async send(event) {
    if (!event.recipientEmail) return false;
    return sendOrderNotificationEmail({
      to: event.recipientEmail,
      subject: event.title,
      heading: event.title,
      message: event.body,
      orderNumber: event.orderNumber,
      details: event.details,
      cta: event.cta,
      type: event.emailType,
      idempotencyKey: event.idempotencyKey ?? null,
      orderId: event.orderId ?? null,
    });
  },
};

// LIMITATION: sendOwnerWhatsApp only ever reaches the single site-owner
// number configured in app_secrets/env — there is no per-merchant WhatsApp
// number stored anywhere in the schema. So this channel is really "ping the
// site owner about marketplace activity," not "message this merchant." It
// still fires only for recipientType === "merchant" (never for customers,
// which sendOwnerWhatsApp structurally cannot do) so the intent stays
// correct even though the destination is coarser than the abstraction implies.
const whatsappChannel: NotificationChannel = {
  name: "whatsapp",
  async send(event) {
    if (event.recipientType !== "merchant") return false;
    return sendOwnerWhatsApp(`[Order ${event.orderNumber}] ${event.title}\n${event.body}`);
  },
};

// Not implemented yet — wired into the dispatcher now so adding a real
// implementation later doesn't require touching every call site.
const webPushChannel: NotificationChannel = {
  name: "web-push",
  async send() {
    return false;
  },
};

const mobilePushChannel: NotificationChannel = {
  name: "mobile-push",
  async send() {
    return false;
  },
};

const CHANNELS: NotificationChannel[] = [emailChannel, whatsappChannel, webPushChannel, mobilePushChannel];

/**
 * Best-effort fan-out across every (or the event's chosen) channel. Never
 * throws. Returns true when at least one channel actually delivered — M17's
 * order-placed claim uses this to decide whether to keep or release the claim;
 * every earlier caller ignores the return value, exactly as before.
 */
export async function dispatchNotification(event: NotificationEvent): Promise<boolean> {
  const channels = event.channels ? CHANNELS.filter((c) => event.channels!.includes(c.name)) : CHANNELS;
  const results = await Promise.allSettled(
    channels.map((channel) =>
      channel.send(event).catch((err) => {
        console.error(`notification channel "${channel.name}" failed`, err);
        return false;
      }),
    ),
  );
  return results.some((r) => r.status === "fulfilled" && r.value === true);
}
