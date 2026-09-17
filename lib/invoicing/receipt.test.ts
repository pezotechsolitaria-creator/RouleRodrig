import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { invoiceToReceipt } from "./document";
import type { Invoice, InvoiceLine } from "./types";

const M206 = readFileSync(
  join(process.cwd(), "supabase", "migrations",
       "20260917200000_m206_the_receipt_series_finally_issues.sql"), "utf8",
).replace(/^\s*--.*$/gm, "");
const ROUTE = readFileSync(
  join(process.cwd(), "app", "api", "admin", "invoices", "[id]", "receipt", "route.ts"), "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const inv = (over: Partial<Invoice> = {}): Invoice => ({
  id: "i", number: "RR-INV-2026-000001", docKind: "invoice",
  subjectType: "booking", subjectId: "s", reference: "RR-87E663",
  billToName: "Tony Constance", billToEmail: null, billToPhone: null,
  sellerName: "Roule Rodrigues", sellerAddress: "Rodrigues Island",
  currency: "MUR",
  subtotalCents: 599700, discountCents: 0, taxCents: 0, deliveryCents: 0,
  totalCents: 599700, paidCents: 599700, balanceCents: 0,
  sourceAmountUnit: "rupees", sourceAmountRaw: 5997, sourceTotalCents: 599700,
  state: "paid", issuedAt: "2026-09-17T09:00:00Z", dueAt: null,
  paidAt: "2026-09-17T10:00:00Z",
  sentAt: null, sentTo: null, sendCount: 0,
  notes: null, createdAt: "2026-09-17T09:00:00Z", ...over,
});

const line: InvoiceLine = {
  id: "l", position: 1, kind: "charge", description: "Vehicle rental — 3 days",
  qty: 1, unitPriceCents: 599700, lineTotalCents: 599700,
};

// ── TWO DOCUMENTS, ONE SET OF FIGURES ───────────────────────────────────────
//
// The customer can end up holding an invoice AND a receipt for the same sale.
// If either one computes its own total, they can disagree, and the business is
// then arguing with a piece of paper it printed itself.
describe("a receipt is copied from its invoice, never recalculated", () => {
  it("takes every figure from the invoice row", () => {
    for (const field of [
      "v_src.subtotal_cents", "v_src.discount_cents", "v_src.tax_cents",
      "v_src.delivery_cents", "v_src.total_cents", "v_src.paid_cents",
    ]) {
      expect(M206, field).toContain(field);
    }
  });

  it("carries the provenance forward rather than re-reading the source table", () => {
    // The receipt says which unit the original column was in, same as the
    // invoice. Re-reading the booking would be a second chance to read it wrong.
    expect(M206).toContain("v_src.source_amount_unit, v_src.source_amount_raw, v_src.source_total_cents");
    expect(M206).not.toMatch(/from public\.(bookings|orders|ride_requests)\b/);
  });

  it("does no arithmetic on money at all", () => {
    expect(M206).not.toMatch(/_cents\s*[*+/-]\s*\d/);
    expect(M206).not.toMatch(/sum\(/i);
  });

  it("copies the lines in their original order", () => {
    expect(M206).toMatch(/insert into public\.invoice_lines[\s\S]*?from public\.invoice_lines l[\s\S]*?order by l\.position/);
  });
});

// ── WHEN A RECEIPT MAY EXIST ────────────────────────────────────────────────
describe("a receipt is only ever true", () => {
  it("refuses an invoice that is not paid in full", () => {
    expect(M206).toContain("is not paid in full, so there is nothing to receipt");
    expect(M206).toMatch(/if v_src\.state <> 'paid' then/);
  });

  it("refuses a second one", () => {
    expect(M206).toContain("already has a receipt");
  });

  it("refuses to receipt a receipt", () => {
    expect(M206).toMatch(/if v_src\.doc_kind <> 'invoice' then/);
  });

  it("decides on a locked row, like every other money path", () => {
    expect(M206).toContain("where id = p_invoice_id for update");
  });
});

// ── THE NUMBER THE SPEC ASKED FOR ───────────────────────────────────────────
describe("RR-RCP-YYYY-NNNNNN", () => {
  it("uses the receipt series and its own counter", () => {
    expect(M206).toContain("public.next_invoice_seq('RCP', v_year)");
    expect(M206).toContain("'RR-RCP-' || v_year::text || '-' || lpad(v_seq::text, 6, '0')");
  });

  it("names the invoice it acknowledges", () => {
    expect(M206).toContain("'Receipt for ' || v_src.number");
    expect(M206).toContain("v_src.id,"); // parent_invoice_id
  });

  it("relaxed the parent constraint deliberately, not accidentally", () => {
    // It was an equivalence — exactly credit notes have a parent — which made a
    // receipt unable to name its invoice. A case keeps every original rule.
    expect(M206).toMatch(/when 'credit_note' then parent_invoice_id is not null/);
    expect(M206).toMatch(/when 'invoice'\s+then parent_invoice_id is null/);
    expect(M206).toMatch(/when 'receipt'\s+then true/);
  });

  it("leaves no public role able to issue one", () => {
    expect(M206).toContain("raise exception 'anon can issue receipts'");
    expect(M206).toContain("raise exception 'authenticated can issue receipts'");
  });
});

describe("the endpoint", () => {
  it("passes an invoice id and no money", () => {
    // Only the CALL matters. The audit line below it records the receipt's own
    // total, which is a figure coming back rather than one going in.
    const call = ROUTE.slice(ROUTE.indexOf("invoice_issue_receipt"), ROUTE.indexOf("});"));
    expect(call).toContain("p_invoice_id: id");
    expect(call).not.toMatch(/amount|cents/i);
  });

  it("surfaces the database's own refusal", () => {
    expect(ROUTE).toContain('failed(error, "Could not issue the receipt.")');
  });
});

describe("the document calls itself a receipt", () => {
  it("headed Receipt, not Invoice", () => {
    expect(invoiceToReceipt(inv({ docKind: "receipt" }), [line]).heading).toBe("Receipt");
    expect(invoiceToReceipt(inv(), [line]).heading).toBe("Invoice");
  });

  it("prints the same total as the invoice it came from", () => {
    const a = invoiceToReceipt(inv(), [line]);
    const b = invoiceToReceipt(inv({ docKind: "receipt", number: "RR-RCP-2026-000001" }), [line]);
    const total = (d: typeof a) => d.rows.find((r) => r.label === "Total")?.value;
    expect(total(b)).toBe(total(a));
    expect(total(b)).toBe("Rs 5,997");
  });
});
