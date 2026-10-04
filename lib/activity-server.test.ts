import { describe, it, expect, vi, beforeEach } from "vitest";
import { groupActivities } from "@/lib/activity";

// ── /orders, driven through the real feed (architecture review 2026-09-30,
//    items 1, 2 and 5) ─────────────────────────────────────────────────────────
//
// listActivitiesForCustomer() runs here against a fake service-role client
// that FILTERS like PostgREST does (eq, ilike, in, order, limit), so each
// assertion is about what the real code asks for and what it does with the
// answer — not about the words in its source.

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const failing: Record<string, { message: string }> = {};
const queried: string[] = [];

function query(table: string) {
  queried.push(table);
  let rows = [...(tables[table] ?? [])];
  const q = {
    select: () => q,
    eq: (c: string, v: unknown) => ((rows = rows.filter((r) => r[c] === v)), q),
    ilike: (c: string, v: string) =>
      ((rows = rows.filter((r) => typeof r[c] === "string" && (r[c] as string).toLowerCase() === v.toLowerCase())), q),
    in: (c: string, vs: unknown[]) => ((rows = rows.filter((r) => vs.includes(r[c]))), q),
    order: (c: string, o?: { ascending?: boolean }) => {
      const dir = o?.ascending === false ? -1 : 1;
      rows.sort((a, b) => String(a[c] ?? "").localeCompare(String(b[c] ?? "")) * dir);
      return q;
    },
    limit: (n: number) => ((rows = rows.slice(0, n)), q),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(failing[table] ? { data: null, error: failing[table] } : { data: rows, error: null }).then(
        resolve,
        reject,
      ),
  };
  return q;
}

vi.mock("@/lib/supabase/admin", () => ({
  hasServiceRole: () => true,
  getPrivileged: async () => ({ from: (t: string) => query(t) }),
}));
vi.mock("@/lib/vehicle-name", () => ({ vehicleName: async (s: string) => s }));

const ME = "user-1";
const EMAIL = "ana@example.com";
const HOUR = 3_600_000;
const iso = (msFromNow: number) => new Date(Date.now() + msFromNow).toISOString();

function request(id: string, over: Row = {}): Row {
  return {
    id,
    what: `Job ${id}`,
    pickup_text: "Port Mathurin",
    dropoff_text: "Mont Lubin",
    created_at: "2026-09-20T08:00:00Z",
    status: "open",
    expires_at: iso(24 * HOUR),
    customer_id: ME,
    guest_email: null,
    archived_at: null,
    ...over,
  };
}

async function feed() {
  const { listActivitiesForCustomer } = await import("./activity-server");
  return listActivitiesForCustomer({ verifiedEmail: EMAIL, userId: ME });
}
const byId = <T extends { id: string }>(list: T[], id: string) => list.find((a) => a.id === id);

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  for (const k of Object.keys(failing)) delete failing[k];
  queried.length = 0;
});

describe("item 5: the feed no longer reads orders it throws away", () => {
  it("never asks for `orders`, and returns no order even when the customer has one", async () => {
    tables.orders = [{ id: "o1", customer_id: ME, status: "paid", created_at: "2026-09-20T08:00:00Z" }];
    tables.bookings = [{ id: "b1", scooter: "burgman", start_date: "2099-01-01", end_date: "2099-01-03", status: "pending", email: EMAIL }];
    const { activities, partial } = await feed();
    expect(queried).not.toContain("orders");
    expect(activities.map((a) => a.kind)).not.toContain("order");
    expect(activities.map((a) => a.id)).toEqual(["b1"]);
    expect(partial).toBe(false);
  });
});

