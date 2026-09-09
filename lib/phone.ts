import {
  getCountryCallingCode, isValidPhoneNumber, parsePhoneNumberFromString, type CountryCode,
} from "libphonenumber-js";

// ── A pasted country code belongs in the PICKER, not in the box ─────────────
//
// The phone field is a country picker beside a NATIONAL-only input — its own
// error message says "no country code needed". But the input took whatever was
// typed, verbatim, so somebody entering their number the way it is written on a
// card ("+230 5836 3401") ended up with a box reading "+23058363401" sitting
// next to a picker already showing "+230".
//
// It even validated, with a green tick, because libphonenumber reads the
// leading + as international and parses it correctly — so nothing downstream
// was wrong. The field simply looked like it held the country code twice, which
// is more than enough to make somebody "fix" it by deleting digits.
//
// Pure and separate from the component so the parsing can be tested directly.

/**
 * Split a typed value into the country it names and the national part.
 *
 * Returns `null` when there is nothing to absorb, meaning the caller should
 * leave the picker and the text exactly as they are. Deliberately conservative:
 * it only ever moves a code it is certain about.
 */
export function absorbCountryCode(
  raw: string,
  currentIso: CountryCode,
): { iso: CountryCode; national: string } | null {
  const text = (raw ?? "").trim();
  if (!text) return null;

  const compact = text.replace(/[\s\-().]/g, "");

  // "+230…" as written, or "00230…" as dialled from a keypad.
  const international = compact.startsWith("+")
    ? compact
    : /^00\d/.test(compact)
      ? `+${compact.slice(2)}`
      : null;

  if (international) {
    const parsed = parsePhoneNumberFromString(international);
    // Only when it names a real country AND leaves a national number behind. A
    // half-typed "+2" must not blank the box between keystrokes.
    if (parsed?.country && parsed.nationalNumber) {
      return { iso: parsed.country as CountryCode, national: String(parsed.nationalNumber) };
    }
    return null;
  }

  // No plus, but the digits open with the SELECTED country's code — the other
  // way people paste a number. Stripped only when what remains is a VALID
  // national number for that country, so a real local number that happens to
  // begin with those digits is never mangled.
  let code: string;
  try {
    code = getCountryCallingCode(currentIso);
  } catch {
    return null;
  }
  if (compact.length > code.length && compact.startsWith(code)) {
    const rest = compact.slice(code.length);
    if (isValidPhoneNumber(rest, currentIso)) return { iso: currentIso, national: rest };
  }

  return null;
}

// Validates a full international phone number (e.g. "+230 5769 8834") against
// each country's real numbering rules (Mauritius = 8 digits, France = 9, …).
// Used both client-side (live feedback) and server-side (anti-spam enforcement).
export function isValidPhone(full: string | null | undefined): boolean {
  const v = (full ?? "").trim();
  if (!v) return false;
  try {
    return isValidPhoneNumber(v);
  } catch {
    return false;
  }
}

// Basic but solid email format check (used client + server).
export function isValidEmail(email: string | null | undefined): boolean {
  const v = (email ?? "").trim();
  if (!v || v.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

/**
 * A number in strict E.164: a plus, then digits, and nothing else.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * PhoneInput hands its caller `formatInternational()`, which is deliberately
 * HUMAN-readable: "+230 5712 3456", with spaces. Most endpoints on this site
 * accept that and store it as typed.
 *
 * /api/delivery-requests does not, and neither does the table underneath it:
 * both enforce /^\+[1-9][0-9]{6,15}$/. So every Deliver Anything submission
 * failed validation before it reached the database — a 400 on the last tap of
 * the form, for everybody, always. `delivery_requests` having zero rows was
 * partly the dead loop behind it and partly this.
 *
 * Returns null when there is nothing usable, so a caller can tell "empty" from
 * "wrong" rather than sending a string the server will certainly reject.
 */
/**
 * The same job as toE164, for a box somebody typed a LOCAL number into.
 *
 * ── WHY toE164 IS NOT ENOUGH ──────────────────────────────────────────────
 * toE164 assumes the country code is already present: it strips punctuation,
 * bolts on a "+" and checks the shape. Hand it a Mauritian mobile as anyone
 * here writes it — "70587837" — and it returns "+70587837", which passes that
 * regex and is not a phone number anywhere on earth.
 *
 * That is not hypothetical. /api/rides stored `phone` exactly as typed, and on
 * 9 Sept a real customer's "70587837" went into the database raw. Every
 * wa.me and tel: link built from it was dead, and the number looked WRONG to
 * the person reading the dispatch screen when it was perfectly correct — it was
 * missing +230, which the app never added.
 *
 * So this parses against a default country, the way the person typing expects:
 *
 *   "70587837"      -> +23070587837   (national, assumed Mauritian)
 *   "+230 7058 7837"-> +23070587837   (already international)
 *   "0033 6 12 …"   -> +33612…        (a tourist's own number, respected)
 *
 * An explicit country code always wins, so a visitor's foreign number is never
 * rewritten into a Mauritian one. Returns null when the result is not a valid
 * number for its country, so the caller decides what to do rather than storing
 * something unreachable.
 */
export function toE164National(
  input: string | null | undefined,
  defaultCountry: CountryCode = "MU",
): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  // "00" is how a keypad dials international; libphonenumber wants a "+".
  const text = /^00\d/.test(raw.replace(/[\s\-().]/g, ""))
    ? `+${raw.replace(/[\s\-().]/g, "").slice(2)}`
    : raw;
  try {
    const parsed = parsePhoneNumberFromString(text, defaultCountry);
    return parsed?.isValid() ? parsed.number : null;
  } catch {
    return null;
  }
}

export function toE164(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  // Keep a leading plus, drop every other non-digit: spaces, hyphens,
  // brackets and the non-breaking space some keyboards insert.
  const digits = raw.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
  const withPlus = digits.startsWith("+") ? digits : `+${digits}`;
  return /^\+[1-9]\d{6,15}$/.test(withPlus) ? withPlus : null;
}
