import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Every admin delete leaves a line in the trail (architecture review
//    2026-09-30, item 3) ────────────────────────────────────────────────────
//
// The six DELETE handlers that removed rows and wrote nothing, driven for real.
// Each must still delete exactly what it deleted before and answer { ok: true };
// what is new is one audit row per removed row, with key fields only.

type Row = Record<string, unknown>;
let removed: Row[] = [];
let failure: { message: string } | null = null;
const deletes: { table: string; filters: [string, unknown][] }[] = [];
const audits: { action: string; entityType: string; entityId?: string | null; diff?: Record<string, unknown> | null }[] = [];

function builder(table: string) {
  const filters: [string, unknown][] = [];
  let isDelete = false;
  const b = {
    delete: () => ((isDelete = true), b),
    eq: (c: string, v: unknown) => (filters.push([c, v]), b),
    select: () => b,
    then: (resolve: (v: unknown) => unknown) => {
      if (isDelete) deletes.push({ table, filters: [...filters] });
      return Promise.resolve(failure ? { data: null, error: failure } : { data: removed, error: null }).then(resolve);
    },
  };
  return b;
}

vi.mock("@/lib/auth", () => ({ verifySession: () => true, COOKIE_NAME: "admin" }));
vi.mock("@/lib/supabase/admin", () => ({ getPrivileged: async () => ({ from: (t: string) => builder(t) }) }));
vi.mock("@/lib/admin/audit", () => ({
  audit: async (_a: unknown, e: (typeof audits)[number]) => {
    audits.push(e);
  },
}));

const ID = "22222222-3333-4444-8555-666666666666";
const byId = (path: string) => new NextRequest(`http://localhost${path}?id=${ID}`, { method: "DELETE" });

beforeEach(() => {
  removed = [];
  failure = null;
  deletes.length = 0;
  audits.length = 0;
});

const CASES = [
  {
    name: "contact submissions",
    load: () => import("./submissions/route"),
    path: "/api/admin/submissions",
    table: "contact_submissions",
    row: { id: ID, name: "Ana", email: "ana@example.com", phone: null, scooter: null, dates: null, message: "Hello, is the Burgman free?", handled: true, created_at: "2026-09-01T08:00:00Z" },
    action: "contact_submission.delete",
    kept: { name: "Ana", email: "ana@example.com", handled: true },
    left: ["message"],
  },
  {
    name: "the waitlist",
    load: () => import("./waitlist/route"),
    path: "/api/admin/waitlist",
    table: "waitlist",
    row: { id: ID, email: "ana@example.com", name: "Ana", source: "home", created_at: "2026-09-01T08:00:00Z" },
    action: "waitlist.delete",
    kept: { email: "ana@example.com", source: "home" },
    left: [],
  },
  {
    name: "reviews",
    load: () => import("./reviews/route"),
    path: "/api/admin/reviews",
    table: "product_reviews",
    row: { id: ID, scooter_id: "burgman", scooter_name: "Burgman", name: "Ana", origin: "FR", rating: 2, text: "Too slow uphill", status: "rejected", created_at: "2026-09-01T08:00:00Z" },
    action: "review.delete",
    kept: { scooter_id: "burgman", name: "Ana", rating: 2, status: "rejected" },
    left: ["text"],
  },
  {
    name: "driver reviews",
    load: () => import("./taxi-reviews/route"),
    path: "/api/admin/taxi-reviews",
    table: "taxi_driver_reviews",
    row: { id: ID, driver_id: "d1", driver_name: "Jean", name: "Ana", origin: null, rating: 5, text: "Kind and on time", status: "pending", created_at: "2026-09-01T08:00:00Z" },
    action: "taxi_review.delete",
    kept: { driver_id: "d1", driver_name: "Jean", rating: 5, status: "pending" },
    left: ["text"],
  },
  {
    name: "owner applications",
    load: () => import("./owner-applications/route"),
    path: "/api/admin/owner-applications",
    table: "owner_applications",
    row: { id: ID, owner_name: "Paul", phone: "+230 5712 3456", email: "paul@example.com", listing_type: "scooter", business_name: null, status: "rejected", id_card: "applications/p/id.jpg", created_at: "2026-09-01T08:00:00Z" },
    action: "owner_application.delete",
    kept: { owner_name: "Paul", email: "paul@example.com", listing_type: "scooter", status: "rejected" },
    left: ["id_card"],
  },
] as const;

describe.each(CASES)("DELETE $name", (c) => {
  it("deletes by id as before, answers ok, and audits the removed row's key fields", async () => {
    removed = [c.row as Row];
    const { DELETE } = await c.load();
    const res = await DELETE(byId(c.path));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(deletes).toEqual([{ table: c.table, filters: [["id", ID]] }]);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ action: c.action, entityId: ID });
    expect(audits[0].diff).toMatchObject(c.kept);
    for (const k of c.left) expect(audits[0].diff, k).not.toHaveProperty(k);
  });

  it("writes nothing to the trail when nothing was deleted", async () => {
    const { DELETE } = await c.load();
    const res = await DELETE(byId(c.path));
    expect(res.status).toBe(200);
    expect(audits).toHaveLength(0);
  });

  it("reports a failed delete as before, and audits nothing", async () => {
    failure = { message: "permission denied" };
    const { DELETE } = await c.load();
    const res = await DELETE(byId(c.path));
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: string }).error).toBe("permission denied");
    expect(audits).toHaveLength(0);
  });
});

describe("DELETE Ti Roulé question (leads)", () => {
  const clear = async (question: string) => {
    const { DELETE } = await import("./leads/route");
    return DELETE(
      new NextRequest("http://localhost/api/admin/leads", {
        method: "DELETE",
        body: JSON.stringify({ question }),
        headers: { "Content-Type": "application/json" },
      }),
    );
  };

  it("clears the question's rows as before, and records one line with how many", async () => {
    removed = [{ created_at: "a" }, { created_at: "b" }, { created_at: "c" }];
    const res = await clear("Can I ride to Trou d'Argent?");
    expect(res.status).toBe(200);
    expect(deletes).toEqual([
      { table: "lead_events", filters: [["kind", "tiroule_miss"], ["target_name", "Can I ride to Trou d'Argent?"]] },
    ]);
    expect(audits).toEqual([
      {
        action: "tiroule_question.clear",
        entityType: "lead_events",
        entityId: null,
        diff: { question: "Can I ride to Trou d'Argent?", rowsDeleted: 3 },
      },
    ]);
  });

  it("records nothing when the question had no rows left", async () => {
    await clear("Already answered");
    expect(audits).toHaveLength(0);
  });
});
