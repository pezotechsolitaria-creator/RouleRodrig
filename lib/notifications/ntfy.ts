import "server-only";

// ── ntfy: a push to the owner's phone that costs nothing ────────────────────
//
// The owner chose ntfy over WhatsApp for alerts, and it is a good choice for
// this platform: no account, no per-message cost, no third party holding a
// credential that can send AS him, and an Android/iOS app that behaves like a
// real push notification instead of a chat message he has to swipe.
//
// Same shape as lib/notifications/whatsapp.ts on purpose. This module knows how
// to put a string on ntfy and nothing else — who is eligible, what happened and
// what happens next all stay in Postgres. Swapping one for the other is a
// column on notification_slots, not a rewrite.
//
// ── THE TOPIC IS THE SECRET ────────────────────────────────────────────────
// On the public ntfy.sh, ANYONE who knows a topic name can read it and post to
// it. There is no password on a bare topic. So:
//   · use a long unguessable topic (rr-a7f3c1e9-…), not "roulerodrig";
//   · or self-host, or use an access-controlled topic and set NTFY_TOKEN.
// Alert text on this platform carries customer names and phone numbers, which
// is exactly why this is written down here rather than assumed.

/** How long we wait before deciding ntfy is not going to answer. */
const TIMEOUT_MS = 10_000;

export type SendResult = { ok: true } | { ok: false; error: string; retryable: boolean };

/**
 * Resolve a slot's `target` to the URL we POST to.
 *
 * A bare topic goes to the public server; a full URL is used unchanged, which
 * is what makes a self-hosted ntfy a configuration change rather than a code
 * change.
 */
export function ntfyUrl(target: string): string | null {
  const t = target.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t.replace(/\/+$/, "");
  // Topic names are restricted by ntfy itself; refuse anything that would
  // become a path traversal or a second URL.
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(t)) return null;
  return `https://ntfy.sh/${t}`;
}

/**
 * Send one ntfy notification.
 *
 * Returns a result rather than throwing, for the same reason sendWhatsApp does:
 * the worker records an outcome per job, and one misconfigured slot must not
 * abort a whole batch.
 */
export async function sendNtfy(opts: {
  /** Topic name, or a full URL for a self-hosted server. */
  target: string;
  /** The queue's formatted message. Its first line becomes the title. */
  message: string;
  /** ntfy priority 1..5. Default 4 ("high") — these are alerts, not chatter. */
  priority?: number;
}): Promise<SendResult> {
  const url = ntfyUrl(opts.target);
  if (!url) {
    return { ok: false, error: "ntfy target is not a topic or URL", retryable: false };
  }

  const text = (opts.message ?? "").trim();
  if (!text) return { ok: false, error: "empty message", retryable: false };

  // The queue formats messages as a title line followed by detail lines, so
  // the notification gets a real title instead of repeating the whole blob.
  const [firstLine, ...rest] = text.split("\n");
  const body = rest.join("\n").trim() || firstLine;

  const headers: Record<string, string> = {
    "Content-Type": "text/plain; charset=utf-8",
    Priority: String(opts.priority ?? 4),
  };
  // Header values must be latin-1 safe: an emoji in a title (and every alert
  // here starts with one) throws "Invalid character in header content" and the
  // send fails before it leaves the process. The title is stripped to ASCII and
  // the original first line stays in the BODY, so nothing is lost.
  const asciiTitle = firstLine.replace(/[^\x20-\x7E]/g, "").trim();
  if (asciiTitle) headers.Title = asciiTitle.slice(0, 120);

  // Optional, and only for a server that requires it. A public topic needs no
  // token; a protected or self-hosted one does.
  const token = process.env.NTFY_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: rest.length > 0 ? `${firstLine}\n${body}` : body,
      signal: controller.signal,
      cache: "no-store",
    });

    if (res.ok) return { ok: true };

    const detail = (await res.text().catch(() => "")).slice(0, 200);
    // 4xx is us: a bad topic, a missing token, a message ntfy refused. Retrying
    // it five times over an hour only delays the moment somebody looks at it.
    return {
      ok: false,
      error: `ntfy ${res.status}${detail ? `: ${detail}` : ""}`,
      retryable: res.status >= 500 || res.status === 429,
    };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      error: aborted ? "ntfy timed out" : `ntfy unreachable: ${String(err)}`,
      retryable: true,
    };
  } finally {
    clearTimeout(timer);
  }
}
