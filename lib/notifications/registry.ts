import { NOTIFICATION_CATEGORIES } from "./categories";

// ── The notification registry ──────────────────────────────────────────────
//
// One place that answers, for every event the platform can raise: who cares,
// how loudly, through which channels, what it says, and where tapping it goes.
//
// WHY A TYPESCRIPT MODULE AND NOT A DATABASE TABLE. Templates in a table are
// for products where non-engineers edit copy. Nobody but the owner and I edit
// this copy, and a table buys real costs: an un-typed `params` bag, a runtime
// fetch on every send, no diff in code review, and the permanent possibility of
// a template existing in production but not in staging. A module is
// type-checked, versioned with the code that raises the event, and free to read.
//
// Adding an event = adding one entry here. Nothing else in the system needs to
// learn about it.

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/**
 * Severity. Drives channel choice, ordering, and whether muting applies.
 * `critical` deliberately ignores a user's mute — someone who silenced
 * "payments" still has to learn that their payment failed.
 */
export type NotificationPriority = "low" | "normal" | "high" | "critical";

export type NotificationChannel = "in_app" | "push" | "email" | "whatsapp";

export type NotificationAudience = "customer" | "merchant" | "driver" | "admin" | "organizer";

export type TemplateContext = {
  /** Order number, booking ref, ticket code — whatever the human recognises. */
  ref?: string | null;
  storeName?: string | null;
  driverName?: string | null;
  amount?: string | null;
  when?: string | null;
  /** Resource id used to build the deep link. */
  id?: string | null;
  extra?: string | null;
};

export type NotificationTemplate = {
  audience: NotificationAudience;
  category: NotificationCategory;
  priority: NotificationPriority;
  /**
   * Channels this event is ALLOWED to use. The engine narrows further using
   * preferences and what the recipient actually has configured — this is the
   * ceiling, not the plan.
   *
   * Email appears on roughly a third of these on purpose. The free tier is
   * ~400 messages a day across Brevo and Resend, shared with Supabase's own
   * auth mail; emailing every status change would exhaust it and take password
   * resets down with it. Email is for records, not for progress.
   */
  channels: NotificationChannel[];
  title: (c: TemplateContext) => string;
  body: (c: TemplateContext) => string;
  /**
   * What the PUSH says, when it must say less than the in-app entry.
   *
   * A push notification renders on a locked screen that anyone holding the
   * phone can read, and it travels through Google's or Apple's infrastructure.
   * Money, failures and identities belong behind authentication (§16), so those
   * events push a lead and nothing more.
   */
  pushBody?: (c: TemplateContext) => string;
  /** Deep link. A notification that doesn't land on its subject is an interruption. */
  link: (c: TemplateContext) => string;
};

const money = (c: TemplateContext) => c.amount ?? "your payment";
const ref = (c: TemplateContext) => c.ref ?? "your order";

