import { describe, it, expect } from "vitest";
import { migrateQuickAccess, migrateHomeCards } from "./quick-access";
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
      // A label of "Hiking" so the beaches RELABEL rule does not fire here —
      // this test is about the href move, nothing else.
      tile({ id: "qa-beaches", label: "Hiking", href: "/guide/beaches" }),
      // Same href, different tile: only qa-hiking is being moved.
      tile({ id: "qa-routes", label: "Hiking", href: "/guide/routes" }),
    ];
    // Delivery is appended (see its own tests); the originals must be intact.
    expect(migrateQuickAccess(others).slice(0, 2)).toEqual(others);
  });

  it("is idempotent — a tile already moved is left as-is", () => {
    const moved = tile({ href: "/guide/hiking" });
    expect(migrateQuickAccess([moved])[0]).toEqual(moved);
    expect(migrateQuickAccess(migrateQuickAccess([tile()]))[0].href).toBe("/guide/hiking");
  });

  it("passes undefined through, so the defaults still apply", () => {
    expect(migrateQuickAccess(undefined)).toBeUndefined();
  });

  it("does not mutate the array it was given", () => {
    const input = [tile()];
    const before = input.length;
    migrateQuickAccess(input);
    expect(input[0].href).toBe("/guide/routes");
    expect(input).toHaveLength(before);
  });

  it("swaps Viewpoints for Delivery, in place", () => {
    // In place, not appended: the freed slot is where the eye already was, and
    // a new tile stranded at the end of row two is a tile nobody taps.
    const grid = [
      tile({ id: "qa-beaches", label: "Beaches", href: "/guide/beaches", icon: "beach" }),
      tile({ id: "qa-viewpoints", label: "Viewpoints", href: "/guide/viewpoints", icon: "viewpoint" }),
      tile({ id: "qa-taxi", label: "Taxi", href: "/taxi", icon: "taxi" }),
    ];
    const out = migrateQuickAccess(grid);
    expect(out.map((x) => x.id)).toEqual(["qa-beaches", "qa-deliver", "qa-taxi"]);
    expect(out[1]).toMatchObject({ href: "/deliver", icon: "delivery", label: "Delivery" });
  });

  it("relabels the fused tile so Viewpoints has not merely vanished", () => {
    const out = migrateQuickAccess([tile({ id: "qa-beaches", label: "Beaches", href: "/guide/beaches" })]);
    expect(out[0].label).toBe("Beaches & Views");
    expect(out[0].labelFr).toBe("Plages & vues");
    expect(out[0].href).toBe("/guide/beaches");
  });

  it("does not rename a Beaches tile the owner has already renamed", () => {
    const own = tile({ id: "qa-beaches", label: "Nos plages", href: "/guide/beaches" });
    expect(migrateQuickAccess([own])[0].label).toBe("Nos plages");
  });

  it("does not touch a Viewpoints tile the owner has re-pointed", () => {
    const own = tile({ id: "qa-viewpoints", label: "Viewpoints", href: "/map", icon: "viewpoint" });
    const out = migrateQuickAccess([own]);
    expect(out[0].id).toBe("qa-viewpoints");
    // …but Delivery must still arrive, appended.
    expect(out.some((x) => x.id === "qa-deliver")).toBe(true);
  });

  it("still adds Delivery when Viewpoints was already removed", () => {
    // The owner who tidied his grid must not be the one person who never gets
    // the feature.
    const out = migrateQuickAccess([tile({ id: "qa-taxi", label: "Taxi", href: "/taxi" })]);
    expect(out.map((x) => x.id)).toEqual(["qa-taxi", "qa-deliver"]);
  });

  it("adds Delivery exactly once, however many times it runs", () => {
    const grid = [tile({ id: "qa-viewpoints", label: "Viewpoints", href: "/guide/viewpoints" })];
    const once = migrateQuickAccess(grid);
    const twice = migrateQuickAccess(once);
    expect(twice).toEqual(once);
    expect(twice.filter((x) => x.id === "qa-deliver")).toHaveLength(1);
  });

  it("leaves the shipped defaults untouched — they already point at the guide", () => {
    // A tripwire: if someone re-points the default back at /guide/routes, this
    // migration would silently start rewriting the seed too.
    expect(migrateQuickAccess(DEFAULT_QUICK_ACCESS)).toEqual(DEFAULT_QUICK_ACCESS);
    expect(DEFAULT_QUICK_ACCESS.find((x) => x.id === "qa-hiking")?.href).toBe("/guide/hiking");
  });
});

