import "server-only";
import type { ProviderName } from "../config";

// ── Provider contract and failure classification (M41) ──────────────────────
//
// The old send() had one notion of failure: `return false`. A 429 rate-limit, a
// hard-bounced address, an expired API key and a socket reset were all the same
// event, which made every downstream decision — retry? fall back? alert? — a
// guess. This file is where that guess is replaced by a classification.
//
// The distinction that matters most is between "the provider definitely did not
// accept this" and "we cannot tell whether it did". The brief calls these
// cases 1 and 2, and they demand opposite behaviour:
//
//   definitely not accepted → retrying is FREE and correct
//   cannot tell            → retrying is how you send a customer two tickets
//
// So `unknown` is a first-class outcome here, never folded into failure.

export interface Attachment {
  name: string;
  /** base64 */
  content: string;
}

export interface SendRequest {
  to: string;
  subject: string;
  html: string;
  attachments?: Attachment[];
}

/**
 * What went wrong, and therefore what may be done about it.
 *
 *  transient  — provider said "not now" (429 rate limit, 5xx), or the request
 *               never left the machine (DNS, connection refused). Nothing was
 *               accepted. Retry the SAME provider with backoff.
 *  quota      — the account's sending allowance is spent. Nothing was accepted,
 *               and no amount of waiting fixes it today. The ONLY class for
 *               which switching providers is safe.
 *  auth       — bad or missing API key, unverified sender. A configuration
 *               fault; the other provider will not fix it. Alert the owner.
 *  invalid    — the recipient address is not deliverable. Terminal; no retry,
 *               no fallback, and not the provider's fault.
 *  permanent  — the request itself is wrong (validation, bad template).
 *               Terminal. The other provider would reject it identically.
 *  unknown    — the request may or may not have been accepted: a timeout after
 *               the bytes went out, a connection reset mid-flight. NEVER retried
 *               automatically and NEVER failed over. Logged for reconciliation
 *               against the provider's own record.
 */
export type FailureClass = "transient" | "quota" | "auth" | "invalid" | "permanent" | "unknown";

export type SendOutcome =
  | { ok: true; messageId: string | null }
  | { ok: false; failure: FailureClass; reason: string; status?: number };

export interface ProviderHealth {
  /** False when the provider cannot send at all — no key, or no usable sender. */
  configured: boolean;
  /** Human-readable why-not, safe to show an admin. Never contains a key. */
  reason?: string;
}

export interface EmailProvider {
  name: ProviderName;
  health(): Promise<ProviderHealth>;
  send(req: SendRequest): Promise<SendOutcome>;
}

// ── Classification helpers, shared by both adapters ─────────────────────────

/**
 * Classifies an HTTP response. `body` is the provider's response text, used
 * only to separate a rate limit from a spent allowance — both arrive as 429 at
 * one provider or the other, and they demand different behaviour (wait vs.
 * switch provider).
 */
export function classifyHttp(status: number, body: string): { failure: FailureClass; reason: string } {
  const lower = (body ?? "").toLowerCase();
  const quotaWords = /quota|credit|allowance|daily limit|monthly limit|limit reached|limit exceeded|plan limit|upgrade/;

  if (status === 401 || status === 403) {
    return { failure: "auth", reason: `${status} authentication/permission rejected by provider` };
  }
  // Brevo signals a spent allowance with 402 Payment Required.
  if (status === 402) return { failure: "quota", reason: `${status} sending allowance exhausted` };

  if (status === 429) {
    // A 429 whose body talks about quota is an exhausted allowance, not a
    // per-second rate limit — waiting will not clear it today.
    return quotaWords.test(lower)
      ? { failure: "quota", reason: "429 sending allowance exhausted" }
      : { failure: "transient", reason: "429 rate limited" };
  }

  if (status >= 500) return { failure: "transient", reason: `${status} provider error` };

  if (status === 400 || status === 422) {
    // An undeliverable address is the caller's data problem, not a bad request
    // to fix — worth separating so it is never retried and never alerted on.
    if (/invalid.*(email|recipient|address)|(email|recipient|address).*invalid|not a valid email/.test(lower)) {
      return { failure: "invalid", reason: `${status} recipient address rejected` };
    }
    if (quotaWords.test(lower)) return { failure: "quota", reason: `${status} sending allowance exhausted` };
    return { failure: "permanent", reason: `${status} request rejected by provider` };
  }

  if (status === 404) return { failure: "permanent", reason: "404 provider endpoint or resource missing" };

  return { failure: "permanent", reason: `${status} unexpected provider response` };
}

/**
 * Classifies a thrown fetch error by whether the request could have been
 * received. Node's fetch wraps the real cause, so the socket-level code is what
 * actually carries the information.
 *
 * Errors that prove nothing was sent (no route, refused, DNS) are transient and
 * safe to retry. Anything that could have been received mid-flight (reset,
 * read timeout, abort) is `unknown` and must not be. The default is `unknown`,
 * because guessing wrong in that direction only costs a retry, while guessing
 * wrong in the other direction sends a duplicate.
 */
export function classifyThrown(err: unknown): { failure: FailureClass; reason: string } {
  const cause = (err as { cause?: { code?: string } } | null)?.cause;
  const code = cause?.code ?? (err as { code?: string } | null)?.code ?? "";
  const name = (err as { name?: string } | null)?.name ?? "";

  // Never reached the provider: retrying is free.
  if (["ENOTFOUND", "ECONNREFUSED", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT", "ERR_SOCKET_CONNECTION_TIMEOUT"].includes(code)) {
    return { failure: "transient", reason: `connection failed before send (${code})` };
  }
  // May have been received and processed — acceptance genuinely unknown.
  if (["ECONNRESET", "ETIMEDOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "UND_ERR_SOCKET"].includes(code)) {
    return { failure: "unknown", reason: `connection lost mid-request (${code})` };
  }
  if (name === "AbortError" || name === "TimeoutError") {
    return { failure: "unknown", reason: "request aborted or timed out after sending" };
  }
  return { failure: "unknown", reason: `transport error (${code || name || "unspecified"})` };
}

/** Parse a `Name <email@host>` string, or a bare address. */
export function parseFrom(raw: string): { email: string; name: string } {
  const m = /^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/.exec(raw);
  if (m) return { name: m[1] || "Roule Rodrigues", email: m[2].trim() };
  return { name: "Roule Rodrigues", email: raw.trim() };
}
