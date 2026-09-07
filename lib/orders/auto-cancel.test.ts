import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// ── AN ORDER NOBODY ACCEPTED DIES WHEN ITS COLLECTION TIME PASSES ──────────
//
// A customer orders lunch at 14:00 for 15:00. Nobody in the kitchen touches
// it. Before M181 the order stayed LIVE on both screens for up to two days:
// expire_order() fired only on the 48-hour payment hold, and the only sweep
// ran once a day at 06:00.
//
// The behaviour was verified for real against production inside a rolled-back
// transaction — four synthetic orders, four assertions, all passing. What a
// test in this repo can still protect is the part that would be silently
// undone by a later edit: the two safety guards, and WHERE the sweep is
// called from. Both are one line each and neither fails loudly when wrong.

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");

function migrationNamed(fragment: string): string {
  const file = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql") && f.includes(fragment))
    .sort()
    .pop();
  expect(file, `no migration matching "${fragment}"`).toBeTruthy();
  return readFileSync(join(MIGRATIONS, file as string), "utf8");
}

describe("auto-cancel never touches money or food", () => {
  const sql = migrationNamed("expire_order_knows_two_deadlines");

  it("refuses to cancel an order that was PAID", () => {
    // The customer transferred straight into the merchant's own account. The
    // platform never held it, so cancelling here would leave a merchant with
    // cash and no order to attach it to — and no way to find out.
    expect(sql).toMatch(/o\.status\s*=\s*'pending_payment'/);
  });

  it("refuses to cancel an order the kitchen ACCEPTED", () => {
    // Accepted means somebody started cooking. Cancelling at 15:30 bins real
    // food that a real person paid for the ingredients of.
    expect(sql).toMatch(/o\.accepted_at\s+is\s+null/);
  });

  it("expires on the collection time as well as the payment hold", () => {
    expect(sql).toMatch(/upper\(o\.pickup_slot\)\s*\+\s*v_grace\s*<\s*now\(\)/);
    expect(sql).toMatch(/o\.auto_release_at\s*<\s*now\(\)/);
  });

  it("ignores a pickup slot with no end, rather than treating it as passed", () => {
    // upper() of an unbounded range is NULL, and NULL + interval < now() is
    // NULL, not false — readable either way, but the guard states the intent.
    expect(sql).toMatch(/not\s+upper_inf\(o\.pickup_slot\)/);
  });

  it("puts the stock back", () => {
    expect(sql).toContain("inventory_movements");
    expect(sql).toMatch(/'restock'/);
  });

  it("tells both the customer and the merchant", () => {
    expect(sql).toMatch(/'customer'/);
    expect(sql).toMatch(/'merchant'/);
  });

  it("stays a single signature, because PostgREST refuses an overloaded one", () => {
    expect(sql).toMatch(/drop function if exists public\.expire_order\(uuid\)/);
    expect(sql).toMatch(/expire_order is overloaded/);
  });

  it("is not callable by anon", () => {
    expect(sql).toMatch(/revoke all on function public\.expire_order\(uuid\) from anon/);
  });
});

describe("the sweep warns before it kills", () => {
  const sql = migrationNamed("sweep_and_warn_before_it_dies");

  it("notifies the kitchen once when the collection time arrives", () => {
    expect(sql).toContain("order_collection_due");
    // Deduped, or a kitchen gets the same nudge sixty times an hour.
    expect(sql).toMatch(/not exists\s*\([\s\S]{0,200}order_collection_due/);
  });

  it("only warns while the order is still savable", () => {
    // Window opened, grace not yet spent. Warning about something already
    // cancelled is worse than saying nothing.
    expect(sql).toMatch(/lower\(o\.pickup_slot\)\s*<=\s*now\(\)/);
    expect(sql).toMatch(/upper\(o\.pickup_slot\)\s*\+\s*v_grace\s*>\s*now\(\)/);
  });
});

describe("it runs every minute, which is half the fix", () => {
  const route = readFileSync(
    join(process.cwd(), "app", "api", "cron", "notifications", "route.ts"),
    "utf8",
  );

  it("is called from the per-minute cron, not the daily one", () => {
    // The daily 06:00 sweep would let a 15:00 lunch sit until tomorrow
    // morning, which is the bug this feature exists to fix.
    expect(route).toContain("sweep_expired_orders");

    const daily = readFileSync(
      join(process.cwd(), "app", "api", "cron", "reminders", "route.ts"),
      "utf8",
    );
    expect(
      daily.includes("sweep_expired_orders"),
      "the collection-time sweep belongs on the every-minute cron, not the daily one",
    ).toBe(false);
  });

  it("reports what it did, so the response answers why an order vanished", () => {
    expect(route).toMatch(/orderSweep/);
  });
});

describe("the grace period is configurable and bounded", () => {
  const sql = migrationNamed("collection_time_is_a_deadline");

  it("lives in marketplace_settings with the other platform timings", () => {
    expect(sql).toMatch(/alter table marketplace_settings/);
    expect(sql).toContain("pickup_grace_minutes");
  });

  it("cannot be set to something absurd", () => {
    expect(sql).toMatch(/between 0 and 240/);
  });

  it("defaults to 30 minutes", () => {
    expect(sql).toMatch(/default 30/);
  });
});
