import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fakeDb, type FakeDb } from "@/test/fake-supabase-tables";
import { DEFAULT_CONTENT } from "@/lib/defaults";

// ── CONTENT HISTORY AND RESTORE, THROUGH THE REAL ROUTE (architecture review
// 2026-09-30, item 6) ───────────────────────────────────────────────────────
//
// A restore replaces the whole site. These drive the real GET and POST against
// in-memory site_content and site_content_history tables and assert the ORDER
// that makes it safe: version check, copy of today, conditional write, audit,
// cache busting — and that nothing is written when any step before the write
// fails.

let db: FakeDb;
const revalidatePath = vi.fn();

vi.mock("next/cache", () => ({
  unstable_cache: (fn: () => unknown) => fn,
  revalidateTag: () => {},
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => db.client }));
vi.mock("@/lib/auth", () => ({ verifySession: () => true, COOKIE_NAME: "rr_admin" }));
vi.mock("@/lib/supabase/admin", () => ({
  getPrivileged: async () => db.client,
  hasServiceRole: () => true,
}));

const { GET, POST } = await import("./route");
const { RestoreConfirm } = await import("@/app/admin/content-history/ContentHistoryDesk");

const NOW = "2026-09-30T09:00:00.000+00:00";

function blob(places: number, subheadline: string) {
  const c = JSON.parse(JSON.stringify(DEFAULT_CONTENT));
  c.hero.subheadline = subheadline;
  c.mapLocations = Array.from({ length: places }, (_, i) => ({ id: `p${i}`, name: `Place ${i}` }));
  return c;
}

const current = () => db.tables.site_content[0] as { data: ReturnType<typeof blob>; updated_at: string };
const history = () => db.tables.site_content_history as { id: string; data: ReturnType<typeof blob>; created_at: string }[];

beforeEach(() => {
  revalidatePath.mockClear();
  db = fakeDb({
    site_content: [{ id: "main", data: blob(42, "Today"), updated_at: NOW }],
    site_content_history: [
      { id: "h1", content_id: "main", created_at: "2026-09-20T02:00:00.000Z", data: blob(40, "Ten days ago") },
      { id: "h2", content_id: "main", created_at: "2026-09-29T02:00:00.000Z", data: blob(42, "Today") },
    ],
  });
});

