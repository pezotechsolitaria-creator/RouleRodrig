import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/lib/rate-limit";
import { completePayment, EsimError } from "@/lib/esim/service";

// Step 2: the PayPal button says "approved". Capture it here — the browser's
// word is never trusted, only PayPal's capture response — then buy the eSIM
// from the wholesaler and wait (up to ~20 s) for the profile, so most buyers
// land on a page that already shows their QR code.
//
// Unauthenticated by design, like the rental capture route: the pair
// (our order id, PayPal order id) is known only to the buyer's browser, and
// completePayment() refuses a PayPal order that is not the one created for
// this row. Idempotent: a second call returns the same order, never a second
// charge or a second eSIM.

export const maxDuration = 60;

const body = z.object({
  orderId: z.string().uuid(),
  paypalOrderId: z.string().trim().min(5).max(64),
});

export async function POST(req: NextRequest) {
  const limited = guard(req, "esim-capture", 12, 60_000);
  if (limited) return limited;

  let parsed;
  try {
    parsed = body.safeParse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  try {
    const r = await completePayment(parsed.data.orderId, parsed.data.paypalOrderId);
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof EsimError) {
      console.error(`[esim] capture ${parsed.data.orderId}: ${e.message}`);
      return NextResponse.json({ error: e.publicMessage }, { status: e.status });
    }
    console.error("[esim] capture crashed", e);
    return NextResponse.json(
      { error: "Your payment may have gone through — do not pay again. Check your email or contact us." },
      { status: 500 },
    );
  }
}
