import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isDueToExpire, PAYMENT_TRANSITIONS, REPORT_GRACE_HOURS, RESERVATION_TRANSITIONS } from "./status";

// ── The server's map and the app's map are the same map ─────────────────────
//
// The database enforces transitions (rsv_can / rsv_pay_can in M240b); the app
// uses lib/reservations/status.ts to decide which buttons to show. If the two
// drift, the UI offers a move the server refuses — or hides one it allows.
// This reads the pairs out of the migration and compares them exactly.

const SQL = readFileSync(
  join(process.cwd(), "supabase/migrations/20261004185459_m240b_reservation_engine_functions.sql"),
  "utf8",
);

function pairsOf(fn: string): string[] {
  const start = SQL.indexOf(`create or replace function public.${fn}(`);
  const body = SQL.slice(start, SQL.indexOf("$$;", start));
  return [...body.matchAll(/\('([a-z_]+)', '([a-z_]+)'\)/g)].map((m) => `${m[1]}→${m[2]}`).sort();
}

function pairsOfMap(map: Record<string, readonly string[]>): string[] {
  return Object.entries(map)
    .flatMap(([from, tos]) => tos.map((to) => `${from}→${to}`))
    .sort();
}

describe("transition maps: TypeScript ≡ SQL", () => {
  it("reservation lifecycle", () => {
    expect(pairsOf("rsv_can")).toEqual(pairsOfMap(RESERVATION_TRANSITIONS));
  });

  it("payment", () => {
    expect(pairsOf("rsv_pay_can")).toEqual(pairsOfMap(PAYMENT_TRANSITIONS));
  });
});

describe("the database keeps its promises", () => {
  it("guests get the token doors only; create/admin/expire are server-only", () => {
    const grants = SQL.slice(SQL.lastIndexOf("do $$"));
    for (const f of ["reservation_view(text)", "reservation_guest_answer(text, jsonb)", "reservation_guest_report_payment(text, text)", "reservation_guest_choose_cash(text)"]) {
      expect(grants).toContain(`'${f}'`);
    }
    const guestBlock = grants.slice(grants.indexOf("grant execute"));
    for (const f of ["reservation_create", "reservation_admin", "reservation_expire_due"]) {
      expect(guestBlock.includes(`'${f}(`), f).toBe(false);
    }
  });

  it("a guest's 'I've paid' is a report, never a payment", () => {
    const fn = SQL.slice(SQL.indexOf("function public.reservation_guest_report_payment"), SQL.indexOf("function public.reservation_guest_choose_cash"));
    expect(fn).not.toMatch(/payment_status\s*=\s*'paid'/);
    expect(fn).toContain("payment_reported_at = now()");
  });

  it("confirm never sets paid", () => {
    const fn = SQL.slice(SQL.indexOf("p_action = 'confirm'"), SQL.indexOf("p_action = 'request_info'"));
    expect(fn).not.toMatch(/v_paystatus := 'paid'/);
  });

  it("capacity is checked under a lock on confirm", () => {
    const fn = SQL.slice(SQL.indexOf("p_action = 'confirm'"), SQL.indexOf("p_action = 'request_info'"));
    expect(fn).toContain("pg_advisory_xact_lock");
    expect(fn.indexOf("pg_advisory_xact_lock")).toBeLessThan(fn.indexOf("rsv_seats_taken"));
  });

  it("only a token-shaped string is ever hashed and looked up", () => {
    expect(SQL).toMatch(/p_token ~ '\^\[A-Za-z0-9_-\]\{43\}\$'/);
  });
});

describe("a reported payment holds the date while Roulé checks (M241)", () => {
  const M241 = readFileSync(join(process.cwd(), "supabase/migrations/20261004193543_m241_reported_payment_holds.sql"), "utf8");

  it("the SQL grace is the TypeScript grace, in both the predicate and the sweep", () => {
    expect(M241.split(`payment_reported_at + interval '${REPORT_GRACE_HOURS} hours'`).length - 1).toBe(2);
  });

  const base = { reservation_status: "confirmed" as const, payment_status: "payment_pending" as const, payment_deadline_at: "2026-10-05T07:00:00Z" };
  it("unreported: due at the deadline", () => {
    expect(isDueToExpire(base, new Date("2026-10-05T07:00:01Z"))).toBe(true);
  });
  it("reported an hour before the deadline: held for 24 hours after the report", () => {
    const r = { ...base, payment_reported_at: "2026-10-05T06:00:00Z" };
    expect(isDueToExpire(r, new Date("2026-10-05T07:00:01Z"))).toBe(false);
    expect(isDueToExpire(r, new Date("2026-10-06T05:59:00Z"))).toBe(false);
    expect(isDueToExpire(r, new Date("2026-10-06T06:00:01Z"))).toBe(true);
  });
});
