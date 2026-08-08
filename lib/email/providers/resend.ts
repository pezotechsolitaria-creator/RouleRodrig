import "server-only";
import {
  classifyHttp,
  classifyThrown,
  type EmailProvider,
  type ProviderHealth,
  type SendOutcome,
  type SendRequest,
} from "./types";

// ── Resend adapter ──────────────────────────────────────────────────────────
// Same REST call the previous inline implementation made (no SDK dependency),
// with three things it did not do: the message ID is captured, failures are
// classified, and the sender is refused rather than guessed.

const ENDPOINT = "https://api.resend.com/emails";

/**
 * THE `onboarding@resend.dev` TRAP — and why this adapter has no default sender.
 *
 * The previous code fell back to `Roule Rodrigues <onboarding@resend.dev>` when
 * RESEND_FROM was unset. That address is Resend's SHARED test sender, and it can
 * only deliver to the Resend account owner's own address. Combined with the old
 * send() returning from inside the Resend branch the moment a key existed, the
 * result was a single-variable catastrophe: set RESEND_API_KEY in Vercel and
 * every customer email would be silently rejected while the site reported
 * healthy.
 *
 * So there is deliberately NO fallback here. No verified sender means this
 * provider reports itself unconfigured, the router routes elsewhere, and the
 * admin dashboard says exactly what is missing. A provider that refuses to run
 * half-configured cannot be misconfigured into silence.
 */
function senderFor(): { from: string; problem?: string } {
  const from = (process.env.RESEND_FROM ?? "").trim();
  if (!from) {
    return {
      from: "",
      problem:
        "RESEND_FROM is not set. Resend needs a sender on a domain you have verified — " +
        "the onboarding@resend.dev fallback only delivers to your own Resend account address, " +
        "so it is deliberately not used.",
    };
  }
  if (/onboarding@resend\.dev/i.test(from)) {
    return {
      from: "",
      problem:
        "RESEND_FROM is set to onboarding@resend.dev, which can only deliver to your own " +
        "Resend account address. Set a sender on your verified domain.",
    };
  }
  return { from };
}

function apiKey(): string {
  return (process.env.RESEND_API_KEY ?? "").trim();
}

export const resendProvider: EmailProvider = {
  name: "resend",

  async health(): Promise<ProviderHealth> {
    if (!apiKey()) return { configured: false, reason: "RESEND_API_KEY is not set." };
    const { problem } = senderFor();
    if (problem) return { configured: false, reason: problem };
    return { configured: true };
  },

  async send(req: SendRequest): Promise<SendOutcome> {
    const key = apiKey();
    if (!key) return { ok: false, failure: "auth", reason: "RESEND_API_KEY is not set" };
    const { from, problem } = senderFor();
    if (problem) return { ok: false, failure: "auth", reason: problem };

    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: req.to,
          subject: req.subject,
          html: req.html,
          ...(req.attachments?.length
            ? { attachments: req.attachments.map((a) => ({ filename: a.name, content: a.content })) }
            : {}),
        }),
      });

      const text = await res.text().catch(() => "");
      if (!res.ok) {
        const { failure, reason } = classifyHttp(res.status, text);
        // Body is NOT included in the reason: it is a provider error payload
        // that can echo the request, and this string is written to the log and
        // shown in the admin dashboard.
        console.error("[email] Resend rejected send", res.status, failure);
        return { ok: false, failure, reason, status: res.status };
      }

      // Resend returns { id }. Captured because it is the only handle that can
      // later answer "did this really go out?" for an ambiguous send.
      let messageId: string | null = null;
      try {
        messageId = (JSON.parse(text) as { id?: string })?.id ?? null;
      } catch {
        /* accepted without a parseable body — still accepted */
      }
      return { ok: true, messageId };
    } catch (err) {
      const { failure, reason } = classifyThrown(err);
      console.error("[email] Resend transport failure", failure);
      return { ok: false, failure, reason };
    }
  },
};
