// ── THE INVOICE MODEL, IN TYPESCRIPT ────────────────────────────────────────
//
// Mirrors the M200 schema. Two rules carry over from the SQL and are worth
// repeating here, because this is the layer an implementer actually reads:
//
//   1. EVERY money field ends in Cents. lib/money.ts states the rule and this
//      platform has broken it four times — the admin money desk, /track, then
//      /orders, then the Activity model, where a Rs 1,800 transfer showed a
//      customer "Rs 180,000". A field called `amount` is a field that will one
//      day hold the wrong unit.
//
//   2. NOTHING here computes a total. The amount on an invoice comes from
//      invoice_issue() reading the source row in SQL. TypeScript never converts
//      a rupee column, never multiplies by 100, and never accepts an amount
//      from a caller — a caller that can pass an amount can pass the wrong one.

/** Every transaction this platform can bill. Matches invoice_subject_type. */
export const INVOICE_SUBJECTS = [
  "booking",
  "place_booking",
  "order",
  "ride_request",
  "delivery",
  "service_booking",
  "subscription_invoice",
  "managed_ticketing_agreement",
] as const;

export type InvoiceSubjectType = (typeof INVOICE_SUBJECTS)[number];

export type InvoiceState =
  | "draft"
  | "issued"
  | "part_paid"
  | "paid"
  | "void"
  | "written_off";

export type InvoiceDocKind = "invoice" | "receipt" | "credit_note";

/** One row of an invoice. line_total_cents = round(qty * unit_price_cents). */
export type InvoiceLine = {
  id: string;
  position: number;
  kind: "charge" | "discount" | "tax" | "delivery" | "deposit_applied" | "reimbursement";
  description: string;
  qty: number;
  unitPriceCents: number;
  lineTotalCents: number;
};

/** An invoice as the admin surfaces see it. Money is cents, always. */
export type Invoice = {
  id: string;
  number: string;
  docKind: InvoiceDocKind;
  subjectType: InvoiceSubjectType;
  subjectId: string;
  /** What the customer already holds: an order number, or RR-XXXXXX. */
  reference: string;

  billToName: string;
  billToEmail: string | null;
  billToPhone: string | null;

  sellerName: string;
  sellerAddress: string;

  currency: string;
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  deliveryCents: number;
  totalCents: number;
  paidCents: number;
  /** Generated column. Negative means the customer overpaid. */
  balanceCents: number;

  /**
   * The proof of conversion, carried on the row itself.
   *
   * sourceAmountRaw is the value verbatim from the source column and
   * sourceAmountUnit says which unit that column is in. A CHECK in the database
   * asserts they agree with sourceTotalCents, so a unit mistake is a failed
   * INSERT rather than a wrong figure on a document a customer keeps.
   */
  sourceAmountUnit: "rupees" | "cents";
  sourceAmountRaw: number;
  sourceTotalCents: number;

  state: InvoiceState;
  issuedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
};
