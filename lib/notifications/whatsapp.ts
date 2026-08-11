import "server-only";

// ── CallMeBot: the messenger, and nothing else ──────────────────────────────
//
// This module knows how to put a string on WhatsApp. It does not know who is
// eligible, what happened, or what should happen next — all of that stays in
// Postgres. If CallMeBot disappeared tomorrow the platform keeps working and
// the jobs stay pending; that separation is deliberate and worth protecting.
//
// SERVER ONLY. The api_key is a bearer credential: anyone holding it can send
// WhatsApp messages as that number. It is never granted to a client database
// role (M43), never returned by an admin API, and never reaches a bundle.

const ENDPOINT = "https://api.callmebot.com/whatsapp.php";

/** How long we wait before deciding CallMeBot is not going to answer. */
const TIMEOUT_MS = 12_000;

export type SendResult = { ok: true } | { ok: false; error: string; retryable: boolean };

/**
 * Send one WhatsApp message.
 *
 * Returns a result rather than throwing: the worker needs to record an outcome
 * per job, and an exception here would abort a whole batch because one number
 * was misconfigured.
 */
export async function sendWhatsApp(opts: {
  phone: string;
  apiKey: string;
  message: string;
}): Promise<SendResult> {
  const phone = opts.phone.trim();
  const apiKey = opts.apiKey?.trim();

  if (!apiKey) {
    // Not retryable: the slot has no credential, and trying again in two
    // minutes will fail identically. Surfaced so the admin card can say so.
    return { ok: false, error: "This recipient has no CallMeBot API key yet.", retryable: false };
  }
  if (!/^\+[1-9][0-9]{6,15}$/.test(phone)) {
    return { ok: false, error: `"${phone}" is not a valid international number.`, retryable: false };
  }

  // CallMeBot wants the number without the leading +.
  const url =
    `${ENDPOINT}?phone=${encodeURIComponent(phone.replace(/^\+/, ""))}` +
    `&text=${encodeURIComponent(opts.message)}` +
    `&apikey=${encodeURIComponent(apiKey)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: "GET", signal: controller.signal, cache: "no-store" });
    const body = await res.text().catch(() => "");

    if (!res.ok) {
      // 5xx and 429 are worth another go; a 4xx means the request itself is
      // wrong and repeating it just burns attempts.
      const retryable = res.status >= 500 || res.status === 429;
      return { ok: false, error: `CallMeBot ${res.status}: ${summarise(body)}`, retryable };
    }

    // CallMeBot answers 200 with an HTML page even when it refuses, so the
    // status code alone is not proof of delivery. These are the phrases it
    // uses for the two failures an operator actually hits.
    const lower = body.toLowerCase();
    if (lower.includes("apikey") && (lower.includes("invalid") || lower.includes("wrong"))) {
      return { ok: false, error: "CallMeBot rejected the API key for this number.", retryable: false };
    }
    if (lower.includes("not registered") || lower.includes("no apikey")) {
      return {
        ok: false,
        error: "This number has not activated CallMeBot yet.",
        retryable: false,
      };
    }

    return { ok: true };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      // A timeout or a network blip is exactly what retries exist for.
      error: aborted ? "CallMeBot timed out." : err instanceof Error ? err.message : "Network error.",
      retryable: true,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Keep provider HTML out of the admin UI and the logs. */
function summarise(body: string): string {
  return body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160) || "no response body";
}
