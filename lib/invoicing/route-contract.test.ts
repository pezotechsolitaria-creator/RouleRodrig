import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const ROUTE = strip(
  readFileSync(join(process.cwd(), "app", "api", "admin", "invoices", "route.ts"), "utf8"),
);
const MIGRATION = readFileSync(
  join(process.cwd(), "supabase", "migrations",
       "20260917090000_m200_a_document_the_customer_can_keep.sql"),
  "utf8",
);

// ── THE ENDPOINT HAS NO FIELD AN AMOUNT COULD ARRIVE IN ────────────────────
//
// This is the load-bearing design decision of the whole system. The caller
// names a subject; invoice_issue() reads the authoritative row and converts in
// SQL. An endpoint that accepted an amount would be an endpoint that could be
// handed the wrong unit, which this platform has done four times.
describe("issuing takes no money from the caller", () => {
  it("reads only a subject, an id and a note", () => {
    expect(ROUTE).toMatch(/const \{ subjectType, subjectId, notes \}/);
  });

  it("has no amount, total, price or cents field anywhere", () => {
    expect(ROUTE).not.toMatch(/\b(amount|total|price|cents|subtotal)\s*[:=]/i);
  });

  it("passes the RPC only what it read from the request", () => {
    expect(ROUTE).toContain("p_subject_type: subjectType");
    expect(ROUTE).toContain("p_subject_id: subjectId.trim()");
    expect(ROUTE).not.toMatch(/p_(amount|total|cents)/);
  });
});

describe("it is admin-only and it leaves a trail", () => {
  it("guards as the first statement", () => {
    const body = ROUTE.slice(ROUTE.indexOf("export async function POST"));
    expect(body.indexOf("guardAdminApi")).toBeLessThan(body.indexOf("readJson"));
  });

  it("writes one audit entry carrying the UNIT, not just the figure", () => {
    // When somebody asks in a year why a document says what it says, the
    // answer should be one row away.
    expect(ROUTE).toContain('action: "invoice.issue"');
    expect(ROUTE).toContain("sourceAmountUnit: inv.sourceAmountUnit");
  });

  it("reuses the existing audit trail rather than a second one", () => {
    expect(ROUTE).toContain('from "@/lib/admin/audit"');
    expect(ROUTE).not.toMatch(/invoice_audit_logs/);
  });

  it("explains an unsupported subject instead of leaking a Postgres error", () => {
    expect(ROUTE).toMatch(/adapter\.supported/);
    expect(ROUTE).toMatch(/adapter\.pending/);
  });
});

// ── THE SCHEMA'S OWN GUARDS ────────────────────────────────────────────────
describe("the migration cannot be applied with a hole in it", () => {
  it("proves its own grants rather than claiming them", () => {
    // Supabase grants anon EXECUTE on new public functions by default and
    // REVOKE FROM PUBLIC does not remove it. This project has been bitten
    // twice, so the migration asserts and fails rather than commenting.
    expect(MIGRATION).toContain("do $assert$");
    expect(MIGRATION).toMatch(/has_table_privilege\('anon','public\.invoices','SELECT'\)/);
    expect(MIGRATION).toMatch(/has_function_privilege\('anon','public\.invoice_issue/);
  });

  it("revokes the named roles, not just PUBLIC", () => {
    for (const role of ["anon", "authenticated"]) {
      expect(MIGRATION).toContain(`from ${role};`);
    }
  });

  it("carries the 100x tripwire as a CHECK", () => {
    expect(MIGRATION).toContain("invoices_unit_provenance");
    expect(MIGRATION).toMatch(/when 'rupees' then source_amount_raw \* 100/);
  });

  it("numbers from a counter, not a sequence", () => {
    // nextval() is non-transactional: a rolled-back issue would burn the
    // number for ever, and a gap in a book of invoices is a question an
    // accountant has to answer.
    expect(MIGRATION).toContain("invoice_counters");
    expect(MIGRATION).toContain("on conflict (series, year)");
    expect(MIGRATION).not.toMatch(/create sequence/i);
  });

  it("cannot let a line violate its own arithmetic", () => {
    expect(MIGRATION).toContain("invoice_lines_arithmetic");
    // The shape that would have broken it: dividing a total by a day count.
    expect(MIGRATION).not.toMatch(/round\(v_cents::numeric \/ v_qty\)/);
  });
});
