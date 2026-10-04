import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardShared } from "@/lib/rate-limit";
import { guestAction, viewByToken } from "@/lib/reservations/server";

// GET  /api/reservations/[token] — the guest's reservation (polled by the
//      booking page every 12s while it is being reviewed).
// POST /api/reservations/[token] — the guest's own moves: answer Roulé's
//      question, report a Juice/transfer payment ("I've paid" — a report,
//      never paid), choose cash where the owner allows it, or note that they
//      opened WhatsApp.
//
// The token is the credential; a booking reference opens nothing. Responses
// are never cached: this is one person's live booking.

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await viewByToken(token).catch(() => undefined);
  if (view === undefined) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });
  if (!view) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  return NextResponse.json(view, { headers: NO_STORE });
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("answer"), answer: z.record(z.string(), z.string().max(300)) }),
  z.object({ action: z.literal("report_payment"), method: z.enum(["mcb_juice", "bank_transfer"]) }),
  z.object({ action: z.literal("choose_cash") }),
  z.object({ action: z.literal("message_opened") }),
]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limited = await guardShared(req, "reservation-guest", 20, 60_000);
  if (limited) return limited;
  const { token } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { action, ...rest } = parsed.data;
  const res = await guestAction(token, action, rest);
  return NextResponse.json(res, { status: res.ok ? 200 : res.error === "not_found" ? 404 : 409, headers: NO_STORE });
}
