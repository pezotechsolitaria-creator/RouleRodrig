// ── The email type registry (M41) ───────────────────────────────────────────
//
// Before this file, an email's "type" was which function you happened to call.
// Nothing could route by type, count by type, or protect one type's capacity
// from another's, because the concept did not exist as data.
//
// Every transactional email the platform sends now declares a type here, and a
// type carries exactly two facts the router needs:
//
//   CATEGORY — the business domain, so a dashboard can answer "what is eating
//              Brevo's quota today?" and so routing can be changed per domain
//              without touching business logic.
//   PRIORITY — how much the platform is willing to sacrifice to preserve
//              capacity for something else. See the rule at the bottom.
//
// Types are plain strings in the database (email_log.email_type), not a PG
// enum, so adding a ticketing type later is a code change and not a migration
// that has to be coordinated with a deploy.

/** Business domain. Drives routing config and the dashboard breakdown. */
export type EmailCategory =
  | "ticketing"
  | "marketplace"
  | "scooter_rental"
  | "car_rental"
  | "accommodation"
  | "activity"
  | "account"
  | "operational"
  | "marketing";

/**
 * How much the platform will give up to protect other capacity.
 *
 * THE RULE, and it is not negotiable by configuration: a reserve or a quota
 * threshold may throttle `normal` and `low`. It may NEVER block `critical`.
 * A protected reserve that stops a password reset or a ticket QR has inverted
 * its own purpose — it exists to guarantee those very messages.
 *
 * `high` is throttled only once a provider is genuinely exhausted, never
 * merely to defend a reserve.
 */
export type EmailPriority = "critical" | "high" | "normal" | "low";

export interface EmailTypeMeta {
  category: EmailCategory;
  priority: EmailPriority;
  /** Present for types no code path sends yet — kept so routing and reserves
   *  can be configured and tested before the feature that emits them lands. */
  planned?: true;
}

