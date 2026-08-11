import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { guardShared } from "@/lib/rate-limit";

// The organiser's side of a managed-ticketing agreement: ask, accept, withdraw.
//
// NOTHING HERE CAN SET A FEE. Not because this file checks, but because the
// three RPCs it can reach take no fee and no status parameter — the migration
// asserts that at deploy time (M60b). An organiser who forged any request body
// they liked still cannot quote themselves, approve themselves, or move an
// agreement to active without a fee they were actually offered.
//
// The fee is also never sent from the client on acceptance. Accepting means
// "yes, to whatever is recorded against this agreement", and the recorded value
// is the only one the server reads. There is no client-supplied amount anywhere
// in this flow to tamper with.

const storeSchema = z.object({ storeId: z.string().uuid() });

const requestSchema = z.object({
  storeId: z.string().uuid(),
  note: z.string().trim().max(1000).optional(),
});

const cancelSchema = z.object({
  storeId: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
});

function rpcError(error: { code?: string; message?: string }, fallback: string) {
  if (error.code === "RR003") return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (error.code === "RR004") return NextResponse.json({ error: error.message }, { status: 409 });
  if (error.code === "RR005") return NextResponse.json({ error: error.message }, { status: 400 });
  console.error(fallback, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

/** The agreement, or {status:'not_requested'} when there isn't one. */
export async function GET(req: NextRequest) {
  const limited = await guardShared(req, "organizer-managed", 60, 60_000);
  if (limited) return limited;

  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const storeId = req.nextUrl.searchParams.get("storeId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(storeId)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { data, error } = await supabase.rpc("organizer_managed_ticketing", { p_store_id: storeId });
  if (error) return rpcError(error, "Could not load that.");
  return NextResponse.json(data);
}

/** Ask Roulé Rodrigues to run ticketing for this event. */
export async function POST(req: NextRequest) {
  const limited = await guardShared(req, "organizer-managed-write", 10, 60_000);
  if (limited) return limited;

  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("organizer_request_managed_ticketing", {
    p_store_id: parsed.data.storeId,
    p_note: parsed.data.note ?? null,
  });
  if (error) return rpcError(error, "Could not send that request.");
  return NextResponse.json(data);
}

/** Accept the fee that was quoted. Sends no amount — see the note above. */
export async function PATCH(req: NextRequest) {
  const limited = await guardShared(req, "organizer-managed-write", 10, 60_000);
  if (limited) return limited;

  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = storeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });

  const { data, error } = await supabase.rpc("organizer_accept_managed_ticketing", {
    p_store_id: parsed.data.storeId,
  });
  if (error) return rpcError(error, "Could not accept that.");
  return NextResponse.json(data);
}

/** Withdraw — only before the service is running. */
export async function DELETE(req: NextRequest) {
  const limited = await guardShared(req, "organizer-managed-write", 10, 60_000);
  if (limited) return limited;

  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = cancelSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });

  const { data, error } = await supabase.rpc("organizer_cancel_managed_ticketing", {
    p_store_id: parsed.data.storeId,
    p_reason: parsed.data.reason ?? null,
  });
  if (error) return rpcError(error, "Could not withdraw that request.");
  return NextResponse.json(data);
}
