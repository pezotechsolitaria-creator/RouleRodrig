// Lightweight currency display helper. Prices are stored in MUR (Rs) as
// strings like "From Rs 800". For tourists we offer an approximate display
// in EUR / GBP / USD using fixed reference rates (clearly marked with ~).

export type Currency = "MUR" | "EUR" | "GBP" | "USD";

export const CURRENCIES: Currency[] = ["MUR", "EUR", "GBP", "USD"];

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  MUR: "Rs",
  EUR: "€",
  GBP: "£",
  USD: "$",
};

// Approximate MUR per 1 unit of the foreign currency.
export const MUR_PER: Record<Currency, number> = {
  MUR: 1,
  EUR: 49,
  GBP: 58,
  USD: 46,
};

/**
 * Convert any "Rs <amount>" occurrences inside a price string to the chosen
 * currency. Non-MUR results are prefixed with "~" to signal they're approximate.
 * Surrounding words ("From", "/ day") are preserved.
 */
export function convertPrice(text: string, currency: Currency): string {
  if (!text || currency === "MUR") return text;
  const sym = CURRENCY_SYMBOL[currency];
  const rate = MUR_PER[currency];
  return text.replace(/Rs\s*([\d.,]+)/gi, (match, num: string) => {
    const rs = parseFloat(String(num).replace(/,/g, ""));
    if (!Number.isFinite(rs)) return match;
    const value = Math.round(rs / rate);
    return `~${sym}${value.toLocaleString()}`;
  });
}
