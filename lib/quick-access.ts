import type { QuickAccessItem } from "./defaults";

// Pure, so it can be tested. `lib/content.ts` imports "server-only", which
// throws the moment a test file touches it — the same reason lib/activity.ts
// keeps its logic out of the server module.

/**
 * Re-point saved Quick Access tiles whose destination has moved.
 *
 * WHY THIS EXISTS AT ALL: `DEFAULT_QUICK_ACCESS` is a first-run seed. The live
 * site has its own `quickAccess` array saved in `site_content` and that array
 * WINS, so editing the default moves a tile on a fresh install and nowhere
 * else. Without this, the "Hiking" tile on roulerodrig.com would have gone on
 * opening the scooter-routes page forever.
 *
 * Deliberately narrow. Each rule names one id and the one legacy href it is
 * moving off, so anything the owner has typed himself is left exactly as typed;
 * once he points a tile somewhere of his own choosing this stops touching it. A
 * migration that fought the admin panel would be a worse bug than the one it
 * fixes.
 *
 * Runs on READ, which is what makes it stick: admin loads the corrected value,
 * so the owner's next "Save Changes" persists it rather than reverting it.
 */
const MOVED: { id: string; from: string; to: string }[] = [
  // Hiking got its own guide. It used to land on /guide/routes — a page titled
  // "Scooter routes & hiking trails" whose H1, hero copy and first CTA are all
  // about renting a scooter, with the trails below every ride on it.
  { id: "qa-hiking", from: "/guide/routes", to: "/guide/hiking" },
];

/**
 * Tiles REPLACED in place, keeping their position in the grid.
 *
 * Beaches and Viewpoints were two tiles serving one errand — "show me
 * somewhere beautiful". Fusing them frees a slot, and the freed slot is where
 * Deliver Anything goes. Doing it as a replacement rather than a delete plus an
 * append keeps the new tile where the eye already was, instead of stranding it
 * at the end of the second row.
 *
 * Guarded on the legacy href, exactly like MOVED: if the owner has already
 * pointed his Viewpoints tile somewhere of his own, it is his and this leaves
 * it alone.
 */
const REPLACED: { id: string; whenHref: string; with: QuickAccessItem }[] = [
  {
    id: "qa-viewpoints",
    whenHref: "/guide/viewpoints",
    with: {
      id: "qa-deliver",
      label: "Delivery",
      labelFr: "Livraison",
      labelCr: "Livrezon",
      href: "/deliver",
      icon: "delivery",
      enabled: true,
    },
  },
];

/**
 * Tiles RELABELLED, only while they still carry the label they shipped with.
 *
 * The fused tile has to say so, or it reads as Viewpoints having simply
 * vanished. Checked against the original English label so a tile the owner has
 * renamed himself is never overwritten.
 */
const RELABELLED: { id: string; whenLabel: string; label: string; labelFr: string; labelCr: string }[] = [
  {
    id: "qa-beaches",
    whenLabel: "Beaches",
    label: "Beaches & Views",
    labelFr: "Plages & vues",
    labelCr: "Laplaz & vi",
  },
];

export function migrateQuickAccess(items: QuickAccessItem[]): QuickAccessItem[];
export function migrateQuickAccess(items: undefined): undefined;
export function migrateQuickAccess(items?: QuickAccessItem[]): QuickAccessItem[] | undefined;
export function migrateQuickAccess(items?: QuickAccessItem[]): QuickAccessItem[] | undefined {
  if (!items) return items;

  const out = items.map((item) => {
    const swap = REPLACED.find((r) => r.id === item.id && item.href === r.whenHref);
    // The replacement inherits nothing from the tile it stands in for — a
    // Viewpoints label on a Delivery tile would be worse than either.
    if (swap) return { ...swap.with };

    const rename = RELABELLED.find((r) => r.id === item.id && item.label === r.whenLabel);
    if (rename) {
      return { ...item, label: rename.label, labelFr: rename.labelFr, labelCr: rename.labelCr };
    }

    const move = MOVED.find((m) => m.id === item.id && item.href === m.from);
    return move ? { ...item, href: move.to } : item;
  });

  // If the tile being replaced was already gone — removed by the owner, or a
  // saved array that predates it — the new one still has to arrive, or the
  // whole feature is invisible to exactly the people who tidied their grid.
  // Appended rather than inserted: there is no position left to inherit.
  for (const r of REPLACED) {
    if (!out.some((i) => i.id === r.with.id)) out.push({ ...r.with });
  }

  return out;
}
