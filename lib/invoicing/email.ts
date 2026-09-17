import type { Invoice, InvoiceLine } from "./types";
import { SUBJECTS } from "./subjects";
import { money, stateWords } from "./document";

// ── THE EMAIL THAT CARRIES THE DOCUMENT ─────────────────────────────────────
//
// PURE on purpose: no fetch, no database, no provider. Everything a customer
// will read is decided here and can be asserted in a test, because the one way
// to find out that an invoice email says the wrong number is otherwise to send
// it to a customer.
//
// The PDF is attached rather than linked. A link would need a token, a public
// route, an expiry and a decision about what happens when the token leaks —
// all to deliver a 2 KB file that the mail can simply carry. Attaching it also
// means the document survives in the customer's inbox without depending on
// this site being up in a year's time, which is the point of a document.

/** What the reader sees in their inbox list. */
export function invoiceEmailSubject(inv: Invoice): string {
  if (inv.docKind === "credit_note") return `Credit note ${inv.number}`;
  if (inv.state === "paid") return `Receipt ${inv.number} — paid in full`;
  return `Invoice ${inv.number} from Roulé Rodrigues`;
}

/** The filename in the attachment row. It is what they will search for later. */
export function invoiceAttachmentName(inv: Invoice): string {
  return `${inv.number}.pdf`;
}

/** First name only, and only when it is safe to take one. */
function greetingName(full: string): string {
  const first = full.trim().split(/\s+/)[0] ?? "";
  return first.length >= 2 ? first : full.trim();
}

/**
 * The body, as sentences.
 *
 * WHAT IS NOT SAID: nothing about when the money is due unless the invoice
 * carries a due date, and no instruction to pay by any particular method. The
 * owner's payment terms are the owner's wording — this email delivers a
 * document, it does not invent commercial terms on the business's behalf.
 */
export function invoiceEmailLines(inv: Invoice, lines: InvoiceLine[]): string[] {
  const subject = SUBJECTS[inv.subjectType];
  const what = lines[0]?.description ?? subject.label;
  const out: string[] = [];

  out.push(
    `Hi ${greetingName(inv.billToName)} — your ${
      inv.docKind === "credit_note" ? "credit note" : "invoice"
    } for ${what} is attached as a PDF.`,
  );

  out.push(`${inv.number} · ${subject.label} · ${inv.reference}`);

  // The figures, in the order somebody checks them against their own record.
  if (inv.paidCents > 0 && inv.balanceCents <= 0) {
    out.push(`Total ${money(inv.totalCents)} — paid in full. Nothing further is owed.`);
  } else if (inv.paidCents > 0) {
    out.push(
      `Total ${money(inv.totalCents)}. Received so far ${money(inv.paidCents)}, leaving ${money(
        inv.balanceCents,
      )}.`,
    );
  } else {
    out.push(`Total ${money(inv.totalCents)}.`);
  }

  if (inv.balanceCents < 0) {
    // An overpayment is the customer's money. Saying so in the email is the
    // difference between a refund they have to chase and one they expect.
    out.push(
      `You paid ${money(Math.abs(inv.balanceCents))} more than the total. We owe that back to you and will be in touch to return it.`,
    );
  }

  if (inv.dueAt) {
    out.push(`Due by ${inv.dueAt.slice(0, 10)}.`);
  }

  if (inv.state === "void") {
    out.push("This document has been cancelled and is sent for your records only.");
  }

  if (inv.notes) out.push(inv.notes);

  out.push(
    "If anything on it does not match what you agreed, reply to this email and we will correct it.",
  );
  return out;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Inline-styled and plain.
 *
 * Email clients strip <style>, so every rule is on the element. No images, no
 * web fonts, no CTA button: the thing being delivered is the attachment, and a
 * button that leads back to a site the customer cannot log into would be a
 * dead end on a 3G phone.
 */
export function invoiceEmailHtml(inv: Invoice, lines: InvoiceLine[]): string {
  const paragraphs = invoiceEmailLines(inv, lines);
  const rows = lines
    .slice()
    .sort((a, b) => a.position - b.position)
    .map(
      (l) =>
        `<tr><td style="padding:6px 0;font-size:14px;color:#1a1a1a">${escapeHtml(
          l.description,
        )}</td><td style="padding:6px 0;font-size:14px;text-align:right;white-space:nowrap">${escapeHtml(
          money(l.lineTotalCents),
        )}</td></tr>`,
    )
    .join("");

  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">
  <h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(invoiceEmailSubject(inv))}</h1>
  ${paragraphs
    .map((p) => `<p style="font-size:15px;line-height:1.6;margin:0 0 14px">${escapeHtml(p)}</p>`)
    .join("")}
  <table style="width:100%;border-collapse:collapse;margin:18px 0 0">${rows}
    <tr><td style="padding:10px 0 0;border-top:1px solid #ddd;font-size:15px;font-weight:bold">Total</td><td style="padding:10px 0 0;border-top:1px solid #ddd;font-size:15px;font-weight:bold;text-align:right;white-space:nowrap">${escapeHtml(
      money(inv.totalCents),
    )}</td></tr>
  </table>
  <p style="font-size:13px;color:#666;margin:18px 0 0">${escapeHtml(stateWords(inv))} · ${escapeHtml(
    inv.sellerName,
  )}, ${escapeHtml(inv.sellerAddress)}</p>
</div>`;
}
