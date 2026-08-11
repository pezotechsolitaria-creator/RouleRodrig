import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// What a DOOR needs to know, and nothing else.
//
// This module exists because the scanner page used to load organizer_event_detail
// — which carries the organiser's bank details, every buyer's email and phone,
// receipt paths and confirmed revenue. That was harmless while only organisers
// could open it. The moment door staff exist it becomes the wrong payload for
// the wrong person, and "we just won't render those fields" is not a control.
//
// So the scanner has its own RPCs (M59), gated by can_scan_event() rather than
// can_manage_event(), returning a name, a date and whether the event is
// cancelled. An organiser opening the same page gets the same minimal payload —
// there is one door screen, not two, and it is the small one.

export type ScannerEvent = {
  storeId: string;
  slug: string;
  name: string;
  startsAt: string;
  venueName: string | null;
  cancelledAt: string | null;
  phase: "cancelled" | "draft" | "ended" | "in_progress" | "upcoming";
  /** 'organizer' | 'door_staff' — what this person is on THIS event. */
  role: string;
};

export type ScannerContext = {
  storeId: string;
  slug: string;
  name: string;
  startsAt: string;
  venueName: string | null;
  cancelledAt: string | null;
  /** Whether to offer the management links. Decided by the database, not by the
   *  page guessing from a role string it was handed. */
  canManage: boolean;
};

/** Every event this person may scan — organiser or door staff. No money. */
export async function listScannableEvents(supabase: SupabaseClient): Promise<ScannerEvent[]> {
  const { data, error } = await supabase.rpc("scanner_my_events");
  if (error) {
    console.error("scanner_my_events failed", error);
    throw new Error("Could not load your events.");
  }
  return (data as ScannerEvent[] | null) ?? [];
}

/**
 * One event's door context, or null when this person may not scan it.
 *
 * The RPC raises RR003 for both "no such event" and "not yours", so a wrong
 * slug and a forbidden slug are indistinguishable from outside.
 */
export async function getScannerContext(
  supabase: SupabaseClient,
  slug: string,
): Promise<ScannerContext | null> {
  const { data, error } = await supabase.rpc("scanner_event_context", { p_slug: slug });
  if (error) {
    if (error.code === "RR003") return null;
    console.error("scanner_event_context failed", error);
    throw new Error("Could not open the scanner.");
  }
  return (data as ScannerContext | null) ?? null;
}
