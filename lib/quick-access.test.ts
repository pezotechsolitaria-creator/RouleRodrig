import { describe, it, expect } from "vitest";
import { migrateQuickAccess } from "./quick-access";
import { DEFAULT_QUICK_ACCESS } from "./defaults";
import type { QuickAccessItem } from "./defaults";

const tile = (over: Partial<QuickAccessItem> = {}): QuickAccessItem => ({
  id: "qa-hiking",
  label: "Hiking",
  href: "/guide/routes",
  icon: "hiking",
  enabled: true,
  ...over,
});

describe("migrateQuickAccess", () => {
  it("moves the saved Hiking tile off the scooter-routes page", () => {
    // The case that matters: the LIVE site has this row saved, so without the
    // migration the tile keeps opening /guide/routes no matter what the
    // defaults say.
    expect(migrateQuickAccess([tile()])[0].href).toBe("/guide/hiking");
  });

  it("keeps everything else about the tile the owner's", () => {
    const custom = tile({ label: "Rando", labelFr: "Randonnée", enabled: false });
    const [out] = migrateQuickAccess([custom]);
    expect(out).toEqual({ ...custom, href: "/guide/hiking" });
  });

  it("does not touch a tile the owner has pointed somewhere himself", () => {
    // The rule is scoped to the one legacy href. If he sends Hiking to the map,
    // that is a decision, and a migration that overrode it would be a worse bug
    // than the one this fixes.
    const own = tile({ href: "/map" });
    expect(migrateQuickAccess([own])[0].href).toBe("/map");
  });

  it("leaves other tiles alone", () => {
    const others = [
      tile({ id: "qa-beaches", href: "/guide/beaches" }),
      // Same href, different tile: only qa-hiking is being moved.
      tile({ id: "qa-routes", href: "/guide/routes" }),
    ];
    expect(migrateQuickAccess(others)).toEqual(others);
  });

  it("is idempotent — a tile already moved is left as-is", () => {
    const moved = tile({ href: "/guide/hiking" });
    expect(migrateQuickAccess([moved])).toEqual([moved]);
    expect(migrateQuickAccess(migrateQuickAccess([tile()]))[0].href).toBe("/guide/hiking");
  });

  it("passes undefined through, so the defaults still apply", () => {
    expect(migrateQuickAccess(undefined)).toBeUndefined();
  });

  it("does not mutate the array it was given", () => {
    const input = [tile()];
    migrateQuickAccess(input);
    expect(input[0].href).toBe("/guide/routes");
  });

  it("leaves the shipped defaults untouched — they already point at the guide", () => {
    // A tripwire: if someone re-points the default back at /guide/routes, this
    // migration would silently start rewriting the seed too.
    expect(migrateQuickAccess(DEFAULT_QUICK_ACCESS)).toEqual(DEFAULT_QUICK_ACCESS);
    expect(DEFAULT_QUICK_ACCESS.find((x) => x.id === "qa-hiking")?.href).toBe("/guide/hiking");
  });
});
