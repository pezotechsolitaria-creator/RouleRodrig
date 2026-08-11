import type { CaptureResult } from "posthog-js";

// ── What must never reach PostHog ────────────────────────────────────────────
//
// Sibling of lib/sentry-scrub.ts, and deliberately NOT a copy of it. The two
// vendors receive different shapes: Sentry gets exceptions with request bodies,
// PostHog gets analytics events with flat property bags, autocaptured DOM
// element chains, and person properties. The threat is the same though — this
// app's forms carry names, phone numbers, delivery coordinates and bank
// details, and PostHog has no built-in scrubbing of its own.
//
// This exists so the guarantee is STRUCTURAL rather than a matter of developer
// discipline. Today every posthog.capture() call in the repo sends only counts,
// ids and booleans. This file is what keeps that true after someone writes
// `posthog.capture("checkout", { phone, email, address })` in a hurry.
//
// Runs in the browser only, on every outbound event, via `before_send`.

const REDACTED = "[redacted]";

// Matched as a SUBSTRING of the property key, case-insensitively. Anything here
// is dropped wholesale — we never try to partially preserve a sensitive field.
const DENY_SUBSTRINGS = [
  // contact details
  "email", "phone", "mobile", "telephone", "whatsapp",
  "address", "street", "postal", "postcode", "zipcode",
  // people
  "first_name", "firstname", "last_name", "lastname", "full_name", "fullname",
  "customer_name", "contact_name", "account_holder", "holder_name",
  "birthdate", "birth_date", "passport", "national_id",
  // money
  "account_number", "iban", "swift", "bic", "bank", "card", "cvv", "cvc",
  "payment_instructions", "receipt",
  // location precise enough to identify a home
  "delivery_lat", "delivery_lng", "delivery_instructions",
  "latitude", "longitude", "coordinates", "geolocation",
  // credentials
  "password", "passwd", "secret", "api_key", "apikey", "authorization",
  // "_token" catches auth_token / access_token / refresh_token / id_token in
  // one rule. It deliberately does NOT match the bare `token` property, which
  // belongs to PostHog — see POSTHOG_OWNED_PROPERTIES below.
  "_token", "authtoken", "bearer", "jwt", "credential", "signature",
  "cookie", "otp", "one_time", "pin_code",
  // codes that can single out a person
  "referral_code", "partner_code", "promo_code", "voucher", "coupon_code",
] as const;

// Matched against the WHOLE key. These are too short or too common to use as
// substrings — "pan" would eat "panel", and "name" would eat the perfectly
// legitimate "store_name" / "product_name" that the marketplace events use.
const DENY_EXACT = new Set([
  "name", "username", "surname", "dob", "ssn", "nid", "pan", "token", "pin",
]);

// ── Do not touch these, ever ─────────────────────────────────────────────────
//
// PostHog puts its own plumbing in the SAME flat `properties` bag as our custom
// properties, and unlike the rest of its internals these are NOT `$`-prefixed.
// `properties.token` is the project API key: ingest returns 401 for any event
// whose token was altered, and posthog-js sends it anyway — so redacting it
// produces a total, silent analytics outage with no console error and no failed
// request visible to the page. posthog-js names this exact hazard in
// `_runBeforeSend` ("a generic token/PII scrubber matching /token/i"), and this
// scrubber walked straight into it in production before this exemption existed.
//
// `token` is the only name posthog enforces (`knownUnsafeEditableEventProperty`);
// `distinct_id` is included because it is equally PostHog-owned and equally
// fatal to lose, and it is a random id rather than personal data.
const POSTHOG_OWNED_PROPERTIES = new Set(["token", "distinct_id"]);

// Query parameters worth stripping out of any URL we report. A booking link or
// a magic-link callback routinely carries exactly this.
const DENY_QUERY_PARAMS = [
  "email", "phone", "token", "access_token", "refresh_token", "code",
  "otp", "ref", "reference", "name", "address", "secret", "key", "signature",
];

// `has_receipt: true` says a receipt was attached; it does not say what is in
// it. A boolean under a has_/is_ style key is a presence flag and carries no
// personal data by construction, so it is exempt from the key deny-list — the
// app relies on exactly this pattern (has_deposit, has_receipt, has_logo,
// is_guest_checkout) to keep sensitive values out of analytics in the first
// place. The value must actually BE a boolean; `has_email: "marie@…"` is not a
// flag and stays subject to the deny-list.
const PRESENCE_FLAG_KEY = /^(has|is|had|was|can|should|with)_/;

function isPresenceFlag(key: string, value: unknown): boolean {
  return typeof value === "boolean" && PRESENCE_FLAG_KEY.test(key.toLowerCase());
}

function isDeniedKey(key: string): boolean {
  const k = key.toLowerCase();
  if (DENY_EXACT.has(k)) return true;
  return DENY_SUBSTRINGS.some((d) => k.includes(d));
}

/**
 * Values that betray identity even under an innocent key name. Same families as
 * the Sentry scrubber so the two cannot disagree about what counts as private.
 */
