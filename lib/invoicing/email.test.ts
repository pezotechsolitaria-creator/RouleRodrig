import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  invoiceEmailSubject,
  invoiceEmailLines,
  invoiceEmailHtml,
  invoiceAttachmentName,
} from "./email";
import { EMAIL_TYPES } from "@/lib/email/types";
import type { Invoice, InvoiceLine } from "./types";
import { invoiceToReceipt } from "./document";
import { buildReceiptPdf } from "@/lib/receipt-pdf";

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const read = (...p: string[]) => strip(readFileSync(join(process.cwd(), ...p), "utf8"));
const SEND = read("app", "api", "admin", "invoices", "[id]", "send", "route.ts");
const M205 = readFileSync(
  join(process.cwd(), "supabase", "migrations",
       "20260917190000_m205_recording_that_it_went_out.sql"), "utf8",
).replace(/^\s*--.*$/gm, "");

const inv = (over: Partial<Invoice> = {}): Invoice => ({
  id: "i", number: "RR-INV-2026-000001", docKind: "invoice",
  subjectType: "ride_request", subjectId: "s", reference: "RR-6493D3",
  billToName: "Maud Gonzalez", billToEmail: "maud@example.com", billToPhone: null,
  sellerName: "Roule Rodrigues", sellerAddress: "Rodrigues Island",
  currency: "MUR",
  subtotalCents: 97880, discountCents: 0, taxCents: 0, deliveryCents: 0,
  totalCents: 97880, paidCents: 0, balanceCents: 97880,
  sourceAmountUnit: "cents", sourceAmountRaw: 97880, sourceTotalCents: 97880,
  state: "issued", issuedAt: "2026-09-17T09:00:00Z", dueAt: null, paidAt: null,
  sentAt: null, sentTo: null, sendCount: 0,
  notes: null, createdAt: "2026-09-17T09:00:00Z", ...over,
});

const line: InvoiceLine = {
  id: "l", position: 1, kind: "charge",
  description: "Taxi — Graviers beach to François Leguat tortoise reserve",
  qty: 1, unitPriceCents: 97880, lineTotalCents: 97880,
};

// ── THE FIGURE IN THE INBOX IS THE FIGURE ON THE DOCUMENT ───────────────────
describe("the email says the same money as the invoice", () => {
  it("prints cents as rupees, never a hundred times the truth", () => {
    const body = invoiceEmailLines(inv(), [line]).join(" ");
    expect(body).toContain("Rs 978.80");
    expect(body).not.toContain("Rs 97,880");
  });

  it("says paid in full without asking for money", () => {
    const body = invoiceEmailLines(
      inv({ state: "paid", paidCents: 97880, balanceCents: 0 }),
      [line],
    ).join(" ");
    expect(body).toContain("paid in full");
    expect(body).toContain("Nothing further is owed");
  });

  it("names the remaining balance when something is still owed", () => {
    const body = invoiceEmailLines(
      inv({ state: "part_paid", paidCents: 50000, balanceCents: 47880 }),
      [line],
    ).join(" ");
    expect(body).toContain("Received so far Rs 500");
    expect(body).toContain("Rs 478.80");
  });

  it("tells a customer who overpaid that the money is theirs", () => {
    const body = invoiceEmailLines(
      inv({ state: "paid", paidCents: 100000, balanceCents: -2120 }),
      [line],
    ).join(" ");
    expect(body).toContain("Rs 21.20");
    expect(body).toContain("We owe that back to you");
  });

  it("says a cancelled document is for the record", () => {
    const body = invoiceEmailLines(inv({ state: "void" }), [line]).join(" ");
    expect(body).toContain("cancelled");
  });
});

