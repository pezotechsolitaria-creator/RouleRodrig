import { NextRequest, NextResponse } from "next/server";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged } from "@/lib/supabase/admin";

function isAuthed(req: NextRequest) {
  return verifySession(req.cookies.get(COOKIE_NAME)?.value);
}

// ── Admin: review scooter-owner applications ─────────────────────────────────
export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = await getPrivileged();
  const { data, error } = await supabase
    .from("owner_applications")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Turn private storage paths into short-lived signed URLs (30 min) so the
  // admin can view sensitive documents without making the bucket public.
  async function sign(path: string | null | undefined): Promise<string | null> {
    if (!path) return null;
    const { data: s } = await supabase.storage.from("applications").createSignedUrl(path, 1800);
    return s?.signedUrl ?? null;
  }

  const rows = await Promise.all(
    (data ?? []).map(async (a) => ({
      ...a,
      id_card_url: await sign(a.id_card),
      insurance_url: await sign(a.insurance),
      vehicle_photo_urls: (
        await Promise.all((Array.isArray(a.vehicle_photos) ? a.vehicle_photos : []).map((p: string) => sign(p)))
      ).filter(Boolean),
    })),
  );

  return NextResponse.json(rows);
}

export async function PATCH(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, status } = (await req.json()) as { id: string; status: string };
  if (!id || !["pending", "approved", "rejected"].includes(status))
    return NextResponse.json({ error: "Missing id or invalid status" }, { status: 400 });
  const supabase = await getPrivileged();
  // Selected back so the decision email has a name, an address and a category
  // without a second round trip — and so a status that did not actually change
  // can be detected before anyone is emailed about it.
  const { data: before } = await supabase
    .from("owner_applications")
    .select("id, owner_name, email, listing_type, business_name, status")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("owner_applications").update({ status }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Tell the applicant. The form promised "we'll be in touch" and this used to
  // flip a column and stop, which left the promise resting on the owner
  // remembering to phone them — and since M47 the taxi / organiser / delivery
  // categories cannot create anything themselves, so this email is the only way
  // they can learn the answer.
  //
  // Best-effort and after the commit, the same rule every other send in this
  // codebase follows: an admin's click must not fail because a mail provider
  // did. Re-applying the SAME status sends nothing — an idempotent PATCH from a
  // double-click should not look like a second decision to the applicant.
  if (before && before.status !== status && (status === "approved" || status === "rejected")) {
    try {
      const { notifyApplicationDecision } = await import("@/lib/notifications/partner-application");
      await notifyApplicationDecision(before, status);
    } catch (err) {
      console.error("application decision email failed", err);
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const supabase = await getPrivileged();
  const { error } = await supabase.from("owner_applications").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
