import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { guardShared } from "@/lib/rate-limit";
import {
  notifyQuoteAccepted,
  notifyDriverOfCancellation,
  notifyLosingDrivers,
} from "@/lib/delivery/notify-requests";

// ── One request, from the customer's side ───────────────────────────────────
//
// Read it, accept a price, or withdraw it. Everything a customer can do to a
// Deliver Anything job after posting it — which until M136 was nothing at all,
// because no route existed and the accepting function was granted to nobody.
//
// ── The credential ─────────────────────────────────────────────────────────
// Signed in → the customer's OWN session, and delivery_request_view() matches
// on auth.uid(). Guest → the pair (request id, email), checked inside the RPC
// and reached only through the service-role key.
//
// The pair is the same credential shape /api/orders/lookup has always used,
// with a STRONGER identifier: a v4 uuid rather than a short human-readable
// order number. The rate limit below is the brute-force ceiling, and the RPC
// returns null identically for "no such request" and "wrong email" so this
// cannot be used to confirm that an id exists.
//
// POST rather than GET for the read, because the guest's email is a credential
// and a credential does not belong in a URL — it would land in server logs,
// browser history and any Referer header the page later sends.

export const dynamic = "force-dynamic";

const SAFE_RPC_ERROR = "P0001";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("view"),
    email: z.string().trim().toLowerCase().email().max(254).optional(),
  }),
  z.object({
    action: z.literal("accept"),
    quoteId: z.string().uuid(),
    // The price the customer actually SAW on the confirm sheet. Not the price
    // they are charged -- that still comes from the quote row in the database
    // -- but the one they agreed to. A re-quote updates the existing row and
    // keeps its id, so without this the id they tapped could carry a different
    // number by the time it arrived.
    expectedFee: z.number().int().min(0).max(5_000_000).optional(),
    // M155. Which way the money moves, chosen at the moment a price is taken.
    // The CAP is the server's to enforce — a client that picks "cash" for a
    // Rs 9,000 shopping run is refused in SQL, not here.
    paymentMethod: z.enum(["cash", "bank_transfer"]).default("cash"),
    email: z.string().trim().toLowerCase().email().max(254).optional(),
  }),
  z.object({
    action: z.literal("rate"),
    rating: z.number().int().min(1).max(5),
    body: z.string().trim().max(500).optional(),
    email: z.string().trim().toLowerCase().email().max(254).optional(),
  }),
  z.object({
    action: z.literal("attachProof"),
    email: z.string().trim().email().max(200).optional(),
    // A path this server minted during the upload. Validated AGAIN in SQL
    // against the bucket prefix, so a forged one cannot point elsewhere.
    path: z.string().trim().max(300),
    reference: z.string().trim().max(120).optional(),
  }),
  z.object({
    action: z.literal("cancel"),
    email: z.string().trim().toLowerCase().email().max(254).optional(),
    reason: z.string().trim().max(300).optional(),
  }),
]);

