import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { guardShared } from "@/lib/rate-limit";

// POST /api/delivery-requests/lookup — find a request you have lost the link to.
//
// A guest has no account, gets no email (the shared Supabase mail budget is
// spent on password resets, M41) and identifies their request by a uuid nobody
// can memorise. The localStorage entry was the ONLY thread back to it: a
// different phone, cleared storage or a closed tab and the request was
// unreachable for ever, quietly, while drivers quoted on it.
//
// The credential is the pair (reference, email) — the same shape
// /api/orders/lookup has always used, and with the same reasoning. Neither half
// is enough: a six-character reference is short enough to be guessable into a
// disclosure, and an email alone must never list somebody's deliveries.
//
// The RPC is SECURITY DEFINER and granted to service_role ONLY, so this route
// is the sole way in and the rate limit below is the real brute-force ceiling.
// It is deliberately tighter than the read: 8/min matches order lookup exactly.

export const dynamic = "force-dynamic";

const schema = z.object({
  ref: z.string().trim().min(4, "Enter the reference from your request.").max(32),
  email: z.string().trim().toLowerCase().email("Enter the email you used.").max(254),
});

export async function POST(req: NextRequest) {
  const limited = await guardShared(req, "delivery-request-lookup", 8, 60_000);
  if (limited) return limited;

  if (!hasServiceRole()) {
    console.error("delivery request lookup: SUPABASE_SERVICE_ROLE_KEY missing");
    return NextResponse.json({ error: "Lookup is unavailable right now." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  const admin = await getPrivileged();
  const { data, error } = await admin.rpc("lookup_delivery_request", {
    p_ref: parsed.data.ref,
    p_email: parsed.data.email,
  });

  if (error) {
    console.error("lookup_delivery_request failed", error);
    return NextResponse.json({ error: "We couldn't look that up. Please try again." }, { status: 500 });
  }

  // ONE message for "no such reference" and "wrong email", so this cannot be
  // used to confirm that a reference exists — the same rule the RR003 codes
  // follow everywhere else in this codebase.
  if (!data) {
    return NextResponse.json(
      { error: "We couldn't find a request with that reference and email." },
      { status: 404 },
    );
  }

  return NextResponse.json({ id: data as string });
}
