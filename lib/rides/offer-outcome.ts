// ── Can this target actually be messaged? ───────────────────────────────────
//
// Three answers, not two, and the difference between the last two is the whole
// point: "no number on file" is fixed by editing the driver, "no CallMeBot key"
// is fixed by walking him through the one-time opt-in. Merging them tells the
// owner to do the wrong one.
//
// ── WHY THIS IS A FILE AND NOT SIX INLINE LINES ────────────────────────────
// Because the bug was guard ORDER. lib/rides/notify.ts had:
//
//     if (!t.phone) return;                        <- fires on ""
//     if (!t.api_key) { result.unreachable.push(); return; }
//
// and taxi_drivers.whatsapp held an empty string, so coalesce(whatsapp, phone)
// handed back "". The bare return sat one line ABOVE the only writer of
// `unreachable`, so that driver produced no send, no counter, no console line
// and no Sentry event — an OfferSendResult identical to a healthy dispatch that
// simply had nobody to ask. The tail diagnostic is gated on those very
// counters, so it stayed quiet too.
//
// notify.ts imports server-only and the privileged client, so nothing in it can
// be unit tested. This can, and the ordering is now pinned by a test.
//
// M119 put a CHECK on taxi_drivers so a blank can no longer be stored. This
// stays anyway: the constraint protects the table, and this protects the send
// path from every other source — a column that has not been constrained yet, a
// join that widened, a provider that returns whitespace.

/** What to do about one offer target. */
export type OfferTargetOutcome =
  /** No number to send to at all. Fix the driver record. */
  | "no_contact"
  /** A number, but no CallMeBot key — he has never opted in. */
  | "no_key"
  /** Send it. */
  | "send";

export type OfferTargetLike = {
  phone?: string | null;
  api_key?: string | null;
};

/**
 * Blank, whitespace and null are all "no number".
 *
 * btrim matters: taxi_offer_targets returns coalesce(whatsapp, phone) and a
 * single space would sail past a plain falsy check and reach CallMeBot as a
 * request to message nobody.
 */
export function classifyOfferTarget(t: OfferTargetLike): OfferTargetOutcome {
  const phone = (t.phone ?? "").trim();
  if (!phone) return "no_contact";
  const key = (t.api_key ?? "").trim();
  if (!key) return "no_key";
  return "send";
}
