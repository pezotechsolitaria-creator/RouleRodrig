import { NextRequest, NextResponse, after } from "next/server";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { guard } from "@/lib/rate-limit";

// ── THE DRIVER'S ONE ENDPOINT ───────────────────────────────────────────────
//
// Taxi drivers have no accounts — the owner's decision, and the right one for
// Rodrigues. So the offer carries its own authorisation: a 64-hex-character
// single-use token, sent by WhatsApp, that names exactly one offer.
//
// WHY THE TOKEN IS SAFE AS A CREDENTIAL:
//  · it names an OFFER, not a driver, so it cannot be pointed at another ride
//  · it expires with the offer
//  · it is spent on first answer — a second tap gets "already answered"
//  · it reveals no customer phone number until this driver has WON the job
//  · every decision is made inside a SECURITY DEFINER function; nothing here
//    trusts a field from the request body
//
// Rate limited because a token is guessable in principle, and the only defence
// against grinding 16^64 is that nobody gets to try quickly.

export async function GET(req: NextRequest) {
  const limited = guard(req, "ride-offer-read", 30, 60_000);
  if (limited) return limited;
  if (!hasServiceRole()) {
    return NextResponse.json({ ok: false, reason: "unconfigured" }, { status: 503 });
  }

  const token = new URL(req.url).searchParams.get("t") ?? "";
  if (token.length < 32) return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });

  const admin = await getPrivileged();
  const { data, error } = await admin.rpc("ride_offer_by_token", { p_token: token });
  if (error) {
    console.error("ride_offer_by_token failed", error);
    return NextResponse.json({ ok: false, reason: "error" }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  // Tighter than the read: this one assigns real work.
  const limited = guard(req, "ride-offer-answer", 10, 60_000);
  if (limited) return limited;
  if (!hasServiceRole()) {
    return NextResponse.json({ ok: false, reason: "unconfigured" }, { status: 503 });
  }

  let body: { token?: string; answer?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
  }

  const token = (body.token ?? "").trim();
  const answer = body.answer === "decline" ? "decline" : "accept";
  if (token.length < 32) return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });

  const admin = await getPrivileged();
  const { data, error } = await admin.rpc(
    answer === "accept" ? "accept_ride_by_token" : "decline_ride_by_token",
    { p_token: token },
  );
  if (error) {
    console.error("ride offer answer failed", error);
    return NextResponse.json({ ok: false, reason: "error" }, { status: 500 });
  }

  // The driver won the ride: tell the customer who is coming. The token is the
  // only handle in the request, so the ride and driver are read back from the
  // offer it names — which accept_ride_by_token leaves in place (the token is
  // UNIQUE, and only expired/withdrawn rows are ever re-tokened).
  //
  // after(), not await: this response is how the driver gets the customer's
  // number, and it must not wait on an email provider with no timeout over a
  // patchy mobile connection. after() keeps the function alive until it ends.
  if (answer === "accept" && (data as { ok?: boolean } | null)?.ok === true) {
    after(async () => {
      try {
        const { data: offer, error: offerErr } = await admin
          .from("ride_offers").select("request_id, driver_id").eq("token", token).maybeSingle();
        const o = offer as { request_id?: string; driver_id?: string } | null;
        if (offerErr || !o?.request_id || !o.driver_id) {
          console.error("driver-found: offer read-back failed", { offerErr });
          return;
        }
        const { notifyCustomerDriverFound } = await import("@/lib/rides/notify");
        await notifyCustomerDriverFound(o.request_id, o.driver_id);
      } catch (e) {
        console.error("driver-found email failed", e);
      }
    });
  }

  // 200 even when the answer is "somebody else got it" — that is not an error,
  // it is the outcome of a race the driver was told about, and the body says so.
  return NextResponse.json(data);
}
