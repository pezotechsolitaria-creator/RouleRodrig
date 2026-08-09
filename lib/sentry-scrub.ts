import type { ErrorEvent, EventHint } from "@sentry/nextjs";

// ── What must never reach Sentry ─────────────────────────────────────────────
//
// This app's errors travel with unusually sensitive company: an exception thrown
// inside checkout carries the request body, and that body holds names, phone
// numbers and delivery coordinates. A merchant route can carry bank details.
// Sentry's own default scrubbing catches obvious field names; it does not know
// about `p_receipt_path`, `service_role`, or that RR references identify a real
// booking. So the deny-list is ours and it is deliberately aggressive: losing a
// debugging detail costs a few minutes, leaking a customer's phone number is
// permanent.
//
// Applied on the SERVER and the CLIENT — a browser event can carry a form field
// just as easily as a request body can.

// Matched case-insensitively against key names anywhere in the payload.
const DENY_KEYS = [
  // secrets
  "password", "passwd", "secret", "token", "api_key", "apikey", "authorization",
  "auth", "cookie", "session", "jwt", "bearer", "service_role", "anon_key",
  "supabase_service_role_key", "cron_secret", "admin_password", "session_secret",
  "brevo_api_key", "resend_api_key", "paypal_secret", "upstash",
  // money
  "account_number", "account_holder", "bank_name", "iban", "card", "cvv", "cvc",
  "pan", "payment_instructions", "receipt", "payment_receipt_path",
  // people
  "email", "phone", "whatsapp", "customer_phone", "customer_name",
  "delivery_lat", "delivery_lng", "delivery_instructions", "address",
  "contact_email", "contact_phone",
];

const REDACTED = "[redacted]";

function looksSensitive(key: string): boolean {
  const k = key.toLowerCase();
  return DENY_KEYS.some((d) => k.includes(d));
}

// Values that betray identity even under an innocent key name.
function scrubValue(value: string): string {
  return value
    // email addresses
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, REDACTED)
    // any + prefixed international number of 7+ digits
    .replace(/\+\d[\d\s()-]{6,}\d/g, REDACTED)
    // Supabase/Vercel style keys and JWTs
    .replace(/\b(eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,})\b/g, REDACTED)
    .replace(/\b(sb[ps]_[A-Za-z0-9_-]{20,})\b/g, REDACTED)
    .replace(/\b(re_[A-Za-z0-9_-]{20,})\b/g, REDACTED)
    // a booking reference identifies a real customer's booking
    .replace(/\bRR-[0-9A-F]{6}\b/gi, "RR-[redacted]");
}

// Depth-limited so a cyclic or pathologically nested payload cannot hang the
// process while trying to sanitise it.
function scrub(input: unknown, depth = 0): unknown {
  if (depth > 8) return REDACTED;
  if (typeof input === "string") return scrubValue(input);
  if (Array.isArray(input)) return input.map((v) => scrub(v, depth + 1));
  if (input && typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      out[k] = looksSensitive(k) ? REDACTED : scrub(v, depth + 1);
    }
    return out;
  }
  return input;
}

/**
 * Sentry `beforeSend`. Runs on every event, client and server, before it leaves
 * the process — so a mistake here is the difference between a private error and
 * a published one.
 */
export function scrubEvent(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
  // Never attribute an error to a real person. Sentry can group by IP or user
  // id by default; neither is worth a customer's identity in a third party.
  delete event.user;
  if (event.request) {
    delete event.request.cookies;
    delete event.request.env;
    if (event.request.headers) {
      event.request.headers = scrub(event.request.headers) as Record<string, string>;
    }
    if (event.request.data) event.request.data = scrub(event.request.data);
    // Query strings routinely carry a booking reference or an email.
    if (typeof event.request.query_string === "string") {
      event.request.query_string = scrubValue(event.request.query_string);
    }
    if (typeof event.request.url === "string") {
      event.request.url = scrubValue(event.request.url);
    }
  }
  if (event.extra) event.extra = scrub(event.extra) as Record<string, unknown>;
  if (event.contexts) event.contexts = scrub(event.contexts) as typeof event.contexts;
  // Exception messages are the sneakiest leak: a Postgres error quotes the row
  // that violated a constraint, which can include an email address verbatim.
  if (event.exception?.values) {
    for (const v of event.exception.values) {
      if (v.value) v.value = scrubValue(v.value);
    }
  }
  if (event.message) event.message = scrubValue(event.message);
  if (event.breadcrumbs) {
    for (const b of event.breadcrumbs) {
      if (b.message) b.message = scrubValue(b.message);
      if (b.data) b.data = scrub(b.data) as Record<string, unknown>;
    }
  }
  return event;
}

/** Shared across client, server and edge so the three cannot drift apart. */
export const SENTRY_COMMON = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  // Never send PII, even when an integration offers it.
  sendDefaultPii: false,
  // 10% of transactions. Enough to see a slow route, far short of the free
  // tier's ceiling — performance data is the usual cause of a surprise bill.
  tracesSampleRate: 0.1,
  // Local runs would otherwise burn quota and bury real production errors.
  enabled: process.env.NODE_ENV === "production",
  beforeSend: scrubEvent,
} as const;
