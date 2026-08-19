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

  // ── THE REMOVAL PREVIEW ────────────────────────────────────────────────────
  // ?preview=<storeId> answers "what happens if I press the red button" BEFORE
  // it is pressed: how many orders, how much money, which uploaded files, and
  // whether anything is currently blocking. The confirm panel can then state
  // real numbers instead of a generic "this cannot be undone" — which is the
  // difference between a decision and a flinch.
  const preview = new URL(req.url).searchParams.get("preview");
  if (preview) {
    if (!/^[0-9a-f-]{36}$/i.test(preview)) {
      return NextResponse.json({ error: "Invalid kitchen id." }, { status: 400 });
    }
    const { data, error } = await admin.rpc("admin_kitchen_delete_preview", { p_store_id: preview });
    if (error) {
      if (error.code === "RR003") return NextResponse.json({ error: error.message }, { status: 404 });
      return failed(error, "Could not check that kitchen.");
    }
    return NextResponse.json(data);
  }

  // ── WHY THREE READS AND NOT ONE EMBED ──────────────────────────────────────
  // This used to embed food_kitchen_ops and store_payment_settings directly on
  // food_kitchens. They are not children of it — all three are SIBLINGS, each
  // holding its own foreign key to stores.id and none pointing at another. Ask
  // PostgREST to follow a relationship that does not exist and the WHOLE query
  // fails, so every kitchen vanished and the Menu tab reported "Add a kitchen
  // first" to an operator with four live kitchens and seven dishes on the site.
  //
  // The file already solved this once for dish counts ("a separate read rather
  // than an embed"), and the same answer applies here. Three small reads keyed
  // by store_id, joined in code: no relationship to infer, nothing to get
  // ambiguous, and a failure in one of them cannot take the other two down.
  const { data, error } = await admin
    .from("food_kitchens")
    .select(
      "store_id, prep_minutes_min, prep_minutes_max, pickup_hint, position, " +
        "halal_certified, halal_certifier, halal_certified_until, " +
        // stores IS a real parent (food_kitchens.store_id → stores.id), so this
        // embed is the one that can be trusted.
        "stores(id, name, slug, tagline, status, address, phone, whatsapp, lat, lng)",
    )
    .order("position");

  if (error) return failed(error, "Failed to load kitchens.");

  const storeIds = ((data ?? []) as unknown as { store_id: string }[]).map((r) => r.store_id);

  // Sibling data, fetched flat. Both are best-effort: a kitchen with no ops row
  // or no payment row is a kitchen that has not been configured yet, not an
  // error, and it must still appear so it CAN be configured.
  const [opsRes, paymentRes] = await Promise.all([
    storeIds.length
      ? admin.from("food_kitchen_ops").select("store_id, cooker_name, cooker_phone, cooker_notes").in("store_id", storeIds)
      : Promise.resolve({ data: [], error: null }),
    storeIds.length
      // Read back, because the editor lets you change it. It did not, so the
      // edit form defaulted the checkbox to ON and every save silently
      // re-enabled Roulé Rodrigues delivery for a kitchen that had it off.
      ? admin
          .from("store_payment_settings")
          .select("store_id, offers_rr_delivery, accepts_cash, accepts_bank_transfer")
          .in("store_id", storeIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (opsRes.error) console.error("kitchen ops read failed", opsRes.error);
  if (paymentRes.error) console.error("kitchen payment read failed", paymentRes.error);

  const opsByStore = new Map(
    ((opsRes.data ?? []) as unknown as { store_id: string }[]).map(
      (r) => [r.store_id, r as unknown as Record<string, unknown>] as const,
    ),
  );
  const payByStore = new Map(
    ((paymentRes.data ?? []) as unknown as {
      store_id: string;
      offers_rr_delivery?: boolean;
      accepts_cash?: boolean;
      accepts_bank_transfer?: boolean;
    }[]).map(
      (r) => [r.store_id, r] as const,
    ),
  );

  type Row = {
    store_id: string;
    prep_minutes_min: number;
    prep_minutes_max: number;
    pickup_hint: string | null;
    position: number;
    halal_certified: boolean | null;
    halal_certifier: string | null;
    halal_certified_until: string | null;
    stores: Record<string, unknown> | Record<string, unknown>[] | null;

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

  // ── Is the MERCHANT above this kitchen still approved? ────────────────────
  //
  // store_is_visible() requires BOTH `stores.status = 'active'` AND
  // `merchants.status = 'approved'`. Archiving a merchant (from
  // /admin/subscriptions) closes its shops and suspends it — and that second
  // half is invisible from this screen, so a kitchen set back to "active" here
  // reports success and still never appears anywhere.
  //
  // That is not hypothetical. On 13 Aug the food merchant was archived at
  // 17:47 while deleting a different kitchen, and the audit log then shows Ti
  // Kitchen's status being flipped to active FOUR TIMES in six minutes. It had
  // nine dishes and stayed invisible every time, and /food fell back to the
  // WhatsApp concierge because nothing was orderable. The screen said saved and
  // meant nothing.
  //
  // Two plain reads, joined in code, per this file's own rule — merchants is a
  // real parent of stores, but embeds have blanked this panel twice already.
  const { data: ownerRows } = await admin
    .from("stores")
    .select("id, merchant_id")
    .in("id", rows.map((r) => r.store_id));
  const merchantByStore = new Map(
    ((ownerRows ?? []) as { id: string; merchant_id: string | null }[]).map((r) => [r.id, r.merchant_id]),
  );
  const merchantIds = [...new Set([...merchantByStore.values()].filter(Boolean))] as string[];
  const { data: merchantRows } = merchantIds.length
    ? await admin.from("merchants").select("id, status").in("id", merchantIds)
    : { data: [] };
  const merchantStatus = new Map(
    ((merchantRows ?? []) as { id: string; status: string }[]).map((m) => [m.id, m.status]),
  );

  // Opening hours, for the go-live checklist below. A kitchen with no hours is
  // closed at every moment of every day — store_schedule_status() says so, and
  // the customer simply cannot order. Counted here rather than inferred in the
  // browser so the checklist and the checkout agree.
  const { data: hourRows } = await admin
    .from("store_hours")
    .select("store_id")
    .in("store_id", rows.map((r) => r.store_id));
  const hasHours = new Set(((hourRows ?? []) as { store_id: string }[]).map((h) => h.store_id));

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
      const ops = opsByStore.get(r.store_id) ?? null;
      const counted = dishCount.get(r.store_id) ?? { total: 0, live: 0 };
      return {
        storeId: r.store_id,
        name: store?.name ?? "Kitchen",
        slug: store?.slug ?? "",
        tagline: store?.tagline ?? null,
        status: store?.status ?? "draft",
        address: store?.address ?? null,
        phone: store?.phone ?? null,
        // M95 — the number a customer messages when they cannot bank-transfer.
        whatsapp: store?.whatsapp ?? null,
        lat: store?.lat ?? null,
        lng: store?.lng ?? null,
        prepMinutesMin: r.prep_minutes_min,
        prepMinutesMax: r.prep_minutes_max,
        pickupHint: r.pickup_hint,
        position: r.position,
        halalCertified: r.halal_certified ?? false,
        halalCertifier: r.halal_certifier ?? null,
        halalCertifiedUntil: r.halal_certified_until ?? null,
        cookerName: ops?.cooker_name ?? null,
        cookerPhone: ops?.cooker_phone ?? null,
        cookerNotes: ops?.cooker_notes ?? null,
        offersRrDelivery:
          payByStore.get(r.store_id)?.offers_rr_delivery ?? false,
        dishCount: counted.total,
        liveDishCount: counted.live,
        // ── The four facts that decide whether a customer can order ────────
        // Every one of these was already knowable and none was shown together,
        // which is how four kitchens ended up built, stocked and invisible.
        hasPayment: Boolean(
          payByStore.get(r.store_id)?.accepts_cash ||
            payByStore.get(r.store_id)?.accepts_bank_transfer,
        ),
        hasHours: hasHours.has(r.store_id),
        // The condition no screen could see. Undefined stays falsy, so a failed
        // read never invents an alarm.
        merchantArchived:
          merchantStatus.get(merchantByStore.get(r.store_id) ?? "") !== undefined &&
          merchantStatus.get(merchantByStore.get(r.store_id) ?? "") !== "approved",
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
      whatsapp: parsed.data.whatsapp || undefined,
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
    if (v.whatsapp !== undefined) storePatch.whatsapp = v.whatsapp?.trim() || null;
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
    // Certification travels as a pair or not at all. Turning it OFF clears the
    // issuer in the same write, so a kitchen can never keep a name that is no
    // longer vouching for it — that stale name is exactly what a customer would
    // trust.
    if (v.halalCertified !== undefined) {
      kitchenPatch.halal_certified = v.halalCertified;
      kitchenPatch.halal_certifier = v.halalCertified ? (v.halalCertifier ?? "").trim() || null : null;
      // The date goes with the flag: un-certifying must not leave an expiry
      // behind for a certificate that is no longer claimed at all.
      kitchenPatch.halal_certified_until = v.halalCertified ? (v.halalCertifiedUntil || null) : null;
    } else if (v.halalCertifier !== undefined) {
      kitchenPatch.halal_certifier = v.halalCertifier.trim() || null;
    }
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

  const url = new URL(req.url);
  const storeId = url.searchParams.get("storeId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(storeId)) {
    return NextResponse.json({ error: "Invalid kitchen id." }, { status: 400 });
  }

  // Two removals, and the caller says which.
  //
  // Without ?mode=purge this stays the M62 delete: kitchens nobody has ordered
  // from, refused (RR004) the moment anyone has. With it, M91's permanent
  // delete — orders, payments, receipts and all — which is why it demands the
  // kitchen's own name back and checks it in the database rather than trusting
  // that a dialog was shown.
  const purge = url.searchParams.get("mode") === "purge";

  const { data, error } = purge
    ? await admin.rpc("admin_purge_kitchen", {
        p_store_id: storeId,
        p_confirm_name: url.searchParams.get("confirm") ?? "",
      })
    : await admin.rpc("admin_delete_kitchen", { p_store_id: storeId });

  if (error) {
    // These are refusals, not failures. Each names something the operator can
    // go and act on, so none of them should arrive as a red 500 with a SQLSTATE
    // stapled to the end — which is exactly how RR041 reached the owner.
    if (error.code === "RR004") return NextResponse.json({ error: error.message, suggestion: "hide" }, { status: 409 });
    if (error.code === "RR042") return NextResponse.json({ error: error.message, suggestion: "resolve" }, { status: 409 });
    if (error.code === "RR043") return NextResponse.json({ error: error.message, suggestion: "confirm" }, { status: 400 });
    if (error.code === "RR041") return NextResponse.json({ error: error.message }, { status: 403 });
    if (error.code === "RR003") return NextResponse.json({ error: error.message }, { status: 404 });
    return failed(error, "Could not remove that kitchen.");
  }

  // The RPC has already written the audit row, and for a purge that row carries
  // the whole snapshot — orders, line items, payments. Logging again here would
  // only add a thinner duplicate of it.
  //
  // Note what is NOT done: the uploaded files listed in `data.files` still exist
  // in storage. They are handed back so the operator can be told, rather than
  // guessing at a bucket name and reporting a cleanup that never happened.
  return NextResponse.json(data ?? { ok: true });
}
