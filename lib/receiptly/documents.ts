import {
  MAX_LINES,
  type Business,
  type DetailRow,
  type DocKind,
  type ReceiptlyDoc,
  type ReceiptlyLine,
} from "./model";

// ── THE DOCUMENT A CUSTOMER GETS WITHOUT ASKING ─────────────────────────────
//
// Receiptly started as a desk: the owner types a booking and downloads a PDF.
// This file is the other half — every booking this platform takes builds the
// same document by itself, and it travels attached to the email the customer
// was already going to receive.
//
// PURE. No fetch, no database, no server-only import, so every figure that
// reaches a page a customer keeps is checked in a test rather than in
// production. The callers do the reading; this does the arithmetic.
//
// ── WHY NOTHING HERE IS SAVED ───────────────────────────────────────────────
//
// The studio saves: the owner types figures nothing else holds, so the row IS
// the record. These documents are the opposite — every figure on one is read
// back out of the booking it describes, so the document is reproducible from
// the booking forever and a stored copy would be a second answer to a question
// that already has one. email_log records that it was sent.
//
// It also keeps a gap-free counter and a database write out of the path of a
// customer email. A booking confirmation that fails because a sequence was
// busy is a worse outcome than a document without a number.

/**
 * Who the document is from.
 *
 * Deliberately a constant and not a read of invoice_settings.receiptly_profile:
 * that profile is what the OWNER starts a hand-made document from, and it can
 * be half-filled or empty. These documents go out unattended, on the path of an
 * email that must not fail, so they carry the house identity — the same one
 * blankDoc() opens the studio with, which is why draft.ts imports it from here
 * rather than repeating it.
 *
 * `logo: null` is not a missing logo. The PDF assembler embeds the built-in
 * Roulé Rodrigues mark whenever a document carries no uploaded one, so null is
 * how a document asks for the house mark.
 */
export const HOUSE: Business = {
  name: "Roulé Rodrigues",
  tagline: "Take the long way",
  website: "roulerodrig.com",
  logo: null,
  accent: "#0a7d3b",
};

/**
 * Today on Rodrigues, as a document dates itself.
 *
 * NOT `new Date().toISOString().slice(0, 10)`. The island is UTC+4, so between
 * midnight and 04:00 local that spelling returns YESTERDAY — a document handed
 * over at one in the morning prints the wrong day, and on 1 January it prints
 * a year that the number beside it disagrees with, because receiptly_doc_save()
 * takes its year from `now() at time zone 'Indian/Mauritius'`.
 *
 * en-CA is the locale whose short date IS ISO, which is what the date input and
 * the database column both want.
 */
export function islandToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Indian/Mauritius",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

// ── UNITS ───────────────────────────────────────────────────────────────────
//
// This platform stores money in two units and the same column name carries
// both. lib/invoicing/subjects.ts is the map, measured against live rows; this
// file obeys it and never re-derives it:
//
//   bookings.total_amount / deposit_amount / delivery_fee / amount_paid  RUPEES
//   place_bookings.deposit_amount                                        RUPEES
//   ride_requests.quoted_price                                           CENTS
//   orders.total / subtotal / tax / delivery_fee                         CENTS
//
// Every adapter below names its money parameters after the unit it expects —
// `totalRupees`, `fareCents` — so a caller handing over the wrong column reads
// wrong at the call site rather than 100× wrong on a customer's document.

/** Whole rupees → minor units. */
export const rupeesToMinor = (rupees: number): number => Math.round(rupees * 100);

/**
 * Cents → minor units.
 *
 * The identity function, and it exists anyway. "Minor units" and "cents" are
 * the same thing only for a currency whose exponent is 2; naming the unit at
 * every call site is what stops the next reader from assuming the conversion
 * is always a no-op and reaching for a yen.
 */
export const centsToMinor = (cents: number): number => Math.round(cents);

