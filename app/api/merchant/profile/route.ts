import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOwnStoreId } from "@/lib/merchant/context";
import { guard } from "@/lib/rate-limit";

// ── A shop's own profile, edited by the shop (M98) ─────────────────────────
//
// `authenticated` holds SELECT and nothing more on `stores`, so this cannot be
// a plain update. set_store_profile() is the narrow door: an explicit whitelist
// of presentation columns, gated on is_store_staff(). status, slug, is_test,
// featured and merchant_id are not in it and are ignored if sent — see the
// migration for why each one is excluded.
//
// store_id comes from the session, never from the body.

const profileSchema = z.object({
  name: z.string().trim().min(1, "Your shop needs a name.").max(200),
  tagline: z.string().trim().max(200).optional().or(z.literal("")),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  address: z.string().trim().max(300).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  whatsapp: z.string().trim().max(40).optional().or(z.literal("")),
  // Sent as strings from the form; the RPC range-clamps them, because a bad
  // number puts the shop in the sea and the delivery driver with it.
  lat: z.string().trim().max(30).optional().or(z.literal("")),
  lng: z.string().trim().max(30).optional().or(z.literal("")),
});

export async function GET(req: NextRequest) {
  const limited = guard(req, "merchant-profile-read", 60, 60_000);
  if (limited) return limited;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const storeId = await getOwnStoreId(supabase);
  if (!storeId) return NextResponse.json({ error: "No shop found for this account." }, { status: 404 });

  // Reading IS granted, so this one is a plain select.
  const { data, error } = await supabase
    .from("stores")
    .select("name, tagline, description, address, phone, whatsapp, lat, lng, slug, status")
    .eq("id", storeId)
    .maybeSingle();

  if (error) {
    console.error("merchant profile read failed", error);
    return NextResponse.json({ error: "Could not load your shop." }, { status: 500 });
  }
  return NextResponse.json({ profile: data });
}

export async function PUT(req: NextRequest) {
  const limited = guard(req, "merchant-profile-write", 20, 60_000);
  if (limited) return limited;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const storeId = await getOwnStoreId(supabase);
  if (!storeId) return NextResponse.json({ error: "No shop found for this account." }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const { error } = await supabase.rpc("set_store_profile", {
    p_store_id: storeId,
    p_patch: parsed.data,
  });

  if (error) {
    // An expired subscription blocks shop edits (trigger, errcode RR008).
    if (error.code === "RR008") return NextResponse.json({ error: error.message }, { status: 403 });
    if (error.code === "RR003") return NextResponse.json({ error: "Shop not found." }, { status: 404 });
    if (error.code === "RR005") return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("set_store_profile failed", error);
    return NextResponse.json({ error: "Could not save your shop." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
