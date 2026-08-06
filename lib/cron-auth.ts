import { createHash, timingSafeEqual } from "node:crypto";

// ── Cron endpoint authorisation ──────────────────────────────────────────────
// Fail CLOSED. The previous guard read:
//
//   const secret = process.env.CRON_SECRET;
//   if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) → 401
//
// so an *unset* CRON_SECRET skipped authentication altogether and left
// /api/cron/reminders — a route listed publicly in vercel.json — callable by
// anyone. That handler emails real customers, pushes a WhatsApp digest
// containing customer names and phone numbers to the owner, and cancels
// pending bookings. "Unprotected because unconfigured" is the one failure mode
// a guard must never have: the moment it matters most is the moment the
// variable is missing.
//
// Missing secret → 503, not 401. They are different problems and the operator
// needs to tell them apart: 503 says "this deployment is misconfigured" and
// shows up as a failing cron run in Vercel, which is exactly the signal that
// gets it fixed. A 401 would look like a rejected caller and hide the cause.

export type CronAuth = { ok: true } | { ok: false; status: 401 | 503; error: string };

// Constant-time compare over SHA-256 digests: timingSafeEqual requires equal
// lengths, and hashing gives that for free without leaking the secret's length.
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

export function authorizeCron(req: { headers: { get(name: string): string | null } }): CronAuth {
  const secret = process.env.CRON_SECRET?.trim();

  if (!secret) {
    return {
      ok: false,
      status: 503,
      error: "Cron is not configured on this deployment (CRON_SECRET is unset).",
    };
  }

  const presented = req.headers.get("authorization") ?? "";
  if (!safeEqual(presented, `Bearer ${secret}`)) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  return { ok: true };
}
