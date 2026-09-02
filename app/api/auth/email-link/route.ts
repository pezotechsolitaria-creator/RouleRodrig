import { NextRequest, NextResponse } from "next/server";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { guard } from "@/lib/rate-limit";
import { sendAuthLink } from "@/lib/email";
import { SITE_URL } from "@/lib/site";

// ── THE PASSWORD RESET, SENT BY US ──────────────────────────────────────────
//
// Every customer email this business sends goes out through Brevo, from
// bookings@roulerodrig.com, signed by this domain's SPF, DKIM and DMARC, and
// recorded in email_log. Every one except the two that matter most: the
// password reset and the email confirmation. Those were sent by Supabase Auth
// over its own SMTP — a transport its own documentation describes as suitable
// for testing, which rate-limits to one message every 40-odd seconds, and which
// sends from a shared address this domain has never vouched for.
//
// So the single email whose whole job is to be trusted was the single email
// most likely to be filtered, and the one place we could not answer "did it
// actually send?".
//
// generateLink() is the piece that makes this possible: it mints exactly the
// link Supabase would have mailed, and mails nothing. The token stays theirs —
// no security property changes, no expiry logic is reimplemented here — and
// only the delivery moves.

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Only our own paths, so a caller cannot aim a recovery link at their site. */
function safeNext(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/account";
}

export async function POST(req: NextRequest) {
  // Tighter than the ride form: this one sends mail to an address the caller
  // chose, so it is the obvious lever for using us as a spam cannon.
  const limited = guard(req, "auth-email-link", 4, 60_000);
  if (limited) return limited;

  let body: { email?: string; kind?: string; next?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const kind = body.kind === "confirm" ? "confirm" : "recovery";
  const next = safeNext(body.next);

  // ── ALWAYS "ok" FROM HERE DOWN ────────────────────────────────────────────
  // Whether an address has an account is not something a stranger gets to ask.
  // Every branch below returns the same body, so the response cannot be used to
  // enumerate customers — the same reason /login has always reported its reset
  // as sent either way. Failures are logged for us, never reported to them.
  const ok = NextResponse.json({ ok: true });

  if (!EMAIL_RE.test(email)) return ok;
  if (!hasServiceRole()) {
    console.error("auth email-link: no service role; cannot mint a link");
    return ok;
  }

  try {
    const admin = await getPrivileged();
    const redirectTo =
      kind === "recovery"
        ? `${SITE_URL}/auth/reset-password?next=${encodeURIComponent(next)}`
        : `${SITE_URL}/auth/callback?next=${encodeURIComponent(next)}`;

    const { data, error } = await admin.auth.admin.generateLink({
      // `magiclink` rather than `signup` for confirmation: signup would need the
      // password we do not have at resend time, while a magic link both proves
      // the address and signs them straight in — one tap instead of two.
      type: kind === "recovery" ? "recovery" : "magiclink",
      email,
      options: { redirectTo },
    });

    const link = data?.properties?.action_link;
    if (error || !link) {
      // The commonest case by far is "no such user", which is not an error
      // worth alarming about — it is the enumeration guard doing its job.
      console.warn("auth email-link: no link minted", error?.message);
      return ok;
    }

    await sendAuthLink({ to: email, kind, link });
  } catch (err) {
    console.error("auth email-link failed", err);
  }

  return ok;
}
