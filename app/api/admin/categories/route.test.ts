import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { fakeDb, type FakeDb } from "@/test/fake-supabase-tables";

// ── THE MARKETPLACE SHELVES EDITOR, THROUGH THE REAL ROUTE (architecture
// review 2026-09-30, item 5) ────────────────────────────────────────────────
//
// The real guardAdminApi, zod schemas and rules run against an in-memory
// categories table; the assertions are on the rows and the audit trail.

let db: FakeDb;
let authed = true;
const revalidatePath = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock("@/lib/auth", () => ({ verifySession: () => authed, COOKIE_NAME: "rr_admin" }));
vi.mock("@/lib/supabase/admin", () => ({
  getPrivileged: async () => db.client,
  hasServiceRole: () => true,
}));

const route = await import("./route");
const { GET, POST, PATCH } = route;

const LOCAL = "0b6c3a51-1a2b-4c3d-8e4f-5a6b7c8d9e01";
const CARE = "0b6c3a51-1a2b-4c3d-8e4f-5a6b7c8d9e02";
const SERVICES = "0b6c3a51-1a2b-4c3d-8e4f-5a6b7c8d9e03";
const FOOD = "0b6c3a51-1a2b-4c3d-8e4f-5a6b7c8d9e04";

const req = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/api/admin/categories", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const cat = (id: string) => db.tables.categories.find((c) => c.id === id)!;
const audits = () => (db.tables.audit_logs ?? []) as { action: string; entity_id: string; diff: Record<string, unknown> }[];

beforeEach(() => {
  authed = true;
  revalidatePath.mockClear();
  db = fakeDb({
    categories: [
      { id: LOCAL, parent_id: null, name: "Local products", slug: "local-products", icon: "package", position: 10, is_active: true },
      { id: CARE, parent_id: null, name: "Vehicle Care & Detailing", slug: "vehicle-care", icon: "car", position: 30, is_active: true },
      { id: SERVICES, parent_id: null, name: "Services", slug: "services", icon: "wrench", position: 50, is_active: false },
      { id: FOOD, parent_id: null, name: "Fruit & Vegetables", slug: "fruit-veg", icon: "carrot", position: 50, is_active: true },
    ],
    products: [{ category_id: CARE }, { category_id: CARE }, { category_id: LOCAL }, { category_id: null }],
  });
});

describe("the door", () => {
  it("refuses without the admin session", async () => {
    authed = false;
    expect((await GET(req("GET"))).status).toBe(401);
  });

  it("has no DELETE — a shelf is switched off, never deleted", () => {
    expect("DELETE" in route).toBe(false);
  });
});

describe("GET lists every shelf with how many products are on it", () => {
  it("counts products per shelf, switched-off ones included", async () => {
    const body = await (await GET(req("GET"))).json();
    const by = Object.fromEntries(body.categories.map((c: { slug: string; productCount: number }) => [c.slug, c.productCount]));
    expect(by).toEqual({ "local-products": 1, "vehicle-care": 2, services: 0, "fruit-veg": 0 });
  });
});