// ── Customer ───────────────────────────────────────────────────────────────
const CUSTOMER = {
  "order.placed": {
    audience: "customer",
    category: "payments",
    priority: "high",
    // Email here IS the receipt — the one durable record of the transaction.
    channels: ["in_app", "push", "email"],
    title: () => "Order received",
    body: (c) => `We've got order ${ref(c)}. You'll hear from us as it moves.`,
    link: (c) => (c.id ? `/orders/${c.id}` : "/orders"),
  },
  "order.payment_confirmed": {
    audience: "customer",
    category: "payments",
    priority: "high",
    channels: ["in_app", "push", "email"],
    title: () => "Payment confirmed",
    body: (c) => `Your payment for ${ref(c)} is confirmed.`,
    // Never the amount on a lock screen.
    pushBody: () => "Tap to view your order.",
    link: (c) => (c.id ? `/orders/${c.id}` : "/orders"),
  },
  "order.payment_rejected": {
    audience: "customer",
    category: "payments",
    // Money that did not arrive is not a "normal" event, and mute must not hide it.
    priority: "critical",
    channels: ["in_app", "push", "email"],
    title: () => "Payment needs attention",
    body: (c) => `We couldn't confirm payment for ${ref(c)}. Tap to see what to do.`,
    pushBody: () => "Payment update — tap to view.",
    link: (c) => (c.id ? `/orders/${c.id}` : "/orders"),
  },
  "order.preparing": {
    audience: "customer",
    category: "bookings",
    priority: "normal",
    // No email: the customer already has the receipt, and "we started" is not a record.
    channels: ["in_app", "push"],
    title: () => "Your order is being prepared",
    body: (c) => `${c.storeName ?? "The shop"} has started on ${ref(c)}.`,
    link: (c) => (c.id ? `/orders/${c.id}` : "/orders"),
  },
  "order.ready_pickup": {
    audience: "customer",
    category: "bookings",
    priority: "high",
    // Email carries the pickup code, which they need at a counter with no signal.
    channels: ["in_app", "push", "email"],
    title: () => "Ready to collect",
    body: (c) => `${ref(c)} is ready at ${c.storeName ?? "the shop"}.`,
    link: (c) => (c.id ? `/orders/${c.id}` : "/orders"),
  },
  "delivery.driver_assigned": {
    audience: "customer",
    category: "deliveries",
    priority: "normal",
    channels: ["in_app", "push"],
    title: () => "A driver is on the way",
    body: (c) => `${c.driverName ?? "Your driver"} is collecting ${ref(c)}.`,
    link: (c) => (c.id ? `/orders/${c.id}` : "/orders/track"),
  },
  "delivery.out_for_delivery": {
    audience: "customer",
    category: "deliveries",
    priority: "high",
    channels: ["in_app", "push"],
    title: () => "On the way to you",
    body: (c) => `${c.driverName ?? "Your driver"} is bringing ${ref(c)}. Have your PIN ready.`,
    link: (c) => (c.id ? `/orders/${c.id}` : "/orders/track"),
  },
  "delivery.completed": {
    audience: "customer",
    category: "deliveries",
    priority: "normal",
    channels: ["in_app", "push"],
    title: () => "Delivered",
    body: (c) => `${ref(c)} has been delivered. Thanks for using Roulé Rodrigues.`,
    link: (c) => (c.id ? `/orders/${c.id}` : "/orders"),
  },
  "delivery.problem": {
    audience: "customer",
    category: "deliveries",
    priority: "critical",
    channels: ["in_app", "push", "email"],
    title: () => "Problem with your delivery",
    body: (c) => `Something went wrong delivering ${ref(c)}. We're on it.`,
    pushBody: () => "Delivery update — tap to view.",
    link: (c) => (c.id ? `/orders/${c.id}` : "/orders/track"),
  },
  "order.cancelled": {
    audience: "customer",
    category: "payments",
    priority: "high",
    channels: ["in_app", "push", "email"],
    title: () => "Order cancelled",
    body: (c) => `${ref(c)} has been cancelled.`,
    link: (c) => (c.id ? `/orders/${c.id}` : "/orders"),
  },
  "refund.issued": {
    audience: "customer",
    category: "payments",
    priority: "critical",
    channels: ["in_app", "push", "email"],
    title: () => "Refund issued",
    body: (c) => `A refund for ${ref(c)} is on its way.`,
    pushBody: () => "Refund update — tap to view.",
    link: (c) => (c.id ? `/orders/${c.id}` : "/orders"),
  },
  "booking.confirmed": {
    audience: "customer",
    category: "rentals",
    priority: "high",
    channels: ["in_app", "push", "email"],
    title: () => "Booking confirmed",
    body: (c) => `Booking ${ref(c)} is confirmed${c.when ? ` for ${c.when}` : ""}.`,
    link: () => "/manage-booking",
  },
  "booking.cancelled": {
    audience: "customer",
    category: "rentals",
    priority: "high",
    channels: ["in_app", "push", "email"],
    title: () => "Booking cancelled",
    body: (c) => `Booking ${ref(c)} has been cancelled.`,
    link: () => "/manage-booking",
  },
  "booking.reminder": {
    audience: "customer",
    category: "rentals",
    priority: "normal",
    // No email. They already have the confirmation; a reminder is attention,
    // not a record — and reminders are the easiest way to burn the daily quota.
    channels: ["in_app", "push"],
    title: () => "Coming up tomorrow",
    body: (c) => `Booking ${ref(c)} starts tomorrow${c.when ? ` at ${c.when}` : ""}.`,
    link: () => "/manage-booking",
  },
  "booking.payment_reminder": {
    audience: "customer",
    category: "payments",
    priority: "high",
    // Money is involved, so this one does earn an email.
    channels: ["in_app", "push", "email"],
    title: () => "Deposit still needed",
    body: (c) => `Booking ${ref(c)} isn't confirmed until the deposit is paid.`,
    pushBody: () => "Your booking needs a deposit — tap to view.",
    link: () => "/manage-booking",
  },
  "ticket.issued": {
    audience: "customer",
    category: "ticketing",
    priority: "high",
    // The email IS the ticket. Never push-only.
    channels: ["in_app", "push", "email"],
    title: () => "Your ticket is ready",
    body: (c) => `Your ticket for ${c.extra ?? "the event"} is ready to show at the gate.`,
    link: (c) => (c.id ? `/orders/${c.id}` : "/orders"),
  },
  "event.changed": {
    audience: "customer",
    category: "ticketing",
    priority: "critical",
    channels: ["in_app", "push", "email"],
    title: () => "Event details changed",
    body: (c) => `${c.extra ?? "An event you have tickets for"} has changed. Check the new details.`,
    link: (c) => (c.id ? `/events/${c.id}` : "/events"),
  },
  "event.cancelled": {
    audience: "customer",
    category: "ticketing",
    priority: "critical",
    channels: ["in_app", "push", "email"],
    title: () => "Event cancelled",
    body: (c) => `${c.extra ?? "An event you have tickets for"} has been cancelled.`,
    link: (c) => (c.id ? `/events/${c.id}` : "/events"),
  },
  "event.reminder": {
    audience: "customer",
    category: "ticketing",
    priority: "normal",
    channels: ["in_app", "push"],
    title: () => "Tomorrow",
    body: (c) => `${c.extra ?? "Your event"} is tomorrow${c.when ? ` at ${c.when}` : ""}.`,
    link: (c) => (c.id ? `/orders/${c.id}` : "/orders"),
  },
  "account.security": {
    audience: "customer",
    category: "system",
    priority: "critical",
    channels: ["in_app", "email"],
    title: () => "Security alert",
    body: (c) => c.extra ?? "There was an important change to your account.",
    link: () => "/account",
  },
} as const satisfies Record<string, NotificationTemplate>;

