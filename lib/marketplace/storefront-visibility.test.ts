import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// ── WHY /shop CAN LOOK BROKEN WHILE THE DATABASE LOOKS FINE ─────────────────
//
// An investigation on 2026-09-06 spent real time on this: /shop rendered
// "The island's shops are coming online" while `select ... from stores` showed
// three stores with status='active', store_is_visible() true, active products,
// active variants and stock. Nothing was broken. Every one of those stores is
// excluded on purpose:
//
//   · Chez Banane      — has a food_kitchens row, so it belongs to /food
//   · Ti Kitchen (DEMO)— same
//   · Tomorrow Land    — has an events row, so it belongs to the box office
//
// marketplace_stores is the ONE definition of "a shop the marketplace may
// show", and it carries four conditions. Three of them are invisible from the
// stores table alone, which is what makes the empty state so convincing a bug:
//
//   1. store_is_visible(id)  -- which itself requires status='active',
//                               merchant approved, AND `not is_test`
//   2. no food_kitchens row
//   3. no events row
//
// This test does not re-check the database. It reads the shipped migration and
// fails if any of those exclusions is dropped, because dropping one does not
// break a page — it silently leaks kitchens and box offices into the shop grid,
// where they would be bought from with the wrong checkout.
//
// The mirror failure is equally quiet: ADDING an exclusion here empties /shop
// for everyone, and the page's empty state says something reassuring rather
// than something alarming.

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");

/** The most recent migration that (re)defines the view, which is the one that wins. */
function latestViewSource(): { file: string; sql: string } {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  for (let i = files.length - 1; i >= 0; i--) {
    const sql = readFileSync(join(MIGRATIONS, files[i]), "utf8");
    if (/create\s+or\s+replace\s+view\s+public\.marketplace_stores/i.test(sql)) {
      return { file: files[i], sql };
    }
  }
  throw new Error("no migration defines public.marketplace_stores");
}

describe("marketplace_stores — the one definition of a shop /shop may show", () => {
  const { file, sql } = latestViewSource();

  // Narrow to the view body so a comment elsewhere in the file cannot satisfy
  // these assertions — the same trap cash-off.test.ts documents.
  const body = sql
    .slice(sql.search(/create\s+or\s+replace\s+view\s+public\.marketplace_stores/i))
    .split(/;/)[0];

  it("is defined in a migration we can find", () => {
    expect(file).toBeTruthy();
    expect(body.length).toBeGreaterThan(80);
  });

  it("still defers to store_is_visible rather than re-spelling status checks", () => {
    // store_is_visible also carries `not is_test`, which is the condition that
    // hides a test shop. Inlining status='active' here would drop that silently.
    expect(body).toMatch(/store_is_visible\s*\(/);
  });

  it("still excludes food kitchens, which belong to /food", () => {
    expect(body).toMatch(/not\s+exists[\s\S]{0,120}food_kitchens/i);
  });

  it("still excludes event stores, which belong to the box office", () => {
    expect(body).toMatch(/not\s+exists[\s\S]{0,120}\bevents\b/i);
  });

  it("reads from stores, not from another view that could re-widen it", () => {
    expect(body).toMatch(/from\s+public\.stores/i);
  });

  // security_invoker is load-bearing: without it the view runs as its owner and
  // stores' RLS stops applying to anon page queries.
  it("keeps security_invoker on", () => {
    expect(body).toMatch(/security_invoker\s*=\s*on/i);
  });
});

describe("store_is_visible — the predicate the view leans on", () => {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  const src = files
    .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"))
    .filter((s) => /function\s+public\.store_is_visible/i.test(s))
    .pop();

  it("is defined somewhere in the migrations", () => {
    expect(src, "store_is_visible is defined in no migration").toBeTruthy();
  });

  it("still hides test stores", () => {
    // `not s.is_test` is why flipping stores.is_test to true removes a shop from
    // the marketplace instantly, and why flipping it to false is what puts one
    // there. That is the intended kill switch for seeded/demo data.
    expect(src!).toMatch(/not\s+\w*\.?is_test/i);
  });

  it("still requires the merchant to be approved, not merely the store active", () => {
    expect(src!).toMatch(/status\s*=\s*'approved'/i);
  });
});
