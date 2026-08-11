import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Server-side organiser context.
//
// Authorization is NEVER decided here. Every value below comes from a
// SECURITY DEFINER function that re-derives the answer from auth.uid():
// organizer_my_events() takes no parameter at all, and
// organizer_event_detail() is gated by can_manage_event() (M43). This module
// only shapes what those return for the page.
//
// That matters because a dashboard is exactly where it is tempting to fetch by
// an id from the URL and check permission in the component. An organiser who
// swapped a slug would then be one forgotten `if` away from another organiser's
// event.

export type OrganizerEvent = {
  store_id: string;
  slug: string;
  name: string;
  starts_at: string;
  ends_at: string | null;
  venue_name: string | null;
  cancelled_at: string | null;
  phase: "cancelled" | "draft" | "ended" | "in_progress" | "upcoming";
  store_status: string;
  /** Tickets still available across every active ticket type. */
  remaining: number;
  /** Units held by orders that have not been paid yet. */
  awaiting: number;
  /** Units on orders the money has landed for. */
  confirmed: number;
  /** remaining + awaiting + confirmed — derived, never stored, so it self-corrects. */
  capacity: number;
  issued: number;
  redeemed: number;
  /** What the ORGANISER has taken. Roulé Rodrigues never holds ticket money. */
  gross_confirmed: number;
  can_verify_payments: boolean;
};

export type OrganizerPackage = {
  variantId: string;
  name: string | null;
  // M47 content — what makes a tier a tier rather than just a higher price.
  // These MUST be returned by organizer_event_detail (M47c): the editor posts
  // back what it was given, so a missing field here is not a blank form, it is
  // a silent wipe of content the organiser already wrote.
  subtitle: string | null;
  description: string | null;
  inclusions: string[];
  imageUrl: string | null;
  displayOrder: number;
  price: number;
  remaining: number;
  isActive: boolean;
  salesOpen: boolean;
  salesStart: string | null;
  salesEnd: string | null;
  minPerOrder: number;
  maxPerOrder: number | null;
  sold: number;
  awaiting: number;
};

export type OrganizerReservation = {
  orderId: string;
  orderNumber: string;
  status: string;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  total: number;
  placedAt: string | null;
  autoReleaseAt: string | null;
  units: number | null;
  // M49d — enough to JUDGE a payment, not merely to see one is claimed.
  provider: string | null;
  receiptSubmittedAt: string | null;
  /** Object path in the private order-receipts bucket — never a URL. The link is
   *  minted on demand and expires, so nothing durable is handed to the client. */
  receiptPath: string | null;
};

/** Where this event's money goes. The organiser is the payee — Roulé Rodrigues
 *  never holds ticket money — which is why they both set and read this. */
export type OrganizerPaymentSettings = {
  acceptsCash: boolean;
  acceptsBankTransfer: boolean;
  requireReceipt: boolean;
  bankName: string | null;
  accountHolder: string | null;
  accountNumber: string | null;
  instructions: string | null;
};

export type OrganizerEventDetail = {
  storeId: string;
  slug: string;
  name: string;
  phase: OrganizerEvent["phase"];
  startsAt: string;
  endsAt: string | null;
  venueName: string | null;
  venueAddress: string | null;
  timezone: string;
  cancelledAt: string | null;
  canVerifyPayments: boolean;
  /** M58. Total the venue holds across every package; null = no overall limit. */
  capacity: number | null;
  /** Derived, never stored — places sold or held right now. */
  placesTaken: number;
  /** Null until the organiser has set anything up — which is the state every
   *  new event starts in, and the reason tickets cannot be sold yet. */
  payment: OrganizerPaymentSettings | null;
  packages: OrganizerPackage[];
  recent: OrganizerReservation[];
};

/**
 * Every event this signed-in user may run. Empty array for anybody who is not
 * an active, assigned organiser — including a suspended one, because the RPC
 * reads status live rather than trusting a session.
 */
export async function listMyEvents(supabase: SupabaseClient): Promise<OrganizerEvent[]> {
  const { data, error } = await supabase.rpc("organizer_my_events");
  if (error) {
    console.error("organizer_my_events failed", error);
    // A query FAILURE and "you run no events" are different answers and an
    // organiser must not be shown the wrong one — same rule as the customer
    // orders page. Throwing renders the error boundary, which is recoverable.
    throw new Error("Could not load your events.");
  }
  return (data as OrganizerEvent[] | null) ?? [];
}

/**
 * One event, or null when this user may not manage it. The RPC raises RR003
 * rather than returning an empty shape, so a wrong slug and a forbidden slug
 * are indistinguishable from outside — which is the point.
 */
export async function getEventDetail(
  supabase: SupabaseClient,
  storeId: string,
): Promise<OrganizerEventDetail | null> {
  const { data, error } = await supabase.rpc("organizer_event_detail", { p_store_id: storeId });
  if (error) {
    if (error.code === "RR003") return null;
    console.error("organizer_event_detail failed", error);
    throw new Error("Could not load this event.");
  }
  return (data as OrganizerEventDetail | null) ?? null;
}

// ── Access (M59) ────────────────────────────────────────────────────────────

/** What somebody is on ONE event. 'organizer' runs it; 'door_staff' scans. */
export type EventRole = "organizer" | "door_staff";

export type EventStaffMember = {
  assignmentId: string;
  name: string;
  email: string;
  role: EventRole;
  /** 'invited' until they sign in and claim the invite, then 'active'. */
  status: string;
  hasSignedIn: boolean;
  canVerifyPayments: boolean;
  assignedAt: string;
};

// ── Managed ticketing (M60) ─────────────────────────────────────────────────
//
// The fee is what the ORGANISER owes ROULÉ RODRIGUES, and it is deliberately
// carried in its own payload rather than folded into the event detail: nothing
// in the revenue path knows this type exists, which is what makes "the fee never
// touches ticket money" structural rather than a habit.

export type ManagedTicketingStatus =
  | "not_requested"
  | "requested"
  | "approved"
  | "active"
  | "completed"
  | "cancelled";

export type ManagedTicketing = {
  /** Absent when status is 'not_requested' — that state is the absence of a row. */
  id?: string;
  status: ManagedTicketingStatus;
  feeType: "fixed" | "percentage" | null;
  feeAmountCents: number | null;
  /** Scaled by 1000: 10% is 10000. */
  feeRateE5: number | null;
  feeCurrency: string;
  serviceIncludes: string | null;
  organiserNote: string | null;
  requestedAt: string | null;
  approvedAt: string | null;
  acceptedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelledReason: string | null;
  paymentStatus: "unpaid" | "invoiced" | "paid" | "waived";
  paymentNote: string | null;
  /** What a percentage fee comes to at TODAY's revenue. Moves until invoiced. */
  estimatedFeeCents: number | null;
  estimateBasisCents: number | null;
  /** Frozen at invoicing. Ticket refunds after this point do not change it. */
  invoicedFeeCents: number | null;
  invoicedBasisCents: number | null;
  invoicedAt: string | null;
  /** Shown beside the fee so the two are never confused for one another. */
  ticketRevenueCents: number;
  separationNote: string;
};
