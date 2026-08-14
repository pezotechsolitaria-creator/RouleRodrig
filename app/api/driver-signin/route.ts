import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { guardShared } from "@/lib/rate-limit";

// ── A driver who closed the tab gets back in (M100) ────────────────────────
//
// The driver page is /d/<64-hex-token>, and that link is the whole credential.
// Lose the WhatsApp message and you lose the job board — the only recovery was
// to ask the owner to send it again, at whatever hour.
//
// Two factors, matching what /track already does for guest bookings:
//
//   · the phone number the driver knows by heart
//   · a 6-character code the owner reads out
//
// A code alone would have been a password that never expires and gets read
// aloud across a counter. Neither factor is useful without the other, and the
// public taxi page already lists driver phone numbers — so the phone is the
// convenience half and the code is the secret half.
//
// The limit is deliberately tight: six hex characters is 16.7 million
// combinations, which is plenty against 6 attempts a minute and nothing at all
// against an unthrottled endpoint. This is where that security actually lives.
const schema = z.object({
  code: z.string().trim().min(4).max(20),
  phone: z.string().trim().min(6).max(30),
});

// One message for every failure. Distinguishing "no such code" from "wrong
// number" would turn this into a way to enumerate which codes are real.
const NO_MATCH = "That code and number do not match. Check both with Roulé Rodrigues.";

export async function POST(req: NextRequest) {
  const limited = await guardShared(req, "driver-signin", 6, 60_000);
  if (limited) return limited;

  if (!hasServiceRole()) {
    return NextResponse.json({ error: "Sign-in is unavailable right now." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: NO_MATCH }, { status: 400 });

  const supabase = await getPrivileged();
  const { data, error } = await supabase.rpc("driver_link_by_code", {
    p_code: parsed.data.code,
    p_phone: parsed.data.phone,
  });

  if (error) {
    console.error("driver_link_by_code failed", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  const result = data as { ok?: boolean; token?: string } | null;
  if (!result?.ok || !result.token) {
    return NextResponse.json({ error: NO_MATCH }, { status: 404 });
  }

  // The token goes back to the browser because it IS the page address. The
  // client redirects rather than this route doing it, so the driver lands on a
  // normal URL they can then install or bookmark — which is the actual cure for
  // the problem, not the sign-in.
  return NextResponse.json({ ok: true, path: `/d/${result.token}` });
}
