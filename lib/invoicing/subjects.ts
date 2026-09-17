import type { InvoiceSubjectType } from "./types";

// ── THE UNIT MAP, IN ONE PLACE ──────────────────────────────────────────────
//
// This platform stores money in two units and the same field name carries
// both. It has shipped as a live 100x bug four times. The knowledge of which
// table is in which unit was, until now, spread across renderers, adapters and
// people's memories — which is exactly why each fix caught one case and missed
// the next.
//
// It lives here. One table, readable in ten seconds, checked against the live
// rows rather than against column names:
//
//   bookings.total_amount        5997      = Rs 5,997     RUPEES
//   place_bookings.deposit_amount           (0 rows)      RUPEES
//   orders.total                 75000     = Rs 750       CENTS
//   deliveries.customer_fee      30000     = Rs 300       CENTS
//     (rendered with centsToDecimalString() on the admin board, and
//      driver_earning + platform_fee equals it on every live row)
//   ride_requests.quoted_price   180000    = Rs 1,800     CENTS
//     (8 priced rides span 25000..180000 — Rs 250 to Rs 1,800, which is what
//      an island transfer costs. A rupee reading makes the cheapest taxi
//      Rs 25,000, so the unit is not in doubt.)
//
// The conversion itself does NOT happen here. invoice_issue() does it in SQL,
// once, and the invoice row carries the proof. This map exists so a human can
// see the shape, and so `supported` can gate a subject before the RPC has to.

export type SubjectAdapter = {
  /** The table invoice_issue() reads. */
  table: string;
  /** The column holding the authoritative total. Null when there is none. */
  amountColumn: string | null;
  /**
   * The unit that column is in.
   *
   * "none" means the table has no money column at all — a service_booking is
   * settled with the provider on the day. Such a subject can still be invoiced
   * one day, but the amount would have to be entered rather than read, which
   * is a different and more dangerous kind of adapter.
   */
  unit: "rupees" | "cents" | "none";
  /** What the document calls this, in English. */
  label: string;
  /** Does invoice_issue() handle it yet? Phase 1 ships two. */
  supported: boolean;
  /** Why not, when it does not — so the refusal can say something useful. */
  pending?: string;
};

/**
 * Every subject, exhaustively.
 *
 * Record<InvoiceSubjectType, …> is the point: adding a member to
 * INVOICE_SUBJECTS without adding it here is a tsc error, not a runtime
 * surprise on a document a customer is holding.
 */
export const SUBJECTS: Record<InvoiceSubjectType, SubjectAdapter> = {
  booking: {
    table: "bookings",
    amountColumn: "total_amount",
    unit: "rupees",
    label: "Vehicle rental",
    supported: true,
  },
  order: {
    table: "orders",
    amountColumn: "total",
    unit: "cents",
    label: "Order",
    supported: true,
  },
  ride_request: {
    table: "ride_requests",
    amountColumn: "quoted_price",
    unit: "cents",
    label: "Taxi or transfer",
    // M203. The line is the quoted fare and nothing else: there is no distance
    // column to break a fare down by, and inventing kilometres to fill a table
    // would put a figure on a customer's document that nothing supports.
    supported: true,
  },
  delivery: {
    table: "deliveries",
    // customer_fee, NOT payment_amount. The column's own database comment is
    // the authority: payment_amount is "what the customer says they
    // transferred ... their claim, not a verified figure" — an unconfirmed
    // claim about paying THIS fee, NULL on every live row. If a transfer is
    // real it becomes a payment against the invoice, never the invoice itself.
    // M208 bills the fee and says on the document that the shopping is not
    // part of it.
    amountColumn: "customer_fee",
    unit: "cents",
    label: "Delivery",
    supported: true,
  },
  place_booking: {
    table: "place_bookings",
    amountColumn: "deposit_amount",
    unit: "rupees",
    label: "Experience or stay",
    supported: false,
    // Zero rows ever. There is no pricing module behind it, so the amount is
    // whatever the operator agreed and has to be entered rather than read.
    pending: "no transactions yet — amount would have to be entered by hand",
  },
  service_booking: {
    table: "service_bookings",
    amountColumn: null,
    unit: "none",
    label: "Service",
    supported: false,
    pending: "settled with the provider on the day; no money column",
  },
  subscription_invoice: {
    table: "subscription_invoices",
    amountColumn: "amount",
    unit: "cents",
    label: "Merchant subscription",
    supported: false,
    pending: "merchant billing, not a customer document",
  },
  managed_ticketing_agreement: {
    table: "managed_ticketing_agreements",
    amountColumn: "invoiced_fee_cents",
    unit: "cents",
    label: "Ticketing fee",
    supported: false,
    pending: "fee is NULL on every live agreement",
  },
};

/** The subjects invoice_issue() will actually accept today. */
export function supportedSubjects(): InvoiceSubjectType[] {
  return (Object.keys(SUBJECTS) as InvoiceSubjectType[]).filter(
    (k) => SUBJECTS[k].supported,
  );
}

/** Narrowing guard for anything arriving over the wire. */
export function isInvoiceSubject(v: unknown): v is InvoiceSubjectType {
  return typeof v === "string" && v in SUBJECTS;
}
