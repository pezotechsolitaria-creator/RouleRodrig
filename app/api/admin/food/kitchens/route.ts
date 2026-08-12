import { NextRequest, NextResponse } from "next/server";
import { guardFoodAdmin, readJson, failed } from "@/lib/food/guard";
import { kitchenSchema, kitchenPatchSchema } from "@/lib/schemas/food";
import { createKitchen, uniqueStoreSlug } from "@/lib/food/admin";
import { audit } from "@/lib/admin/audit";

// Kitchens — the operator's view of who cooks what.
//
// A kitchen is a store plus a cooker, and the two halves land in two tables on
// purpose: the public half in stores/food_kitchens, the cooker's name and
// number in food_kitchen_ops, which has RLS enabled and NO policy. RLS filters
// rows and never columns, so a phone number in a publicly-readable table would
// be one `select *` away from the anon API. Splitting the table is what
// actually protects it.

export async function GET(req: NextRequest) {
  const gate = await guardFoodAdmin(req);
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;

  const { data, error } = await admin
    .from("food_kitchens")
    .select(
      "store_id, prep_minutes_min, prep_minutes_max, pickup_hint, position, " +
        "stores(id, name, slug, tagline, status, address, phone, lat, lng), " +
        "food_kitchen_ops(cooker_name, cooker_phone, cooker_notes), " +
        // Read it back, because the editor lets you change it. It did not, so
        // the edit form defaulted the checkbox to ON and every save silently
        // re-enabled Roulé Rodrigues delivery for a kitchen that had it off.
        "store_payment_settings(offers_rr_delivery)",
    )
    .order("position");

  if (error) return failed(error, "Failed to load kitchens.");

  type Row = {
    store_id: string;
    prep_minutes_min: number;
    prep_minutes_max: number;
    pickup_hint: string | null;
    position: number;
    stores: Record<string, unknown> | Record<string, unknown>[] | null;
    food_kitchen_ops: Record<string, unknown> | Record<string, unknown>[] | null;
    store_payment_settings: Record<string, unknown> | Record<string, unknown>[] | null;
  };
  const one = (v: unknown) => (Array.isArray(v) ? (v[0] ?? null) : v);

  // Dish counts are a separate read rather than an embed: PostgREST cannot
  // aggregate across food_kitchens → stores → products in one hop, and the
  // operator's first question about a kitchen is always "how many dishes".
  const rows = (data ?? []) as unknown as Row[];

  const { data: counts } = await admin
    .from("products")
    .select("store_id, status")
    .in("store_id", rows.map((r) => r.store_id));

  const dishCount = new Map<string, { total: number; live: number }>();
  for (const p of (counts ?? []) as { store_id: string; status: string }[]) {
    const entry = dishCount.get(p.store_id) ?? { total: 0, live: 0 };
    entry.total += 1;
    if (p.status === "active") entry.live += 1;
    dishCount.set(p.store_id, entry);
  }

  return NextResponse.json({
    kitchens: rows.map((r) => {
      const store = one(r.stores) as Record<string, unknown> | null;
      const ops = one(r.food_kitchen_ops) as Record<string, unknown> | null;
      const counted = dishCount.get(r.store_id) ?? { total: 0, live: 0 };
      return {
        storeId: r.store_id,
        name: store?.name ?? "Kitchen",
        slug: store?.slug ?? "",
        tagline: store?.tagline ?? null,
        status: store?.status ?? "draft",
        address: store?.address ?? null,
        phone: store?.phone ?? null,
        lat: store?.lat ?? null,
        lng: store?.lng ?? null,
        prepMinutesMin: r.prep_minutes_min,
        prepMinutesMax: r.prep_minutes_max,
        pickupHint: r.pickup_hint,
        position: r.position,
        cookerName: ops?.cooker_name ?? null,
        cookerPhone: ops?.cooker_phone ?? null,
        cookerNotes: ops?.cooker_notes ?? null,
        offersRrDelivery:
          (one(r.store_payment_settings) as { offers_rr_delivery?: boolean } | null)?.offers_rr_delivery ?? false,
        dishCount: counted.total,
        liveDishCount: counted.live,
      };
    }),
  });
}

export async function POST(req: NextRequest) {
  const gate = await guardFoodAdmin(req);
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;

  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const parsed = kitchenSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  try {
    const storeId = await createKitchen(admin, {
      ...parsed.data,
      tagline: parsed.data.tagline || undefined,
      address: parsed.data.address || undefined,
      phone: parsed.data.phone || undefined,
      pickupHint: parsed.data.pickupHint || undefined,
      cookerName: parsed.data.cookerName || undefined,
      cookerPhone: parsed.data.cookerPhone || undefined,
      cookerNotes: parsed.data.cookerNotes || undefined,
    });
    await audit(admin, { action: "kitchen.create", entityType: "store", entityId: storeId,
      diff: { name: parsed.data.name } });
    return NextResponse.json({ storeId });
  } catch (err) {
    return failed(err, "Could not create that kitchen.");
  }
}