// ── Merchant ───────────────────────────────────────────────────────────────
const MERCHANT = {
  "merchant.order_new": {
    audience: "merchant",
    category: "payments",
    priority: "high",
    // Push + WhatsApp, no email: a merchant lives in the dashboard, and an
    // email per order is the fastest way to burn the daily quota.
    channels: ["in_app", "push", "whatsapp"],
    title: () => "New order",
    body: (c) => `Order ${ref(c)} just came in${c.amount ? ` — ${c.amount}` : ""}.`,
    pushBody: (c) => `Order ${ref(c)} — tap to view.`,
    link: () => "/merchant/orders",
  },
  "merchant.payment_received": {
    audience: "merchant",
    category: "payments",
    priority: "high",
    channels: ["in_app", "push"],
    title: () => "Payment received",
    body: (c) => `Payment confirmed for ${ref(c)}.`,
    pushBody: () => "Payment received — tap to view.",
    link: () => "/merchant/orders",
  },
  "merchant.payment_proof": {
    audience: "merchant",
    category: "payments",
    priority: "high",
    channels: ["in_app", "push"],
    title: () => "Payment proof submitted",
    body: (c) => `A customer uploaded proof of payment for ${ref(c)}. It needs checking.`,
    link: () => "/merchant/orders",
  },
  "merchant.order_cancelled": {
    audience: "merchant",
    category: "payments",
    priority: "normal",
    channels: ["in_app", "push"],
    title: () => "Order cancelled",
    body: (c) => `Order ${ref(c)} was cancelled.`,
    link: () => "/merchant/orders",
  },
  "merchant.low_stock": {
    audience: "merchant",
    category: "system",
    priority: "normal",
    channels: ["in_app", "push"],
    title: () => "Running low",
    body: (c) => `${c.extra ?? "A product"} is nearly out of stock.`,
    link: () => "/merchant/products",
  },
  "merchant.out_of_stock": {
    audience: "merchant",
    category: "system",
    priority: "high",
    channels: ["in_app", "push"],
    title: () => "Out of stock",
    body: (c) => `${c.extra ?? "A product"} is out of stock and no longer sellable.`,
    link: () => "/merchant/products",
  },
  "merchant.store_approved": {
    audience: "merchant",
    category: "system",
    priority: "high",
    channels: ["in_app", "push", "email"],
    title: () => "Your shop is live",
    body: () => "Your shop has been approved and is now visible to customers.",
    link: () => "/merchant",
  },
  "merchant.store_rejected": {
    audience: "merchant",
    category: "system",
    priority: "critical",
    channels: ["in_app", "email"],
    title: () => "Your shop needs changes",
    body: (c) => c.extra ?? "Your shop application needs attention before it can go live.",
    link: () => "/merchant",
  },
  "merchant.delivery_problem": {
    audience: "merchant",
    category: "deliveries",
    priority: "high",
    channels: ["in_app", "push"],
    title: () => "Delivery problem",
    body: (c) => `There's a problem with the delivery for ${ref(c)}.`,
    link: () => "/merchant/orders",
  },
} as const satisfies Record<string, NotificationTemplate>;

