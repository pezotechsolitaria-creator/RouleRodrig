import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CategoryStrip from "@/components/shop/CategoryStrip";
import {
  CATEGORY_ICON_KEYS,
  byRailOrder,
  categorySlugFromName,
  categorySlugInput,
  categorySlugProblem,
  nextPosition,
  reorderWrites,
  type CategoryRow,
} from "./marketplace-categories";

// ── The shelves editor's rules (architecture review 2026-09-30, item 5) ─────

describe("every icon the editor offers is one the rail can draw", () => {
  // Renders the REAL strip once per key. A key CategoryStrip does not know
  // silently becomes the generic package box — the fault M183 found on three
  // live shelves — so offering one would let the owner pick a picture that
  // never appears.
  const svgClassFor = (icon: string) => {
    const html = renderToStaticMarkup(
      createElement(CategoryStrip, { categories: [{ slug: "x", name: "X", icon, count: 1 }] }),
    );
    const tile = html.slice(html.indexOf('href="/shop/c/x"'));
    return tile.match(/<svg[^>]*class="([^"]+)"/)?.[1] ?? "";
  };

  it("draws a real picture for each key, and the box only for 'package'", () => {
    const box = svgClassFor("definitely-not-a-key");
    expect(box).toMatch(/lucide-package/);
    for (const key of CATEGORY_ICON_KEYS) {
      if (key === "package") continue;
      expect(svgClassFor(key), `icon "${key}" falls back to the generic box`).not.toBe(box);
    }
  });
});

describe("slugs", () => {
  it("are made from the name the way the M183 shelves were written", () => {
    expect(categorySlugFromName("Local products")).toBe("local-products");
    expect(categorySlugFromName("Vehicle Care & Detailing")).toBe("vehicle-care-and-detailing");
    expect(categorySlugFromName("Épicerie fine")).toBe("epicerie-fine");
  });

  it("can be typed a word at a time", () => {
    expect(categorySlugInput("beach-")).toBe("beach-");
    expect(categorySlugInput("Beach  Gear")).toBe("beach-gear");
  });

  it("refuse a trailing hyphen, an empty address, and a clash in any case", () => {
    const existing = [{ slug: "Local-Products" }];
    expect(categorySlugProblem("beach-", existing)).toMatch(/single hyphens/);
    expect(categorySlugProblem("", existing)).toMatch(/needs a web address/);
    expect(categorySlugProblem("local-products", existing)).toMatch(/already a shelf/);
    expect(categorySlugProblem("beach-gear", existing)).toBeNull();
  });
});

describe("positions", () => {
  it("puts a new shelf after the last on the ten-step grid", () => {
    expect(nextPosition([{ position: 10 }, { position: 40 }])).toBe(50);
    expect(nextPosition([{ position: 45 }])).toBe(50);
    expect(nextPosition([])).toBe(10);
  });

  const row = (id: string, position: number, name = id, parent_id: string | null = null): CategoryRow => ({
    id, parent_id, name, slug: id, icon: null, position, is_active: true,
  });

  /** Apply the writes, then read the list back the way the rail sorts it. */
  const railAfter = (all: CategoryRow[], writes: { id: string; position: number }[]) =>
    all
      .map((c) => ({ ...c, position: writes.find((w) => w.id === c.id)?.position ?? c.position }))
      .sort(byRailOrder)
      .map((c) => c.id);

  it("writes only the numbers that change, and does nothing at either end", () => {
    const all = [row("a", 10), row("b", 20), row("c", 30)];
    expect(reorderWrites(all, "c", "up")).toEqual([
      { id: "c", position: 20 },
      { id: "b", position: 30 },
    ]);
    expect(reorderWrites(all, "a", "up")).toEqual([]);
    expect(reorderWrites(all, "c", "down")).toEqual([]);
    expect(reorderWrites(all, "missing", "up")).toEqual([]);
  });

  // Deliberately changed pin (architecture review 2026-09-30, item 5,
  // follow-up). It used to be "moves within siblings only": a child renumbered
  // to 10 among its siblings while a top-level shelf also sat at 10, so the
  // /shop rail — one flat row by position, name — put the child wherever its
  // name fell. The desk is now one list in rail order; a move renumbers it all.
  it("renumbers the whole rail, parent ignored, so the rail reads exactly the desk's order", () => {
    // M183-like: Local products 10, Vehicle Care 30, Fruit 50, and two rows a
    // nesting desk once filed inside Local products, renumbered as siblings.
    const all = [
      row("local", 10, "Local products"),
      row("care", 30, "Vehicle Care"),
      row("fruit", 50, "Fruit"),
      row("wax", 20, "Wax", "local"),
      row("honey", 10, "Honey", "local"),
    ];
    const desk = [...all].sort(byRailOrder).map((c) => c.id);
    expect(desk).toEqual(["honey", "local", "wax", "care", "fruit"]);

    // Move Wax up: it passes Local products in THIS list, the list the owner sees.
    const writes = reorderWrites(all, "wax", "up");
    expect(railAfter(all, writes)).toEqual(["honey", "wax", "local", "care", "fruit"]);
    // Every number is now distinct, so the rail's name tie-break no longer decides anything.
    const positions = all.map((c) => writes.find((w) => w.id === c.id)?.position ?? c.position);
    expect(new Set(positions).size).toBe(all.length);
  });

  it("moves past a tie for real — the M183 shelves that share a number", () => {
    const all = [row("a", 10, "A"), row("b", 50, "B"), row("c", 50, "C")];
    expect(railAfter(all, reorderWrites(all, "c", "up"))).toEqual(["a", "c", "b"]);
    expect(railAfter(all, reorderWrites(all, "b", "down"))).toEqual(["a", "c", "b"]);
  });
});