/**
 * One line whose total is EXACTLY the figure the customer was quoted.
 *
 * The obvious spelling — qty × (total / qty) — is a rounding bug waiting for a
 * price that does not divide: three nights of Rs 2,500 split across a Rs 7,499
 * stay makes the document's total disagree with the email it is attached to,
 * by a rupee, forever. So the quantity is only broken out when it divides
 * exactly, and otherwise the count moves into the description where it is
 * still readable and cannot be multiplied.
 */
export function lineFromTotal(
  description: string,
  quantity: number,
  totalMinor: number,
): ReceiptlyLine {
  const qty = Math.max(1, Math.round(quantity));
  const total = Math.round(totalMinor);
  const unit = total / qty;
  if (qty > 1 && Number.isInteger(unit)) {
    return { description, qty, unitMinor: unit };
  }
  return {
    description: qty > 1 ? `${qty} × ${description}` : description,
    qty: 1,
    unitMinor: total,
  };
}

/** Details are joined onto at most two lines by the renderer — keep them short. */
function detailsOf(pairs: [string, string | null | undefined][]): DetailRow[] {
  return pairs
    .filter((p): p is [string, string] => typeof p[1] === "string" && p[1].trim() !== "")
    .slice(0, 6)
    .map(([label, value]) => ({ label, value }));
}

type Seed = {
  kind: DocKind;
  reference: string;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  serviceName: string;
  details: DetailRow[];
  lines: ReceiptlyLine[];
  depositPct?: number | null;
  depositFixedMinor?: number | null;
  receivedMinor?: number;
  payMethod?: string;
  payReference?: string;
  issuedOn: string;
  dueOn?: string;
  notes?: string;
  terms?: string;
  footer?: string;
};

function houseDoc(seed: Seed): ReceiptlyDoc {
  return {
    kind: seed.kind,
    business: { ...HOUSE },
    customerName: seed.customerName.trim(),
    customerEmail: (seed.customerEmail ?? "").trim(),
    customerPhone: (seed.customerPhone ?? "").trim(),
    serviceName: seed.serviceName.trim(),
    details: seed.details,
    lines: seed.lines.slice(0, MAX_LINES),
    currencyCode: "MUR",
    depositPct: seed.depositPct ?? null,
    depositFixedMinor: seed.depositFixedMinor ?? null,
    receivedMinor: Math.max(0, Math.round(seed.receivedMinor ?? 0)),
    payMethod: seed.payMethod ?? "",
    payReference: seed.payReference ?? "",
    reference: seed.reference,
    issuedOn: seed.issuedOn,
    dueOn: seed.dueOn ?? "",
    notes: seed.notes ?? "",
    terms: seed.terms ?? "",
    footer: seed.footer ?? "",
  };
}

/**
 * A deposit, expressed the way it will print truthfully.
 *
 * A percentage reads better on the page — "Deposit (25%)" says why the figure
 * is what it is — but computeMoney() recomputes it from the total, so quoting a
 * percentage that does not reproduce the STORED deposit to the rupee would put
 * a figure on the document that the email beside it contradicts. The percentage
 * is therefore used only when it lands exactly, and the stored figure wins
 * otherwise.
 */
function depositBasis(
  totalMinor: number,
  depositMinor: number | null,
  pct: number | null | undefined,
): { depositPct: number | null; depositFixedMinor: number | null } {
  if (depositMinor == null || depositMinor <= 0) return { depositPct: null, depositFixedMinor: null };
  if (pct != null && pct > 0 && Math.round((totalMinor * pct) / 100) === depositMinor) {
    return { depositPct: pct, depositFixedMinor: null };
  }
  return { depositPct: null, depositFixedMinor: depositMinor };
}

/**
 * A date a customer reads, and every character of it printable.
 *
 * The range separator is an EN DASH and not an arrow. WinAnsiEncoding — what
 * the PDF's fonts are declared with — has no U+2192, so "→" reached the page
 * as a literal question mark: "2026-10-01 ? 2026-10-05". The en dash is in the
 * encoding, is what a date range is written with anyway, and lib/receipt-pdf
 * already maps it for exactly this reason.
 */
