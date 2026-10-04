import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CategoryRow } from "@/lib/admin/marketplace-categories";
import CategoriesDesk from "./CategoriesDesk";

// ── THE SHELVES DESK SHOWS THE RAIL'S ORDER (architecture review 2026-09-30,
// item 5, follow-up) ────────────────────────────────────────────────────────
//
// The first desk drew shelves nested under an "Inside" picker, but the /shop
// rail (marketplace_home, m96b) is one flat row by position, then name, and
// reads no parent. So the desk showed an order the shop never did. These
// render the REAL desk with rows already loaded and read the list it draws.

type Row = CategoryRow & { productCount: number };

const row = (id: string, name: string, position: number, parent_id: string | null = null): Row => ({
  id,
  parent_id,
  name,
  slug: id,
  icon: "package",
  position,
  is_active: true,
  productCount: 0,
});

// Includes two rows an older nesting desk filed inside Local products, numbered
// as siblings on top of the top-level grid — the case that broke the order.
const rows: Row[] = [
  row("care", "Vehicle Care", 30),
  row("wax", "Wax", 20, "local"),
  row("local", "Local products", 10),
  row("fruit", "Fruit", 50),
  row("honey", "Honey", 10, "local"),
];

const html = renderToStaticMarkup(createElement(CategoriesDesk, { initialRows: rows }));

/** The shelf names in the order the desk draws them, top to bottom. */
const drawnOrder = () => [...html.matchAll(/aria-label="Name of ([^"]+)"/g)].map((m) => m[1]);
const button = (label: string) => html.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`))?.[0] ?? "";

describe("one list, in the order the /shop rail reads", () => {
  it("draws every shelf top to bottom by position, then name — parent ignored", () => {
    expect(drawnOrder()).toEqual(["Honey", "Local products", "Wax", "Vehicle Care", "Fruit"]);
  });

  it("indents nothing and offers no 'Inside' picker the shop would ignore", () => {
    expect(html).not.toMatch(/>\s*Inside\s*</);
    expect(html).not.toContain("Top level");
    expect(html).not.toContain("ml-6");
  });

  it("the arrows run the whole list: only the very first and very last are stopped", () => {
    // The attribute, not the word: every arrow's class carries disabled:opacity-40.
    expect(button("Move Honey up")).toContain('disabled=""');
    expect(button("Move Fruit down")).toContain('disabled=""');
    // Local products headed the old top-level group, so its up arrow was
    // stopped; in the rail it sits second, behind Honey, and can go up.
    expect(button("Move Local products up")).not.toContain('disabled=""');
    expect(button("Move Wax up")).not.toContain('disabled=""');
    expect(button("Move Honey down")).not.toContain('disabled=""');
  });

  it("tells the owner the list is the rail's order", () => {
    expect(html).toContain("Top to bottom here is left to right on the /shop rail.");
  });
});
