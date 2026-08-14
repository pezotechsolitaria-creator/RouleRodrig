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

export function migrateQuickAccess(items: QuickAccessItem[]): QuickAccessItem[];
export function migrateQuickAccess(items: undefined): undefined;
export function migrateQuickAccess(items?: QuickAccessItem[]): QuickAccessItem[] | undefined;
export function migrateQuickAccess(items?: QuickAccessItem[]): QuickAccessItem[] | undefined {
  if (!items) return items;
  return items.map((item) => {
    const move = MOVED.find((m) => m.id === item.id && item.href === m.from);
    return move ? { ...item, href: move.to } : item;
  });
}
