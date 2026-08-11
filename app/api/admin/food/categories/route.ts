import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardFoodAdmin, readJson, failed } from "@/lib/food/guard";
import { foodCategorySchema, foodCategoryPatchSchema } from "@/lib/schemas/food";
import { uniqueSlug } from "@/lib/food/admin";

// The food taxonomy. Separate from public.categories, which is the marketplace
// product tree feeding /shop's filter bar — putting "Ourite" in there would
// surface food categories in the shop directory, the same leak M42 had to close
// for events.

export async function GET(req: NextRequest) {
  const gate = await guardFoodAdmin(req);
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;

  const { data, error } = await admin.from("food_categories").select("*").order("position");
  if (error) return failed(error, "Failed to load categories.");

  // Dish counts, so the operator can see which categories are aspirational.
  const { data: links } = await admin.from("food_item_categories").select("category_id");
  const counts = new Map<string, number>();
  for (const l of (links ?? []) as { category_id: string }[]) {
    counts.set(l.category_id, (counts.get(l.category_id) ?? 0) + 1);
  }

  return NextResponse.json({
    categories: (data ?? []).map((c) => ({
      id: c.id as string,
      slug: c.slug as string,
      name: c.name as string,
      nameFr: c.name_fr as string | null,
      nameCr: c.name_cr as string | null,
      emoji: c.emoji as string | null,
      imageUrl: c.image_url as string | null,
      position: c.position as number,
      isActive: c.is_active as boolean,
      dishCount: counts.get(c.id as string) ?? 0,
    })),
  });
}

export async function POST(req: NextRequest) {
  const gate = await guardFoodAdmin(req);
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;

  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const parsed = foodCategorySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  const v = parsed.data;

  const { data, error } = await admin
    .from("food_categories")
    .insert({
      slug: await uniqueSlug(admin, "food_categories", v.slug),
      name: v.name,
      name_fr: v.nameFr?.trim() || null,
      name_cr: v.nameCr?.trim() || null,
      emoji: v.emoji?.trim() || null,
      image_url: v.imageUrl?.trim() || null,
      position: v.position ?? 0,
      is_active: v.isActive ?? true,
    })
    .select("id")
    .single();

  if (error) return failed(error, "Could not create that category.");
  return NextResponse.json({ id: data?.id });
}

export async function PATCH(req: NextRequest) {
  const gate = await guardFoodAdmin(req);
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;

  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const parsed = foodCategoryPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  const v = parsed.data;

  const patch: Record<string, unknown> = {};
  if (v.name !== undefined) patch.name = v.name;
  if (v.nameFr !== undefined) patch.name_fr = v.nameFr?.trim() || null;
  if (v.nameCr !== undefined) patch.name_cr = v.nameCr?.trim() || null;
  if (v.emoji !== undefined) patch.emoji = v.emoji?.trim() || null;
  if (v.imageUrl !== undefined) patch.image_url = v.imageUrl?.trim() || null;
  if (v.position !== undefined) patch.position = v.position;
  if (v.isActive !== undefined) patch.is_active = v.isActive;
  if (v.slug !== undefined) patch.slug = await uniqueSlug(admin, "food_categories", v.slug, v.id);

  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true });

  const { error } = await admin.from("food_categories").update(patch).eq("id", v.id);
  if (error) return failed(error, "Could not save that category.");
  return NextResponse.json({ ok: true });
}

// Deactivate rather than delete. food_item_categories cascades, so a real
// delete would silently strip the category from every dish that used it —
// destructive, invisible, and impossible to undo. Deactivating removes it from
// every customer surface immediately, which is what "remove" means here.
export async function DELETE(req: NextRequest) {
  const gate = await guardFoodAdmin(req);
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;

  const id = new URL(req.url).searchParams.get("id");
  if (!id || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Missing or invalid category." }, { status: 400 });
  }

  const { error } = await admin.from("food_categories").update({ is_active: false }).eq("id", id);
  if (error) return failed(error, "Could not remove that category.");
  return NextResponse.json({ ok: true });
}
