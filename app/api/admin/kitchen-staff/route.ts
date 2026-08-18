import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";

// Adding and removing cooks. Admin-cookie only; admin_add_kitchen_staff() is
// service-role and refuses any store that is not a kitchen, so this cannot be
// used to hand someone a login to a real merchant's shop.
function gate(req: NextRequest): NextResponse | null {
  if (!verifySession(req.cookies.get(COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasServiceRole()) {
    return NextResponse.json({ error: "Admin backend is not configured." }, { status: 503 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const denied = gate(req);
  if (denied) return denied;
  const admin = await getPrivileged();
  const { data, error } = await admin
    .from("kitchen_staff")
    .select("id, store_id, invite_email, display_name, user_id, created_at, stores(name)")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Could not load staff." }, { status: 500 });
  return NextResponse.json({ staff: data ?? [] });
}

export async function POST(req: NextRequest) {
  const denied = gate(req);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = z
    .object({
      storeId: z.string().uuid(),
      email: z.string().trim().toLowerCase().email().max(254),
      name: z.string().trim().min(1).max(80),
    })
    .safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const admin = await getPrivileged();
  const { data, error } = await admin.rpc("admin_add_kitchen_staff", {
    p_store_id: parsed.data.storeId,
    p_email: parsed.data.email,
    p_name: parsed.data.name,
  });
  if (error) {
    if (error.code === "RR005" || error.code === "RR003") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("admin_add_kitchen_staff failed", error);
    return NextResponse.json({ error: "Could not add that person." }, { status: 500 });
  }

  // Tell them, the same way door staff are told (M-door-staff-invite): a row
  // written with nobody informed is how the events invite silently failed.
  let invited = false;
  try {
    const { data: store } = await admin.from("stores").select("name").eq("id", parsed.data.storeId).maybeSingle();
    const { notifyInvited } = await import("@/lib/notifications/invite");
    invited = await notifyInvited({
      email: parsed.data.email,
      name: parsed.data.name,
      context: (store as { name?: string } | null)?.name ?? "the kitchen",
      assignmentId: (data as { id?: string })?.id ?? parsed.data.email,
      role: "kitchen",
    });
  } catch (err) {
    console.error("kitchen staff invite email failed", err);
  }

  return NextResponse.json({ ...(data as object), invited });
}

export async function DELETE(req: NextRequest) {
  const denied = gate(req);
  if (denied) return denied;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = z.object({ id: z.string().uuid() }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const admin = await getPrivileged();
  const { error } = await admin.from("kitchen_staff").delete().eq("id", parsed.data.id);
  if (error) return NextResponse.json({ error: "Could not remove that person." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