export function scrubValue(value: string): string {
  return (
    value
      // email addresses
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, REDACTED)
      // any +prefixed international number of 7+ digits
      .replace(/\+\d[\d\s()-]{6,}\d/g, REDACTED)
      // JWTs and Supabase / Resend style keys
      .replace(/\b(eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,})\b/g, REDACTED)
      .replace(/\b(sb[ps]_[A-Za-z0-9_-]{20,})\b/g, REDACTED)
      .replace(/\b(re_[A-Za-z0-9_-]{20,})\b/g, REDACTED)
      // a booking reference identifies a real customer's booking
      .replace(/\bRR-[0-9A-F]{6}\b/gi, "RR-[redacted]")
  );
}

/**
 * Strips sensitive query parameters from a URL, then runs value scrubbing over
 * whatever is left. Works on absolute and relative URLs; anything unparseable
 * falls back to plain value scrubbing rather than being dropped, because a
 * missing $current_url breaks page analytics entirely.
 */
export function scrubUrl(raw: string): string {
  try {
    // A base is required for relative URLs; it is discarded before returning.
    const base = "https://roulerodrig.com";
    const isAbsolute = /^[a-z][a-z0-9+.-]*:/i.test(raw);
    const url = new URL(raw, base);

    let touched = false;
    for (const param of DENY_QUERY_PARAMS) {
      if (url.searchParams.has(param)) {
        url.searchParams.set(param, REDACTED);
        touched = true;
      }
    }
    if (!touched && !/[?#]/.test(raw)) return scrubValue(raw);

    const out = isAbsolute ? url.href : `${url.pathname}${url.search}${url.hash}`;
    return scrubValue(out);
  } catch {
    return scrubValue(raw);
  }
}

const URLISH_KEY = /(^\$?(current_|initial_)?url$)|url$|href$|referrer$|pathname$/i;

// Depth-limited so a cyclic or pathologically nested payload cannot hang the
// browser while being sanitised.
function scrubDeep(input: unknown, depth = 0): unknown {
  if (depth > 8) return REDACTED;
  if (typeof input === "string") return scrubValue(input);
  if (Array.isArray(input)) return input.map((v) => scrubDeep(v, depth + 1));
  if (input && typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (isPresenceFlag(k, v)) {
        out[k] = v;
      } else if (isDeniedKey(k)) {
        out[k] = REDACTED;
      } else if (typeof v === "string" && URLISH_KEY.test(k)) {
        // Reached via autocapture's `$elements`, where each element carries
        // `attr__href` in full. Without this the query string on a link like
        // /orders/track?ref=RR-A1B2C3 would survive one level down.
        out[k] = scrubUrl(v);
      } else {
        out[k] = scrubDeep(v, depth + 1);
      }
    }
    return out;
  }
  return input;
}

/**
 * Property bags get PostHog-aware treatment.
 *
 * Keys beginning with `$` are PostHog's own and are never dropped — deleting
 * `$session_id` or `$device_id` would break sessions, funnels and stickiness
 * for no privacy gain, since they are random ids and not personal data. Their
 * VALUES are still sanitised, because `$current_url` and the autocaptured
 * `$elements_chain` are exactly where a stray email or booking ref shows up.
 *
 * Everything else — our own custom event properties — is subject to the
 * deny-list. Legitimate analytics identifiers (store_id, variant_id,
 * scooter_id, place_id, event_store_id, item_count, …) match nothing here and
 * pass through untouched.
 */
function scrubProperties(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(props)) {
    const isInternal = key.startsWith("$");

    // First, before any rule: PostHog's own plumbing passes through verbatim.
    // Editing it does not protect anyone and breaks ingestion outright.
    if (POSTHOG_OWNED_PROPERTIES.has(key)) {
      out[key] = value;
      continue;
    }

    if (isPresenceFlag(key, value)) {
      out[key] = value;
      continue;
    }

    if (!isInternal && isDeniedKey(key)) {
      out[key] = REDACTED;
      continue;
    }

    if (typeof value === "string") {
      out[key] = URLISH_KEY.test(key) ? scrubUrl(value) : scrubValue(value);
      continue;
    }

    out[key] = scrubDeep(value, 1);
  }

  return out;
}

/**
 * PostHog `before_send`. Runs on every event before it leaves the browser, so a
 * mistake here is the difference between private customer data and data sitting
 * in a third-party analytics product.
 *
 * Returns the event (never null) — this filter sanitises, it does not drop
 * events, because silently discarding analytics is its own kind of bug.
 */
export function scrubPostHogEvent(cr: CaptureResult | null): CaptureResult | null {
  if (!cr) return null;

  try {
    if (cr.properties) {
      cr.properties = scrubProperties(cr.properties);
    }

    // Person properties are the highest-value target in the whole payload: they
    // persist against the profile rather than a single event.
    if (cr.$set) cr.$set = scrubProperties(cr.$set);
    if (cr.$set_once) cr.$set_once = scrubProperties(cr.$set_once);

    return cr;
  } catch {
    // Fail CLOSED. If sanitising threw, we do not know what is in this payload,
    // and returning it unscrubbed would defeat the only reason this function
    // exists. Dropping one event costs a gap in a chart; sending a customer's
    // phone number to a third party is permanent. Same trade-off the Sentry
    // scrubber makes in lib/sentry-scrub.ts.
    return null;
  }
}