const shortDate = (iso: string): string => {
  if (!iso || iso.length < 10) return iso;
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
};

const dates = (start: string, end: string): string =>
  !start ? "" : end && end !== start
    ? `${shortDate(start)} – ${shortDate(end)}`
    : shortDate(start);

// ── VEHICLE RENTALS (bookings) ──────────────────────────────────────────────

export type VehicleDocInput = {
  /** quote before the owner has checked the vehicle; confirmation once he has;
   *  receipt once the money is in. */
  kind: Extract<DocKind, "quote" | "confirmation" | "receipt">;
  reference: string;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  vehicle: string;
  startDate: string;
  endDate: string;
  pickupTime?: string | null;
  days: number;
  /** bookings.total_amount — WHOLE RUPEES. Null means no document. */
  totalRupees: number | null | undefined;
  /** bookings.delivery_fee — WHOLE RUPEES. Part of the total, itemised out. */
  deliveryRupees?: number | null;
  /** bookings.deposit_amount — WHOLE RUPEES. */
  depositRupees?: number | null;
  depositPct?: number | null;
  /** bookings.amount_paid — WHOLE RUPEES. */
  paidRupees?: number | null;
  issuedOn: string;
  /** bookings.payment_due_by, as a date. */
  dueOn?: string;
  pay?: { method: string; reference: string } | null;
  notes?: string;
};

/**
 * A vehicle rental, itemised the way the email itemises it.
 *
 * The rental and the delivery are separate lines because the customer is shown
 * them separately — summaryRows() in lib/email.ts prints "Rental · Location (N
 * days)" and "Delivery · Livraison" — and a document that merges what the email
 * splits invites the question of which one is right.
 */
export function vehicleRentalDoc(input: VehicleDocInput): ReceiptlyDoc | null {
  if (typeof input.totalRupees !== "number" || input.totalRupees <= 0) return null;

  const totalMinor = rupeesToMinor(input.totalRupees);
  const deliveryMinor = rupeesToMinor(Math.max(0, input.deliveryRupees ?? 0));
  const rentalMinor = totalMinor - deliveryMinor;
  const days = Math.max(1, Math.round(input.days || 1));

  const lines: ReceiptlyLine[] = [
    lineFromTotal(`${input.vehicle} — ${days} day${days === 1 ? "" : "s"}`, days, rentalMinor),
  ];
  if (deliveryMinor > 0) {
    lines.push({ description: "Delivery and collection", qty: 1, unitMinor: deliveryMinor });
  }

  const depositMinor =
    typeof input.depositRupees === "number" && input.depositRupees > 0
      ? rupeesToMinor(input.depositRupees)
      : null;

  return houseDoc({
    kind: input.kind,
    reference: input.reference,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    customerPhone: input.customerPhone,
    serviceName: input.vehicle,
    details: detailsOf([
      ["Dates", dates(input.startDate, input.endDate)],
      ["Pickup", input.pickupTime ?? null],
    ]),
    lines,
    // ── AN ESTIMATE ASKS FOR NOTHING ──────────────────────────────────────
    //
    // A quote goes out with the REQUEST email, which says in as many words
    // that no payment is due and that nobody has checked the vehicle is free
    // yet. "Deposit required Rs 1,499" under a badge reading ESTIMATE is the
    // contradiction that email was rewritten to remove — a customer who acts
    // on the document instead of the paragraph wires money for a vehicle
    // nobody has confirmed. The deposit appears once it is real, on the
    // confirmation.
    ...(input.kind === "quote"
      ? { depositPct: null, depositFixedMinor: null }
      : depositBasis(totalMinor, depositMinor, input.depositPct)),
    receivedMinor:
      typeof input.paidRupees === "number" && input.paidRupees > 0
        ? rupeesToMinor(input.paidRupees)
        : 0,
    payMethod: input.pay?.method ?? "",
    payReference: input.pay?.reference ?? "",
    issuedOn: input.issuedOn,
    dueOn: input.dueOn,
    notes: input.notes ?? "",
  });
}

