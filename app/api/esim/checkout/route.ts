import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardShared } from "@/lib/rate-limit";
import { startCheckout, EsimError } from "@/lib/esim/service";

// Step 1 of buying an eSIM: plan + email → our order row + a PayPal order id
// for the PayPal button to approve. The PRICE is never sent by the client; it
// is read from the plan row, and the wholesaler's live price is checked
// against it before anyone is asked to pay.

const body = z.object({
  planId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email().max(254),
  language: z.enum(["en", "fr", "cr"]).default("en"),
  // Attribution only (utm_*, referrer, landing path). Never trusted for money.
  source: z.record(z.string().max(40), z.string().max(200)).optional(),
});

export async function POST(req: NextRequest) {
  const limited = await guardShared(req, "esim-checkout", 10, 60_000);
  if (limited) return limited;

  let parsed;
  try {
    parsed = body.safeParse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!parsed.success) {
    const emailBad = parsed.error.issues.some((i) => i.path[0] === "email");
    return NextResponse.json(
      { error: emailBad ? "Please enter a valid email — your eSIM is sent there." : "Invalid request." },
      { status: 400 },
    );
  }

  const source = Object.fromEntries(Object.entries(parsed.data.source ?? {}).slice(0, 10));
  try {
    const r = await startCheckout({ ...parsed.data, source });
    return NextResponse.json({ orderId: r.orderId, ref: r.ref, paypalOrderId: r.paypalOrderId });
  } catch (e) {
    if (e instanceof EsimError) {
      if (e.status >= 500) console.error("[esim] checkout", e.message);
      return NextResponse.json({ error: e.publicMessage }, { status: e.status });
    }
    console.error("[esim] checkout crashed", e);
    return NextResponse.json({ error: "Something went wrong. You have not been charged." }, { status: 500 });
  }
}
