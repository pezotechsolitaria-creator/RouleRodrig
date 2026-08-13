import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

// ── A standing guard on one habit that keeps costing money ──────────────────
//
// M89 turned cash off across the platform so nothing is handed over before the
// money arrives. Three gates enforce it: a trigger on `payments`,
// store_payment_options(), and the checkout UIs. None of them can survive a
// caller that decides for itself that cash is fine when it does not get an
// answer.
//
// That exact shape has already gone wrong twice on this codebase:
//
//   · M83/M84 — /api/cart/resolve could not read store_payment_settings at all
//     (the grant is deliberately absent, M8), and `accepts_cash ?? true` turned
//     that silence into "every shop takes cash". Every customer on the island
//     was shown Cash regardless of what the shop accepted, and bank transfer
//     was never offered even where it was the only method.
//   · M89 — the same line survived into a world where cash does not exist, so
//     a failed RPC would have offered a payment method the database refuses,
//     and the customer would find out after the food was cooked.
//
// A missing answer is not a yes. This test reads the shipped source and fails
// if any cash flag is defaulted TRUE, so the third time is caught by a test
// rather than by an owner wondering why nobody paid.

const CASH_DEFAULTED_TRUE = [
  // `acceptsCash: o?.accepts_cash ?? true` and every spelling around it.
  /accepts?_?[cC]ash[^\n]{0,60}\?\?\s*true/,
  /accepts?[cC]ash[^\n]{0,60}\|\|\s*true/,
];

// A NOTE ON WHAT THIS DELIBERATELY DOES NOT CATCH.
//
// The plain literal `accepts_cash: true` is not banned, and a wider pattern was
// tried and withdrawn. It fires on five places that are all correct: seeding a
// brand-new store_payment_settings row (the `at_least_one_method` CHECK
// requires one method to be true, so creation genuinely has to write it), the
// no-row-yet defaults these routes echo back, and two fixtures in
// plain-words.test.ts that exist to test cash wording. A guard that flags
// correct code gets exemptions bolted onto it until it means nothing.
//
// Widening it did earn its keep once, though: it found `payment = {
// acceptsCash: true, … }` in /api/cart/resolve — the value returned for a cart
// with no resolvable store — which no `??` pattern would ever have seen. That
// one is fixed; the lesson is that this test covers the common shape, not
// every shape, and reading the diff is still the job.

/**
 * Live TypeScript only.
 *
 * Deliberately NOT the migration archive. Those files are an applied,
 * immutable record — `coalesce(v_pay.accepts_cash, true)` appears in eleven of
 * them because that genuinely was the rule between M6 and M89, and editing a
 * shipped migration to satisfy a test would be rewriting history to make the
 * present look tidy. What matters about SQL is the CURRENT definition, which
 * the second test below pins directly.
 */
function trackedSources(): string[] {
  const out = execSync("git ls-files app lib components", {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return out
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean)
    .filter((f) => /\.(ts|tsx)$/.test(f))
    // This file quotes the patterns it bans.
    .filter((f) => !f.endsWith("cash-off.test.ts"));
}

describe("cash never defaults to available", () => {
  it("has no source that assumes cash when it did not get an answer", () => {
    const offenders: string[] = [];

    for (const file of trackedSources()) {
      let text: string;
      try {
        text = readFileSync(file, "utf8");
      } catch {
        continue; // deleted between listing and reading
      }
      text.split("\n").forEach((line, i) => {
        if (CASH_DEFAULTED_TRUE.some((re) => re.test(line))) {
          offenders.push(`${file}:${i + 1}  ${line.trim()}`);
        }
      });
    }

    expect(
      offenders.sort(),
      `Cash is defaulted to TRUE here. A missing or failed payment-options read must fail CLOSED — ` +
        `see M83/M84. Use \`?? false\`:\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });

  it("still defines the switch and the trigger that enforce it", () => {
    const all = migrations().map(({ sql }) => sql).join("\n");
    expect(all, "prepayment_only() is gone").toMatch(/function\s+public\.prepayment_only\s*\(/);
    expect(all, "the payments trigger is gone").toMatch(/payments_refuse_cash/);
  });

  it("has not let a later migration quietly restore cash", () => {
    // THE REAL REGRESSION RISK, and the reason the scan above skips the
    // archive. store_payment_options() is the one function every checkout
    // reads. Any future migration that recreates it — to add a column, to fix
    // something unrelated — and copies the pre-M89 body forward would turn
    // cash back on across the whole island, silently, with no UI change to
    // notice. So this checks the LAST definition wins, not that some
    // definition somewhere is correct.
    const defining = migrations().filter(({ sql }) =>
      /create\s+or\s+replace\s+function\s+public\.store_payment_options/i.test(sql),
    );
    expect(defining.length, "store_payment_options is not defined in any migration").toBeGreaterThan(0);

    const latest = defining[defining.length - 1];
    // Take only the tail from that definition onwards, so an earlier unrelated
    // mention of prepayment_only() in the same file cannot satisfy this.
    const body = latest.sql.slice(
      latest.sql.search(/create\s+or\s+replace\s+function\s+public\.store_payment_options/i),
    );
    expect(
      body,
      `The newest definition of store_payment_options (${latest.file}) does not consult ` +
        `prepayment_only(), so cash would be offered again island-wide.`,
    ).toMatch(/prepayment_only\s*\(\s*\)/);
  });
});

/** Migration files in applied order — the filename prefix is the timestamp. */
function migrations(): { file: string; sql: string }[] {
  return execSync("git ls-files supabase/migrations", { encoding: "utf8" })
    .split("\n")
    .map((f) => f.trim())
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((file) => ({ file, sql: readFileSync(file, "utf8") }));
}
