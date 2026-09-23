import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { kitchenPatchSchema, kitchenSchema } from "@/lib/schemas/food";
import { bookingRule } from "@/app/admin/food/booking-rule";

// ── THE OWNER'S LEVER FOR A COOK WHO NEEDS NOTICE (M216) ────────────────────
//
// Chez Banane's cook needs 24–48 hours. M216 set it in SQL (24 hours' notice,
// bookable two days ahead); this is the screen that lets the owner change it.
//
// The trap these pin: KitchensPanel's save() sends the WHOLE draft. A field
// the edit form cannot load from GET is a field every unrelated save resets —
// it already happened to offers_rr_delivery. Unread, fixing a typo in Chez
// Banane's tagline would have put it back to walk-up with no notice.

const CHEZ_BANANE = "d522e765-78c3-43da-ab4e-db2b7977acaa";

type Call = { table: string; select?: string; update?: Record<string, unknown> };

const state: {
  calls: Call[];
  rows: Record<string, unknown>;
  singles: Record<string, unknown>;
  updateError: { message: string } | null;
} = { calls: [], rows: {}, singles: {}, updateError: null };

/** A PostgREST builder that records what was selected and written. */
function builder(table: string) {
  const call: Call = { table };
  state.calls.push(call);
  const chain = {
    select: (s: string) => {
      call.select = s;
      return chain;
    },
    order: () => chain,
    in: () => chain,
    eq: () => chain,
    limit: () => chain,
    update: (patch: Record<string, unknown>) => {
      call.update = patch;
      return chain;
    },
    upsert: async () => ({ error: null }),
    maybeSingle: async () => ({ data: state.singles[table] ?? null, error: null }),
    then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) =>
      Promise.resolve(
        call.update
          ? { data: null, error: state.updateError }
          : { data: state.rows[table] ?? [], error: null },
      ).then(ok, bad),
  };
  return chain;
}

const fakeAdmin = { from: (t: string) => builder(t), rpc: vi.fn() };

vi.mock("@/lib/food/guard", () => ({
  guardFoodAdmin: async () => ({ admin: fakeAdmin }),
  readJson: async (req: Request) => req.json(),
  failed: (_err: unknown, fallback: string) => NextResponse.json({ error: fallback }, { status: 500 }),
}));
vi.mock("@/lib/admin/audit", () => ({ audit: vi.fn(async () => {}) }));
vi.mock("@/lib/food/admin", () => ({
  createKitchen: vi.fn(async () => CHEZ_BANANE),
  uniqueStoreSlug: vi.fn(async (_a: unknown, s: string) => s),
}));

const { GET, PATCH } = await import("./route");

const req = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/api/admin/food/kitchens", {
    method,
    ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
  });

beforeEach(() => {
  state.calls = [];
  state.rows = {};
  state.singles = {};
  state.updateError = null;
});

describe("GET reads the booking rule back", () => {
  it("selects min_notice_hours and preorder_days, and returns them", async () => {
    state.rows.food_kitchens = [
      {
        store_id: CHEZ_BANANE,
        prep_minutes_min: 20,
        prep_minutes_max: 40,
        pickup_hint: null,
        position: 0,
        halal_certified: false,
        halal_certifier: null,
        halal_certified_until: null,
        min_notice_hours: 24,
        preorder_days: 2,
        stores: { id: CHEZ_BANANE, name: "Chez Banane", slug: "chez-banane", status: "active" },
      },
    ];
    state.singles.marketplace_settings = { food_preorder_enabled: true };

    const res = await GET(req("GET"));
    expect(res.status).toBe(200);

    const kitchenRead = state.calls.find((c) => c.table === "food_kitchens" && c.select);
    expect(kitchenRead?.select).toMatch(/\bmin_notice_hours\b/);
    expect(kitchenRead?.select).toMatch(/\bpreorder_days\b/);

    const { kitchens } = (await res.json()) as { kitchens: Record<string, unknown>[] };
    expect(kitchens[0]).toMatchObject({ minNoticeHours: 24, preorderDays: 2, preorderLive: true });
  });

  it("says when the platform lever is off, so a saved notice is not mistaken for a live one", async () => {
    state.rows.food_kitchens = [
      { store_id: CHEZ_BANANE, min_notice_hours: 24, preorder_days: 2, stores: { name: "Chez Banane" } },
    ];
    state.singles.marketplace_settings = { food_preorder_enabled: false };
    const { kitchens } = (await (await GET(req("GET"))).json()) as { kitchens: Record<string, unknown>[] };
    expect(kitchens[0]).toMatchObject({ preorderLive: false });
  });
});

