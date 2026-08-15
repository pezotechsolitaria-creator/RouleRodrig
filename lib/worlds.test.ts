import { describe, expect, it } from "vitest";
import {
  forWorld, heroesForWorld, inWorld, otherWorld, parseWorld, rankForWorld,
  targetOf, WORLD_COPY, WORLDS,
} from "@/lib/worlds";

describe("world targeting", () => {
  it("treats content with no world as belonging to both", () => {
    // EVERY existing record is in this state. If this ever returns false for
    // one world, the entire catalogue vanishes from half the site with no
    // migration having been asked for.
    expect(targetOf({})).toBe("both");
    expect(targetOf({ world: null })).toBe("both");
    expect(targetOf({ world: "" })).toBe("both");
    expect(targetOf({ world: "nonsense" })).toBe("both");
    for (const w of WORLDS) expect(inWorld({}, w)).toBe(true);
  });

  it("respects an explicit assignment", () => {
    expect(inWorld({ world: "authentic" }, "authentic")).toBe(true);
    expect(inWorld({ world: "authentic" }, "curated")).toBe(false);
    expect(inWorld({ world: "curated" }, "curated")).toBe(true);
    expect(inWorld({ world: "both" }, "curated")).toBe(true);
  });

  it("only accepts a real world from storage", () => {
    expect(parseWorld("authentic")).toBe("authentic");
    expect(parseWorld("curated")).toBe("curated");
    expect(parseWorld("both")).toBeNull();
    expect(parseWorld(null)).toBeNull();
    expect(parseWorld("light")).toBeNull();
  });

  it("toggles", () => {
    expect(otherWorld("authentic")).toBe("curated");
    expect(otherWorld("curated")).toBe("authentic");
  });
});

describe("ranking", () => {
  const items = [
    { id: "a" },
    { id: "b", worldPriority: 2 },
    { id: "c", featuredCurated: true },
    { id: "d", worldPriority: 1 },
    { id: "e", featuredCurated: true, worldPriority: 5 },
  ];

  it("puts featured first, then explicit priority, then original order", () => {
    expect(rankForWorld(items, "curated").map((i) => i.id)).toEqual(
      // c and e are featured (c has no priority so it sorts after e among the
      // featured); then d(1), b(2), then unranked a.
      ["e", "c", "d", "b", "a"],
    );
  });

  it("does not let unranked content outrank a deliberate number", () => {
    const out = rankForWorld([{ id: "none" }, { id: "ten", worldPriority: 10 }], "authentic");
    expect(out.map((i) => i.id)).toEqual(["ten", "none"]);
  });

  it("is stable, so a homepage does not reshuffle between navigations", () => {
    // Annotated so TypeScript does not reject an object literal that happens
    // to share no keys with Rankable — which is exactly the shape all existing
    // content has, and precisely what this test is about.
    const flat: { id: string; worldPriority?: number }[] = [{ id: "x" }, { id: "y" }, { id: "z" }];
    expect(rankForWorld(flat, "authentic").map((i) => i.id)).toEqual(["x", "y", "z"]);
    expect(rankForWorld(flat, "curated").map((i) => i.id)).toEqual(["x", "y", "z"]);
  });

  it("ranks each world by its own flags", () => {
    const both = [
      { id: "p", featuredAuthentic: true },
      { id: "q", featuredCurated: true },
    ];
    expect(forWorld(both, "authentic")[0].id).toBe("p");
    expect(forWorld(both, "curated")[0].id).toBe("q");
  });
});

describe("forWorld", () => {
  const catalogue = [
    { id: "village", world: "authentic" },
    { id: "spa", world: "curated" },
    { id: "beach" },
    { id: "villa", world: "curated", featuredCurated: true, heroCurated: true },
  ];

  it("filters and ranks in one pass", () => {
    expect(forWorld(catalogue, "authentic").map((i) => i.id)).toEqual(["village", "beach"]);
    expect(forWorld(catalogue, "curated").map((i) => i.id)).toEqual(["villa", "spa", "beach"]);
  });

  it("never returns content belonging to the other world", () => {
    for (const w of WORLDS) {
      for (const item of forWorld(catalogue, w)) {
        expect(inWorld(item, w)).toBe(true);
      }
    }
  });

  it("finds hero candidates only where they were marked", () => {
    expect(heroesForWorld(catalogue, "curated").map((i) => i.id)).toEqual(["villa"]);
    expect(heroesForWorld(catalogue, "authentic")).toEqual([]);
  });
});

describe("world copy", () => {
  it("gives every world the full trilingual set", () => {
    for (const w of WORLDS) {
      const c = WORLD_COPY[w];
      expect(c.promise).toHaveLength(3);
      expect(c.cta).toHaveLength(3);
      expect(c.headline).toHaveLength(3);
      for (const line of [...c.promise, ...c.cta, ...c.headline]) {
        expect(line.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("gives the two worlds opposite light, because world subsumes the theme", () => {
    expect(WORLD_COPY.authentic.theme).toBe("light");
    expect(WORLD_COPY.curated.theme).toBe("dark");
  });
});