describe("migrateHomeCards", () => {
  const card = (over: Record<string, unknown> = {}) => ({
    id: "hc-exp", label: "Experiences", href: "/browse/tours", ...over,
  });

  it("moves the Experiences card off the tour list onto the hub", () => {
    // /browse/tours is ONE kind of experience — massages, charters, sea trips
    // and hiking guides had no door of their own.
    expect(migrateHomeCards([card()])[0].href).toBe("/experiences");
  });

  it("leaves a card the owner has re-pointed himself", () => {
    expect(migrateHomeCards([card({ href: "/browse/activities" })])[0].href).toBe("/browse/activities");
  });

  it("keeps every other property of the card", () => {
    const c = card({ label: "Nos expériences", tint: "amber", enabled: false });
    expect(migrateHomeCards([c])[0]).toEqual({ ...c, href: "/experiences" });
  });

  it("leaves other cards alone", () => {
    const others = [card({ id: "hc-scooter", href: "/browse/tours" })];
    expect(migrateHomeCards(others)).toEqual(others);
  });

  it("is idempotent", () => {
    const once = migrateHomeCards([card()]);
    expect(migrateHomeCards(once)).toEqual(once);
  });

  it("passes undefined through so the defaults apply", () => {
    expect(migrateHomeCards(undefined)).toBeUndefined();
  });
});

// ── THE MARKETPLACE RENAME ──────────────────────────────────────────────────
//
// The homepage card was the last surface still calling /shop "Local Stores".
// These tests pin BOTH halves of the fix: the seed in lib/defaults.ts (which
// only ever affects a fresh install) and the read-time migration (which is the
// half that actually reaches roulerodrig.com, because the saved site_content
// array wins over the seed).

const card = (over: Record<string, unknown> = {}) => ({
  id: "hc-stores",
  label: "Local Stores",
  labelFr: "Boutiques",
  labelCr: "Laboutik",
  href: "/shop",
  icon: "store",
  enabled: true,
  ...over,
});

describe("the Local Stores -> Marketplace rename", () => {
  it("renames the saved card in all three languages", () => {
    const [out] = migrateHomeCards([card()]) as Record<string, unknown>[];
    expect(out.label).toBe("Marketplace");
    expect(out.labelFr).toBe("Marketplace");
    expect(out.labelCr).toBe("Marketplace");
  });

  it("leaves the destination alone — this is a rename, not a move", () => {
    const [out] = migrateHomeCards([card()]) as Record<string, unknown>[];
    expect(out.href).toBe("/shop");
  });

  it("keeps every other field the owner set", () => {
    const [out] = migrateHomeCards([card({ icon: "shopping-bag", enabled: false })]) as Record<
      string,
      unknown
    >[];
    expect(out.icon).toBe("shopping-bag");
    expect(out.enabled).toBe(false);
    expect(out.id).toBe("hc-stores");
  });

  // The guard that makes this safe to ship: a migration that fought the admin
  // panel would be a worse bug than the label it fixes.
  it("does NOT touch a card the owner has already renamed himself", () => {
    const owners = card({ label: "Nou Bazar", labelFr: "Nou Bazar", labelCr: "Nou Bazar" });
    const [out] = migrateHomeCards([owners]) as Record<string, unknown>[];
    expect(out.label).toBe("Nou Bazar");
    expect(out.labelFr).toBe("Nou Bazar");
  });

  it("does not rename a different card that happens to say Local Stores", () => {
    const [out] = migrateHomeCards([card({ id: "hc-other" })]) as Record<string, unknown>[];
    expect(out.label).toBe("Local Stores");
  });

  it("is idempotent — running it on already-migrated cards changes nothing", () => {
    const once = migrateHomeCards([card()]);
    const twice = migrateHomeCards(once);
    expect(twice).toEqual(once);
  });

  it("still moves the Experiences card, so relabel did not break re-pointing", () => {
    const [out] = migrateHomeCards([
      { id: "hc-exp", label: "Experiences", href: "/browse/tours" },
    ]) as Record<string, unknown>[];
    expect(out.href).toBe("/experiences");
    expect(out.label).toBe("Experiences");
  });

  it("passes undefined through, because a site with no saved cards has none", () => {
    expect(migrateHomeCards(undefined)).toBeUndefined();
  });

  it("the shipped seed no longer says Local Stores in any language", async () => {
    const { DEFAULT_HOME_CARDS } = await import("./defaults");
    const stores = DEFAULT_HOME_CARDS.find((c) => c.id === "hc-stores");
    expect(stores).toBeDefined();
    expect([stores!.label, stores!.labelFr, stores!.labelCr]).toEqual([
      "Marketplace",
      "Marketplace",
      "Marketplace",
    ]);
  });

  // The seed and the migration have to agree, or a fresh install and the live
  // site end up with two different words for the same card.
  it("the seed and the migration agree on the new label", async () => {
    const { DEFAULT_HOME_CARDS } = await import("./defaults");
    const seeded = DEFAULT_HOME_CARDS.find((c) => c.id === "hc-stores");
    const [migrated] = migrateHomeCards([card()]) as Record<string, unknown>[];
    expect(migrated.label).toBe(seeded!.label);
  });
});