const restore = (body: unknown) =>
  POST(
    new NextRequest("http://localhost/api/admin/content-history", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

describe("GET — the list", () => {
  it("is newest first, says what differs from now, and counts what would change", async () => {
    const body = await (await GET(new NextRequest("http://localhost/api/admin/content-history"))).json();
    expect(body.current.version).toBe(NOW);
    expect(body.snapshots.map((s: { id: string }) => s.id)).toEqual(["h2", "h1"]);
    expect(body.snapshots[0].changed).toEqual([]);
    expect(body.snapshots[1].changed).toEqual(["hero", "mapLocations"]);
    expect(body.snapshots[1].counts).toEqual([{ key: "mapLocations", label: "map places", now: 42, then: 40 }]);
    // The blobs themselves never leave the server.
    expect(JSON.stringify(body)).not.toContain("Ten days ago");
  });

  it("pages ten at a time and says when there are older ones", async () => {
    for (let i = 0; i < 11; i++) {
      history().push({ id: `x${i}`, content_id: "main", created_at: `2026-08-${String(10 + i).padStart(2, "0")}T02:00:00.000Z`, data: blob(1, "old") } as never);
    }
    const first = await (await GET(new NextRequest("http://localhost/api/admin/content-history?page=0"))).json();
    expect(first.snapshots).toHaveLength(10);
    expect(first.hasMore).toBe(true);
    const second = await (await GET(new NextRequest("http://localhost/api/admin/content-history?page=1"))).json();
    expect(second.snapshots).toHaveLength(3);
    expect(second.hasMore).toBe(false);
  });
});

describe("POST — a restore", () => {
  it("copies today first, then writes the snapshot, then audits and revalidates", async () => {
    const res = await restore({ id: "h1", expectedVersion: NOW });
    const body = await res.json();
    expect(res.status).toBe(200);

    // The order, from the calls the route made.
    const writes = db.calls.filter((c) => c.op !== "select").map((c) => `${c.table}.${c.op}`);
    expect(writes).toEqual(["site_content_history.insert", "site_content.update", "audit_logs.insert"]);

    // Today's content is in the history, so the restore can be undone.
    const backup = history().find((h) => h.id === body.backupId)!;
    expect(backup.data.hero.subheadline).toBe("Today");
    expect(backup.data.mapLocations).toHaveLength(42);

    // The site is the snapshot now, with a new version.
    expect(current().data.hero.subheadline).toBe("Ten days ago");
    expect(current().updated_at).not.toBe(NOW);
    expect(body.version).toBe(current().updated_at);

    expect(db.tables.audit_logs[0]).toMatchObject({
      action: "content.restore",
      entity_id: "main",
      diff: { snapshotId: "h1", backupId: body.backupId, changed: ["hero", "mapLocations"] },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(revalidatePath).toHaveBeenCalledWith("/browse/[category]", "page");
  });

  it("refuses when the content moved since the list was loaded, and writes nothing", async () => {
    const res = await restore({ id: "h1", expectedVersion: "2026-09-30T08:00:00.000+00:00" });
    expect(res.status).toBe(409);
    expect(current().data.hero.subheadline).toBe("Today");
    expect(db.calls.filter((c) => c.op !== "select")).toEqual([]);
  });

  it("restores nothing if today's copy cannot be saved first", async () => {
    db.failOn.push({ table: "site_content_history", op: "insert", error: { message: "permission denied" } });
    const res = await restore({ id: "h1", expectedVersion: NOW });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/permission denied/);
    expect(current().data.hero.subheadline).toBe("Today");
    expect(db.calls.some((c) => c.table === "site_content" && c.op !== "select")).toBe(false);
  });

  it("refuses a snapshot that is not a site blob", async () => {
    history().push({ id: "bad", content_id: "main", created_at: "2026-09-01T02:00:00.000Z", data: { branding: {} } } as never);
    const res = await restore({ id: "bad", expectedVersion: NOW });
    expect(res.status).toBe(422);
    expect(current().data.hero.subheadline).toBe("Today");
  });

  it("says a snapshot past its 90 days is gone", async () => {
    expect((await restore({ id: "missing", expectedVersion: NOW })).status).toBe(404);
  });

  it("keeps the copy of today when a save lands in the same second, and says so", async () => {
    db.beforeWrite = (call) => {
      if (call.table === "site_content" && call.op === "update") current().updated_at = "2026-09-30T09:00:01.000+00:00";
    };
    const res = await restore({ id: "h1", expectedVersion: NOW });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/copy made first is kept/);
    expect(current().data.hero.subheadline).toBe("Today");
    expect(history()).toHaveLength(3);
  });
});

describe("the confirm step names what a restore would change", () => {
  it("lists the sections and every collection whose size moves", () => {
    const text = renderToStaticMarkup(
      createElement(RestoreConfirm, {
        snapshot: {
          id: "h1",
          createdAt: "2026-09-20T02:00:00.000Z",
          changed: ["hero", "mapLocations"],
          counts: [{ key: "mapLocations", label: "map places", now: 42, then: 40 }],
        },
        busy: false,
        onConfirm: () => {},
        onCancel: () => {},
      }),
    ).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(text).toContain("These sections will change: Hero, Island guide places.");
    expect(text).toContain("map places: 42 now → 40 after the restore");
    expect(text).toContain("copied into this list first");
    // Island time: 02:00 UTC is 06:00 in Rodrigues.
    expect(text).toMatch(/Sun,? 20 Sept? 2026, 06:00/);
  });
});
