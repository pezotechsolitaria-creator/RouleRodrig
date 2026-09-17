import type { Invoice, InvoiceLine, InvoicePayment, InvoiceState, InvoiceSubjectType } from "./types";

// ── ONE PLACE WHERE A DATABASE ROW BECOMES AN INVOICE ───────────────────────
//
// Every route that reads an invoice used to spell this mapping out again. Two
// copies of a money mapping is how paid_cents ends up read from the right
// column in one route and a stale one in another, and nothing fails: both
// compile, both return a number, and only the figure is wrong.
//
// PURE — no client, no fetch — so the mapping itself is testable.

type Row = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const nul = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0));

/**
 * A row from `invoices`.
 *
 * Every *_cents field is passed through untouched. There is no arithmetic in
 * this file and there must never be: the database is the authority on the
 * figure, and a conversion here would be a second opinion about a unit that is
 * already settled on the row.
 */
export function toInvoice(r: Row): Invoice {
  return {
    id: str(r.id),
    number: str(r.number),
    docKind: str(r.doc_kind) as Invoice["docKind"],
    subjectType: str(r.subject_type) as InvoiceSubjectType,
    subjectId: str(r.subject_id),
    reference: str(r.reference),

    billToName: str(r.bill_to_name),
    billToEmail: nul(r.bill_to_email),
    billToPhone: nul(r.bill_to_phone),

    sellerName: str(r.seller_name),
    sellerAddress: str(r.seller_address),

    currency: str(r.currency),
    subtotalCents: num(r.subtotal_cents),
    discountCents: num(r.discount_cents),
    taxCents: num(r.tax_cents),
    deliveryCents: num(r.delivery_cents),
    totalCents: num(r.total_cents),
    paidCents: num(r.paid_cents),
    balanceCents: num(r.balance_cents),

    sourceAmountUnit: str(r.source_amount_unit) as Invoice["sourceAmountUnit"],
    sourceAmountRaw: num(r.source_amount_raw),
    sourceTotalCents: num(r.source_total_cents),

    state: str(r.state) as InvoiceState,
    issuedAt: nul(r.issued_at),
    dueAt: nul(r.due_at),
    paidAt: nul(r.paid_at),
    sentAt: nul(r.sent_at),
    sentTo: nul(r.sent_to),
    sendCount: num(r.send_count),
    notes: nul(r.notes),
    createdAt: str(r.created_at),
  };
}

/** A row from `invoice_lines`. qty is numeric(12,3) and PostgREST sends it as a string. */
export function toLine(r: Row): InvoiceLine {
  return {
    id: str(r.id),
    position: num(r.position),
    kind: str(r.kind) as InvoiceLine["kind"],
    description: str(r.description),
    qty: num(r.qty),
    unitPriceCents: num(r.unit_price_cents),
    lineTotalCents: num(r.line_total_cents),
  };
}

/** A row from `invoice_payments`. */
export function toPayment(r: Row): InvoicePayment {
  return {
    id: str(r.id),
    amountCents: num(r.amount_cents),
    method: str(r.method),
    receivedAt: str(r.received_at),
    externalRef: nul(r.external_ref),
    note: nul(r.note),
    recordedBy: str(r.recorded_by),
  };
}
