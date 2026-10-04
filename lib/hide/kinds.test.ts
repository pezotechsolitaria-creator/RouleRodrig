import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { HIDE_KINDS, HIDE_REFUSAL_COPY, hideKey, isHideKind } from "./kinds";

const M234 = readFileSync("supabase/migrations/20261002130000_m234_a_customer_can_clear_their_history.sql", "utf8");

describe("what a customer can clear (M234)", () => {
  it("is exactly the list the database accepts", () => {
    const check = M234.match(/kind in \(([^)]+)\)/)![1];
    const sqlKinds = check.split(",").map((s) => s.trim().replace(/'/g, "")).sort();
    expect(sqlKinds).toEqual([...HIDE_KINDS].sort());
  });

  it("checks a kind before trusting it", () => {
    expect(isHideKind("ride")).toBe(true);
    expect(isHideKind("delivery")).toBe(false); // cleared by M227, not here
    expect(hideKey("order", "abc")).toBe("order:abc");
  });

  it("has words for every refusal in English and French", () => {
    for (const r of Object.values(HIDE_REFUSAL_COPY)) {
      expect(r.en.length).toBeGreaterThan(10);
      expect(r.fr.length).toBeGreaterThan(10);
    }
  });
});

describe("the database half never writes the record it hides", () => {
  it("is a marker table, not a column on a table with an updated_at clock", () => {
    expect(M234).toMatch(/create table if not exists public\.customer_hidden_items/);
    expect(M234).not.toMatch(/alter table public\.(orders|bookings|place_bookings|ride_requests|service_bookings)\s+add/i);
  });

  it("refuses anything still live, and anything that is not yours, with one answer", () => {
    expect(M234).toContain("'reason', 'still_live'");
    // Exact email equality, never ilike: an underscore is an ilike wildcard.
    // Checked on the SQL with its comments removed — the comment explaining
    // why there is no ilike would otherwise fail this test.
    const code = M234.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
    expect(code).not.toMatch(/ilike/i);
    expect(M234).toMatch(/lower\(btrim\(b\.email\)\) = v_email/);
  });

  it("gives clients no direct door to the table, and anon none to the functions", () => {
    expect(M234).toMatch(/revoke all on table public\.customer_hidden_items from public, anon, authenticated;/);
    expect(M234).toMatch(/revoke all on function public\.set_my_item_hidden\(text, uuid, boolean\) from public, anon;/);
  });
});

describe("the route acts as the customer, never as the server", () => {
  const route = readFileSync("app/api/hide/route.ts", "utf8");
  it("calls the RPC with the customer's own session", () => {
    expect(route).toMatch(/const supabase = await createClient\(\);/);
    expect(route).toMatch(/supabase\.rpc\("set_my_item_hidden"/);
    expect(route).not.toMatch(/getPrivileged/);
  });
});