// ── WHAT THE EMAIL MUST NOT DO ──────────────────────────────────────────────
describe("the email invents no commercial terms", () => {
  it("names no payment method and no deadline of its own", () => {
    const body = invoiceEmailLines(inv(), [line]).join(" ").toLowerCase();
    // Prices and terms are the owner's wording. An email that tells a customer
    // to pay by bank transfer within 7 days has made both up.
    for (const invented of ["bank transfer", "within 7 days", "late fee", "paypal"]) {
      expect(body, invented).not.toContain(invented);
    }
  });

  it("states a due date only when the invoice carries one", () => {
    expect(invoiceEmailLines(inv(), [line]).join(" ")).not.toContain("Due by");
    expect(
      invoiceEmailLines(inv({ dueAt: "2026-10-01T00:00:00Z" }), [line]).join(" "),
    ).toContain("Due by 2026-10-01");
  });

  it("escapes whatever the customer's name happens to contain", () => {
    const html = invoiceEmailHtml(inv({ billToName: "<script>x</script>" }), [line]);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("the inbox row", () => {
  it("leads with the number, because that is what gets searched for", () => {
    expect(invoiceEmailSubject(inv())).toContain("RR-INV-2026-000001");
    expect(invoiceAttachmentName(inv())).toBe("RR-INV-2026-000001.pdf");
  });

  it("calls a settled document a receipt", () => {
    expect(invoiceEmailSubject(inv({ state: "paid" }))).toContain("Receipt");
  });
});

// ── THE SEND ITSELF ─────────────────────────────────────────────────────────
describe("sending is recorded, and cannot double-send by accident", () => {
  it("keys idempotency on the send count, so a resend is a new email", () => {
    // Two clicks in the same second share a key and the second is deduped; a
    // deliberate resend happens after the count moved, so it goes.
    expect(SEND).toContain(
      "`invoice_document:${inv.id}:${inv.paidCents}:${inv.sendCount}`",
    );
  });

  it("does not record a send that was deduplicated", () => {
    expect(SEND).toMatch(/if \(res\.deduped\)[\s\S]*?sent: false/);
  });

  it("does not record a send that was suppressed", () => {
    expect(SEND).toMatch(/if \(res\.suppressed\)[\s\S]*?status: 503/);
    expect(SEND).toContain("Nothing was recorded");
  });

  it("refuses to send a draft", () => {
    expect(SEND).toContain('inv.state === "draft"');
  });

  it("builds the attachment from the same renderer as the download", () => {
    expect(SEND).toContain("buildReceiptPdf(invoiceToReceipt(inv, lines))");
    expect(SEND).not.toMatch(/\b(jspdf|pdfkit|puppeteer|@react-pdf)\b/i);
  });

  it("records the address it actually used, not the one on the customer record", () => {
    expect(SEND).toContain("p_to: recipient");
    expect(M205).toContain("sent_to    = btrim(p_to)");
  });

  it("moves the count and the timestamp together, in one statement", () => {
    expect(M205).toMatch(/set sent_at\s*=\s*now\(\)[\s\S]*?send_count = send_count \+ 1/);
  });

  it("leaves no public role able to mark an invoice sent", () => {
    expect(M205).toContain("raise exception 'anon can mark invoices sent'");
    expect(M205).toContain("raise exception 'authenticated can mark invoices sent'");
  });
});

// ── THE ATTACHMENT IS A REAL PDF, BUILT IN NODE ─────────────────────────────
//
// The renderer was written for the browser. The send route runs it inside a
// serverless function, so "it works" has to mean "it works in Node" — this
// test runs in Node and is the proof.
describe("the attachment", () => {
  it("is a PDF, produced server-side from the invoice", () => {
    const bytes = buildReceiptPdf(invoiceToReceipt(inv(), [line]));
    expect(bytes.length).toBeGreaterThan(500);
    expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
    // The trailer is what makes it openable rather than a truncated file.
    expect(Buffer.from(bytes).toString("latin1")).toContain("%%EOF");
  });

  it("carries the figure the customer will check", () => {
    const text = Buffer.from(buildReceiptPdf(invoiceToReceipt(inv(), [line]))).toString("latin1");
    expect(text).toContain("RR-INV-2026-000001");
  });
});

describe("the email type is registered where the quota can see it", () => {
  it("is its own category, so month-end invoicing is not read as a rental spike", () => {
    expect(EMAIL_TYPES.invoice_document.category).toBe("billing");
  });

  it("is high, not critical — a document is as good an hour later", () => {
    // Critical is reserved for mail that is useless late: a booking
    // confirmation, a password reset.
    expect(EMAIL_TYPES.invoice_document.priority).toBe("high");
  });
});
