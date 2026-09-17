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
//     (no live row to measure, so proved from four render sites instead:
//      rupeesToCents() in lib/activity.ts and app/api/admin/money, and
//      "Rs {amount}" printed with no division in lib/email.ts twice)
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
    // M210. The entry here used to read "amount would have to be entered by
    // hand", and that was simply wrong: deposit_amount is written once, at
    // INSERT, from a server-resolved listing price the client cannot touch,
    // and nothing writes it afterwards — the same property that made
    // deliveries.customer_fee safe to bill.
    //
    // THE NAME IS A FOSSIL. It stopped being a deposit on 2026-08-13, when the
    // owner made activities payable in full at booking. lib/defaults.ts: "this
    // number is the whole price and nothing is owed later". The document must
    // never call it a deposit.
    supported: true,
  },
  service_booking: {
    table: "service_bookings",
    amountColumn: null,
    unit: "none",
    label: "Service",
    supported: false,
    // NOT a "not yet" — a "never, as the business works today". The platform
    // is not the payee. components/shop/BookService.tsx tells the customer at
    // the moment of booking: "Nothing to pay now — you settle it with them."
    // trade_providers has no commission, fee or take-rate column, so this
    // money never touches Roule Rodrigues, and an invoice would go out under
    // invoice_settings.legal_name for a debt owed to a car wash.
    //
    // The amount looks readable through variant_id -> product_variants.price
    // and is not: nothing is snapshotted onto the booking, the merchant can
    // rewrite that price at any time, and the FK is ON DELETE SET NULL — so a
    // price read today for a March booking is a different figure, or none.
    // There is no email column either; the public door takes a name and a
    // phone. M200 already wrote this verdict into a constraint by excluding
    // service_booking from invoices_not_above_source.
    pending:
      "the platform is not the payee — the customer is told at booking that they settle it with the provider",
  },
  subscription_invoice: {
    table: "subscription_invoices",
    amountColumn: "amount",
    unit: "cents",
    label: "Merchant subscription",
    supported: false,
    // The money IS readable — amount is cents and non-null — and that is not
    // the problem. A DOCUMENT ALREADY EXISTS for these exact rows:
    // components/merchant/InvoicePdfButton.tsx builds a PDF headed
    // "Subscription invoice" carrying the reference, plan, period and amount,
    // and app/merchant/(app)/subscription/page.tsx mounts it twice, so any
    // merchant can download one today. Issuing RR-INV numbers over the same
    // rows would be a second document for one debt — the failure M208 was
    // written to prevent, arriving from the other direction.
    //
    // There is also no payer to address: merchants.contact_email is NULL on
    // every live merchant, and all four rows belong to one test shop, one of
    // them for Rs 0.
    pending: "merchants already download a subscription invoice from their own page",
  },
  managed_ticketing_agreement: {
    table: "managed_ticketing_agreements",
    amountColumn: "invoiced_fee_cents",
    unit: "cents",
    label: "Ticketing fee",
    supported: false,
    // Two blockers, and the second is the dangerous one.
    //
    // No figure: invoiced_fee_cents is frozen by an existing billing run
    // (admin_set_managed_ticketing_payment moves payment_status to 'invoiced'
    // and stamps the basis, the fee and the date). It is NULL on both live
    // agreements, so an adapter reading it would refuse every row that exists.
    // Computing the fee instead would be a second implementation that can
    // disagree with the database's own — and for a percentage fee it would
    // disagree by construction, because the basis moves with ticket sales
    // until the freeze.
    //
    // NO PAYER, AND A TRAP WHERE ONE LOOKS LIKE IT IS. The agreement carries
    // no name, email or phone. The obvious join — store_id -> stores.
    // merchant_id -> merchants.contact_email — resolves to the SYSTEM-OWNED
    // merchant that M40 gave every event store, so it would address the
    // invoice to Roule Rodrigues itself. And invoiced_basis_cents must never
    // be billed: it is the organiser's own ticket revenue, buyers' money owed
    // TO them.
    pending: "no fee has ever been set, and the agreement names no payer",
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
