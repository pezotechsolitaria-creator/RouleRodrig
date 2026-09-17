import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");
const read = (...p: string[]) => strip(readFileSync(join(process.cwd(), ...p), "utf8"));

const PAY = read("app", "admin", "invoices", "PaymentDialog.tsx");
const ISSUE = read("app", "admin", "invoices", "IssueDialog.tsx");
const DESK = read("app", "admin", "invoices", "InvoiceDesk.tsx");
const ISSUABLE = read("app", "api", "admin", "invoices", "issuable", "route.ts");

// ── THE CONVERSION IS SHOWN BEFORE IT IS TRUSTED ───────────────────────────
//
// The admin types rupees; the database stores cents. Four live 100x bugs came
// from that boundary and not one was caught by somebody reading code. The
// thing that catches it is a screen saying "Record Rs 2,999" before the button
// can be pressed.
describe("the payment dialog shows its arithmetic", () => {
  it("computes nothing itself — it renders projectPayment", () => {
    expect(PAY).toContain("projectPayment(invoice, typed)");
    // No arithmetic on money in the component.
    expect(PAY).not.toMatch(/\*\s*100|\/\s*100/);
  });

  it("shows the four figures the owner asked for", () => {
    for (const label of ["Invoice total", "Already paid", "Recording now", "Remaining after this"]) {
      expect(PAY, label).toContain(label);
    }
  });

  it("puts the converted amount on the button itself", () => {
    // The last thing read before committing money says what will be committed.
    expect(PAY).toContain("Record ${p.amountLabel}");
  });

  it("stays disabled until the amount parses", () => {
    expect(PAY).toMatch(/disabled=\{!p\.ok \|\| busy\}/);
  });

  it("sends cents, never the typed string", () => {
    expect(PAY).toContain("amountCents: p.amountCents");
    expect(PAY).not.toMatch(/amountCents:\s*typed/);
  });

  it("warns about an overpayment rather than refusing it", () => {
    // People round up in cash. Refusing real money is worse than recording it.
    expect(PAY).toMatch(/p\.overpays/);
    expect(PAY).toContain("more than is owed");
  });

  it("says why an invoice cannot take money, before the request", () => {
    expect(PAY).toContain("paymentBlockedReason(invoice)");
  });
});

describe("the issue dialog sends a subject, never an amount", () => {
  it("posts only the subject and its id", () => {
    expect(ISSUE).toContain("subjectType: row.subjectType");
    expect(ISSUE).toContain("subjectId: row.subjectId");
    expect(ISSUE).not.toMatch(/amountCents|totalCents:\s*row/);
  });

  it("does not offer anything already invoiced", () => {
    // invoices_one_live_per_subject would refuse it, and a button that always
    // errors teaches people to distrust the screen.
    expect(ISSUABLE).toContain('.neq("state", "void")');
    expect(ISSUABLE).toMatch(/done\.has\(`booking:\$\{b\.id\}`\)/);
    expect(ISSUABLE).toMatch(/done\.has\(`order:\$\{o\.id\}`\)/);
  });

  it("converts each source in the right direction for the preview", () => {
    // bookings are rupees, orders are already cents. Getting this backwards in
    // a PREVIEW would still mislead whoever is picking.
    expect(ISSUABLE).toContain("totalCents: b.total_amount * 100");
    expect(ISSUABLE).toContain("totalCents: o.total");
  });
});

describe("the desk", () => {
  it("offers a payment only where money can be taken", () => {
    expect(DESK).toMatch(/i\.state === "issued" \|\| i\.state === "part_paid" \|\| i\.state === "paid"/);
  });

  it("updates the row in place instead of reloading the table", () => {
    expect(DESK).toContain("function replace(updated: Invoice)");
  });

  it("says what happened, including what is still owed", () => {
    expect(DESK).toContain("is settled.");
    expect(DESK).toContain("still owed on");
  });
});
