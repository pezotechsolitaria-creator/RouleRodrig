import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import type { TransferPricing } from "./transfer";
import { readTransferPricing } from "./transfer-server";

/**
 * The transfer fares this platform GUARANTEES, for the pages that sell them.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * Until September 2026 the airport was one flat Rs 1,800 in ride_pricing and
 * that number appeared in NO indexable HTML anywhere on the site. /transfers —
 * the page that owns "airport transfer Rodrigues" — rendered 771 characters,
 * no price, and no structured data. A price is the single most useful thing a
 * transfer page can state, both to a person comparing options and to an
 * assistant asked "how much is a taxi from Rodrigues airport".
 *
 * Since M220 the airport is priced BY ZONE — ≤ 7 km, > 7 and < 15 km, ≥ 15 km
 * by road from Plaine Corail — one way or as a return package. `airport` is
 * therefore the whole active price list from transfer_price_sheet(), including
 * which named place sits in which zone, computed by the same function that
 * charges. The ferry is still one flat fare from ride_pricing.
 *
 * ── WHY THE SERVICE ROLE ───────────────────────────────────────────────────
 * ride_pricing and transfer_pricing_versions have RLS on, no policies, and no
 * grant to `anon` — a public client reads nothing. The fix is NOT to grant it:
 * this project has already shipped one bug of that shape (see the note on
 * store_payment_settings, whose RLS covers every visible store, so a SELECT
 * grant would have published every merchant's bank account). Reading here with
 * the privileged client keeps the tables shut and puts the numbers on the page.
 *
 * Returns nulls rather than throwing, and rather than guessing. Local
 * development has no service-role key, so the caller must render a page that
 * still makes sense without a price — an invented fare is worse than none.
 */
export type TransferFares = {
  /** The active airport price list, or null when it could not be read or the
   *  owner has switched airport transfers off. */
  airport: TransferPricing | null;
  /** Minor units (cents). The ferry terminal at Port Mathurin. */
  ferry: number | null;
};

export const NO_FARES: TransferFares = { airport: null, ferry: null };

export async function readTransferFares(): Promise<TransferFares> {
  if (!hasServiceRole()) return NO_FARES;
  try {
    const admin = await getPrivileged();
    const [sheet, ferryRow] = await Promise.all([
      readTransferPricing(admin),
      admin.from("ride_pricing").select("flat_fare, is_bookable").eq("service", "ferry").maybeSingle(),
    ]);
    const fare = ferryRow.data?.flat_fare;
    // 0 is not a fare, it is an unset column. Only a positive integer is a
    // price worth publishing — and only for a service still being offered.
    const ferry =
      typeof fare === "number" && Number.isFinite(fare) && fare > 0 && ferryRow.data?.is_bookable !== false
        ? fare
        : null;
    return { airport: sheet && sheet.bookable ? sheet : null, ferry };
  } catch {
    // A pricing read must never be the reason a booking page fails to render.
    return NO_FARES;
  }
}