// ── STAYS, TABLES AND EXPERIENCES (place_bookings) ──────────────────────────

export type PlaceDocInput = {
  kind: Extract<DocKind, "quote" | "confirmation" | "receipt">;
  reference: string;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  placeName: string;
  category?: string | null;
  startDate: string;
  endDate: string;
  timeSlot?: string | null;
  guests?: number | null;
  quantity?: number | null;
  /**
   * place_bookings.deposit_amount — WHOLE RUPEES, and despite its name it is
   * the WHOLE PRICE. Activities stopped being deposit-and-balance on
   * 2026-08-13; lib/defaults.ts says it plainly: "this number is the whole
   * price and nothing is owed later". The document must never call it a
   * deposit, which is why nothing below sets one.
   */
  priceRupees: number | null | undefined;
  paidRupees?: number | null;
  issuedOn: string;
  dueOn?: string;
  pay?: { method: string; reference: string } | null;
  notes?: string;
};

export function placeReservationDoc(input: PlaceDocInput): ReceiptlyDoc | null {
  if (typeof input.priceRupees !== "number" || input.priceRupees <= 0) return null;

  const isStay = (input.category ?? "").toLowerCase() === "hotel";
  const qty = Math.max(1, Math.round(input.quantity ?? 1));

  // ── ONE LINE, QUANTITY ONE ────────────────────────────────────────────────
  //
  // The stored figure is flat per RESERVATION, not per person and not per
  // night: /api/place-bookings resolves it server-side and says so — "Flat per
  // reservation, not per person: a boat charter is priced by the boat and there
  // is no per-head field to multiply by", and for a stay quoteStay() has
  // already multiplied the nights in. Splitting it back out by guests would
  // print a per-head rate this business has never charged. Several listings'
  // own price notes already say "per person" while the stored price is flat —
  // that discrepancy is the owner's to resolve in his wording, and inventing
  // arithmetic here would bury it.
  const lines: ReceiptlyLine[] = [
    { description: input.placeName, qty: 1, unitMinor: rupeesToMinor(input.priceRupees) },
  ];

  return houseDoc({
    kind: input.kind,
    reference: input.reference,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    customerPhone: input.customerPhone,
    serviceName: input.placeName,
    details: detailsOf([
      [isStay ? "Stay" : "Date", dates(input.startDate, input.endDate)],
      ["Time", input.timeSlot ?? null],
      [
        isStay ? "Rooms" : "Places",
        qty > 1 ? String(qty) : null,
      ],
      ["Guests", input.guests ? String(input.guests) : null],
    ]),
    lines,
    receivedMinor:
      typeof input.paidRupees === "number" && input.paidRupees > 0
        ? rupeesToMinor(input.paidRupees)
        : 0,
    payMethod: input.pay?.method ?? "",
    payReference: input.pay?.reference ?? "",
    issuedOn: input.issuedOn,
    dueOn: input.dueOn,
    notes: input.notes ?? "",
  });
}

// ── RIDES (ride_requests) ───────────────────────────────────────────────────

export type RideDocInput = {
  reference: string;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  serviceLabel: string;
  pickup: string;
  dropoff?: string | null;
  whenLabel?: string | null;
  passengers?: number | null;
  /** ride_requests.quoted_price — CENTS. Null means no document. */
  fareCents: number | null | undefined;
  issuedOn: string;
};

/**
 * A ride, as an ESTIMATE and never as a bill.
 *
 * The money never touches this platform: the customer's own confirmation email
 * says "You pay the driver directly at the end of the trip — nothing is charged
 * here", and a document headed anything but ESTIMATE would contradict the
 * message it is attached to. The note repeats that sentence rather than
 * paraphrasing it, so the two cannot drift.
 */
