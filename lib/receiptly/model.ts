// ── RECEIPTLY: ONE DOCUMENT, FOUR THINGS IT CAN BE ──────────────────────────
//
// A receipt, a booking confirmation, an invoice and a quote are the same page
// with different tenses. Modelling them as four documents would mean four
// layouts drifting apart; modelling them as one with a `kind` means the money
// arithmetic is written once and every document benefits from every fix.
//
// PURE. No React, no fetch, no database — so every figure that reaches a page
// a customer keeps can be checked in a test.

export const DOC_KINDS = ["receipt", "confirmation", "invoice", "quote"] as const;
export type DocKind = (typeof DOC_KINDS)[number];

export const DOC_KIND_LABEL: Record<DocKind, string> = {
  receipt: "Receipt",
  confirmation: "Booking confirmation",
  invoice: "Invoice",
  quote: "Quote",
};

/** What the hero line says under the amount, per kind and state. */
export const DOC_KIND_BLURB: Record<DocKind, string> = {
  receipt: "Payment received",
  confirmation: "Reservation details",
  invoice: "Amount due",
  quote: "Estimate — not a bill",
};

// ── MONEY ───────────────────────────────────────────────────────────────────
//
// MINOR UNITS EVERYWHERE, and every field says so in its name. This platform
// has shipped a rupee/cent confusion four times, most recently showing a
// customer "Rs 180,000" for a Rs 1,800 transfer, so the rule is not
// negotiable: a variable called `amount` may not exist.
//
// The exponent is per currency because it genuinely differs — a yen has no
// minor unit at all, and dividing one by a hundred invents a precision the
// currency does not have.

export type Currency = {
  code: string;
  symbol: string;
  /** Before or after the number, as that currency is actually written. */
  position: "before" | "after";
  /** Decimal places. 2 for most, 0 for JPY. */
  exponent: number;
  /**
   * Whether a whole amount still shows its decimals.
   *
   * "$ 45.00" is how a dollar is written and "Rs 3,600.00" is not how a rupee
   * is written — the owner's own document says "Rs 3,600". So this is a
   * property of the CURRENCY, not a formatting preference, and getting it
   * wrong makes a document look foreign in its own country.
   */
  alwaysDecimals: boolean;
  label: string;
};

export const CURRENCIES: Currency[] = [
  { code: "MUR", symbol: "Rs",  position: "before", exponent: 2, alwaysDecimals: false, label: "Mauritian rupee" },
  { code: "EUR", symbol: "€", position: "before", exponent: 2, alwaysDecimals: true,  label: "Euro" },
  { code: "USD", symbol: "$",   position: "before", exponent: 2, alwaysDecimals: true,  label: "US dollar" },
  { code: "GBP", symbol: "£", position: "before", exponent: 2, alwaysDecimals: true,  label: "Pound sterling" },
  { code: "ZAR", symbol: "R",   position: "before", exponent: 2, alwaysDecimals: true,  label: "South African rand" },
  { code: "AUD", symbol: "A$",  position: "before", exponent: 2, alwaysDecimals: true,  label: "Australian dollar" },
  { code: "CHF", symbol: "CHF", position: "before", exponent: 2, alwaysDecimals: true,  label: "Swiss franc" },
  { code: "JPY", symbol: "¥", position: "before", exponent: 0, alwaysDecimals: false, label: "Japanese yen" },
];

export function currencyByCode(code: string): Currency {
  return CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0];
}

/**
 * Minor units to the string a customer reads.
 *
 * Grouped with a plain comma and, for a zero-exponent currency, with no
 * decimal point at all. Deliberately NOT toLocaleString with a currency
 * option: that produces a narrow no-break space in a French locale, which is
 * the exact character that once printed "Rs 25?883" on a real receipt.
 */
export function formatMoney(minor: number, c: Currency): string {
  const negative = minor < 0;
  const abs = Math.abs(Math.round(minor));
  const scale = 10 ** c.exponent;
  const whole = Math.floor(abs / scale);
  const grouped = whole.toLocaleString("en-US");
  const minorPart = abs % scale;
  const body =
    c.exponent === 0 || (!c.alwaysDecimals && minorPart === 0)
      ? grouped
      : `${grouped}.${String(minorPart).padStart(c.exponent, "0")}`;
  const withSymbol =
    c.position === "before" ? `${c.symbol} ${body}` : `${body} ${c.symbol}`;
  return negative ? `-${withSymbol}` : withSymbol;
}

/** What a human types, to minor units. null when it is not a number. */
export function parseMoney(typed: string, c: Currency): number | null {
  const raw = typed.trim().replace(/\s/g, "");
  if (raw === "") return null;
  // A comma is a thousands separator only in the grouped shape; anywhere else
  // it is ambiguous — "2,50" is two-fifty in French and two-thousand-five-
  // hundred in English — and an ambiguous amount is refused rather than guessed.
  const cleaned = raw.includes(",")
    ? /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(raw)
      ? raw.replace(/,/g, "")
      : ""
    : raw;
  if (cleaned === "" || !/^\d*\.?\d*$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10 ** c.exponent);
}

// ── THE DOCUMENT ────────────────────────────────────────────────────────────

export type ReceiptlyLine = {
  description: string;
  qty: number;
  unitMinor: number;
};

export type DetailRow = { label: string; value: string };

export type Business = {
  name: string;
  tagline: string;
  website: string;
  /** A data: URL, so the document carries its own logo and needs no network. */
  logo: string | null;
  /** Hex, e.g. #0a7d3b. One accent, used sparingly. */
  accent: string;
};

