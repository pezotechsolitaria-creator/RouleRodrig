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
  orderNumber: string;
  status: string;
  customerName: string | null;
  customerPhone: string | null;
  total: number;
  placedAt: string | null;
  autoReleaseAt: string | null;
  units: number | null;
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
