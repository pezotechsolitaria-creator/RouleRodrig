import "server-only";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { normalizeReference } from "./reference";
import { bookingPath } from "./server";

// ── Back to an open reservation from its reference (6 Oct 2026) ─────────────
//
// The guest's page is /booking/<token>, and the token is the credential. A
// guest who closed the tab had only the reference left — and /track did not
// know reservation references at all, so "Choose a way to pay" was gone while
// the hold was still running. This finds the reservation from what a guest
// can say back: the reference plus the email OR the phone they booked with
// (the form asks for a phone; the email is optional, so phone-only guests had
// no way back at all). It answers with the page's own path, rebuilt from the
// idempotency key exactly as the emailed links are.
//
// Still two factors, and still one answer for "wrong reference" and "wrong
// contact" — the caller sends the same 404 for both.

/** Digits only — "+230 5123 4567" and "5123-4567" compare alike. */
function digits(s: string): string {
  return s.replace(/\D/g, "");
}

/**
 * Does what the guest typed name the contact on the reservation? An email
 * must match exactly (case-insensitive, never a pattern — see
 * rr-ilike-email-is-a-pattern); a phone matches on its last 8 digits, which is
 * a whole Mauritian mobile and survives "+230", "00230" or a leading 0.
 */
export function contactMatches(
  row: { customer_email: string | null; customer_phone: string | null },
  typed: string,
): boolean {
  const t = typed.trim();
  if (!t) return false;
  if (t.includes("@")) {
    const e = (row.customer_email ?? "").trim().toLowerCase();
    return e.length > 0 && e === t.toLowerCase();
  }
  const want = digits(t);
  if (want.length < 7) return false;
  const have = digits(row.customer_phone ?? "");
  const n = Math.min(8, want.length);
  return have.length >= n && have.slice(-n) === want.slice(-n);
}

/** A reservation reference ("RR-8F42K"), normalised, or null for anything else. */
export function reservationReference(raw: string): string | null {
  return normalizeReference(raw);
}

/**
 * The guest's page for this reservation, or null when the reference and the
 * contact do not belong together. Never says which half was wrong.
 */
export async function reservationPathFor(rawRef: string, contact: string): Promise<string | null> {
  const ref = reservationReference(rawRef);
  if (!ref || !hasServiceRole()) return null;
  const admin = await getPrivileged();
  // Plain equality on a normalised value: nothing the guest typed reaches a
  // filter as syntax.
  const { data, error } = await admin
    .from("reservations")
    .select("idempotency_key, customer_email, customer_phone")
    .eq("booking_reference", ref)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as { idempotency_key: string; customer_email: string | null; customer_phone: string | null };
  return contactMatches(row, contact) ? bookingPath(row.idempotency_key) : null;
}
