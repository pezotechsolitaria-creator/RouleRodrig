import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");
const code = (sql: string) =>
  sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");

const SQL = read("supabase/migrations/20260907060000_m181_remind_tomorrows_bookings.sql");
const CRON = read("app/api/cron/reminders/route.ts");

// ── The day before ──────────────────────────────────────────────────────────
//
// Every other booking on this platform is reminded the day before — a scooter
// pickup, a scooter return, an experience. A service appointment got NOTHING:
// booked on Tuesday for Saturday, and by Saturday morning neither side had
// heard a word since.

describe("the reminder actually runs", () => {
  it("is wired into the daily cron beside the others", () => {
    // A function nothing calls is the same as no function.
    expect(CRON).toMatch(/rpc\("remind_tomorrows_bookings"\)/);
  });

  it("cannot take the rest of the run down with it", () => {
    // Every other block in this job is individually caught for the same reason.
    const block = CRON.slice(CRON.indexOf("remind_tomorrows_bookings"));
    expect(block.slice(0, 400)).toMatch(/catch \(err\)/);
  });

  it("reports what it did, including who it could NOT reach", () => {
    // "1 reminder sent" while saying nothing about the four guests with no
    // account would read as a healthy run.
    expect(CRON).toMatch(/bookingsReminded,/);
    expect(code(SQL)).toMatch(/'guests', v_guests/);
  });
});

describe("it sends one digest, not one alert per job", () => {
  it("groups the provider's bookings by store", () => {
    // A car wash with six appointments does not want six notifications; they
    // want tomorrow's list. That is the difference between a bell people read
    // and a bell people mute.
    expect(code(SQL)).toMatch(/group by store_id, merchant_id/);
    expect(code(SQL)).toMatch(/string_agg/);
  });

  it("reaches every person who can act on it", () => {
    expect(code(SQL)).toMatch(/merchant_staff ms on ms\.merchant_id = s\.merchant_id/);
  });
});

describe("it cannot send twice", () => {
  it("stamps the booking in the same transaction that writes the alert", () => {
    // A crash between the two would either double-send or silently skip a day.
    expect(code(SQL)).toMatch(/update service_bookings b\s+set reminded_at = now\(\)/);
    expect(code(SQL)).toMatch(/reminded_at is null/);
  });

  it("also carries a dedupe key, in case the cron runs twice", () => {
    expect(code(SQL)).toMatch(/'svc-tomorrow:'/);
    expect(code(SQL)).toMatch(/on conflict do nothing/);
  });

  it("survives being called twice inside one transaction", () => {
    // `on commit drop` drops at COMMIT, not at the end of the function, so the
    // second call died with "relation _due already exists". Production calls it
    // once per request so it would never have fired there — it fired in the
    // first probe. A function that only works once per transaction is a trap
    // for the next caller.
    expect(code(SQL)).toMatch(/drop table if exists _due;/);
  });
});