// ── Driver ─────────────────────────────────────────────────────────────────
// Never email. A driver on a scooter does not read email, and every one of
// these is worthless within the hour.
const DRIVER = {
  "driver.delivery_offered": {
    audience: "driver",
    category: "deliveries",
    priority: "critical",
    channels: ["in_app", "push", "whatsapp"],
    title: (c) => (c.amount ? `New delivery — ${c.amount}` : "New delivery available"),
    body: (c) => `Pick up from ${c.storeName ?? "a shop"}. First to accept gets it.`,
    link: () => "/driver",
  },
  "driver.delivery_assigned": {
    audience: "driver",
    category: "deliveries",
    priority: "high",
    channels: ["in_app", "push"],
    title: () => "Delivery assigned to you",
    body: (c) => `You have the job from ${c.storeName ?? "the shop"}.`,
    link: () => "/driver",
  },
  "driver.pickup_reminder": {
    audience: "driver",
    category: "deliveries",
    priority: "high",
    channels: ["in_app", "push", "whatsapp"],
    title: () => "Pickup is due",
    body: (c) => `The order at ${c.storeName ?? "the shop"} is waiting for collection.`,
    link: () => "/driver",
  },
  "driver.delivery_reassigned": {
    audience: "driver",
    category: "deliveries",
    priority: "critical",
    // The most time-critical message in the platform: it stops a wasted ride.
    channels: ["in_app", "push", "whatsapp"],
    title: () => "Delivery reassigned",
    body: (c) => `The job from ${c.storeName ?? "the shop"} was released. Don't ride out for it.`,
    link: () => "/driver",
  },
  "driver.delivery_cancelled": {
    audience: "driver",
    category: "deliveries",
    priority: "critical",
    channels: ["in_app", "push", "whatsapp"],
    title: () => "Delivery cancelled",
    body: (c) => `The job from ${c.storeName ?? "the shop"} has been cancelled.`,
    link: () => "/driver",
  },
  "driver.customer_unreachable": {
    audience: "driver",
    category: "deliveries",
    priority: "high",
    channels: ["in_app", "push"],
    title: () => "Customer contact updated",
    body: (c) => c.extra ?? "The customer's delivery details changed. Check before you set off.",
    link: () => "/driver",
  },
  "driver.account_approved": {
    audience: "driver",
    category: "system",
    priority: "high",
    channels: ["in_app", "push", "email"],
    title: () => "You're approved to drive",
    body: () => "Your driver account is active. Go online to start receiving jobs.",
    link: () => "/driver",
  },
} as const satisfies Record<string, NotificationTemplate>;

