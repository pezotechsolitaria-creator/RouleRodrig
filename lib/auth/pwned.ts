import "server-only";
import { createHash } from "node:crypto";

// Leaked-password protection, built rather than bought.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
// Supabase offers "Prevent use of leaked passwords" — and gates it behind the
// Pro plan. This project is on Free, so the toggle is visible but unusable.
//
// The feature is not the interesting part: Supabase is calling the SAME public
// Have I Been Pwned API this file calls, which is free, needs no key, and has
// no plan. The only thing the Pro plan actually buys here is the wiring, and
// the wiring is thirty lines.
//
// ── THE PRIVACY MODEL (k-anonymity) ─────────────────────────────────────────
// The password NEVER leaves this server, and its full hash never leaves either.
// We SHA-1 the password, send only the FIRST FIVE hex characters, and HIBP
// returns every leaked suffix sharing that prefix — hundreds of them. Matching
// happens locally. HIBP cannot tell which of those hundreds we were asking
// about, and cannot reconstruct the password.
//
// SHA-1 is not a security choice here and is not used to protect anything: it
// is simply the index HIBP is built on. The password is still hashed by
// Supabase with bcrypt for storage.
//
// ── FAIL OPEN, DELIBERATELY ─────────────────────────────────────────────────
// If HIBP is slow or down, this returns "not breached" and the sign-up
// proceeds. A password checker that blocks account creation when a third-party
// API blinks has caused a worse outage than the weak passwords it prevents.
// The minimum-length rule still applies, and it is enforced locally.

const HIBP_RANGE_URL = "https://api.pwnedpasswords.com/range";

export interface PasswordCheck {
  /** True when the password appears in a known breach corpus. */
  breached: boolean;
  /** How many times it appears — 0 when clean or when the check could not run. */
  count: number;
  /** False when HIBP could not be reached, so callers can avoid claiming "safe". */
  checked: boolean;
}

/**
 * Looks a password up in the Have I Been Pwned corpus without disclosing it.
 * Never throws.
 */
export async function checkPwnedPassword(password: string): Promise<PasswordCheck> {
  if (!password) return { breached: false, count: 0, checked: false };

  const sha1 = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(`${HIBP_RANGE_URL}/${prefix}`, {
      // Padding asks HIBP to pad the response with decoy hashes so an observer
      // cannot infer anything from the RESPONSE SIZE either.
      headers: { "Add-Padding": "true", "User-Agent": "roule-rodrigues-auth" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return { breached: false, count: 0, checked: false };

    const body = await res.text();
    for (const line of body.split("\n")) {
      const [hashSuffix, countRaw] = line.trim().split(":");
      if (hashSuffix === suffix) {
        const count = Number.parseInt(countRaw ?? "0", 10);
        // A padded decoy is returned with a count of 0 — a real hit never is.
        if (!Number.isFinite(count) || count <= 0) break;
        return { breached: true, count, checked: true };
      }
    }
    return { breached: false, count: 0, checked: true };
  } catch {
    // Timeout, network error, malformed response — all fail open.
    return { breached: false, count: 0, checked: false };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The minimum this project accepts, enforced locally and independent of HIBP.
 *
 * Supabase's own minimum is 6, which is far too short — and raising it in the
 * dashboard only guards Supabase's own endpoints. This is the number the app
 * enforces on every password it sets.
 */
export const MIN_PASSWORD_LENGTH = 10;

/** Human-readable refusal, or null when the password is acceptable. */
export function lengthComplaint(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters — long is far safer than complicated.`;
  }
  return null;
}