const NOT_FOUND = "We couldn't find that request. Check the link and the email you used.";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }
  const v = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ── Two different budgets, because they are two different risks ──────────
  // A SIGNED-IN read is proved by the session and is polled every 20 seconds by
  // the tracking screen, so it needs room to breathe: 60/min.
  //
  // A GUEST read is a GUESS. Whoever holds the request link supplies an email,
  // and a hit returns the delivery PIN — the code that proves the parcel
  // reached the right person. 60 attempts a minute at somebody's email address
  // is a brute-force budget, so the guest branch gets the same 8/min as
  // /api/orders/lookup, which is the site's established ceiling for exactly
  // this shape of credential.
  //
  // Accepting and cancelling change the world and get almost none.
  // Keyed on whether an EMAIL was supplied, not on whether there is a session.
  // The signed-in branch below deliberately falls through to the email path
  // when the session does not own the request -- so gating on `user` would have
  // handed a logged-in attacker the 60/min budget for exactly the guess this
  // is meant to slow down. A signed-in customer polling their own request
  // sends no email and keeps the roomy budget; anyone supplying one is
  // guessing until proven otherwise.
  const guessing = v.action === "view" && Boolean(v.email);
  const limited =
    v.action !== "view"
      ? await guardShared(req, "delivery-request-act", 10, 60_000)
      : guessing
        ? await guardShared(req, "delivery-request-guest-view", 8, 60_000)
        : await guardShared(req, "delivery-request-view", 60, 60_000);
  if (limited) return limited;

  // A guest cannot reach any of these RPCs without the key.
  if (!user && !hasServiceRole()) {
    console.error("delivery-requests/[id]: SUPABASE_SERVICE_ROLE_KEY missing");
    return NextResponse.json({ error: "This is temporarily unavailable." }, { status: 503 });
  }

  if (v.action === "view") {
    // The session path first. It needs no email and cannot be pointed at
    // somebody else's request.
    if (user) {
      const { data, error } = await supabase.rpc("delivery_request_view", { p_id: id });
      if (error) {
        console.error("delivery_request_view failed", error);
        return NextResponse.json({ error: "Could not load that request." }, { status: 500 });
      }
      if (data) return NextResponse.json({ request: data });
      // Not theirs by account — but a request posted as a GUEST before they
      // signed in still belongs to them in every sense that matters. Falling
      // through to the email path is what stops signing in from losing it.
      if (!v.email) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    }

    if (!v.email) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    const admin = await getPrivileged();
    const { data, error } = await admin.rpc("delivery_request_view", {
      p_id: id,
      p_email: v.email,
    });
    if (error) {
      console.error("delivery_request_view (guest) failed", error);
      return NextResponse.json({ error: "Could not load that request." }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    return NextResponse.json({ request: data });
  }

  if (v.action === "rate") {
    // Ownership and the "only once it is delivered" rule both live in the RPC.
    // A guest goes through the service role holding their proven email, the
    // same split every other guest action here uses.
    const client = user ? supabase : await getPrivileged();
    const { data, error } = await client.rpc("rate_delivery_driver", {
      p_request_id: id,
      p_rating: v.rating,
      p_body: v.body ?? null,
      p_email: user ? null : v.email ?? null,
    });
    if (error) {
      if (error.code === SAFE_RPC_ERROR) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      console.error("rate_delivery_driver failed", error);
      return NextResponse.json({ error: "Could not save your rating." }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  if (v.action === "attachProof") {
    // Ownership, the "this one is cash" refusal and the "already under way"
    // refusal all live in the RPC. Same guest split as everything else here.
    const client = user ? supabase : await getPrivileged();
    const { data, error } = await client.rpc("attach_delivery_payment_proof", {
      p_request_id: id,
      p_path: v.path,
      p_reference: v.reference ?? null,
      p_email: user ? null : v.email ?? null,
    });
    if (error) {
      if (error.code === SAFE_RPC_ERROR) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      console.error("attach_delivery_payment_proof failed", error);
      return NextResponse.json(
        { error: "Could not attach that receipt." },
        { status: 500 },
      );
    }
    if (!data) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  if (v.action === "cancel") {
    const client = user ? supabase : await getPrivileged();
    const { data, error } = await client.rpc("cancel_delivery_request", {
      p_id: id,
      p_email: user ? null : v.email ?? null,
      p_reason: v.reason ?? null,
    });
    if (error) {
      if (error.code === SAFE_RPC_ERROR) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      console.error("cancel_delivery_request failed", error);
      return NextResponse.json({ error: "Could not withdraw that request." }, { status: 500 });
    }
    // The RPC answers false for "not yours" and for "no such request" alike —
    // deliberately indistinguishable, so this stays a non-oracle.
    if (!data) {
      // A signed-in customer may still own it by guest email.
      if (user && v.email) {
        const admin = await getPrivileged();
        const { data: retry } = await admin.rpc("cancel_delivery_request", {
          p_id: id,
          p_email: v.email,
          p_reason: v.reason ?? null,
        });
        if (retry) {
          await notifyDriverOfCancellation(id);
          return NextResponse.json({ ok: true });
        }
      }
      return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    }
    // The most time-critical message in the flow: a booked driver may already
    // be on the road, and every minute they keep going is their fuel spent on
    // a job that no longer exists. Awaited, and it never throws. Does nothing
    // when the request was still open -- there is nobody to tell.
    await notifyDriverOfCancellation(id);
    // And everybody whose standing price just died with the request. A driver
    // who quotes and hears nothing stops opening the board.
    await notifyLosingDrivers(id);
    return NextResponse.json({ ok: true });
  }

  // ── accept ────────────────────────────────────────────────────────────────
  // Two different functions, because the proof of ownership is different.
  // Neither takes the price from the browser: the fee that becomes the
  // delivery is read from the quote row inside the database, so a tampered
  // request body cannot book a driver at a price they never offered.
  let deliveryId: string | null = null;

  if (user) {
    const { data, error } = await supabase.rpc("customer_accept_delivery_quote", {
      p_quote_id: v.quoteId,
      p_expected_fee: v.expectedFee ?? null,
      p_payment_method: v.paymentMethod,
    });
    if (!error) {
      deliveryId = data as string;
    } else if (error.code === SAFE_RPC_ERROR && v.email) {
      // Posted as a guest, accepted while signed in.
      const admin = await getPrivileged();
      const { data: g, error: gErr } = await admin.rpc("guest_accept_delivery_quote", {
        p_quote_id: v.quoteId,
        p_email: v.email,
        p_expected_fee: v.expectedFee ?? null,
      p_payment_method: v.paymentMethod,
      });
      if (gErr) {
        if (gErr.code === SAFE_RPC_ERROR) {
          return NextResponse.json({ error: gErr.message }, { status: 409 });
        }
        console.error("guest_accept_delivery_quote failed", gErr);
        return NextResponse.json({ error: "Could not book that driver." }, { status: 500 });
      }
      deliveryId = g as string;
    } else if (error.code === SAFE_RPC_ERROR) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    } else {
      console.error("customer_accept_delivery_quote failed", error);
      return NextResponse.json({ error: "Could not book that driver." }, { status: 500 });
    }
  } else {
    if (!v.email) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    const admin = await getPrivileged();
    const { data, error } = await admin.rpc("guest_accept_delivery_quote", {
      p_quote_id: v.quoteId,
      p_email: v.email,
      p_expected_fee: v.expectedFee ?? null,
      p_payment_method: v.paymentMethod,
    });
    if (error) {
      if (error.code === SAFE_RPC_ERROR) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      console.error("guest_accept_delivery_quote failed", error);
      return NextResponse.json({ error: "Could not book that driver." }, { status: 500 });
    }
    deliveryId = data as string;
  }

  // The driver has just been given a job and does not know. Awaited rather than
  // fired and forgotten — a serverless function that returns can be frozen
  // mid-flight, and a notification that dies there is exactly the silent
  // failure this whole flow exists to avoid. It cannot throw.
  await notifyQuoteAccepted(v.quoteId);
  // The other drivers were just declined by accept_delivery_quote. Telling them
  // is what keeps them quoting on the next one.
  await notifyLosingDrivers(id);

  return NextResponse.json({ ok: true, deliveryId }, { status: 200 });
}