// ── The registry ────────────────────────────────────────────────────────────
// Ordered by domain. `planned: true` marks a type nothing emits yet: the
// ticketing set exists because M33/M34 built the sellable half of ticketing but
// no ticket email at all, and the conditional reserve has to be configurable
// before the emails it protects exist (otherwise the reserve can only be added
// by restructuring, which is the thing this design is meant to avoid).
export const EMAIL_TYPES = {
  // ── Ticketing ─────────────────────────────────────────────────────────────
  // A ticket QR is the single most critical email the platform will ever send:
  // it IS the admission. Losing it at the door cannot be repaired by support.
  ticket_order_confirmation:        { category: "ticketing", priority: "critical", planned: true },
  ticket_payment_confirmation:      { category: "ticketing", priority: "critical", planned: true },
  // LIVE since M57 — lib/notifications/ticket-delivery.ts, sent the moment an
  // organiser confirms payment. The events checkout tells the buyer in as many
  // words that their ticket arrives by email, so this is load-bearing copy
  // rather than a nicety: without it that sentence is simply untrue.
  ticket_qr_delivery:               { category: "ticketing", priority: "critical" },
  ticket_cancellation:              { category: "ticketing", priority: "high",     planned: true },
  ticket_refund:                    { category: "ticketing", priority: "high",     planned: true },
  ticket_event_reminder:            { category: "ticketing", priority: "normal",   planned: true },
  ticket_checkin_notification:      { category: "ticketing", priority: "normal",   planned: true },
  organizer_ticket_order_notification: { category: "ticketing", priority: "high",  planned: true },

  // ── Marketplace ──────────────────────────────────────────────────────────
  marketplace_order_confirmation:   { category: "marketplace", priority: "high" },
  marketplace_payment_confirmation: { category: "marketplace", priority: "critical" },
  marketplace_order_status:         { category: "marketplace", priority: "high" },
  // The one marketplace email sent while the customer can still change the
  // outcome — every other one reports something already decided. Treated as
  // high, never throttled as a "reminder".
  marketplace_payment_due:          { category: "marketplace", priority: "high" },
  // Both emitted by the generic merchant status-change path, which is why they
  // are live rather than planned: "ready" carries the pickup code the customer
  // needs at the counter, "completed" closes the order.
  marketplace_pickup_ready:         { category: "marketplace", priority: "high" },
  marketplace_order_completed:      { category: "marketplace", priority: "normal" },
  marketplace_order_expired:        { category: "marketplace", priority: "normal" },
  marketplace_merchant_notification:{ category: "marketplace", priority: "high" },

  // ── Scooter rentals ──────────────────────────────────────────────────────
  scooter_booking_confirmation:     { category: "scooter_rental", priority: "high" },
  scooter_payment_confirmation:     { category: "scooter_rental", priority: "critical", planned: true },
  scooter_pickup_reminder:          { category: "scooter_rental", priority: "normal" },
  scooter_return_reminder:          { category: "scooter_rental", priority: "normal" },
  scooter_booking_status:           { category: "scooter_rental", priority: "high" },
  scooter_feedback_request:         { category: "scooter_rental", priority: "low" },

  // ── Car rentals ──────────────────────────────────────────────────────────
  // A separate domain from scooters even though both live in the `bookings`
  // table: the fleet entry carries `category`, deposits already differ (50% vs
  // 25%), and the brief requires per-domain routing. Resolved per booking by
  // vehicleEmailType() below.
  car_booking_confirmation:         { category: "car_rental", priority: "high" },
  car_payment_confirmation:         { category: "car_rental", priority: "critical", planned: true },
  car_pickup_reminder:              { category: "car_rental", priority: "normal" },
  car_return_reminder:              { category: "car_rental", priority: "normal" },
  car_booking_status:               { category: "car_rental", priority: "high" },
  car_feedback_request:             { category: "car_rental", priority: "low" },

  // ── Accommodation (place_bookings, category 'hotel') ─────────────────────
  accommodation_booking_confirmation: { category: "accommodation", priority: "high" },
  accommodation_payment_confirmation: { category: "accommodation", priority: "critical", planned: true },
  accommodation_checkin_reminder:   { category: "accommodation", priority: "normal" },
  accommodation_checkout_reminder:  { category: "accommodation", priority: "normal", planned: true },
  accommodation_status:             { category: "accommodation", priority: "high" },
  accommodation_feedback_request:   { category: "accommodation", priority: "low" },

  // ── Activities (place_bookings, non-hotel) ───────────────────────────────
  activity_booking_confirmation:    { category: "activity", priority: "high" },
  activity_payment_confirmation:    { category: "activity", priority: "critical", planned: true },
  activity_reminder:                { category: "activity", priority: "normal" },
  activity_status:                  { category: "activity", priority: "high" },
  activity_feedback_request:        { category: "activity", priority: "low" },

  // ── Account / security ───────────────────────────────────────────────────
  // IMPORTANT: these three are declared but the application does NOT send
  // them. Supabase Auth does, over its own SMTP transport (see
  // docs/supabase-auth-emails.md), so this router cannot route them and its
  // counters cannot see them. They exist here so the concept is nameable, and
  // so the day auth email moves in-app the routing entry is already present.
  // The quota engine treats them as Brevo's invisible load, not as app traffic.
  // An invitation is the ONLY route into an account somebody else created for
  // you, which puts it in the same class as a password reset: it may be queued
  // behind other mail, but it must never be dropped to defend a reserve. The
  // volume is a handful ever, so guaranteeing it costs nothing. Until M108 the
  // door and kitchen invites borrowed organizer_ticket_order_notification — a
  // TICKETING type marked `planned` — which put access mail under a ticketing
  // quota it had nothing to do with.
  account_invitation:               { category: "account", priority: "critical" },
  email_verification:               { category: "account", priority: "critical", planned: true },
  password_reset:                   { category: "account", priority: "critical", planned: true },
  security_notification:            { category: "account", priority: "critical", planned: true },

  // ── Operational (internal — owner and staff) ─────────────────────────────
  // A missed owner alert is backed by the CallMeBot WhatsApp ping, which is why
  // these sit below customer mail in priority: the owner has a second channel,
  // the customer does not.
  enquiry_ack:                      { category: "operational", priority: "normal" },
  // M91 — the two halves of the availability check. Both are CRITICAL: the
  // first carries a deadline the customer must act on, and the second is the
  // only thing standing between "we are checking" and silence forever.
  booking_availability_confirmed:   { category: "scooter_rental", priority: "critical" },
  booking_unavailable:              { category: "scooter_rental", priority: "critical" },
  // M127 — the same two halves for stays and experiences. Critical for exactly
  // the same reasons: the first carries a deadline the customer must act on,
  // and the second is the only thing between "we are checking" and silence.
  // Separate types rather than reusing the scooter pair, because these are
  // categorised as accommodation/activity and the quota router reads category.
  accommodation_availability_confirmed: { category: "accommodation", priority: "critical" },
  accommodation_unavailable:            { category: "accommodation", priority: "critical" },
  activity_availability_confirmed:      { category: "activity", priority: "critical" },
  activity_unavailable:                 { category: "activity", priority: "critical" },
  owner_booking_alert:              { category: "operational", priority: "high" },
  owner_place_booking_alert:        { category: "operational", priority: "high" },
  owner_pickup_reminder:            { category: "operational", priority: "normal" },
  owner_return_reminder:            { category: "operational", priority: "normal" },
  owner_place_reminder:             { category: "operational", priority: "normal" },
  // Money the owner must act on: a customer says they have transferred, and
  // nothing happens until he looks. "high", not "critical" — it is urgent to a
  // waiting guest but it does not defend a reserve.
  owner_payment_reported:           { category: "operational", priority: "high" },
  owner_tiroule_digest:             { category: "operational", priority: "low" },
  admin_test:                       { category: "operational", priority: "low" },
  // Outbound to an APPLICANT, not to the owner — so unlike its neighbours here
  // there is no second channel behind it. Somebody applied to list a business
  // (or, since M47, to become a taxi driver, event organiser or delivery
  // partner) and the page promised "we'll be in touch"; until this existed,
  // approving an application flipped a column and told them nothing. `high`
  // for that reason: it is the answer to a question a real person asked.
  partner_application_decision:     { category: "operational", priority: "high" },

  // ── Marketing ────────────────────────────────────────────────────────────
  // Kept a separate category so it can be throttled first and so it is never
  // confused with transactional mail. waitlist_welcome belongs here rather than
  // in operational: it is triggered by an explicit opt-in, but its CONTENT is
  // island tips and deals, so it should live under marketing's rules.
  waitlist_welcome:                 { category: "marketing", priority: "low" },
  newsletter:                       { category: "marketing", priority: "low", planned: true },
  promotion:                        { category: "marketing", priority: "low", planned: true },
  campaign:                         { category: "marketing", priority: "low", planned: true },
} as const satisfies Record<string, EmailTypeMeta>;

