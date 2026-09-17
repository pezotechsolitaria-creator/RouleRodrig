import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { voidBlockedReason, canVoid, DOC_KIND_WORD } from "./void-form";
import { STATE_LABEL } from "./register";
import type { Invoice, InvoiceState } from "./types";

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");
const DIALOG = strip(readFileSync(
  join(process.cwd(), "app", "admin", "invoices", "VoidDialog.tsx"), "utf8"));
const VIEW = strip(readFileSync(
  join(process.cwd(), "app", "admin", "invoices", "[id]", "InvoiceDetailView.tsx"), "utf8"));
const M201 = readFileSync(
  join(process.cwd(), "supabase", "migrations",
       "20260917140000_m201_partial_payments_and_the_race.sql"), "utf8")
  .replace(/^\s*--.*$/gm, "");

const inv = (over: Partial<Invoice> = {}): Invoice => ({
  id: "i", number: "RR-INV-2026-000001", docKind: "invoice",
  subjectType: "order", subjectId: "s", reference: "RR260907-C92312",
  billToName: "A Customer", billToEmail: null, billToPhone: null,
  sellerName: "Roule Rodrigues", sellerAddress: "Rodrigues Island",
  currency: "MUR",
  subtotalCents: 75000, discountCents: 0, taxCents: 0, deliveryCents: 0,
  totalCents: 75000, paidCents: 0, balanceCents: 75000,
  sourceAmountUnit: "cents", sourceAmountRaw: 75000, sourceTotalCents: 75000,
  state: "issued", issuedAt: "2026-09-17T09:00:00Z", dueAt: null, paidAt: null,
  sentAt: null, sentTo: null, sendCount: 0,
  notes: null, createdAt: "2026-09-17T09:00:00Z", ...over,
});

// ── A BUTTON THAT EXISTED ONLY AS AN ENDPOINT ───────────────────────────────
//
// /void shipped in phase 2 and nothing in the app could reach it. M207 then
// refused a second credit note with "Cancel that one first if it was wrong" —
// another instruction with no button behind it.
describe("cancelling is reachable", () => {
  it("is offered on the invoice page", () => {
    expect(VIEW).toContain("canVoid(inv)");
    expect(VIEW).toContain("<VoidDialog");
  });

  it("reaches the endpoint that has been there all along", () => {
    expect(DIALOG).toContain("/void");
  });

  it("works for a credit note too, which is what M207 tells the admin to do", () => {
    expect(canVoid(inv({ docKind: "credit_note" }))).toBe(true);
    expect(DOC_KIND_WORD.credit_note).toBe("credit note");
  });
});

// ── MONEY WINS, AND IS SAID BEFORE THE BUTTON IS PRESSED ────────────────────
describe("what cannot be cancelled", () => {
  it("refuses one with money against it, and names the remedy", () => {
    const why = voidBlockedReason(inv({ state: "part_paid", paidCents: 50000 }));
    expect(why).toContain("Rs 500");
    expect(why).toContain("credit note");
  });

  it("says the same thing the trigger says", () => {
    // The rule lives in the database on a locked row. This only repeats it.
    expect(M201).toMatch(/new\.state = 'void' and old\.paid_cents > 0/);
    expect(M201).toContain("Raise a credit note instead");
  });

  it("refuses a draft, an already-cancelled one, and a written-off one", () => {
    expect(voidBlockedReason(inv({ state: "draft" }))).toContain("nothing to cancel");
    expect(voidBlockedReason(inv({ state: "void" }))).toContain("already cancelled");
    expect(voidBlockedReason(inv({ state: "written_off" }))).toContain("written off");
  });

  it("allows exactly the states the trigger's transition table allows", () => {
    // issued -> void and part_paid -> void are legal transitions; part_paid
    // always carries a payment, so in practice only an untouched issued
    // document can be cancelled. Every other state must be refused here.
    for (const state of Object.keys(STATE_LABEL) as InvoiceState[]) {
      const allowed = canVoid(inv({ state }));
      expect(allowed, state).toBe(state === "issued" || state === "part_paid");
    }
  });

  it("requires a reason of real length", () => {
    expect(DIALOG).toContain("reason.trim().length >= 3");
  });
});
