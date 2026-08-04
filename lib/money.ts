// Money enters this app as a decimal string typed by a merchant (e.g. "9.995")
// and must become an exact integer in minor units (cents) for storage —
// `Math.round(parseFloat(input) * 100)` is NOT safe for this: IEEE-754 float
// multiplication silently misrounds boundary values (verified: 9.995 * 100 ===
// 999.4999999999999, rounding DOWN to 999 instead of 1000). toCents() works
// on the decimal string directly so it never enters floating-point space.

/**
 * Converts a decimal string (e.g. "9.99", "9.995", "1,234.5") into an integer
 * number of minor units (cents), using round-half-up on the third decimal
 * digit onward. Returns null for anything that isn't a valid non-negative
 * amount, so callers can distinguish "invalid" from "zero".
 */
export function toCents(input: string): number | null {
  const trimmed = input.trim().replace(/,/g, "");
  if (trimmed === "") return null;
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;

  const [wholeRaw, fracRaw = ""] = trimmed.split(".");
  const whole = wholeRaw === "" ? "0" : wholeRaw;

  // Round the fractional part to 2 digits using ordinary decimal rounding
  // (half-up on the 3rd digit), entirely in string/integer space.
  let cents = fracRaw.length >= 2 ? fracRaw.slice(0, 2) : fracRaw.padEnd(2, "0");
  if (fracRaw.length > 2 && fracRaw.charCodeAt(2) >= "5".charCodeAt(0)) {
    const bumped = parseInt(cents, 10) + 1;
    if (bumped === 100) {
      return (parseInt(whole, 10) + 1) * 100;
    }
    cents = String(bumped).padStart(2, "0");
  }

  return parseInt(whole, 10) * 100 + parseInt(cents, 10);
}

/** Formats an integer cent amount back into a "1234.56"-style decimal string. */
export function centsToDecimalString(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
