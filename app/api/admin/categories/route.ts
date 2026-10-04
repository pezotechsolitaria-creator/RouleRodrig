import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { guardAdminApi, readJson, failed } from "@/lib/admin/api-guard";
import { audit } from "@/lib/admin/audit";
import {
  NO_NESTING_MESSAGE,
  RETIRED_SLUGS,
  categorySlugFromName,
  categorySlugProblem,
  isCategoryIcon,
  nextPosition,
  reorderWrites,
  type CategoryRow,
} from "@/lib/admin/marketplace-categories";

// ── THE MARKETPLACE SHELVES, EDITABLE WITHOUT A MIGRATION ───────────────────
//
// architecture review 2026-09-30, item 5. The rules — slug fixed at creation,
// deactivate never delete, shelves stay flat like the /shop rail, the retired
// "services" shelf stays retired — are in lib/admin/marketplace-categories.ts,
// shared with the desk. This route is the only writer and the boundary:
//
//  · guardAdminApi first. /admin has no Supabase user, so the table's
//    categories_admin_write policy (is_platform_admin()) is unreachable from
//    here; the signed cookie IS the check and the service role is how the
//    write lands. The guard also refuses loudly when that key is missing,
//    instead of the anon fallback quietly matching no rows.
//  · There is no DELETE export, so Next answers 405 to one.
//  · No parent. Nothing public reads parent_id, so a nested shelf would sit in
//    the desk under one shelf and on the rail wherever its number fell
//    (architecture review 2026-09-30, item 5, follow-up). A parent is refused
//    in words rather than by zod's "unrecognized key", and an explicit null is
//    accepted as the nothing it is.
//  · Every write is audited, with what it was before.

const SELECT = "id, parent_id, name, slug, icon, position, is_active";

const createSchema = z.object({
  name: z.string().trim().min(1, "Give the shelf a name.").max(80),
  slug: z.string().trim().toLowerCase().max(80).optional(),
  icon: z.string().nullable().optional(),
  parentId: z.null().optional(),
  isActive: z.boolean().optional(),
});

const updateSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1, "A shelf needs a name.").max(80).optional(),
    icon: z.string().nullable().optional(),
    parentId: z.null().optional(),
    isActive: z.boolean().optional(),
    move: z.enum(["up", "down"]).optional(),
  })
  .strict();

/** A request that tries to put a shelf inside another one, refused in words. */
function nestingRefused(body: unknown): NextResponse | null {
  if (body && typeof body === "object" && (body as { parentId?: unknown }).parentId != null) {
    return NextResponse.json({ error: NO_NESTING_MESSAGE }, { status: 400 });
  }
  return null;
}

async function allCategories(admin: SupabaseClient) {
  const { data, error } = await admin.from("categories").select(SELECT);
  return { rows: (data ?? []) as CategoryRow[], error };
}

/** /shop reads categories under a 60-second ISR window; a rename should show now. */
function revalidateShop() {
  try {
    revalidatePath("/shop", "layout");
    revalidatePath("/marketplace");
  } catch (err) {
    console.error("categories saved but /shop was not revalidated", err);
  }
}

export async function GET(req: NextRequest) {
  const gate = await guardAdminApi(req, "The categories editor");
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;

  const { rows, error } = await allCategories(admin);
  if (error) return failed(error, "Failed to load the categories.");

  // How many products sit on each shelf, so switching one off says what it
  // hides. One narrow column; the catalogue is small, and capped regardless.
  const { data: products, error: pErr } = await admin.from("products").select("category_id").limit(5000);
  if (pErr) return failed(pErr, "Failed to count the products on each shelf.");
  const counts: Record<string, number> = {};
  for (const p of (products ?? []) as { category_id: string | null }[]) {
    if (p.category_id) counts[p.category_id] = (counts[p.category_id] ?? 0) + 1;
  }

  return NextResponse.json({
    categories: rows.map((c) => ({ ...c, productCount: counts[c.id] ?? 0 })),
  });
}