export type EmailType = keyof typeof EMAIL_TYPES;

export const ALL_EMAIL_TYPES = Object.keys(EMAIL_TYPES) as EmailType[];

/** Metadata for a type. Falls back to a safe default for a string that isn't a
 *  known type, so an unrecognised value can still be logged and sent rather
 *  than throwing inside a best-effort email path. */
export function emailTypeMeta(type: string): EmailTypeMeta {
  return (EMAIL_TYPES as Record<string, EmailTypeMeta>)[type] ?? { category: "operational", priority: "normal" };
}

export function emailCategory(type: string): EmailCategory {
  return emailTypeMeta(type).category;
}

export function emailPriority(type: string): EmailPriority {
  return emailTypeMeta(type).priority;
}

/** Types actually emitted by code today — the ones a dashboard should expect
 *  to see traffic for. */
export function liveEmailTypes(): EmailType[] {
  return ALL_EMAIL_TYPES.filter((t) => !emailTypeMeta(t).planned);
}

const PRIORITY_RANK: Record<EmailPriority, number> = { critical: 0, high: 1, normal: 2, low: 3 };

/** True when `a` is at least as important as `b`. */
export function atLeastAsImportant(a: EmailPriority, b: EmailPriority): boolean {
  return PRIORITY_RANK[a] <= PRIORITY_RANK[b];
}

/** Critical mail is never blocked to defend a reserve. Single place to ask. */
export function isCritical(type: string): boolean {
  return emailPriority(type) === "critical";
}

// ── Vehicle domain resolution ───────────────────────────────────────────────
// Scooters and cars share the `bookings` table, so the email type has to be
// derived from the fleet entry's `category` (the same field lib/booking-pricing.ts
// uses to charge a 50% deposit on cars and 25% on scooters). Unknown or absent
// category means scooter, matching that file's default exactly — one default,
// not two that can drift.
type VehicleEmailBase =
  | "booking_confirmation"
  | "payment_confirmation"
  | "pickup_reminder"
  | "return_reminder"
  | "booking_status"
  | "feedback_request";

export function vehicleEmailType(base: VehicleEmailBase, vehicleCategory?: string | null): EmailType {
  const kind = (vehicleCategory ?? "scooter") === "car" ? "car" : "scooter";
  return `${kind}_${base}` as EmailType;
}

// ── Place-booking domain resolution ─────────────────────────────────────────
// place_bookings.category distinguishes accommodation from everything else.
// 'hotel' is the accommodation marker used throughout lib/email.ts (it picks
// the "Rooms · Chambres" row label from the same value).
type PlaceEmailBase =
  | "booking_confirmation" | "reminder" | "status" | "feedback_request"
  // M127. Availability is decided before payment, exactly as for vehicles.
  | "availability_confirmed" | "unavailable";

export function placeEmailType(base: PlaceEmailBase, placeCategory?: string | null): EmailType {
  const isStay = (placeCategory ?? "").toLowerCase() === "hotel";
  if (!isStay) return `activity_${base}` as EmailType;
  // Accommodation names its reminder after the check-in it is reminding about.
  if (base === "reminder") return "accommodation_checkin_reminder";
  return `accommodation_${base}` as EmailType;
}
