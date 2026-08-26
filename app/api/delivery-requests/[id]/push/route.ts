import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { guard } from "@/lib/rate-limit";
import { pushIsConfigured } from "@/lib/push/send";

// A customer subscribing their phone to their own Deliver Anything request.
//
// This is the piece that made the rest of the flow honest. Quotes arrive
// MINUTES later — that is the whole shape of a reverse auction — and until now
// nothing enrolled a customer in any channel at all: a guest has no push
// subscription and is deliberately not emailed (the shared Supabase mail budget
// pays for password resets, M41). So the only way to learn a price had arrived
// was to sit on the page and watch it poll, and four screens said otherwise.
//
// The credential is the request plus the email it was posted under — the same
// proof /api/delivery-requests/[id] demands for a guest read, and the same one
// /api/orders/push has always used. Authorisation lives INSIDE the RPC, not in
// the grant: without that check anyone could point their own device at a
// stranger's email and receive that stranger's delivery updates.

export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(254).optional(),
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500),
  }),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Could not turn alerts on." }, { status: 404 });
  }

  // Enrolling carries an email guess, so it gets the same tight budget the
  // guest read does rather than the roomy polling one.
  const limited = guard(req, "delivery-request-push", 10, 60_000);
  if (limited) return limited;

  // Subscribing against a server that cannot send is a silent dead end.
  if (!pushIsConfigured()) {
    return NextResponse.json({ error: "Alerts are not available yet." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });
  }

  // The customer's OWN session. A signed-in owner is matched on auth.uid()
  // inside the RPC and needs no email at all; a guest supplies one and it must
  // match the request.
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("register_delivery_request_push", {
    p_endpoint: parsed.data.endpoint,
    p_p256dh: parsed.data.keys.p256dh,
    p_auth: parsed.data.keys.auth,
    p_request_id: id,
    p_email: parsed.data.email ?? null,
    p_user_agent: req.headers.get("user-agent") ?? null,
  });

  if (error) {
    console.error("register_delivery_request_push failed", error);
    return NextResponse.json({ error: "Could not turn alerts on." }, { status: 500 });
  }

  // The RPC returns false when the caller could not prove the request is
  // theirs. Deliberately the same shape as a genuine failure: it must not
  // become an oracle for which email posted which request.
  if (data !== true) {
    return NextResponse.json({ error: "Could not turn alerts on." }, { status: 403 });
  }

  return NextResponse.json({ ok: true });
}