export async function POST(req: NextRequest) {
  const gate = await guardAdminApi(req, "The categories editor");
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;

  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const nesting = nestingRefused(body);
  if (nesting) return nesting;
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  const { name, icon, isActive = true } = parsed.data;
  const slug = parsed.data.slug || categorySlugFromName(name);

  const { rows, error } = await allCategories(admin);
  if (error) return failed(error, "Failed to read the categories.");

  const slugProblem = categorySlugProblem(slug, rows);
  if (slugProblem) return NextResponse.json({ error: slugProblem }, { status: 409 });
  if (icon != null && !isCategoryIcon(icon)) {
    return NextResponse.json({ error: "Pick one of the icons offered." }, { status: 400 });
  }

  // nextPosition puts it after every shelf, nested or not — last on the rail
  // and last in the desk's one list.
  const row = { name, slug, icon: icon ?? null, parent_id: null, is_active: isActive, position: nextPosition(rows) };
  const { data, error: insErr } = await admin.from("categories").insert(row).select(SELECT).single();
  if (insErr) {
    // The unique index is citext: a race with another tab lands here.
    if ((insErr as { code?: string }).code === "23505") {
      return NextResponse.json({ error: `/shop/c/${slug} is already a shelf. Pick another address.` }, { status: 409 });
    }
    return failed(insErr, "Could not create that shelf.");
  }

  const created = data as CategoryRow;
  await audit(admin, {
    action: "category.create",
    entityType: "category",
    entityId: created.id,
    diff: { name, slug, icon: row.icon, is_active: isActive, position: row.position },
  });
  revalidateShop();
  return NextResponse.json({ category: created }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const gate = await guardAdminApi(req, "The categories editor");
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;

  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  if (body && typeof body === "object" && "slug" in body) {
    return NextResponse.json(
      { error: "A shelf's web address is fixed once it is created, so links and search results keep working." },
      { status: 400 },
    );
  }
  const nesting = nestingRefused(body);
  if (nesting) return nesting;
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  const { id, name, icon, isActive, move } = parsed.data;

  const { rows, error } = await allCategories(admin);
  if (error) return failed(error, "Failed to read the categories.");
  const before = rows.find((c) => c.id === id);
  if (!before) return NextResponse.json({ error: "That shelf no longer exists." }, { status: 404 });

  // ── Reorder: renumber the whole list in rail order, audited as one move ───
  if (move) {
    const writes = reorderWrites(rows, id, move);
    for (const w of writes) {
      const { error: wErr } = await admin.from("categories").update({ position: w.position }).eq("id", w.id);
      if (wErr) return failed(wErr, "Could not reorder the shelves.");
    }
    if (writes.length) {
      await audit(admin, {
        action: "category.reorder",
        entityType: "category",
        entityId: id,
        diff: {
          name: before.name,
          move,
          positions: writes.map((w) => ({ id: w.id, from: rows.find((r) => r.id === w.id)?.position, to: w.position })),
        },
      });
      revalidateShop();
    }
    return NextResponse.json({ ok: true, moved: writes.length > 0 });
  }

  const patch: Partial<CategoryRow> = {};
  if (name !== undefined && name !== before.name) patch.name = name;
  if (icon !== undefined) {
    if (icon !== null && !isCategoryIcon(icon)) {
      return NextResponse.json({ error: "Pick one of the icons offered." }, { status: 400 });
    }
    if (icon !== before.icon) patch.icon = icon;
  }
  if (isActive !== undefined && isActive !== before.is_active) {
    if (isActive && RETIRED_SLUGS.includes(before.slug.toLowerCase())) {
      return NextResponse.json(
        {
          error:
            `"${before.name}" was retired on purpose (M183): a shelf here is a subject, like vehicle care, ` +
            "not a kind of sale. Services live on the subject shelves they belong to.",
        },
        { status: 409 },
      );
    }
    patch.is_active = isActive;
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true, changed: [] });

  const { data, error: upErr } = await admin.from("categories").update(patch).eq("id", id).select(SELECT).single();
  if (upErr) return failed(upErr, "Could not save that shelf.");

  const from: Record<string, unknown> = {};
  for (const k of Object.keys(patch)) from[k] = before[k as keyof CategoryRow];
  await audit(admin, {
    action: "category.update",
    entityType: "category",
    entityId: id,
    diff: { slug: before.slug, from, to: patch },
  });
  revalidateShop();
  return NextResponse.json({ ok: true, category: data as CategoryRow, changed: Object.keys(patch) });
}
