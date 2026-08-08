import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardShared } from "@/lib/rate-limit";
import { checkPwnedPassword, lengthComplaint, MIN_PASSWORD_LENGTH } from "@/lib/auth/pwned";

// Is this password safe to use? Called before sign-up and before a password
// reset, so a customer is told BEFORE they commit rather than after.
//
// ── WHY SERVER-SIDE ─────────────────────────────────────────────────────────
// The k-anonymity model would technically allow the browser to query HIBP
// directly. Doing it here instead means one rate limit, one timeout policy, one
// fail-open rule, and no third-party request originating from the customer's
// device — which is also the answer to "why is my browser talking to
// pwnedpasswords.com?".
//
// ── WHY THIS IS NOT AN ORACLE ───────────────────────────────────────────────
// The endpoint answers only about a password the caller ALREADY supplied. It
// reveals nothing about any account: it does not take an email, does not touch
// the database, and returns the same shape whether or not a user exists. The
// worst an attacker can do is ask "is this password in HIBP?" — a question they
// can already ask HIBP directly, for free.
//
// Rate-limited anyway, because it is an unauthenticated endpoint that makes an
// outbound request, and that is worth bounding regardless.
const schema = z.object({
  password: z.string().min(1).max(200),
});

export async function POST(req: NextRequest) {
  const limited = await guardShared(req, "password-check", 20, 60_000);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const password = parsed.data.password;

  // Length first — it is local, instant, and a short password is refused
  // whether or not HIBP can be reached.
  const tooShort = lengthComplaint(password);
  if (tooShort) {
    return NextResponse.json({ ok: false, reason: "length", message: tooShort, minLength: MIN_PASSWORD_LENGTH });
  }

  const result = await checkPwnedPassword(password);
  if (result.breached) {
    return NextResponse.json({
      ok: false,
      reason: "breached",
      // The count is the persuasive part. "This password has appeared in
      // 24,230 breaches" changes behaviour in a way "weak password" does not.
      count: result.count,
      message:
        `This password has appeared in ${result.count.toLocaleString("en")} known data breaches. ` +
        `Attackers try these first — please choose a different one.`,
    });
  }

  // `checked: false` means HIBP was unreachable and we failed open. Surfaced
  // honestly rather than reported as a clean bill of health.
  return NextResponse.json({ ok: true, checked: result.checked });
}
