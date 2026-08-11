import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { guardShared } from "@/lib/rate-limit";

// Door staff, managed by the organiser who runs the event.
//
// AUTHORIZATION IS THE DATABASE'S, AND THE ESCALATIONS ARE UNREPRESENTABLE
// RATHER THAN CHECKED FOR:
//   * organizer_add_door_staff() hard-codes role='door_staff'. There is no role
//     parameter to send, so an organiser cannot mint another organiser even if
//     this file were wrong.
//   * organizer_revoke_staff() deletes only role='door_staff' rows, scoped to
//     the store passed in — so an organiser can neither remove a peer nor reach
//     into another event by guessing an assignment id.
//   * Every function is gated by can_manage_event(), which M59 narrowed to
//     exclude door staff. A scanner cannot hire another scanner.
//
// Runs as the signed-in user, never the service role.

const addSchema = z.object({
  storeId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254),
  name: z.string().trim().min(1, "Give this person a name.").max(120),
});

const revokeSchema = z.object({
  storeId: z.string().uuid(),
  assignmentId: z.string().uuid(),
});

function rpcError(error: { code?: string; message?: string }, fallback: string) {
  if (error.code === "RR003") return NextResponse.json({ error: "Not found." }, { status: 404 });
  // RR004/RR005 messages are written for the organiser to read.
  if (error.code === "RR004") return NextResponse.json({ error: error.message }, { status: 409 });
  if (error.code === "RR005") return NextResponse.json({ error: error.message }, { status: 400 });
  console.error(fallback, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

/** Who can get into this event, and how. No money, no customer data. */
export async function GET(req: NextRequest) {
  const limited = await guardShared(req, "organizer-staff", 60, 60_000);
  if (limited) return limited;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const storeId = req.nextUrl.searchParams.get("storeId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(storeId)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { data, error } = await supabase.rpc("organizer_event_staff", { p_store_id: storeId });
  if (error) return rpcError(error, "Could not load the staff list.");
  return NextResponse.json({ staff: data ?? [] });
}

export async function POST(req: NextRequest) {
  const limited = await guardShared(req, "organizer-staff-add", 20, 60_000);
  if (limited) return limited;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  // No role is sent. The RPC decides, and it always decides 'door_staff'.
  const { data, error } = await supabase.rpc("organizer_add_door_staff", {
    p_store_id: parsed.data.storeId,
    p_email: parsed.data.email,
    p_name: parsed.data.name,
  });
  if (error) return rpcError(error, "Could not add that person.");
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const limited = await guardShared(req, "organizer-staff-revoke", 30, 60_000);
  if (limited) return limited;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = revokeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });

  const { data, error } = await supabase.rpc("organizer_revoke_staff", {
    p_store_id: parsed.data.storeId,
    p_assignment_id: parsed.data.assignmentId,
  });
  if (error) return rpcError(error, "Could not remove that person.");
  return NextResponse.json(data);
}
