// ── eSIM pricing: pure, so every rupee of it is testable ────────────────────
//
// UNITS, stated once because this codebase has shipped a money-unit bug twice
// (bookings in rupees, orders in cents, same field names). Every eSIM amount
// carries its unit IN ITS NAME and there are exactly two:
//
//   *_usd_micros  — what the wholesaler charges us, in millionths of a USD.
//                   eSIM Access quotes in 1/10,000 USD; micros hold that
//                   exactly (×100) and hold any other wholesaler's too.
//   *_eur_cents   — what the customer pays, in euro cents. EUR because
//                   PayPal cannot charge MUR, and because it is the currency
//                   Rodrigues' visitors (Réunion, France, Europe) think in.
//
// THE PRICE IS ALL-IN. Rentals add PayPal's fee on top at checkout; the eSIM
// store does not. A traveller comparing "€9.90" with Airalo's "$9.50" reads a
// surprise fee on the last screen as a bait-and-switch, and an eSIM is a
// purchase people abandon at the slightest doubt. The fee is priced in here
// instead, where only the margin feels it.

/** PayPal's cut on a cross-border card payment into a Mauritian account. A
 *  deliberate over-estimate (the published rate is lower) so the margin floor
 *  below is a floor, not a hope. */
export const PAYPAL_PERCENT = 5.4;
export const PAYPAL_FIXED_EUR_CENTS = 35;

/** Never sell a plan that nets less than this after the wholesaler and PayPal. */
export const MIN_NET_EUR_CENTS = 100;

export type MarginBreakdown = {
  retailEurCents: number;
  costEurCents: number;
  paypalEurCents: number;
  netEurCents: number;
  /** Net as a share of the retail price, 0–1. */
  marginRatio: number;
};

export function usdMicrosToEurCents(usdMicros: number, eurPerUsd: number): number {
  return Math.round((usdMicros / 1_000_000) * eurPerUsd * 100);
}

export function paypalFeeEurCents(retailEurCents: number): number {
  return Math.round((retailEurCents * PAYPAL_PERCENT) / 100) + PAYPAL_FIXED_EUR_CENTS;
}

export function margin(retailEurCents: number, wholesaleUsdMicros: number, eurPerUsd: number): MarginBreakdown {
  const costEurCents = usdMicrosToEurCents(wholesaleUsdMicros, eurPerUsd);
  const paypalEurCents = paypalFeeEurCents(retailEurCents);
  const netEurCents = retailEurCents - costEurCents - paypalEurCents;
  return {
    retailEurCents,
    costEurCents,
    paypalEurCents,
    netEurCents,
    marginRatio: retailEurCents > 0 ? netEurCents / retailEurCents : 0,
  };
}

/**
 * Whether a sale at this price may go ahead. Checked at checkout against the
 * wholesale price stored at the last sync: if the wholesaler has raised prices
 * since, or the owner typed a price below cost, the sale is refused and the
 * owner is told — losing money silently on every order is the failure mode a
 * reseller never notices until the statement arrives.
 */
export function isSellable(retailEurCents: number, wholesaleUsdMicros: number, eurPerUsd: number): boolean {
  if (!Number.isFinite(retailEurCents) || retailEurCents <= 0) return false;
  if (!Number.isFinite(wholesaleUsdMicros) || wholesaleUsdMicros <= 0) return false;
  return margin(retailEurCents, wholesaleUsdMicros, eurPerUsd).netEurCents >= MIN_NET_EUR_CENTS;
}

/**
 * A suggested retail price for a freshly synced plan. The owner can override
 * every one of these in /admin/esim; this only decides what a new plan starts
 * at so that a sync never publishes a loss-maker.
 *
 * Markup is TIERED, because the value of convenience is not proportional to
 * the wholesale cost: a €1 plan is worth €4.90 to someone standing in an
 * airport with no signal, and a €20 plan is not worth €98. Small plans carry a
 * big multiple, large plans a modest one — the same shape every consumer eSIM
 * brand's price list has.
 *
 * Rounded UP to the next x.90, the price point tourists read as "about €5"
 * rather than "€5.37 — what is the .37 for?".
 */
export function suggestRetailEurCents(wholesaleUsdMicros: number, eurPerUsd: number): number {
  const cost = usdMicrosToEurCents(wholesaleUsdMicros, eurPerUsd);
  const multiple = cost <= 150 ? 3.2 : cost <= 400 ? 2.4 : cost <= 900 ? 1.9 : cost <= 2000 ? 1.6 : 1.45;
  // The floor: cost + PayPal + the minimum net, solved for the retail price
  // PayPal's percentage is taken from.
  const floor = Math.ceil(
    (cost + PAYPAL_FIXED_EUR_CENTS + MIN_NET_EUR_CENTS + 50) / (1 - PAYPAL_PERCENT / 100),
  );
  const raw = Math.max(Math.ceil(cost * multiple), floor, 390);
  return roundUpToNinety(raw);
}

/** 537 → 590, 590 → 590, 1004 → 1090. Always rounds UP, never below cost. */
export function roundUpToNinety(eurCents: number): number {
  const euros = Math.floor(eurCents / 100);
  const candidate = euros * 100 + 90;
  return candidate >= eurCents ? candidate : candidate + 100;
}

/** "€9.90" — the only way a price reaches a screen or an email. */
export function formatEur(eurCents: number, lang: "en" | "fr" = "en"): string {
  const v = (eurCents / 100).toFixed(2);
  return lang === "fr" ? `${v.replace(".", ",")} €` : `€${v}`;
}

/** PayPal wants "9.90" — two decimals, dot separator, no symbol. */
export function eurCentsToPayPalValue(eurCents: number): string {
  return (eurCents / 100).toFixed(2);
}

/** "9.90" from PayPal back to 990; null for anything that is not a price. */
export function payPalValueToEurCents(value: string | null | undefined): number | null {
  if (typeof value !== "string" || !/^\d+(\.\d{1,2})?$/.test(value.trim())) return null;
  return Math.round(Number(value.trim()) * 100);
}

/** Price per GB, for the "best value" badge. Unlimited/daily plans → null. */
export function eurCentsPerGb(retailEurCents: number, dataMb: number): number | null {
  if (!dataMb || dataMb <= 0) return null;
  return Math.round(retailEurCents / (dataMb / 1024));
}
