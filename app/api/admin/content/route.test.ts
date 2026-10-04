import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { fakeDb, type FakeDb } from "@/test/fake-supabase-tables";
import { DEFAULT_CONTENT } from "@/lib/defaults";

// ── THE STUDIO SAVE, DRIVEN THROUGH THE REAL ROUTE (architecture review
// 2026-09-30, item 4) ───────────────────────────────────────────────────────
//
// Four routes write site_content and the studio PUTs all of it. These run the
// real PUT — real version check, real content guard, real saveContent() with
// its conditional write — against an in-memory table, and assert on the ROW:
// what a stale tab, a truncated body and a same-second race each leave behind.

let db: FakeDb;
const revalidatePath = vi.fn();
const revalidateTag = vi.fn();

vi.mock("next/cache", () => ({
  unstable_cache: (fn: () => unknown) => fn,
  revalidateTag: (...a: unknown[]) => revalidateTag(...a),
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => db.client }));
vi.mock("@/lib/supabase/admin", () => ({
  getPrivileged: async () => db.client,
  hasServiceRole: () => true,
}));
vi.mock("@/lib/auth", () => ({ verifySession: () => true, COOKIE_NAME: "rr_admin" }));

const { PUT, GET } = await import("./route");
const { CONTENT_CONFLICT_MESSAGE } = await import("@/lib/admin/content-version");
const { sameContentVersion } = await import("@/lib/content");

const V1 = "2026-09-30T08:00:00.123456+00:00";

function stored() {
  const c = JSON.parse(JSON.stringify(DEFAULT_CONTENT));
  c.legal = { brn: "C07000000" };
  return c;
}

function put(body: unknown, base?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (base !== undefined) headers["x-content-base"] = base;
  return PUT(new NextRequest("http://localhost/api/admin/content", { method: "PUT", headers, body: JSON.stringify(body) }));
}

const row = () => db.tables.site_content[0] as { data: Record<string, unknown>; updated_at: string };

beforeEach(() => {
  db = fakeDb({ site_content: [{ id: "main", data: stored(), updated_at: V1 }] });
  revalidatePath.mockClear();
  revalidateTag.mockClear();
});

describe("PUT /api/admin/content — a save from the version it was loaded from", () => {
  it("writes, hands back the new version, audits and busts the caches", async () => {
    // What the studio holds: the editor's read of the row, as GET serves it.
    const next = await (await GET(new NextRequest("http://localhost/api/admin/content"))).json();
    next.hero.subheadline = "Edited in the studio";
    const res = await put(next, V1);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(row().data.hero).toMatchObject({ subheadline: "Edited in the studio" });
    expect(body.updatedAt).toBe(row().updated_at);
    expect(body.updatedAt).not.toBe(V1);
    expect(db.tables.audit_logs?.[0]).toMatchObject({ action: "content.save", diff: { changed: ["hero"] } });
    expect(revalidateTag).toHaveBeenCalledWith("site-content", { expire: 0 });
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(revalidatePath).toHaveBeenCalledWith("/experiences/[type]", "page");
  });

  it("accepts the same instant printed differently", async () => {
    const res = await put(stored(), "2026-09-30T08:00:00.123456Z");
    expect(res.status).toBe(200);
  });

  it("serves the version with the content, so a reader can save back", async () => {
    const res = await GET(new NextRequest("http://localhost/api/admin/content"));
    expect(res.headers.get("x-content-base")).toBe(V1);
  });
});

describe("PUT /api/admin/content — the stale tab", () => {
  it("refuses with 409 and the owner's sentence when /admin/legal saved since", async () => {
    // The tab loaded V1; /admin/legal then wrote the BRN and moved the row on.
    row().updated_at = "2026-09-30T09:15:00.000+00:00";
    row().data.legal = { brn: "C07999999" };

    const old = stored();
    old.hero.subheadline = "An edit made in the old tab";
    const res = await put(old, V1);

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(CONTENT_CONFLICT_MESSAGE);
    // Nothing reverted: the newer legal block survives.
    expect(row().data.legal).toEqual({ brn: "C07999999" });
    expect(db.calls.some((c) => c.table === "site_content" && c.op !== "select")).toBe(false);
  });

  it("refuses a page that opened on the seed defaults during a blip, and says so", async () => {
    // The studio got no row (loaded:false renders defaults) and so sent
    // "none"; the database is back and the real row is there.
    const res = await put(JSON.parse(JSON.stringify(DEFAULT_CONTENT)), "none");
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/opened without the live content/);
    expect(row().data.legal).toEqual({ brn: "C07000000" });
  });

  it("refuses a request that carries no version at all — a page loaded before this shipped", async () => {
    const res = await put(stored());
    expect(res.status).toBe(428);
    expect((await res.json()).error).toMatch(/reload/i);
    expect(row().updated_at).toBe(V1);
  });

  it("loses the same-second race safely: the conditional write refuses, no clobber", async () => {
    // Both reads saw V1; the other tab's write lands between our check and
    // our write. The UPDATE is conditional on V1, so it matches nothing.
    db.beforeWrite = (call) => {
      if (call.table === "site_content" && call.op === "update") {
        row().updated_at = "2026-09-30T08:00:01.000+00:00";
        row().data.hero = { ...(row().data.hero as object), subheadline: "The other tab" };
      }
    };
    const mine = stored();
    mine.hero.subheadline = "Mine";
    const res = await put(mine, V1);

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(CONTENT_CONFLICT_MESSAGE);
    expect(row().data.hero).toMatchObject({ subheadline: "The other tab" });
  });
});

describe("PUT /api/admin/content — the refusal reaches the owner in words", () => {
  it("returns the guard's sentence when a save would wipe the FAQ", async () => {
    db.tables.site_content[0].data = {
      ...stored(),
      faq: { ...DEFAULT_CONTENT.faq, items: Array.from({ length: 8 }, (_, i) => ({ id: `q${i}`, question: "q", answer: "a" })) },
    };
    const wiped = stored();
    wiped.faq = { ...wiped.faq, items: [] };
    const res = await put(wiped, V1);

    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain('FAQ questions ("faq.items") would drop from 8 to 0');
    expect(row().updated_at).toBe(V1);
  });

  it("does not blame another tab when the write simply could not land", async () => {
    // The anon fallback (no service-role key) updates zero rows and reports
    // no error; the row has NOT moved, so this is not a conflict.
    db.beforeWrite = (call) => {
      if (call.op === "update") call.filters.push(["id", "nothing-matches"]);
    };
    const res = await put(stored(), V1);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/not written/);
  });
});

describe("sameContentVersion", () => {
  it("compares instants, keeping microseconds", () => {
    expect(sameContentVersion("2026-09-30T08:00:00.12+00:00", "2026-09-30T08:00:00.120000+00:00")).toBe(true);
    expect(sameContentVersion("2026-09-30T08:00:00.123456+00:00", "2026-09-30T08:00:00.123457+00:00")).toBe(false);
    expect(sameContentVersion(null, null)).toBe(true);
    expect(sameContentVersion(null, V1)).toBe(false);
  });
});