describe("POST creates a shelf", () => {
  it("derives the slug from the name, places it last on the ten-step grid and audits it", async () => {
    const res = await POST(req("POST", { name: "Beach & Snorkel", icon: "gift" }));
    expect(res.status).toBe(201);
    const created = (await res.json()).category;
    expect(created).toMatchObject({ slug: "beach-and-snorkel", position: 60, is_active: true, icon: "gift", parent_id: null });
    expect(audits()[0]).toMatchObject({ action: "category.create", entity_id: created.id });
    expect(revalidatePath).toHaveBeenCalledWith("/shop", "layout");
  });

  it("refuses a slug that exists — even a switched-off one, even in another case", async () => {
    const res = await POST(req("POST", { name: "Anything", slug: "Services" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("/shop/c/services is already a shelf");
    expect(db.tables.categories).toHaveLength(4);
  });

  it("refuses an icon the rail cannot draw", async () => {
    const res = await POST(req("POST", { name: "Books", icon: "book" }));
    expect(res.status).toBe(400);
    expect(db.tables.categories).toHaveLength(4);
  });

  // Deliberately changed pin (architecture review 2026-09-30, item 5,
  // follow-up). This used to be "nests one level deep and no deeper". Nothing
  // public reads parent_id — the /shop rail is one flat row — so a nested shelf
  // sat in the desk under its parent and on the rail wherever its number fell.
  it("refuses to put a new shelf inside another, in words, and writes nothing", async () => {
    const res = await POST(req("POST", { name: "Car shampoo", parentId: CARE }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/do not nest on the shop yet/);
    expect(db.tables.categories).toHaveLength(4);
    expect(audits()).toHaveLength(0);
  });

  it("takes an explicit null parent as nothing and creates a top-level shelf", async () => {
    const res = await POST(req("POST", { name: "Car shampoo", parentId: null }));
    expect(res.status).toBe(201);
    expect((await res.json()).category).toMatchObject({ parent_id: null, position: 60 });
  });
});

describe("PATCH edits a shelf, never its address", () => {
  it("renames, keeping the slug, and audits before and after", async () => {
    const res = await PATCH(req("PATCH", { id: LOCAL, name: "Made in Rodrigues" }));
    expect(res.status).toBe(200);
    expect(cat(LOCAL)).toMatchObject({ name: "Made in Rodrigues", slug: "local-products" });
    expect(audits()[0]).toMatchObject({
      action: "category.update",
      entity_id: LOCAL,
      diff: { slug: "local-products", from: { name: "Local products" }, to: { name: "Made in Rodrigues" } },
    });
  });

  it("refuses any attempt to change the slug", async () => {
    const res = await PATCH(req("PATCH", { id: LOCAL, slug: "new-address" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/fixed once it is created/);
    expect(cat(LOCAL).slug).toBe("local-products");
  });

  it("switches a shelf off and on, audited", async () => {
    await PATCH(req("PATCH", { id: CARE, isActive: false }));
    expect(cat(CARE).is_active).toBe(false);
    await PATCH(req("PATCH", { id: CARE, isActive: true }));
    expect(cat(CARE).is_active).toBe(true);
    expect(audits().map((a) => a.action)).toEqual(["category.update", "category.update"]);
  });

  it("keeps the retired 'services' shelf retired (owner ruling M183)", async () => {
    const res = await PATCH(req("PATCH", { id: SERVICES, isActive: true }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/retired on purpose \(M183\)/);
    expect(cat(SERVICES).is_active).toBe(false);
    expect(audits()).toHaveLength(0);
  });

  it("moves a shelf up past a tie, renumbering the whole list so the move is real", async () => {
    // services and fruit-veg share position 50; moving fruit-veg up must land
    // it above vehicle-care, not swap two equal numbers and change nothing.
    const res = await PATCH(req("PATCH", { id: FOOD, move: "up" }));
    expect((await res.json()).moved).toBe(true);
    const order = [...db.tables.categories]
      .sort((a, b) => Number(a.position) - Number(b.position) || String(a.name).localeCompare(String(b.name)))
      .map((c) => c.slug);
    expect(order).toEqual(["local-products", "fruit-veg", "vehicle-care", "services"]);
    expect(audits()[0]).toMatchObject({ action: "category.reorder", entity_id: FOOD, diff: { move: "up" } });
  });

  it("does nothing, and says so, at the end of the list", async () => {
    const res = await PATCH(req("PATCH", { id: LOCAL, move: "up" }));
    expect((await res.json()).moved).toBe(false);
    expect(audits()).toHaveLength(0);
  });

  it("will not put a shelf inside another — or itself — and leaves it untouched", async () => {
    for (const parentId of [LOCAL, CARE]) {
      const res = await PATCH(req("PATCH", { id: CARE, parentId }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/do not nest on the shop yet/);
    }
    expect(cat(CARE)).toMatchObject({ parent_id: null, position: 30 });
    expect(audits()).toHaveLength(0);
  });

  it("after a move, the rail's own sort reads back exactly the desk's one list", async () => {
    // Two rows filed inside Local products by the old nesting desk, numbered as
    // siblings (10, 20) on top of the top-level grid. The rail reads the table
    // the way marketplace_home() does: position, then name, no parent.
    const HONEY = "0b6c3a51-1a2b-4c3d-8e4f-5a6b7c8d9e06";
    const WAX = "0b6c3a51-1a2b-4c3d-8e4f-5a6b7c8d9e07";
    db.tables.categories.push(
      { id: HONEY, parent_id: LOCAL, name: "Honey", slug: "honey", icon: "honey", position: 10, is_active: true },
      { id: WAX, parent_id: LOCAL, name: "Wax", slug: "wax", icon: "package", position: 20, is_active: true },
    );
    const rail = () =>
      [...db.tables.categories]
        .sort((a, b) => Number(a.position) - Number(b.position) || String(a.name).localeCompare(String(b.name)))
        .map((c) => c.slug);

    // What the desk lists, top to bottom (GET, sorted the desk's way).
    const listed = ((await (await GET(req("GET"))).json()).categories as { slug: string; position: number; name: string }[])
      .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
      .map((c) => c.slug);
    expect(listed).toEqual(rail());
    expect(listed).toEqual(["honey", "local-products", "wax", "vehicle-care", "fruit-veg", "services"]);

    // The owner moves Wax up one, past Local products — in the list he sees.
    expect((await (await PATCH(req("PATCH", { id: WAX, move: "up" }))).json()).moved).toBe(true);
    expect(rail()).toEqual(["honey", "wax", "local-products", "vehicle-care", "fruit-veg", "services"]);
    // Every shelf now has its own number: no tie left for the name to break.
    expect(new Set(db.tables.categories.map((c) => c.position)).size).toBe(db.tables.categories.length);
  });
});