describe("PATCH maps the pair onto the columns, in ONE update", () => {
  beforeEach(() => {
    state.singles.food_kitchens = { store_id: CHEZ_BANANE };
  });

  it("minNoticeHours → min_notice_hours, preorderDays → preorder_days", async () => {
    const res = await PATCH(req("PATCH", { storeId: CHEZ_BANANE, minNoticeHours: 48, preorderDays: 3 }));
    expect(res.status).toBe(200);
    const writes = state.calls.filter((c) => c.table === "food_kitchens" && c.update);
    // One write: the database checks the pair together, and two writes would
    // fail halfway whenever both move up at once.
    expect(writes).toHaveLength(1);
    expect(writes[0].update).toEqual({ min_notice_hours: 48, preorder_days: 3 });
  });

  it("leaves them alone when the request does not mention them", async () => {
    await PATCH(req("PATCH", { storeId: CHEZ_BANANE, prepMinutesMin: 20, prepMinutesMax: 40 }));
    const write = state.calls.find((c) => c.table === "food_kitchens" && c.update);
    expect(write?.update).not.toHaveProperty("min_notice_hours");
    expect(write?.update).not.toHaveProperty("preorder_days");
  });

  it("turns the database's constraint name into a sentence", async () => {
    state.updateError = {
      message: 'new row for relation "food_kitchens" violates check constraint "food_kitchens_notice_within_horizon"',
    };
    const res = await PATCH(req("PATCH", { storeId: CHEZ_BANANE, minNoticeHours: 48 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/^The notice is longer than the days customers can book ahead/);
  });

  it("refuses notice beyond the days ahead before touching the database", async () => {
    const res = await PATCH(req("PATCH", { storeId: CHEZ_BANANE, minNoticeHours: 48, preorderDays: 1 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(
      "With 48 hours’ notice, customers must be able to book at least 2 days ahead — otherwise there is no time left they can choose.",
    );
    expect(state.calls.some((c) => c.update)).toBe(false);
  });
});

describe("the schema holds the same bounds as the database", () => {
  const patch = (v: Record<string, unknown>) => kitchenPatchSchema.safeParse({ storeId: CHEZ_BANANE, ...v });

  it("accepts Chez Banane's rule, and either half alone", () => {
    expect(patch({ minNoticeHours: 24, preorderDays: 2 }).success).toBe(true);
    expect(patch({ minNoticeHours: 72, preorderDays: 3 }).success).toBe(true);
    expect(patch({ minNoticeHours: 0, preorderDays: 0 }).success).toBe(true);
    expect(patch({ preorderDays: 1 }).success).toBe(true);
  });

  it("notice 0–72 whole hours, days 0–3", () => {
    expect(patch({ minNoticeHours: -1 }).success).toBe(false);
    expect(patch({ minNoticeHours: 73 }).success).toBe(false);
    expect(patch({ minNoticeHours: 1.5 }).success).toBe(false);
    expect(patch({ preorderDays: 4 }).success).toBe(false);
    expect(patch({ preorderDays: -1 }).success).toBe(false);
  });

  it("notice may not exceed days × 24", () => {
    expect(patch({ minNoticeHours: 25, preorderDays: 1 }).success).toBe(false);
    expect(patch({ minNoticeHours: 24, preorderDays: 1 }).success).toBe(true);
  });

  it("a new kitchen checks the pair too", () => {
    const base = { name: "Chez Test", prepMinutesMin: 15, prepMinutesMax: 30 };
    expect(kitchenSchema.safeParse({ ...base, minNoticeHours: 24, preorderDays: 0 }).success).toBe(false);
    expect(kitchenSchema.safeParse({ ...base, minNoticeHours: 24, preorderDays: 2 }).success).toBe(true);
  });
});

describe("the panel", () => {
  const src = readFileSync(join(process.cwd(), "app", "admin", "food", "KitchensPanel.tsx"), "utf8");

  it("the card says it in one line", () => {
    expect(bookingRule(24, 2)).toBe("Needs 24 h notice · up to 2 days ahead");
    expect(bookingRule(0, 1)).toBe("Bookable up to 1 day ahead");
    expect(bookingRule(0, 0)).toBe("Bookable today only");
  });

  it("the edit form LOADS the real values — never a default that a save would write back", () => {
    expect(src).toContain("minNoticeHours: k.minNoticeHours,");
    expect(src).toContain("preorderDays: k.preorderDays,");
  });

  it("save() sends both", () => {
    expect(src).toContain("minNoticeHours: draft.minNoticeHours,");
    expect(src).toContain("preorderDays: draft.preorderDays,");
  });

  it("a new kitchen starts walk-up", () => {
    const empty = src.slice(src.indexOf("const emptyDraft"), src.indexOf("});", src.indexOf("const emptyDraft")));
    expect(empty).toMatch(/minNoticeHours: 0,/);
    expect(empty).toMatch(/preorderDays: 0,/);
  });
});
