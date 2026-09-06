import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";

// Who may deliver their own orders WITH TRACKING.
//
// AUTH NOTE, the same as every other /admin route on this platform: the admin
// console authenticates with a signed password cookie and has NO Supabase user,
// so is_platform_admin() can never be true for it. store_own_delivery grants
// writes to nobody but the service role, and admin_set_own_delivery_tracking
// was explicitly revoked from anon in M173b — so the cookie check below IS the
// security boundary and the service-role client is how the write lands.
function isAuthed(req: NextRequest) {
  return verifySession(req.cookies.get(COOKIE_NAME)?.value);
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasServiceRole()) {
    return NextResponse.json(
      { error: "Admin backend is not configured (SUPABASE_SERVICE_ROLE_KEY is unset)." },
      { status: 503 },
    );
  }

  const admin = await getPrivileged();

  // Every store that could deliver its own orders, whether or not it has said
  // so yet — the admin's question is "who should I switch on", and a store that
  // has not asked is still an answer to it.
  const [{ data: stores }, { data: settings }] = await Promise.all([
    admin
      .from("stores")
      .select("id, name, slug, status")
      .neq("status", "archived")
      .order("name"),
    admin.from("store_own_delivery").select("store_id, enabled, tracking_approved, note"),
  ]);

  const byStore = new Map(
    ((settings ?? []) as { store_id: string; enabled: boolean; tracking_approved: boolean; note: string | null }[]).map(
      (s) => [s.store_id, s],
    ),
  );

  return NextResponse.json({
    stores: ((stores ?? []) as { id: string; name: string; slug: string; status: string }[]).map(
      (s) => ({
        id: s.id,
        name: s.name,
        slug: s.slug,
        status: s.status,
        enabled: byStore.get(s.id)?.enabled ?? false,
        trackingApproved: byStore.get(s.id)?.tracking_approved ?? false,
        note: byStore.get(s.id)?.note ?? null,
      }),
    ),
  });
}

const Body = z.object({
  storeId: z.string().uuid(),
  approved: z.boolean(),
  note: z.string().trim().max(300).optional(),
});

export async function POST(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasServiceRole()) {
    return NextResponse.json(
      { error: "Admin backend is not configured (SUPABASE_SERVICE_ROLE_KEY is unset)." },
      { status: 503 },
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const admin = await getPrivileged();
  // The fee is NOT settable here. It is zero for everybody, the owner prices
  // this privately with each shop, and a number typed into an admin form at
  // three in the morning is not how that conversation should be recorded.
  const { data, error } = await admin.rpc("admin_set_own_delivery_tracking", {
    p_store_id: parsed.data.storeId,
    p_approved: parsed.data.approved,
    p_fee_cents: 0,
    p_note: parsed.data.note ?? null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, result: data });
}
