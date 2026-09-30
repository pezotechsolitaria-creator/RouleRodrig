import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { IN_PROGRESS_LEGS, canClear } from "./clear";
import { clearRequest, readCleared, readSaved, saveRequest, unclearRequest } from "./my-requests";

// ── "CLEAR" HIDES, AND NEVER FROM THE ADMIN (M227) ──────────────────────────
//
// The owner: let customers clear their own requests; the admin keeps 100% of
// the records. The risk is not that Clear fails — it is that it touches the
// request itself (a delete, or an update that restarts the archive clock), or
// that it hides a job a driver is already on. These pin the rule against a
// later edit. The SQL was exercised against the real table before it landed
// (wrong email refused, right email hides without changing updated_at, undo
// removes only the marker).

const SQL = readFileSync(
  join(process.cwd(), "supabase/migrations/20260930170000_m227_a_customer_can_clear_a_request.sql"),
  "utf8",
);
// The migration's comments quote the rules to explain them; scan code only.
const sql = SQL.replace(/^\s*--.*$/gm, "");

describe("the request itself is never touched", () => {
  it("never deletes a request", () => {
    expect(sql).not.toMatch(/delete\s+from\s+delivery_requests\b/i);
  });

  it("never updates a request (set_updated_at would restart the archive clock)", () => {
    expect(sql).not.toMatch(/update\s+(public\.)?delivery_requests\b/i);
  });

  it("writes and removes only the marker", () => {
    expect(sql).toMatch(/insert into delivery_request_hidden/);
    expect(sql).toMatch(/delete from delivery_request_hidden where request_id = p_id/);
  });

  it("keeps the marker table out of PostgREST", () => {
    expect(sql).toMatch(/enable row level security/);
    expect(sql).toMatch(/revoke all on table public\.delivery_request_hidden from public, anon, authenticated/);
  });
});

describe("only the customer's own list is filtered", () => {
  it("my_delivery_requests skips cleared rows and still skips archived ones", () => {
    expect(sql).toMatch(/not exists \(select 1 from delivery_request_hidden h where h\.request_id = r\.id\)/);
    expect(sql).toMatch(/r\.archived_at is null/);
  });

  it("proves ownership by session or by the guest's email", () => {
    expect(sql).toMatch(/v_customer = auth\.uid\(\)/);
    expect(sql).toMatch(/lower\(btrim\(v_guest\)\) = lower\(btrim\(p_email\)\)/);
  });
});

describe("a job in progress cannot be cleared", () => {
  it("the SQL refuses exactly the legs the UI hides the button for", () => {
    const m = sql.match(/d\.status in \(([^)]+)\)/);
    expect(m, "in-progress guard missing").toBeTruthy();
    const legs = [...m![1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
    expect(legs).toEqual([...IN_PROGRESS_LEGS]);
  });

  it("offers Clear for open, finished and staff-handled requests", () => {
    expect(canClear(undefined)).toBe(true);
    expect(canClear({ status: "open", deliveryStatus: null })).toBe(true);
    expect(canClear({ status: "cancelled", deliveryStatus: null })).toBe(true);
    expect(canClear({ status: "accepted", deliveryStatus: "delivered" })).toBe(true);
    // "We are looking into it" — staff still see it on the board.
    expect(canClear({ status: "accepted", deliveryStatus: "requires_admin" })).toBe(true);
  });

  it("withholds it while a driver is on the job", () => {
    for (const leg of IN_PROGRESS_LEGS) {
      expect(canClear({ status: "accepted", deliveryStatus: leg }), leg).toBe(false);
    }
  });
});

describe("the device remembers a Clear", () => {
  const memory = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    };
  };

  it("forgets the request and does not let the tracker save it back", () => {
    const store = memory();
    saveRequest({ id: "a", what: "Fridge", email: "x@y.z" }, store);
    clearRequest("a", store);
    expect(readSaved(store)).toEqual([]);
    expect(readCleared(store)).toEqual(["a"]);
    // RequestTracker saves on every load; an old link must not undo a Clear.
    saveRequest({ id: "a", what: "Fridge" }, store);
    expect(readSaved(store)).toEqual([]);
  });

  it("undo brings the same entry back", () => {
    const store = memory();
    const [entry] = saveRequest({ id: "a", what: "Fridge", email: "x@y.z" }, store);
    clearRequest("a", store);
    unclearRequest(entry, "a", store);
    expect(readCleared(store)).toEqual([]);
    expect(readSaved(store).map((r) => [r.id, r.email])).toEqual([["a", "x@y.z"]]);
  });
});
