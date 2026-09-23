import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  anyWalkUpServingNow,
  isWalkUpServingNow,
  walkUpKitchensServingNow,
} from "./ready-now";

// ── "READY NOW" AFTER M216 ──────────────────────────────────────────────────
//
// browse_food(p_orderable_only) reads ready_now, which a kitchen that needs
// notice can never satisfy. On 23 Sept 2026 the only kitchen on /food was such
// a kitchen, so every "Ready now" control led to an empty list. These pin the
// rule that hides them, and the menu surfaces that stopped promising a
// half-hour meal the kitchen cannot cook.

const ROOT = join(__dirname, "..", "..");
/** Prose in comments must never be what satisfies a test. */
const code = (...p: string[]) =>
  readFileSync(join(ROOT, ...p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const CHEZ_BANANE_OPEN = { isOpen: true, minNoticeHours: 24 };
const CHEZ_BANANE_SHUT = { isOpen: false, minNoticeHours: 24 };
const WALK_UP_OPEN = { isOpen: true, minNoticeHours: 0 };
const WALK_UP_SHUT = { isOpen: false, minNoticeHours: 0 };

describe("which kitchens can serve right now", () => {
  it("a notice kitchen never can, open or not", () => {
    expect(isWalkUpServingNow(CHEZ_BANANE_OPEN)).toBe(false);
    expect(isWalkUpServingNow(CHEZ_BANANE_SHUT)).toBe(false);
  });

  it("a walk-up kitchen can while it is open", () => {
    expect(isWalkUpServingNow(WALK_UP_OPEN)).toBe(true);
    expect(isWalkUpServingNow(WALK_UP_SHUT)).toBe(false);
  });

  it("counts only open walk-up kitchens", () => {
    expect(walkUpKitchensServingNow([CHEZ_BANANE_OPEN])).toBe(0);
    expect(walkUpKitchensServingNow([CHEZ_BANANE_OPEN, WALK_UP_OPEN, WALK_UP_SHUT])).toBe(1);
    expect(walkUpKitchensServingNow([])).toBe(0);
  });
});

describe("the dish page's own question", () => {
  const client = (result: { data: unknown; error: unknown }) => {
    const rpc = vi.fn().mockResolvedValue(result);
    return { rpc, supabase: { rpc } as unknown as SupabaseClient };
  };

  it("reads food_home()'s kitchens", async () => {
    const { rpc, supabase } = client({
      data: { kitchens: [CHEZ_BANANE_OPEN, WALK_UP_OPEN] },
      error: null,
    });
    await expect(anyWalkUpServingNow(supabase)).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("food_home");
  });

  it("is false with only Chez Banane", async () => {
    const { supabase } = client({ data: { kitchens: [CHEZ_BANANE_OPEN] }, error: null });
    await expect(anyWalkUpServingNow(supabase)).resolves.toBe(false);
  });

  it("is false when the read fails — no link beats a dead-end link", async () => {
    const { supabase } = client({ data: null, error: { message: "boom" } });
    await expect(anyWalkUpServingNow(supabase)).resolves.toBe(false);
  });
});

describe("/food hides what cannot lead anywhere", () => {
  const page = code("app", "food", "page.tsx");

  it("counts cooking-now from open walk-up kitchens, not kitchensOpen", () => {
    expect(page).toContain("walkUpKitchensServingNow(home.kitchens)");
    expect(page).not.toMatch(/n=\{home\.kitchensOpen\}/);
  });

  it("shows the Ready now chip only when it can list something, or is on", () => {
    expect(page).toMatch(/const showReadyNow = cookingNow > 0 \|\| f\.open;/);
    expect(page).toMatch(/\{showReadyNow && \(\s*<Link[\s\S]*?chrome\.readyNow/);
  });

  it("shows Quickest only with more than one kitchen, or while it is on", () => {
    expect(page).toMatch(/home\?\.kitchens\.length \?\? 0\) > 1 \|\| f\.sort === "fastest"/);
    expect(page).toMatch(/\{showQuickest && \(\s*<Link[\s\S]*?chrome\.quickest/);
  });

  it("puts the notice beside the open/closed pill in the kitchens list", () => {
    expect(page).toMatch(/chrome\.kitchenOpen" : "chrome\.kitchenClosed"[\s\S]*?k\.minNoticeHours > 0[\s\S]*?card\.noticeBadge/);
  });
});

describe("the /food snippet says what ordering here is (M201, M216)", () => {
  const src = readFileSync(join(ROOT, "app", "food", "page.tsx"), "utf8");
  const description = src.match(/const DESCRIPTION =\s*"([^"]+)";/)?.[1] ?? "";

  it("fits a search result and keeps its keywords", () => {
    expect(description.length).toBeGreaterThan(100);
    expect(description.length).toBeLessThanOrEqual(155);
    expect(description.startsWith("Order food in Rodrigues")).toBe(true);
    // Keywords that are ON the menu. "Creole curries" was the purged demo
    // kitchen's, and a snippet must not offer what nobody can order.
    for (const kw of ["grilled lobster", "octopus", "fish"]) {
      expect(description).toContain(kw);
    }
    expect(description).not.toMatch(/curr/i);
  });

  it("promises a booking and cash, not a bank transfer", () => {
    expect(description).toMatch(/a day ahead/);
    expect(description).toMatch(/cash at handover/);
    expect(description).not.toMatch(/bank transfer/i);
  });
});

describe("the dish page offers a booking as a PreOrder", () => {
  const page = code("app", "food", "[slug]", "page.tsx");

  it("keeps OutOfStock for a dish that cannot be ordered", () => {
    expect(page).toMatch(/!dish\.orderable\s*\?\s*"https:\/\/schema\.org\/OutOfStock"/);
  });

  it("says PreOrder for a kitchen that needs notice, InStock for walk-up", () => {
    expect(page).toMatch(
      /notice > 0\s*\?\s*"https:\/\/schema\.org\/PreOrder"\s*:\s*"https:\/\/schema\.org\/InStock"/,
    );
  });

  it("asks for ready-now only on the path that shows the link", () => {
    expect(page).toMatch(/!dish\.orderable && !notice \? await anyWalkUpServingNow\(supabase\) : false/);
    expect(page).toContain("<DishOrderPanel dish={dish} readyNowExists={readyNowExists} />");
  });
});

describe("no half-hour promise beside a dish that needs notice", () => {
  it("every prep-time line is gated on the notice", () => {
    for (const file of [
      ["components", "food", "FoodCard.tsx"],
      ["app", "food", "[slug]", "page.tsx"],
      ["app", "food", "k", "[slug]", "page.tsx"],
    ]) {
      const src = code(...file);
      expect(src, file.join("/")).toMatch(/const prep =\s*!notice &&/);
      expect(src, file.join("/")).toContain('k="card.noticeBadge"');
    }
    const panel = code("components", "food", "DishOrderPanel.tsx");
    expect(panel).toMatch(/!notice && dish\.prepMin != null/);
    expect(panel).toContain("copy.panel.noticeLead(dish.kitchenName, notice)");
  });

  it("the order panel only links to Ready now when it exists", () => {
    const panel = code("components", "food", "DishOrderPanel.tsx");
    expect(panel).toMatch(/readyNowExists \? \(\s*<Link\s+href="\/food\?open=1"/);
    expect(panel).toContain("readyNowExists = false");
  });

  it("the add control follows orderable, never kitchenOpen", () => {
    const quick = code("components", "food", "FoodQuickAdd.tsx");
    expect(quick).toContain("if (!item.orderable) return null;");
    expect(quick).not.toContain("kitchenOpen");
  });
});