describe("item 1: a Clear on /deliver means the same on /orders", () => {
  beforeEach(() => {
    tables.delivery_requests = [
      request("r-open-cleared"),
      request("r-driver-on-it", { status: "accepted" }),
      request("r-delivered-cleared", { status: "accepted" }),
      request("r-archived", { archived_at: "2026-09-25T00:00:00Z" }),
      request("r-guest-cleared", { customer_id: null, guest_email: "Ana@Example.com", status: "cancelled" }),
      request("r-someone-else", { customer_id: "user-2" }),
    ];
    tables.delivery_request_hidden = [
      { request_id: "r-open-cleared" },
      { request_id: "r-driver-on-it" },
      { request_id: "r-delivered-cleared" },
      { request_id: "r-guest-cleared" },
      { request_id: "r-someone-else" },
    ];
    tables.deliveries = [
      { request_id: "r-driver-on-it", status: "picked_up", created_at: "2026-09-20T09:00:00Z" },
      { request_id: "r-delivered-cleared", status: "delivered", created_at: "2026-09-20T09:00:00Z" },
    ];
  });

  it("leaves out what the customer cleared — signed-in and guest halves alike", async () => {
    const { activities } = await feed();
    const ids = activities.map((a) => a.id);
    expect(ids).not.toContain("r-open-cleared");
    expect(ids).not.toContain("r-delivered-cleared");
    expect(ids).not.toContain("r-guest-cleared");
  });

  it("keeps a cleared job while a driver is on it — M227's own rule", async () => {
    const { activities } = await feed();
    const live = byId(activities, "r-driver-on-it");
    expect(live).toBeDefined();
    expect(live?.stage).toBe("active");
  });

  it("keeps archived requests: /orders is the full history", async () => {
    const { activities } = await feed();
    expect(byId(activities, "r-archived")).toBeDefined();
  });

  it("still shows nobody else's request, cleared or not", async () => {
    const { activities } = await feed();
    expect(byId(activities, "r-someone-else")).toBeUndefined();
  });

  it("fails OPEN when the marker cannot be read: cleared rows show, nothing live hides", async () => {
    failing.delivery_request_hidden = { message: "boom" };
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { activities, partial } = await feed();
    expect(byId(activities, "r-open-cleared")).toBeDefined();
    expect(byId(activities, "r-driver-on-it")).toBeDefined();
    // Nothing is missing, so the page does not claim anything failed to load.
    expect(partial).toBe(false);
    err.mockRestore();
  });

  it("with the legs unreadable, keeps every cleared ACCEPTED request and says the list may be behind", async () => {
    failing.deliveries = { message: "boom" };
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { activities, partial } = await feed();
    // Only an accepted request can have a driver on it, so only those stay.
    expect(byId(activities, "r-driver-on-it")).toBeDefined();
    expect(byId(activities, "r-delivered-cleared")).toBeDefined();
    expect(byId(activities, "r-open-cleared")).toBeUndefined();
    expect(partial).toBe(true);
    err.mockRestore();
  });

  it("does not warn about stale stages when no request was ever accepted", async () => {
    tables.delivery_requests = [request("r-only-open")];
    failing.deliveries = { message: "boom" };
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { activities, partial } = await feed();
    expect(byId(activities, "r-only-open")).toBeDefined();
    expect(partial).toBe(false);
    err.mockRestore();
  });

  it("asks for nothing extra when the customer has no deliveries", async () => {
    tables.delivery_requests = [];
    await feed();
    expect(queried).not.toContain("delivery_request_hidden");
    expect(queried).not.toContain("deliveries");
  });
});

describe("item 2: a delivery's stage comes from its latest leg", () => {
  beforeEach(() => {
    tables.delivery_requests = [
      request("r-delivered", { status: "accepted" }),
      request("r-assigned", { status: "accepted" }),
      request("r-dead", { status: "accepted" }),
      request("r-dropped", { status: "accepted" }),
      request("r-expired", { expires_at: iso(-HOUR) }),
    ];
    tables.deliveries = [
      // An older leg and a newer one: the newest is the truth, as in
      // my_delivery_requests() (`order by d.created_at desc limit 1`).
      { request_id: "r-delivered", status: "cancelled", created_at: "2026-09-20T09:00:00Z" },
      { request_id: "r-delivered", status: "delivered", created_at: "2026-09-20T11:00:00Z" },
      { request_id: "r-assigned", status: "assigned", created_at: "2026-09-20T09:00:00Z" },
      { request_id: "r-dead", status: "failed_delivery", created_at: "2026-09-20T09:00:00Z" },
      { request_id: "r-dropped", status: "driver_unavailable", created_at: "2026-09-20T09:00:00Z" },
    ];
  });

  it("files a delivered job under Past, not under Coming up as 'Driver booked'", async () => {
    const { activities } = await feed();
    const g = groupActivities(activities);
    const done = byId(g.past, "r-delivered");
    expect(done?.statusLabel).toBe("Delivered");
    expect(byId(g.upcoming, "r-delivered")).toBeUndefined();
  });

  it("says 'Driver booked' only where a driver is booked", async () => {
    const { activities } = await feed();
    const g = groupActivities(activities);
    expect(byId(g.upcoming, "r-assigned")?.statusLabel).toBe("Driver booked");
    // A failed job is over; a dropped one is being sorted out. Neither is booked.
    expect(byId(g.past, "r-dead")?.statusLabel).toBe("Could not be delivered");
    expect(byId(activities, "r-dropped")?.statusLabel).toBe("Driver unavailable");
    for (const a of activities.filter((x) => x.id !== "r-assigned")) {
      expect(a.statusLabel, a.id).not.toBe("Driver booked");
    }
  });

  it("reads an open request past its deadline as expired, whatever the sweep did", async () => {
    const { activities } = await feed();
    const e = byId(activities, "r-expired");
    expect(e?.stage).toBe("cancelled");
    expect(e?.statusLabel).toBe("Expired");
  });
});
