// EUR per USD — the only exchange rate the eSIM store needs: the wholesaler
// bills in USD, the customer pays in EUR. Same free source lib/paypal.ts uses
// for rupees, cached an hour.
//
// The FALLBACK IS PESSIMISTIC ON PURPOSE. If the rate cannot be fetched, the
// margin guard must not be the thing that fails open, so the fallback makes a
// dollar look EXPENSIVE (0.98 € rather than the ~0.86 € of 2026): a plan that
// is still sellable at that rate is sellable at the real one.

export const PESSIMISTIC_EUR_PER_USD = 0.98;

let cache: { v: number; at: number } | null = null;

export async function eurPerUsd(): Promise<number> {
  if (cache && Date.now() - cache.at < 3_600_000) return cache.v;
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(5_000),
    });
    const data = (await res.json()) as { rates?: Record<string, number> };
    const v = data.rates?.EUR;
    if (!v || !Number.isFinite(v) || v < 0.5 || v > 1.5) throw new Error("implausible EUR rate");
    cache = { v, at: Date.now() };
    return v;
  } catch {
    return PESSIMISTIC_EUR_PER_USD;
  }
}
