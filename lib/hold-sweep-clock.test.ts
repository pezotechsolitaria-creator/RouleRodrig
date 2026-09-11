import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const CRON = strip(
  readFileSync(join(ROOT, "app", "api", "cron", "reminders", "route.ts"), "utf8"),
);
const MIG = readdirSync(join(ROOT, "supabase", "migrations")).find((f) =>
  f.includes("m199"),
);

// ── TWO CLOCKS, AND NOTHING KEEPING THEM TOGETHER ──────────────────────────
//
// The hold sweep selected rows with
//   .lt("payment_due_by", new Date().toISOString())
// — a database column compared against the clock of whichever serverless
// container drew the cron. Measured on 2026-09-10: this project's own machine
// read 23:30 UTC while the database read 17:27 UTC the following day.
// Eighteen hours. A container that far ahead cancels reservations that still
// have hours left, emails the customer that their payment window passed, and
// releases the vehicle.
describe("a deadline is compared where it is stored", () => {
  it("no longer sends the container's clock to the database", () => {
    expect(CRON).not.toMatch(/payment_due_by["'\s,]*,\s*new Date\(\)/);
    expect(CRON).not.toMatch(/\.lt\(\s*["']payment_due_by["']/);
  });

  it("asks the database which holds have expired", () => {
    expect(CRON).toContain('supabase.rpc("expired_hold_ids")');
  });

  it("SKIPS the sweep when the function is missing, rather than guessing", () => {
    // Deliberately the opposite of this repo's usual fail-open rule. Carrying
    // on here means falling back to the broken comparison. A dead hold left
    // open one more day costs a booking slot; a wrongly cancelled one costs
    // the customer.
    const guard = CRON.slice(CRON.indexOf("sweepErr"));
    expect(guard).toMatch(/if \(sweepErr\)/);
    expect(CRON).toMatch(/lapsedIds\.length\s*\?/);
  });

  it("ships the migration alongside the code that needs it", () => {
    expect(MIG).toBeTruthy();
    const sql = readFileSync(join(ROOT, "supabase", "migrations", MIG!), "utf8");
    expect(sql).toContain("create or replace function public.expired_hold_ids()");
    // The comparison must be against the database clock.
    expect(sql).toMatch(/payment_due_by\s*<\s*now\(\)/);
    // And it must not be reachable by a customer.
    expect(sql).toMatch(/revoke all on function public\.expired_hold_ids\(\) from anon/);
    expect(sql).toMatch(/grant execute on function public\.expired_hold_ids\(\) to service_role/);
  });

  it("re-checks a payment that landed during the sweep", () => {
    // Belt and braces on both sides: the SQL and the loop.
    const sql = readFileSync(join(ROOT, "supabase", "migrations", MIG!), "utf8");
    expect(sql).toContain("deposit_paid_at is null");
    expect(CRON).toContain("if (b.deposit_paid_at) continue;");
  });
});
