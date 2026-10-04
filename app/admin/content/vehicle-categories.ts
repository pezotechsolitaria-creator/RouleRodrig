import type { FleetItem, VehicleCategory } from "@/lib/defaults";

// ── A RENTAL CATEGORY'S ID IS A PUBLIC URL (architecture review 2026-09-30,
// item 3) ───────────────────────────────────────────────────────────────────
//
// VehicleCategory.id is not an internal key: it is the /browse/<id> page, the
// value every FleetItem.category points at, and a key of the page copy. The
// studio used to mint it as `cat-${Date.now()}`, so the first boat or kayak
// category the owner added would have gone live at /browse/cat-1790000000000 —
// a URL nobody can read, say on the phone or rank for.
//
// Now it is derived ONCE, from the label typed when the category is created,
// and never recomputed: renaming "Kayaks" to "Kayaks & paddleboards" must not
// move an indexed page or orphan the kayaks filed under it. The same rule the
// body-style ids in the studio already follow.

/**
 * /browse/<x> addresses that already belong to something else. The browse page
 * resolves a vehicle category BEFORE these branches (app/browse/[category]/
 * page.tsx), so a category called "Stays" would silently replace the stays
 * page. "food" is the hub tile that links /food (lib/site-data.ts).
 */
export const RESERVED_BROWSE_IDS: readonly string[] = [
  "activities",
  "events",
  "food",
  "getting-around",
  "restaurants",
  "stays",
  "tours",
];

/** Lower-case words joined by hyphens, accents folded, at most 40 characters. */
export function slugifyLabel(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
}

/**
 * The id for a NEW category: the label slugified, made unique against the
 * existing categories and the reserved addresses by a numeric suffix. Empty
 * when the label has no letters or digits to build one from — the caller
 * refuses, rather than inventing a name.
 */
export function categoryIdFromLabel(label: string, existing: readonly Pick<VehicleCategory, "id">[]): string {
  const base = slugifyLabel(label);
  if (!base) return "";
  const taken = new Set<string>([...existing.map((c) => c.id), ...RESERVED_BROWSE_IDS]);
  if (!taken.has(base)) return base;
  for (let n = 2; n < 100; n++) {
    const id = `${base}-${n}`;
    if (!taken.has(id)) return id;
  }
  return "";
}

/**
 * A HINT, never a setting: does this label read like equipment rather than
 * something with an engine? Only used to suggest the owner sets rentalKind —
 * undefined stays "motor" (lib/defaults.ts) until he picks. E-bikes and
 * motorbikes are motor vehicles, so "bike" counts only on its own.
 */
export function looksLikeEquipment(label: string): boolean {
  const s = label.toLowerCase();
  if (/\b(kayak|canoe|paddle|snorkel|surf|bicycle|cycle|v[ée]lo|camera|stroller|pram|pushchair|umbrella|parasol|sunbed|cool ?box|cooler|tent|camping|gear|equipment|fishing rod)/.test(s)) {
    return true;
  }
  return /(^|[^a-z-])bikes?\b/.test(s) && !/(e-?|motor)bikes?\b/.test(s);
}

/** How many fleet items are filed under this category. */
export function vehiclesIn(cat: Pick<VehicleCategory, "id">, fleet: readonly Pick<FleetItem, "category">[]): number {
  return fleet.filter((f) => (f.category ?? "scooter") === cat.id).length;
}

/**
 * The question to ask before removing a category, or null when removing it
 * breaks nothing. Vehicles filed under a removed category keep pointing at an
 * id that no longer exists — no page, no filter, no delivery fee — and an
 * enabled category is a live page. A category that is merely switched OFF
 * keeps its URL at 200 and says it is unavailable (the browse page's own
 * rule), which is why that is the alternative offered.
 */
export function removeCategoryWarning(
  cat: Pick<VehicleCategory, "id" | "label" | "enabled">,
  fleet: readonly Pick<FleetItem, "category">[],
): string | null {
  const n = vehiclesIn(cat, fleet);
  const name = cat.label.trim() || cat.id;
  if (n > 0) {
    return (
      `${name} still has ${n} ${n === 1 ? "vehicle" : "vehicles"}. Removing the category leaves ` +
      `${n === 1 ? "it" : "them"} with no page, and /browse/${cat.id} stops working. Move or remove ` +
      `the vehicles first, or switch the category off instead. Remove it anyway?`
    );
  }
  if (cat.enabled) {
    return (
      `${name} is switched on, so /browse/${cat.id} is a live page. Removing the category takes it ` +
      `down; switching it off keeps the page and says it is unavailable. Remove it anyway?`
    );
  }
  return null;
}
