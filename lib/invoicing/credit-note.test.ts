import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { projectCredit, creditBlockedReason, creditConsequence } from "./credit-form";
import type { Invoice } from "./types";

const M207 = readFileSync(
  join(process.cwd(), "supabase", "migrations",
       "20260917210000_m207_the_credit_note_the_errors_promise.sql"), "utf8",
).replace(/^\s*--.*$/gm, "");
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");
const ROUTE = strip(readFileSync(
  join(process.cwd(), "app", "api", "admin", "invoices", "[id]", "credit-note", "route.ts"), "utf8"));
const DIALOG = strip(readFileSync(
  join(process.cwd(), "app", "admin", "invoices", "CreditNoteDialog.tsx"), "utf8"));
const M201 = readFileSync(
  join(process.cwd(), "supabase", "migrations",
       "20260917140000_m201_partial_payments_and_the_race.sql"), "utf8");

const inv = (over: Partial<Invoice> = {}): Invoice => ({
  id: "i", number: "RR-INV-2026-000001", docKind: "invoice",
  subjectType: "ride_request", subjectId: "s", reference: "RR-6493D3",
  billToName: "Maud Gonzalez", billToEmail: null, billToPhone: null,
  sellerName: "Roule Rodrigues", sellerAddress: "Rodrigues Island",
  currency: "MUR",
  subtotalCents: 97880, discountCents: 0, taxCents: 0, deliveryCents: 0,
  totalCents: 97880, paidCents: 0, balanceCents: 97880,
  sourceAmountUnit: "cents", sourceAmountRaw: 97880, sourceTotalCents: 97880,
  state: "issued", issuedAt: "2026-09-17T09:00:00Z", dueAt: null, paidAt: null,
  sentAt: null, sentTo: null, sendCount: 0,
  notes: null, createdAt: "2026-09-17T09:00:00Z", ...over,
});

// ── THE PROMISE THE ERRORS MAKE ─────────────────────────────────────────────
//
// Two refusals in M201 tell the admin to raise a credit note. For months there
// was no function that could. An error naming a remedy the software does not
// have is worse than one that says nothing.
describe("the remedy the refusals name now exists", () => {
  it("is what M201 tells the admin to do", () => {
    expect(M201).toContain("Raise a credit note instead");
    expect(M201).toContain("raise a credit note");
  });

  it("is a real function, on the CRN series", () => {
    expect(M207).toContain("create or replace function public.invoice_credit_note");
    expect(M207).toContain("public.next_invoice_seq('CRN', v_year)");
    expect(M207).toContain("'RR-CRN-' || v_year::text || '-' || lpad(v_seq::text, 6, '0')");
  });
});

// ── WHAT A CREDIT NOTE MAY NOT BE ───────────────────────────────────────────
describe("a credit note is bounded by the invoice it reverses", () => {
  it("cannot exceed it", () => {
    expect(M207).toMatch(/if v_amount > v_src\.total_cents then/);
    expect(M207).toContain("cannot exceed the invoice");
  });

  it("cannot be raised without a reason", () => {
    expect(M207).toContain("A credit note needs a reason");
    // And the form will not send one either, so the refusal is rarely seen.
    expect(DIALOG).toContain("reason.trim().length > 2");
  });

  it("cannot be raised against a draft, a void, or another credit note", () => {
    expect(M207).toMatch(/if v_src\.state = 'draft' then/);
    expect(M207).toMatch(/if v_src\.state = 'void' then/);
    expect(M207).toMatch(/if v_src\.doc_kind <> 'invoice' then/);
  });

  it("refuses a second one with a message naming the first", () => {
    expect(M207).toContain("already has credit note %");
  });

  it("decides on a locked row", () => {
    expect(M207).toContain("where id = p_invoice_id for update");
  });
});

