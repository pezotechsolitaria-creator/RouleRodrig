import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";

/**
 * The two fares this platform GUARANTEES, for the pages that sell them.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * `ride_pricing` holds a flat_fare for `airport` (Rs 1,800) and `ferry`
 * (Rs 1,200). Those are not estimates: quote_ride() returns them unchanged, so
 * they are the price a customer actually pays. Every other service is
 * base + per_km and genuinely varies.
 *
 * And until now the number appeared in NO indexable HTML anywhere on the site.
 * /transfers — the page that owns "airport transfer Rodrigues" — rendered 771
 * characters, no price, and no structured data, while the fare sat in the
 * database being applied to every booking. A price is the single most useful
 * thing a transfer page can state, both to a person comparing options and to
 * an assistant asked "how much is a taxi from Rodrigues airport".
 *
 * ── WHY THE SERVICE ROLE ───────────────────────────────────────────────────
 * `ride_pricing` has RLS on, no policies, and no grant to `anon` — a public
 * client reads nothing. The fix is NOT to grant it: this project has already
 * shipped one bug of that shape (see the note on store_payment_settings, whose
 * RLS covers every visible store, so a SELECT grant would have published every
 * merchant's bank account). Reading it here with the privileged client keeps
 * the table shut and puts the number on the page.
 *
 * Returns nulls rather than throwing, and rather than guessing. Local
 * development has no service-role key, so the caller must render a page that
 * still makes sense without a price — an invented fare is worse than none.
 */
export type FlatFares = {
  /** Minor units (cents). Plaine Corail ↔ anywhere on the island. */
  airport: number | null;
  /** Minor units (cents). The ferry terminal at Port Mathurin. */
  ferry: number | null;
};

export const NO_FARES: FlatFares = { airport: null, ferry: null };

export async function readFlatFares(): Promise<FlatFares> {
  if (!hasServiceRole()) return NO_FARES;
  try {
    const admin = await getPrivileged();
    const { data, error } = await admin
      .from("ride_pricing")
      .select("service, flat_fare")
      .in("service", ["airport", "ferry"]);
    if (error || !data) return NO_FARES;

    const pick = (service: string): number | null => {
      const row = data.find((r) => r.service === service);
      const fare = row?.flat_fare;
      // 0 is not a fare, it is an unset column. Only a positive integer is a
      // price worth publishing.
      return typeof fare === "number" && Number.isFinite(fare) && fare > 0
        ? fare
        : null;
    };
    return { airport: pick("airport"), ferry: pick("ferry") };
  } catch {
    // A pricing read must never be the reason a booking page fails to render.
    return NO_FARES;
  }
}
