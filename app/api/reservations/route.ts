import { NextRequest, NextResponse } from "next/server";
import { guardShared } from "@/lib/rate-limit";
import { hasServiceRole } from "@/lib/supabase/admin";
import { createReservation, createSchema, ReservationError } from "@/lib/reservations/server";

// POST /api/reservations — request to book (the reservation engine, M240).
//
// The browser sends the party and the date; the PRICE is computed on the
// server from the listing. An Idempotency-Key (a UUID the page generates once
// per request) makes a double tap, a retry or a flaky connection return the
// SAME reservation. The response carries the reference and the token for
// /booking/[token]; the token is never stored.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const limited = await guardShared(req, "reservations", 8, 60_000);
  if (limited) return limited;
  if (!hasServiceRole()) {
    return NextResponse.json({ error: "Reservations are unavailable right now." }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const key = req.headers.get("idempotency-key") ?? body.idempotency_key;
  const parsed = createSchema.safeParse({ ...body, idempotency_key: key });
  if (!parsed.success) {
    return NextResponse.json({ error: "Please check the form.", issues: parsed.error.issues.map((i) => i.path.join(".")) }, { status: 400 });
  }

  try {
    const r = await createReservation(parsed.data);
    return NextResponse.json({ reference: r.reference, token: r.token, existing: r.existing }, { status: r.existing ? 200 : 201 });
  } catch (e) {
    if (e instanceof ReservationError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    console.error("reservation create", e);
    return NextResponse.json({ error: "We couldn't send your request. Please try again." }, { status: 500 });
  }
}
