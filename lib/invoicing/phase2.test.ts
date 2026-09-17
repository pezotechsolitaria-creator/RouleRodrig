import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABEL, isPaymentMethod } from "./payments";

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const read = (...p: string[]) => strip(readFileSync(join(process.cwd(), ...p), "utf8"));

const PAY = read("app", "api", "admin", "invoices", "[id]", "payments", "route.ts");
const VOID = read("app", "api", "admin", "invoices", "[id]", "void", "route.ts");
const M201_RAW = readFileSync(
  join(process.cwd(), "supabase", "migrations",
       "20260917140000_m201_partial_payments_and_the_race.sql"), "utf8");
// SQL comments stripped. The migration EXPLAINS itself at length -- including
// the line "No 'overpaid' state" -- and an assertion that reads prose fails on
// its own documentation. That has now happened five times in this repo.
const M201 = M201_RAW.replace(/^\s*--.*$/gm, "");

// ── MONEY WINS ──────────────────────────────────────────────────────────────
//
// The two orderings, proven against the live database before this shipped:
//   payment then void -> the void is refused, the operator raises a credit note
//   void then payment -> the payment is refused and NEVER silently absorbed
// Both decided on a locked row, because two requests can interleave and an
// application cannot arbitrate that.
describe("a cancellation and a payment cannot both win", () => {
  it("serialises both paths on the invoice row", () => {
    const locks = M201.match(/where id = p_invoice_id for update/g) ?? [];
    expect(locks.length).toBe(2); // record_payment and void
  });

  it("refuses to void an invoice that has money on it", () => {
    expect(M201).toMatch(/new\.state = 'void' and old\.paid_cents > 0/);
    expect(M201).toContain("Raise a credit note instead");
  });

  it("refuses a payment against a cancelled invoice instead of absorbing it", () => {
    expect(M201).toMatch(/if v_inv\.state = 'void' then/);
    expect(M201).toContain("The payment has not been recorded");
  });

  it("recomputes the paid total rather than incrementing it", () => {
    // An increment is a lost update waiting for two requests to arrive
    // together. The sum is taken from the allocations under the row lock.
    expect(M201).toMatch(/select coalesce\(sum\(amount_cents\), 0\) into v_paid/);
    expect(M201).not.toMatch(/paid_cents\s*=\s*paid_cents\s*\+/);
  });
});

describe("an issued document cannot be edited", () => {
  it("freezes the identity and the money", () => {
    // Whitespace collapsed in the SOURCE: the migration pads each column name
    // to align the "is distinct from", so the padding differs per column and
    // an exact-string match cannot be written once.
    const flat = M201.replace(/[ 	]+/g, " ");
    for (const col of ["number", "total_cents", "subtotal_cents", "issued_at", "currency"]) {
      expect(flat, `${col} must be frozen after issue`).toContain(
        `new.${col} is distinct from old.${col}`,
      );
    }
  });

  it("is what makes regenerating a PDF on demand honest", () => {
    // If the numbers could move, a document reprinted next year would disagree
    // with the one the customer is holding.
    expect(M201).toContain("cannot be altered once issued");
  });

  it("allows only the transitions that exist", () => {
    expect(M201).toMatch(/\('issued','part_paid'\)/);
    expect(M201).toMatch(/\('part_paid','paid'\)/);
    // No way back out of paid or void: money returned is a credit note.
    expect(M201).not.toMatch(/\('paid',/);
    expect(M201).not.toMatch(/\('void',/);
  });
});

describe("overpayment", () => {
  it("has no state of its own — the balance simply goes negative", () => {
    expect(M201).not.toMatch(/'overpaid'/);
    expect(M201).toMatch(/v_paid >= v_inv\.total_cents then 'paid'/);
  });

  it("opens a refund only where a refund path exists", () => {
    // refunds.order_id is NOT NULL, so only an order subject can have one.
    // Every other subject is settled by hand — a named gap, not an oversight.
    expect(M201).toMatch(/v_over > 0 and v_inv\.subject_type = 'order'/);
  });
});

describe("the endpoints", () => {
  it("name the amount for its unit", () => {
    // The one place a human supplies money, so the field says cents and a
    // non-integer is rejected — a float here is somebody typing rupees.
    expect(PAY).toContain("amountCents");
    expect(PAY).toMatch(/Number\.isInteger\(amountCents\)/);
    expect(PAY).not.toMatch(/\bamount\b\s*[:=]/);
  });

  it("require a reason before cancelling", () => {
    expect(VOID).toMatch(/reason\.trim\(\)\.length < 3/);
    expect(M201).toContain("Voiding an invoice needs a reason");
  });

  it("guard first and audit after, on both", () => {
    for (const src of [PAY, VOID]) {
      const body = src.slice(src.indexOf("export async function POST"));
      expect(body.indexOf("guardAdminApi")).toBeLessThan(body.indexOf("readJson"));
      expect(src).toContain('entityType: "invoice"');
    }
    expect(PAY).toContain('action: "invoice.payment"');
    expect(VOID).toContain('action: "invoice.void"');
  });

  it("surface the database's own message, which is the useful one", () => {
    for (const src of [PAY, VOID]) expect(src).toContain("failed(error");
  });
});

describe("payment methods", () => {
  it("keeps MCB Juice, which online checkout rejects", () => {
    // Different acts: Juice is gone as an option a customer can PICK online.
    // Recording that somebody paid by Juice is recording a fact, and Juice is
    // ubiquitous here. The owner listed it explicitly.
    expect(isPaymentMethod("mcb_juice")).toBe(true);
    expect(PAYMENT_METHOD_LABEL.mcb_juice).toBe("MCB Juice");
  });

  it("covers every method the owner asked for", () => {
    for (const m of ["cash", "bank_transfer", "mcb_juice", "paypal"]) {
      expect(PAYMENT_METHODS).toContain(m);
    }
    // "Other" exists so a card machine or a correction has somewhere to go.
    expect(PAYMENT_METHOD_LABEL.manual).toBe("Other");
  });

  it("has a label for every method, or the dropdown renders a blank", () => {
    for (const m of PAYMENT_METHODS) expect(PAYMENT_METHOD_LABEL[m]).toBeTruthy();
  });

  it("refuses anything that is not one", () => {
    expect(isPaymentMethod("stripe")).toBe(false);
    expect(isPaymentMethod(null)).toBe(false);
  });
});