// ── Admin ──────────────────────────────────────────────────────────────────
// The owner's operations feed. WhatsApp is the escalation channel here because
// it is the one they actually read away from a desk.
const ADMIN = {
  "admin.merchant_application": {
    audience: "admin",
    category: "admin",
    priority: "normal",
    channels: ["in_app"],
    title: () => "New shop application",
    body: (c) => `${c.extra ?? "A business"} applied to sell on the platform.`,
    link: () => "/admin",
  },
  "admin.delivery_stranded": {
    audience: "admin",
    category: "deliveries",
    priority: "critical",
    channels: ["in_app", "push", "whatsapp"],
    title: () => "No driver found",
    body: (c) => `${ref(c)} found no driver and a customer is waiting.`,
    link: () => "/admin/deliveries",
  },
  "admin.delivery_sla_breach": {
    audience: "admin",
    category: "deliveries",
    priority: "critical",
    channels: ["in_app", "push", "whatsapp"],
    title: () => "Delivery needs you",
    body: (c) => `${ref(c)} has stalled and needs a decision.`,
    link: () => "/admin/deliveries",
  },
  "admin.payment_issue": {
    audience: "admin",
    category: "payments",
    priority: "critical",
    channels: ["in_app", "push", "whatsapp"],
    title: () => "Payment problem",
    body: (c) => `${ref(c)} has a payment that needs checking.`,
    pushBody: () => "Payment problem — tap to view.",
    link: () => "/admin",
  },
  "admin.refund_request": {
    audience: "admin",
    category: "payments",
    priority: "high",
    channels: ["in_app", "push"],
    title: () => "Refund requested",
    body: (c) => `A refund was requested for ${ref(c)}.`,
    link: () => "/admin",
  },
  "admin.security": {
    audience: "admin",
    category: "system",
    priority: "critical",
    channels: ["in_app", "push", "whatsapp"],
    title: () => "Security alert",
    body: (c) => c.extra ?? "Something needs your attention.",
    pushBody: () => "Security alert — tap to view.",
    link: () => "/admin",
  },
  "admin.system_error": {
    audience: "admin",
    category: "system",
    priority: "high",
    channels: ["in_app"],
    title: () => "System error",
    body: (c) => c.extra ?? "A background job failed.",
    link: () => "/admin",
  },
} as const satisfies Record<string, NotificationTemplate>;

export const TEMPLATES = {
  ...CUSTOMER,
  ...MERCHANT,
  ...DRIVER,
  ...ADMIN,
} as const satisfies Record<string, NotificationTemplate>;

export type NotificationType = keyof typeof TEMPLATES;

export function templateFor(type: NotificationType): NotificationTemplate {
  return TEMPLATES[type];
}

/**
 * Categories a user may mute. Anything at `critical` is excluded by
 * construction — you cannot build a preferences screen that hides a failed
 * payment, because the screen is generated from this list.
 */
export function mutableCategories(): NotificationCategory[] {
  const seen = new Set<NotificationCategory>();
  for (const t of Object.values(TEMPLATES) as NotificationTemplate[]) {
    if (t.priority !== "critical") seen.add(t.category);
  }
  return [...seen];
}
