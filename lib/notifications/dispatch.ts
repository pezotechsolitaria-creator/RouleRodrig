import { sendOrderNotificationEmail } from "@/lib/email";
import { sendOwnerWhatsApp } from "@/lib/whatsapp";

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
}

interface NotificationChannel {
  name: string;
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

/** Fire-and-forget fan-out across every channel. Never throws. */
export async function dispatchNotification(event: NotificationEvent): Promise<void> {
  await Promise.allSettled(
    CHANNELS.map((channel) =>
      channel.send(event).catch((err) => {
        console.error(`notification channel "${channel.name}" failed`, err);
        return false;
      }),
    ),
  );
}
