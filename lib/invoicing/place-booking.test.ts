import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SUBJECTS, supportedSubjects } from "./subjects";

const readSql = (file: string) =>
  readFileSync(join(process.cwd(), "supabase", "migrations", file), "utf8")
    // SQL comments stripped: the migration explains itself at length, and an
    // assertion that reads prose fails on its own documentation.
    .replace(/^\s*--.*$/gm, "");
const readTs = (...p: string[]) =>
  readFileSync(join(process.cwd(), ...p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const M210 = readSql("20260918090000_m210_the_column_called_deposit_is_the_whole_price.sql");
const ISSUABLE = readTs("app", "api", "admin", "invoices", "issuable", "route.ts");

/** Just the place_booking branch, so a claim about it cannot be met elsewhere. */
const BRANCH = M210.slice(
  M210.indexOf("elsif p_subject_type = 'place_booking' then"),
  M210.indexOf("  else\n"),
);

// ── THE COLUMN NAME LIES, AND THE DOCUMENT MUST NOT ─────────────────────────
//
// place_bookings.deposit_amount stopped being a deposit on 2026-08-13, when the
// owner decided activities are paid in full at booking. The column kept its
// name because renaming it would have meant migrating live reservations to
// change a word. An invoice headed "Deposit" against the entire price tells a
// customer a balance is coming that never will.
describe("a place booking is billed for the whole price", () => {
  it("never calls it a deposit on the document", () => {
    // The word may appear in the column reference; it may not appear in
    // anything that reaches a customer — the line, or the notes.
    const line = BRANCH.slice(BRANCH.indexOf("btrim(p.place_name)"));
    expect(line.toLowerCase()).not.toContain("deposit");
  });

  it("bills deposit_amount and nothing else", () => {
    expect(BRANCH).toContain("p.deposit_amount");
    // amount_paid is what the customer HAS paid. That is a payment to record
    // against the invoice, never the figure the invoice bills.
    expect(BRANCH).not.toContain("amount_paid");
  });

  it("describes what was reserved and when", () => {
    expect(BRANCH).toContain("btrim(p.place_name)");
    expect(BRANCH).toContain("p.start_date");
    expect(BRANCH).toContain("p.end_date");
  });
});

// ── RUPEES, THE SECOND AND LAST MULTIPLICATION ──────────────────────────────
//
// Confirmed four times, none of them the column name: lib/activity.ts passes it
// through rupeesToCents(), its test turns 4000 into 400000, lib/email.ts says
// "whole RUPEES" outright, and the admin money desk converts at the edge. That
// last comment exists because one formatter shared between a rupee column and a
// cents column once announced a Rs 320.00 order to the owner as "Rs 32,000".
describe("the unit is whole rupees", () => {
  it("multiplies by 100, exactly where the booking adapter does", () => {
    expect(BRANCH).toMatch(/v_unit\s*:=\s*'rupees';/);
    expect(BRANCH).toMatch(/v_cents\s*:=\s*v_raw \* 100;/);
  });

  it("leaves exactly two multiplications in the whole function", () => {
    // bookings.total_amount and place_bookings.deposit_amount. A third would
    // mean somebody converted a cents column.
    const rupeeConversions = M210.match(/v_raw \* 100/g) ?? [];
    expect(rupeeConversions.length).toBe(2);
  });

  it("agrees with the registry", () => {
    expect(SUBJECTS.place_booking.unit).toBe("rupees");
    expect(SUBJECTS.place_booking.amountColumn).toBe("deposit_amount");
  });
});

// ── THE OBVIOUS MISTAKE, NOT MADE ───────────────────────────────────────────
describe("the price is flat per reservation", () => {
  it("never multiplies by quantity", () => {
    // "Flat per reservation, NOT per person — a boat charter is priced by the
    // boat, and there is no per-head field to multiply by." (lib/defaults.ts)
    expect(BRANCH).not.toContain("quantity");
    expect(BRANCH).toMatch(/v_qty\s*:=\s*1;/);
  });
});

// ── THE FIRST SUBJECT WITH A REAL DEADLINE ──────────────────────────────────
describe("the due date is the one the customer already has", () => {
  it("carries payment_due_by onto the invoice", () => {
    expect(BRANCH).toContain("p.payment_due_by");
    expect(M210).toMatch(/state, issued_at, due_at, notes/);
    expect(M210).toContain("'issued', now(), v_due, v_notes");
  });

  it("invents no deadline for any other subject", () => {
    // v_due is only ever assigned in the place_booking branch, so every other
    // invoice still has due_at NULL — nothing upstream of them has a deadline.
    const assignments = M210.match(/v_due\b/g) ?? [];
    // declaration, the select INTO, and the insert
    expect(assignments.length).toBe(3);
  });
});

// ── WHAT IS NOT OWED ────────────────────────────────────────────────────────
describe("only a reservation that was actually agreed", () => {
  it("refuses one the owner has not approved", () => {
    // place_bookings_approved_has_deadline means an unapproved row does not
    // even have a payment deadline yet.
    expect(BRANCH).toMatch(/if v_status = 'pending' then/);
    expect(BRANCH).toContain("nothing agreed to invoice");
  });

  it("refuses one that was declined or cancelled", () => {
    expect(BRANCH).toMatch(/v_status in \('unavailable', 'cancelled'\)/);
    expect(BRANCH).toContain("never owed");
  });

  it("refuses a request-only listing rather than invoicing zero", () => {
    // "0 or unset keeps the listing request-only: nothing to charge, so the
    // owner confirms it by hand as before." (lib/defaults.ts)
    expect(BRANCH).toMatch(/if coalesce\(v_raw, 0\) = 0 then/);
    expect(BRANCH).toContain("request-only");
  });
});

describe("the picker and the registry agree with the adapter", () => {
  it("offers it, with the same filters the RPC enforces", () => {
    expect(ISSUABLE).toMatch(/from\("place_bookings"\)/);
    expect(ISSUABLE).toMatch(/from\("place_bookings"\)[\s\S]*?\.gt\("deposit_amount", 0\)/);
  });

  it("is supported, with no pending excuse left behind", () => {
    expect(SUBJECTS.place_booking.supported).toBe(true);
    expect(SUBJECTS.place_booking.pending).toBeUndefined();
    expect(supportedSubjects()).toContain("place_booking");
  });

  it("leaves no public role able to issue a document in the company's name", () => {
    expect(M210).toContain("raise exception 'anon can issue invoices'");
    expect(M210).toContain("raise exception 'authenticated can issue invoices'");
  });
});

// ── THE THREE THAT STAY SHUT, AND WHY ───────────────────────────────────────
//
// Each was investigated and declined for a DIFFERENT reason. The reasons are
// pinned here because the expensive part was finding them, and the next person
// to ask "why isn't this invoiceable?" should not have to find them again.
describe("the subjects that are not going to be invoiced", () => {
  it("service_booking: the platform is not the payee", () => {
    // BookService.tsx tells the customer "Nothing to pay now — you settle it
    // with them", and trade_providers has no commission column. An invoice
    // would claim money Roule Rodrigues never handles.
    expect(SUBJECTS.service_booking.supported).toBe(false);
    expect(SUBJECTS.service_booking.pending).toContain("not the payee");
  });

  it("subscription_invoice: a document already exists", () => {
    // components/merchant/InvoicePdfButton.tsx renders "Subscription invoice"
    // from the same rows, mounted on the merchant's own page.
    expect(SUBJECTS.subscription_invoice.supported).toBe(false);
    expect(SUBJECTS.subscription_invoice.pending).toContain("already download");
  });

  it("managed_ticketing_agreement: no fee, and no payer", () => {
    // invoiced_fee_cents is NULL on every live agreement, and the obvious
    // join to an email resolves to the system-owned merchant — it would
    // address the invoice to Roule Rodrigues itself.
    expect(SUBJECTS.managed_ticketing_agreement.supported).toBe(false);
    expect(SUBJECTS.managed_ticketing_agreement.pending).toContain("no payer");
  });

  it("every unsupported subject still says why, in a sentence a person can act on", () => {
    for (const key of Object.keys(SUBJECTS) as (keyof typeof SUBJECTS)[]) {
      const a = SUBJECTS[key];
      if (a.supported) continue;
      expect(a.pending, key).toBeTruthy();
      // Not "needs an adapter" — a reason, long enough to be one.
      expect(a.pending!.length, key).toBeGreaterThan(30);
    }
  });
});
