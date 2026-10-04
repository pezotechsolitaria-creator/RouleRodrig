// ── The marketplace shelves, as rules the editor and the route share ────────
//
// architecture review 2026-09-30, item 5. `categories` (marketplace_core.sql:
// id, parent_id, name, slug citext unique, icon, position, is_active) is what
// /shop is browsed by, and until now only a migration could add, rename,
// reorder or retire a shelf — M183's own comment says "an admin can add more
// without a migration", and no screen could.
//
// Four rules this file holds, each for a reason already paid for:
//
//  · THE SLUG IS FIXED AT CREATION. It is the indexed /shop/c/<slug> URL and
//    the sitemap entry; renaming "Local products" must not move the page.
//  · NO DELETE, only deactivate. products.category_id is `on delete set null`,
//    so deleting a shelf would silently unfile every product on it, and orders
//    keep pointing at those products. M183 retired "Services" the same way.
//  · A SHELF IS A SUBJECT, NOT A FULFILMENT TYPE (owner ruling, M183). The
//    retired "services" shelf is never switched back on from here; that
//    decision was the owner's and is recorded in the migration.
//  · FLAT, LIKE THE RAIL. parent_id can express a tree, but nothing public
//    reads it: marketplace_home() (m96b) lists every shelf in ONE row ordered
//    by position, name. The first desk let the owner nest shelves and reorder
//    within a nest, and the /shop rail then showed an order the desk never did
//    — a child renumbered to 10 sat beside the top-level shelf at 10 and could
//    become the first shelf on /shop while drawn indented under its parent
//    (architecture review 2026-09-30, item 5, follow-up). So the desk is one
//    list in rail order, a move renumbers that whole list, and the route
//    refuses a parent until a public page reads one.
//
// Client-safe (no server imports): the desk and the route validate alike.

export type CategoryRow = {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  icon: string | null;
  position: number;
  is_active: boolean;
};

/**
 * The keys components/shop/CategoryStrip.tsx can draw. A key it does not know
 * falls back to a generic box, which is how three shelves once all showed the
 * same icon (M183) — so the editor offers only these.
 * lib/admin/marketplace-categories.test.ts renders the strip with each one.
 */
export const CATEGORY_ICON_KEYS = [
  "package",
  "fish",
  "carrot",
  "honey",
  "flame",
  "utensils",
  "palette",
  "gift",
  "wheat",
  "home",
  "shirt",
  "hammer",
  "wrench",
  "car",
  "sparkles",
] as const;

export type CategoryIconKey = (typeof CATEGORY_ICON_KEYS)[number];

export function isCategoryIcon(v: unknown): v is CategoryIconKey {
  return typeof v === "string" && (CATEGORY_ICON_KEYS as readonly string[]).includes(v);
}

/** Retired by the owner's M183 ruling; never switched back on from the editor. */
export const RETIRED_SLUGS: readonly string[] = ["services"];

export const MAX_CATEGORY_SLUG = 60;
const SLUG_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** "Vehicle Care & Detailing" → "vehicle-care-and-detailing". */
export function categorySlugFromName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_CATEGORY_SLUG)
    .replace(/-+$/, "");
}

/**
 * The address field as it is typed: same fold, but a trailing hyphen survives,
 * because the next word is coming. categorySlugProblem() refuses it if it is
 * still there when the shelf is added.
 */
export function categorySlugInput(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+/, "")
    .slice(0, MAX_CATEGORY_SLUG);
}

/** Why a slug cannot be used for a new shelf, or null. */
export function categorySlugProblem(slug: string, existing: readonly Pick<CategoryRow, "slug">[]): string | null {
  if (!slug) return "The shelf needs a web address — type a name with letters or numbers.";
  if (slug.length > MAX_CATEGORY_SLUG || !SLUG_SHAPE.test(slug)) {
    return "Use lower-case words joined by single hyphens, e.g. local-products.";
  }
  // citext: the database compares slugs without case, so this does too.
  if (existing.some((c) => c.slug.toLowerCase() === slug)) {
    return `/shop/c/${slug} is already a shelf (it may be switched off). Pick another address.`;
  }
  return null;
}

/** Said when anything asks to put one shelf inside another (see FLAT above). */
export const NO_NESTING_MESSAGE =
  "Shelves do not nest on the shop yet — /shop shows every shelf in one row, in the order listed here.";

/** Where a new shelf goes: after the last one, on the ten-step grid M183 set. */
export function nextPosition(all: readonly Pick<CategoryRow, "position">[]): number {
  const max = all.reduce((m, c) => Math.max(m, Number.isFinite(c.position) ? c.position : 0), 0);
  return (Math.floor(max / 10) + 1) * 10;
}

/** The public rail's own order: position, then name (the browse RPCs). */
export function byRailOrder<T extends Pick<CategoryRow, "position" | "name">>(a: T, b: T): number {
  return a.position - b.position || a.name.localeCompare(b.name);
}

/**
 * Move one shelf up or down the list — the same list, in the same order, that
 * the desk shows and the /shop rail reads. Returns the position writes needed
 * (only rows whose number changes), or [] when it is already at that end.
 *
 * Renumbers the WHOLE list on the ten-step grid rather than swapping two
 * numbers: several live shelves can share a position (the older food and craft
 * shelves kept theirs, M183), and swapping two equal numbers moves nothing
 * while reporting success. And not just a sibling group: parent_id is ignored
 * because the rail ignores it, so after any move the numbers sort into exactly
 * the order the desk drew (architecture review 2026-09-30, item 5, follow-up).
 */
export function reorderWrites(
  all: readonly CategoryRow[],
  id: string,
  direction: "up" | "down",
): { id: string; position: number }[] {
  const order = [...all].sort(byRailOrder);
  const at = order.findIndex((c) => c.id === id);
  const to = direction === "up" ? at - 1 : at + 1;
  if (at < 0 || to < 0 || to >= order.length) return [];
  [order[at], order[to]] = [order[to], order[at]];
  return order
    .map((c, i) => ({ id: c.id, position: (i + 1) * 10, was: c.position }))
    .filter((w) => w.position !== w.was)
    .map(({ id: rowId, position }) => ({ id: rowId, position }));
}