// ── THE ONE STATE CHANGE ────────────────────────────────────────────────────
describe("a fully credited unpaid invoice stops counting as owed", () => {
  it("writes it off, and only when nothing was ever paid", () => {
    expect(M207).toMatch(
      /if v_amount = v_src\.total_cents and v_src\.paid_cents = 0 then[\s\S]*?state = 'written_off'/,
    );
  });

  it("says so in the dialog before the button is pressed", () => {
    expect(creditConsequence(inv(), true)).toContain("written off");
    expect(creditConsequence(inv({ paidCents: 97880 }), true)).toContain("refund is arranged separately");
    expect(creditConsequence(inv(), false)).toContain("stays owed");
  });
});

// ── THE RUPEE/CENT BOUNDARY, AGAIN ──────────────────────────────────────────
describe("the amount is shown back before it is sent", () => {
  it("treats an empty field as the whole invoice, not as zero", () => {
    const p = projectCredit(inv(), "");
    expect(p.ok && p.full).toBe(true);
    expect(p.ok && p.amountCents).toBe(null); // the database decides the figure
    expect(p.ok && p.amountLabel).toBe("Rs 978.80");
  });

  it("converts rupees to cents once, and says what it converted", () => {
    const p = projectCredit(inv(), "200");
    expect(p.ok && p.amountCents).toBe(20000);
    expect(p.ok && p.amountLabel).toBe("Rs 200");
    expect(p.ok && p.full).toBe(false);
  });

  it("refuses more than the invoice, with the invoice's own figure", () => {
    const p = projectCredit(inv(), "1000");
    expect(p.ok).toBe(false);
    expect(!p.ok && p.reason).toContain("Rs 978.80");
  });

  it("refuses nothing and nonsense differently from zero", () => {
    expect(projectCredit(inv(), "0").ok).toBe(false);
    expect(projectCredit(inv(), "abc").ok).toBe(false);
  });

  it("puts the converted figure on the button itself", () => {
    expect(DIALOG).toContain("`Credit ${p.amountLabel}`");
  });

  it("omits the amount entirely for a full credit", () => {
    // Sending totalCents back would be trusting a figure that came over a wire
    // to match the one in the database.
    expect(DIALOG).toContain("...(p.amountCents === null ? {} : { amountCents: p.amountCents })");
  });
});

describe("the endpoint", () => {
  it("requires a reason and rejects a non-integer amount", () => {
    expect(ROUTE).toContain("Why is this being credited?");
    expect(ROUTE).toMatch(/Number\.isInteger\(amountCents\)/);
  });

  it("sends null rather than a guess when no amount was given", () => {
    expect(ROUTE).toContain('p_amount_cents: typeof amountCents === "number" ? amountCents : null');
  });

  it("leaves an audit entry naming the invoice it reverses", () => {
    expect(ROUTE).toContain('action: "invoice.credit_note"');
    expect(ROUTE).toContain("againstInvoice: id");
  });
});

describe("the dialog refuses before the request, not after", () => {
  it("blocks a receipt and a credit note from being credited", () => {
    expect(creditBlockedReason(inv({ docKind: "receipt" }))).toContain("Only an invoice");
    expect(creditBlockedReason(inv({ docKind: "credit_note" }))).toContain("Only an invoice");
  });

  it("blocks a draft and a cancelled invoice", () => {
    expect(creditBlockedReason(inv({ state: "draft" }))).toContain("not been issued");
    expect(creditBlockedReason(inv({ state: "void" }))).toContain("cancelled");
  });

  it("allows a paid one — that is the case void cannot handle", () => {
    expect(creditBlockedReason(inv({ state: "paid", paidCents: 97880 }))).toBe(null);
  });
});

describe("no public role can reverse a sale", () => {
  it("is revoked from anon and authenticated, and asserts it", () => {
    expect(M207).toContain("raise exception 'anon can raise credit notes'");
    expect(M207).toContain("raise exception 'authenticated can raise credit notes'");
  });
});
