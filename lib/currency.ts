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
  // The number after "Rs" may be grouped with commas OR spaces / non-breaking
  // spaces (a French locale renders 21475 as "21 475"). Capture the whole run of
  // digits + separators, then strip every non-digit before parsing — otherwise
  // "Rs 21 475" was read as just "21" and rendered a broken "~$0 475".
  return text.replace(/Rs\s*([\d][\d.,\s]*)/gi, (match, num: string) => {
    const cleaned = String(num).replace(/[^\d.]/g, "");
    const rs = parseFloat(cleaned);
    if (!Number.isFinite(rs)) return match;
    const value = Math.round(rs / rate);
    return `~${sym}${value.toLocaleString("en-US")}`;
  });
}