export async function PATCH(req: NextRequest) {
  const gate = await guardFoodAdmin(req);
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;

  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const parsed = kitchenPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  const v = parsed.data;

  // Refuse to edit a store that is not a kitchen. Without this check the
  // endpoint would happily rename a real merchant's shop, because both live in
  // the same `stores` table and only food_kitchens tells them apart.
  const { data: isKitchen } = await admin
    .from("food_kitchens")
    .select("store_id")
    .eq("store_id", v.storeId)
    .maybeSingle();
  if (!isKitchen) return NextResponse.json({ error: "Not a kitchen." }, { status: 404 });

  try {
    // Built field by field rather than spread: `merchant_id`, `rating_avg` and
    // anything else a caller invented must never reach the update.
    const storePatch: Record<string, unknown> = {};
    if (v.name !== undefined) storePatch.name = v.name;
    if (v.tagline !== undefined) storePatch.tagline = v.tagline?.trim() || null;
    if (v.address !== undefined) storePatch.address = v.address?.trim() || null;
    if (v.phone !== undefined) storePatch.phone = v.phone?.trim() || null;
    if (v.lat !== undefined) storePatch.lat = v.lat;
    if (v.lng !== undefined) storePatch.lng = v.lng;
    if (v.status !== undefined) storePatch.status = v.status;
    if (v.slug !== undefined) storePatch.slug = await uniqueStoreSlug(admin, v.slug, v.storeId);
    if (Object.keys(storePatch).length) {
      const { error } = await admin.from("stores").update(storePatch).eq("id", v.storeId);
      if (error) throw new Error(error.message);
    }

    const kitchenPatch: Record<string, unknown> = {};
    if (v.prepMinutesMin !== undefined) kitchenPatch.prep_minutes_min = v.prepMinutesMin;
    if (v.prepMinutesMax !== undefined) kitchenPatch.prep_minutes_max = v.prepMinutesMax;
    if (v.pickupHint !== undefined) kitchenPatch.pickup_hint = v.pickupHint?.trim() || null;
    if (v.position !== undefined) kitchenPatch.position = v.position;
    if (Object.keys(kitchenPatch).length) {
      const { error } = await admin.from("food_kitchens").update(kitchenPatch).eq("store_id", v.storeId);
      if (error) throw new Error(error.message);
    }

    if (v.cookerName !== undefined || v.cookerPhone !== undefined || v.cookerNotes !== undefined) {
      const { error } = await admin.from("food_kitchen_ops").upsert({
        store_id: v.storeId,
        ...(v.cookerName !== undefined ? { cooker_name: v.cookerName?.trim() || null } : {}),
        ...(v.cookerPhone !== undefined ? { cooker_phone: v.cookerPhone?.trim() || null } : {}),
        ...(v.cookerNotes !== undefined ? { cooker_notes: v.cookerNotes?.trim() || null } : {}),
      });
      if (error) throw new Error(error.message);
    }

    if (v.offersRrDelivery !== undefined) {
      const { error } = await admin
        .from("store_payment_settings")
        .upsert({ store_id: v.storeId, offers_rr_delivery: v.offersRrDelivery });
      if (error) throw new Error(error.message);
    }

    await audit(admin, { action: "kitchen.update", entityType: "store", entityId: v.storeId,
      diff: { fields: Object.keys(v).filter((k) => k !== "storeId") } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return failed(err, "Could not save that kitchen.");
  }
}

// Removing a kitchen.
//
// There was no way to do this at all — no endpoint, no button, and even raw SQL
// was refused, because every kitchen belongs to the system-owned 'food' merchant
// and admin_delete_shop() rejects platform infrastructure outright. M62 adds
// admin_delete_kitchen(): kitchen stores only, and refused the moment anyone has
// ordered (hide it instead, so the record of what people ordered survives).
export async function DELETE(req: NextRequest) {
  const gate = await guardFoodAdmin(req);
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;

  const storeId = new URL(req.url).searchParams.get("storeId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(storeId)) {
    return NextResponse.json({ error: "Invalid kitchen id." }, { status: 400 });
  }

  const { data, error } = await admin.rpc("admin_delete_kitchen", { p_store_id: storeId });
  if (error) {
    // RR004 is the refusal, not a failure: the kitchen has orders. 409 so the
    // UI can offer "hide it" instead of showing a red error.
    if (error.code === "RR004") return NextResponse.json({ error: error.message, suggestion: "hide" }, { status: 409 });
    if (error.code === "RR003") return NextResponse.json({ error: error.message }, { status: 404 });
    return failed(error, "Could not remove that kitchen.");
  }

  return NextResponse.json(data ?? { ok: true });
}