export function rideDoc(input: RideDocInput): ReceiptlyDoc | null {
  if (typeof input.fareCents !== "number" || input.fareCents <= 0) return null;

  // An en dash, not an arrow: see shortDate() above. WinAnsi has no U+2192,
  // so "Plaine Corail ? Port Mathurin" is what reached the page.
  const journey = input.dropoff ? `${input.pickup} – ${input.dropoff}` : input.pickup;

  return houseDoc({
    kind: "quote",
    reference: input.reference,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    customerPhone: input.customerPhone,
    serviceName: input.serviceLabel,
    details: detailsOf([
      ["When", input.whenLabel ?? null],
      ["Passengers", input.passengers ? String(input.passengers) : null],
    ]),
    lines: [{ description: journey, qty: 1, unitMinor: centsToMinor(input.fareCents) }],
    issuedOn: input.issuedOn,
    notes:
      "You pay the driver directly at the end of the trip — nothing is charged here.",
  });
}

// ── MARKETPLACE ORDERS (orders) ─────────────────────────────────────────────

export type OrderDocInput = {
  kind: Extract<DocKind, "confirmation" | "receipt">;
  orderNumber: string;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  items: {
    name: string;
    variant?: string | null;
    quantity: number;
    /** order_items.line_total — CENTS. */
    lineTotalCents: number;
  }[];
  /** orders.delivery_fee — CENTS. */
  deliveryFeeCents?: number | null;
  /** orders.tax — CENTS. */
  taxCents?: number | null;
  /** orders.total — CENTS. The figure every line below must add up to. */
  totalCents: number;
  paidCents?: number | null;
  fulfillmentLabel?: string | null;
  storeName?: string | null;
  issuedOn: string;
};

/** Items, fees and tax all fit on one page only so far. */
const ITEM_LINE_BUDGET = MAX_LINES - 3;

/**
 * A shop order, adding up to orders.total and to nothing else.
 *
 * The renderer has no pagination, so a long basket is collapsed rather than
 * silently cut: the lines that do not fit become one "N further items" row
 * carrying their combined total. Whatever is left over after items, delivery
 * and tax becomes an explicit adjustment row — because a document whose lines
 * do not reach its total is a document the customer will add up by hand and
 * find wrong.
 */
export function marketplaceOrderDoc(input: OrderDocInput): ReceiptlyDoc | null {
  if (!Number.isFinite(input.totalCents) || input.totalCents <= 0) return null;

  const lines: ReceiptlyLine[] = [];
  const shown = input.items.slice(0, ITEM_LINE_BUDGET);
  const hidden = input.items.slice(ITEM_LINE_BUDGET);

  for (const it of shown) {
    const name = it.variant ? `${it.name} (${it.variant})` : it.name;
    lines.push(lineFromTotal(name, it.quantity, centsToMinor(it.lineTotalCents)));
  }
  if (hidden.length) {
    const rest = hidden.reduce((sum, it) => sum + centsToMinor(it.lineTotalCents), 0);
    lines.push({
      description: `${hidden.length} further item${hidden.length === 1 ? "" : "s"}`,
      qty: 1,
      unitMinor: rest,
    });
  }

  const delivery = centsToMinor(input.deliveryFeeCents ?? 0);
  if (delivery > 0) lines.push({ description: "Delivery", qty: 1, unitMinor: delivery });
  const tax = centsToMinor(input.taxCents ?? 0);
  if (tax > 0) lines.push({ description: "Tax", qty: 1, unitMinor: tax });

  const totalMinor = centsToMinor(input.totalCents);
  const accounted = lines.reduce((sum, l) => sum + Math.round(l.qty * l.unitMinor), 0);
  if (accounted !== totalMinor) {
    lines.push({ description: "Adjustment", qty: 1, unitMinor: totalMinor - accounted });
  }

  return houseDoc({
    kind: input.kind,
    reference: input.orderNumber,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    customerPhone: input.customerPhone,
    serviceName: input.storeName ?? "",
    details: detailsOf([["Fulfilment", input.fulfillmentLabel ?? null]]),
    lines,
    receivedMinor:
      typeof input.paidCents === "number" && input.paidCents > 0
        ? centsToMinor(input.paidCents)
        : 0,
    issuedOn: input.issuedOn,
  });
}