export type ReceiptlyDoc = {
  kind: DocKind;
  business: Business;

  customerName: string;
  customerEmail: string;
  customerPhone: string;

  /** The headline thing being sold — an excursion, a table, a job. */
  serviceName: string;
  /** Guests, meeting point, meeting time, date — whatever applies. */
  details: DetailRow[];

  lines: ReceiptlyLine[];
  currencyCode: string;

  /** A percentage of the total. Null when the deposit is a fixed figure or none. */
  depositPct: number | null;
  /** A flat deposit in minor units. Null when it is a percentage or none. */
  depositFixedMinor: number | null;
  receivedMinor: number;

  payMethod: string;
  payReference: string;

  reference: string;
  /** ISO date. The document prints it long-form. */
  issuedOn: string;
  dueOn: string;

  notes: string;
  terms: string;
  footer: string;
};

export type ReceiptlyMoney = {
  lineTotals: number[];
  subtotalMinor: number;
  totalMinor: number;
  depositMinor: number;
  balanceAfterDepositMinor: number;
  receivedMinor: number;
  outstandingMinor: number;
};

/** One page, and no more. The renderer does not paginate. */
export const MAX_LINES = 12;

export function lineTotal(l: ReceiptlyLine): number {
  return Math.round(l.qty * l.unitMinor);
}

export function computeMoney(doc: ReceiptlyDoc): ReceiptlyMoney {
  const lines = doc.lines.slice(0, MAX_LINES);
  const lineTotals = lines.map(lineTotal);
  const subtotalMinor = lineTotals.reduce((a, b) => a + b, 0);
  const totalMinor = subtotalMinor;

  // A percentage OR a fixed figure, never both. The fixed one wins if somebody
  // manages to set both, because it is the more explicit statement.
  const depositMinor =
    doc.depositFixedMinor != null
      ? Math.min(doc.depositFixedMinor, totalMinor)
      : doc.depositPct != null
        ? Math.round((totalMinor * doc.depositPct) / 100)
        : 0;

  return {
    lineTotals,
    subtotalMinor,
    totalMinor,
    depositMinor,
    balanceAfterDepositMinor: totalMinor - depositMinor,
    receivedMinor: doc.receivedMinor,
    outstandingMinor: totalMinor - doc.receivedMinor,
  };
}

// ── STATUS ──────────────────────────────────────────────────────────────────

export type StatusTone = "paid" | "part" | "pending" | "quote";

export type DocStatus = {
  label: string;
  tone: StatusTone;
  /** One sentence under the badge. Empty when there is nothing true to add. */
  detail: string;
};

export function docStatus(doc: ReceiptlyDoc, m: ReceiptlyMoney): DocStatus {
  if (doc.kind === "quote") {
    return {
      label: "ESTIMATE",
      tone: "quote",
      detail: "This is an estimate, not a request for payment.",
    };
  }

  const hasDeposit = m.depositMinor > 0;

  if (m.totalMinor > 0 && m.receivedMinor >= m.totalMinor) {
    return {
      label: "PAID IN FULL",
      tone: "paid",
      detail:
        m.receivedMinor > m.totalMinor
          ? "More was received than was owed. The difference is returnable."
          : "Nothing further to settle.",
    };
  }

  if (m.receivedMinor <= 0) {
    return {
      label: "AWAITING PAYMENT",
      tone: "pending",
      detail: hasDeposit
        ? "This reservation is held once the deposit is received."
        : "This reservation is held once payment is received.",
    };
  }

  if (hasDeposit && m.receivedMinor >= m.depositMinor) {
    return {
      label: "DEPOSIT RECEIVED",
      tone: "part",
      detail: "The reservation is held. The balance is payable as arranged.",
    };
  }

  return {
    label: "PART PAID",
    tone: "part",
    detail: hasDeposit
      ? "This reservation is held once the deposit is received in full."
      : "This reservation is held once payment is received in full.",
  };
}

/**
 * The hero figure and its caption — the first thing a reader's eye lands on.
 *
 * It is NOT always the total. On a receipt the number that matters is what was
 * received; on an invoice it is what is still owed; on a quote it is the
 * estimate. Printing the total on all four would make a paid receipt look like
 * a bill.
 */
export function heroAmount(
  doc: ReceiptlyDoc, m: ReceiptlyMoney,
): { minor: number; caption: string } {
  switch (doc.kind) {
    case "receipt":
      return { minor: m.receivedMinor, caption: "Received with thanks" };
    case "invoice":
      return m.outstandingMinor > 0
        ? { minor: m.outstandingMinor, caption: "Amount due" }
        : { minor: m.totalMinor, caption: "Paid in full" };
    case "quote":
      return { minor: m.totalMinor, caption: "Estimated total" };
    case "confirmation":
    default:
      return m.depositMinor > 0 && m.receivedMinor < m.depositMinor
        ? { minor: m.depositMinor, caption: "Deposit to confirm" }
        : { minor: m.totalMinor, caption: "Total" };
  }
}

/**
 * A reference in the shape the owner already uses: RR-COCOS-SB.
 *
 * Built from the business initials, a slug of the service and the customer's
 * initials, because that is what he types by hand and it is genuinely more
 * useful than a counter — he can read a reference and know which trip it was.
 * Falls back to a short stamp when there is nothing to build from.
 */
export function suggestReference(
  businessName: string, serviceName: string, customerName: string, salt: string,
): string {
  const initials = (s: string) =>
    s.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").toUpperCase().slice(0, 3);

  const biz = initials(businessName) || "RR";
  const svc =
    serviceName
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z]/g, "")
      .toUpperCase()
      .slice(0, 5) || salt.toUpperCase().slice(0, 5);
  const who = initials(customerName);

  return [biz, svc, who].filter(Boolean).join("-");
}
