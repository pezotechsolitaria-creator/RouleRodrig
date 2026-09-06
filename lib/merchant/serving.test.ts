import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getServingToday } from "./serving";

// ── A COOK'S QUESTION IS NOT A STOCK COUNT ──────────────────────────────────
//
// Three of the four ways a dish leaves the menu — outside its serving window,
// not served today, kitchen shut — have nothing to do with how many portions
// remain. A shop's low-stock report would call Ti Kitchen perfectly healthy
// while six of its seven dishes were unorderable for the next two hours.

function fake(rows: unknown, error: unknown = null) {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => Promise.resolve({ data: rows, error });
  return { from: () => chain } as never;
}

const TI_KITCHEN = [
  { name: "Boulettes (8 pieces)", orderable: true, availability: "available" },
  { name: "Chicken Curry & Rice", orderable: true, availability: "available" },
  { name: "Coconut Napolitaine", orderable: true, availability: "available" },
  { name: "Grilled Fish of the Day", orderable: true, availability: "available" },
  { name: "Mine Frite Légumes", orderable: true, availability: "available" },
  { name: "Ourite Rougaille", orderable: true, availability: "available" },
  { name: "Farata & Rougaille", orderable: false, availability: "wrong_time" },
];

describe("getServingToday", () => {
  it("counts what a customer can actually order, against the whole menu", async () => {
    // The real production shape of Ti Kitchen at the time of writing.
    const s = await getServingToday(fake(TI_KITCHEN), "store-1");
    expect(s.ok && s.total).toBe(7);
    expect(s.ok && s.orderable).toBe(6);
  });

  it("names what is off and why, in the cook's words", async () => {
    const s = await getServingToday(fake(TI_KITCHEN), "store-1");
    expect(s.ok && s.off).toEqual([
      { name: "Farata & Rougaille", reason: "outside its serving time" },
    ]);
  });

  it("puts what the cook can fix above what is just the clock", async () => {
    // Sold out is a decision they can reverse. Outside a serving window is the
    // time of day, and no amount of attention changes it.
    const s = await getServingToday(
      fake([
        { name: "Zzz Late Dish", orderable: false, availability: "wrong_time" },
        { name: "Aaa Ourite", orderable: false, availability: "sold_out" },
      ]),
      "store-1",
    );
    expect(s.ok && s.off.map((d) => d.name)).toEqual(["Aaa Ourite", "Zzz Late Dish"]);
  });

  it("translates every reason code the catalogue can produce", async () => {
    const codes = ["sold_out", "wrong_day", "wrong_time", "off_menu", "kitchen_closed", "missing"];
    const s = await getServingToday(
      fake(codes.map((c, i) => ({ name: `d${i}`, orderable: false, availability: c }))),
      "store-1",
    );
    // A raw Postgres value reaching a cook's screen is the bug this catches.
    for (const d of (s.ok ? s.off : [])) {
      expect(codes, `"${d.reason}" is an untranslated code`).not.toContain(d.reason);
    }
  });

  it("reports an empty menu as empty, not as a failure", async () => {
    const s = await getServingToday(fake([]), "store-1");
    expect(s).toEqual({ ok: true, total: 0, orderable: 0, off: [] });
  });

  it("fails rather than reporting an empty menu when the read errors", async () => {
    expect(await getServingToday(fake(null, { message: "denied" }), "s")).toEqual({ ok: false });
  });
});

describe("the block says which dishes, not how many", () => {
  const ui = readFileSync(
    join(process.cwd(), "components", "merchant", "home", "ServingToday.tsx"),
    "utf8",
  );

  it("renders dish names", () => {
    // "3 dishes unavailable" sends the cook to the menu to find out which. The
    // names are the entire value of the block.
    expect(ui).toContain("serving.off.slice(0, 4).map");
    expect(ui).toContain("{d.name}");
  });

  it("distinguishes a failed read from an empty menu", () => {
    expect(ui).toContain("!serving.ok");
    expect(ui).toContain("serving.total === 0");
  });
});
