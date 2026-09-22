import {
  PAGE_W, MARGIN, BLACK, YELLOW, GREEN, RED,
  text, rect, strokeRect, gray, wrap, clamp,
  assembleOnePagePdf, type Op,
} from "@/lib/receipt-pdf";
import { RECEIPT_LOGO } from "@/lib/receipt-logo";
import { centsToDisplay } from "@/lib/money";
import {
  bookingDocMoney, bookingDocStatus, bookingDocHeading, bookingDocNote,
  MAX_LINES, type BookingDocLine,
} from "./model";

// ── THE BOOKING CONFIRMATION, AS A PAGE ─────────────────────────────────────
//
// A second LAYOUT over the renderer that already exists — not a second
// renderer. The header (logo, wordmark, site line, date and ref on the right,
// a yellow rule under it) and the footer line are the ones lib/receipt-pdf.ts
// has always drawn, which is why the owner's mock-up looks like this platform:
// he built it from the receipt he already sends.
//
// What is new here is the middle: a four-column table, a money summary, and a
// bordered payment-status panel. Those needed two primitives the file did not
// have — strokeRect() for the border and a RED constant — and nothing else.
//
// ── NO RIGHT-ALIGNMENT, ON PURPOSE ─────────────────────────────────────────
//
// Money in the numeric columns is placed at a FIXED left x, not right-aligned.
// Right-aligning would need a Helvetica width table, and receipt-pdf.ts says
// in as many words why it does not ship one. Every figure in a column is
// formatted the same way — "Rs 1,800", "Rs 3,600" — so a fixed left edge lines
// them up anyway, which is exactly what the owner's own document does.

/** Rs, the way the rest of the platform writes it. */
export function money(cents: number): string {
  return `Rs ${centsToDisplay(cents)}`;
}

export type BookingDocDetail = { label: string; value: string };

export type BookingDocData = {
  /** The owner's own reference, typed. Shown as the customer sees it. */
  ref: string;
  /** The register's number, e.g. RR-BKG-2026-000001. Printed small, beneath. */
  number?: string | null;
  guestName: string;
  /** Experience, Guests, Meeting point, Meeting time, Date — whichever are known. */
  details: BookingDocDetail[];
  lines: BookingDocLine[];
  depositPct: number | null;
  receivedCents: number;
  /** "MCB Juice: 58363401" — the seller's own words, from settings. Never hard-coded. */
  payInstruction?: string | null;
  /** Replaces the generated note when the owner wants to say something else. */
  note?: string | null;
};

// Column x positions. The content band runs MARGIN (56) to PAGE_W - MARGIN
// (539), and these split it the way the owner's document does.
const COL_SERVICE = MARGIN + 10;
const COL_QTY = 330;
const COL_UNIT = 386;
const COL_TOTAL = 466;
/** 56 to 320 at 10pt is about 50 characters; 44 leaves a gap before Qty. */
const SERVICE_CHARS = 44;

const DETAIL_VALUE_X = MARGIN + 150;
const HAIRLINE: [number, number, number] = [0.88, 0.88, 0.88];
const BAND: [number, number, number] = [0.96, 0.96, 0.96];
const AMBER: [number, number, number] = [0.76, 0.55, 0.11];

function toneColour(tone: "pending" | "part" | "paid"): [number, number, number] {
  return tone === "paid" ? GREEN : tone === "part" ? AMBER : RED;
}

function rgbOp(c: [number, number, number]): Op {
  return `${c[0]} ${c[1]} ${c[2]} rg`;
}

function buildContent(d: BookingDocData, dateLabel: string): string {
  const ops: Op[] = [];
  let y = 841.89 - MARGIN;

  const m = bookingDocMoney({
    lines: d.lines.slice(0, MAX_LINES),
    depositPct: d.depositPct,
    receivedCents: d.receivedCents,
  });
  const hasDeposit = d.depositPct != null && d.depositPct > 0;
  const status = bookingDocStatus(m, hasDeposit);

  // ── Header: the one this platform already uses ───────────────────────────
  const LOGO = 34;
  ops.push(`q ${LOGO} 0 0 ${LOGO} ${MARGIN} ${y - LOGO + 10} cm /Im1 Do Q`);
  const TX = MARGIN + LOGO + 10;
  ops.push(BLACK, text(TX, y, 17, "F2", "ROULE RODRIGUES"));
  // The middle dot and the accents are the owner's own, and toWinAnsi has a
  // byte for every one of them — the ASCII in the older receipt was a choice
  // made before that encoder existed, not a limit.
  ops.push(gray(0.4), text(TX, y - 15, 9, "F1", "roulerodrig.com · Rodrigues Island"));
  ops.push(gray(0.4), text(COL_QTY + 90, y, 9, "F1", dateLabel));
  ops.push(gray(0.4), text(COL_QTY + 90, y - 13, 9, "F1", `Booking Ref: ${clamp(d.ref, 22)}`));
  if (d.number) {
    ops.push(gray(0.6), text(COL_QTY + 90, y - 25, 7.5, "F1", clamp(d.number, 24)));
  }

  y -= 30;
  ops.push(rect(MARGIN, y, PAGE_W - MARGIN * 2, 2.5, YELLOW));

  // ── Heading ──────────────────────────────────────────────────────────────
  y -= 34;
  ops.push(BLACK, text(MARGIN, y, 13, "F2", bookingDocHeading(m)));

  // ── Who and what ─────────────────────────────────────────────────────────
  y -= 26;
  const details: BookingDocDetail[] = [
    { label: "Guest", value: d.guestName },
    ...d.details.filter((r) => r.value.trim() !== ""),
  ];
  for (const r of details) {
    ops.push(gray(0.35), text(MARGIN, y, 9.5, "F1", clamp(r.label, 24)));
    ops.push(BLACK, text(DETAIL_VALUE_X, y, 10.5, "F2", clamp(r.value, 46)));
    ops.push(rect(MARGIN, y - 7, PAGE_W - MARGIN * 2, 0.5, HAIRLINE));
    y -= 21;
  }

  // ── What is being charged for ────────────────────────────────────────────
  y -= 8;
  ops.push(rect(MARGIN, y - 8, PAGE_W - MARGIN * 2, 26, BAND));
  ops.push(gray(0.4));
  ops.push(text(COL_SERVICE, y, 9, "F1", "Service"));
  ops.push(text(COL_QTY, y, 9, "F1", "Qty"));
  ops.push(text(COL_UNIT, y, 9, "F1", "Unit price"));
  ops.push(text(COL_TOTAL, y, 9, "F1", "Total"));
  ops.push(rect(MARGIN, y - 8, PAGE_W - MARGIN * 2, 0.8, YELLOW));
  y -= 26;

  d.lines.slice(0, MAX_LINES).forEach((l, i) => {
    ops.push(BLACK, text(COL_SERVICE, y, 10, "F1", clamp(l.description, SERVICE_CHARS)));
    ops.push(text(COL_QTY, y, 10, "F1", String(l.qty)));
    ops.push(text(COL_UNIT, y, 10, "F1", money(l.unitPriceCents)));
    ops.push(text(COL_TOTAL, y, 10, "F2", money(m.lineTotals[i])));
    ops.push(rect(MARGIN, y - 8, PAGE_W - MARGIN * 2, 0.5, HAIRLINE));
    y -= 22;
  });

  // ── The money, in the order somebody checks it ───────────────────────────
  y -= 6;
  ops.push(rect(MARGIN, y + 14, PAGE_W - MARGIN * 2, 1.2, [0, 0, 0]));
  y -= 4;

  const summary: Array<{ label: string; value: string; strong?: boolean }> = [
    { label: "TOTAL", value: money(m.totalCents), strong: true },
  ];
  if (hasDeposit) {
    summary.push(
      { label: `Deposit required (${d.depositPct}%)`, value: money(m.depositCents), strong: true },
      { label: "Balance after deposit", value: money(m.balanceAfterDepositCents) },
    );
  }
  // "Amount received Rs 0" IS PRINTED, deliberately, and this is a real
  // difference from the invoice. moneyRows() in lib/invoicing/document.ts
  // suppresses a zero paid line because "Paid Rs 0" on a fresh invoice reads
  // as a failed payment. On a booking confirmation the zero is the whole
  // message: it is the line that tells the guest the seat is not yet held.
  summary.push({ label: "Amount received", value: money(m.receivedCents), strong: true });

  for (const r of summary) {
    ops.push(BLACK, text(MARGIN, y, 10, "F1", clamp(r.label, 40)));
    ops.push(text(COL_UNIT, y, r.strong ? 11 : 10, r.strong ? "F2" : "F1", r.value));
    ops.push(rect(MARGIN, y - 8, PAGE_W - MARGIN * 2, 0.5, HAIRLINE));
    y -= 22;
  }

  // ── PAYMENT STATUS, in a box, because it is the line people look for ─────
  y -= 14;
  const boxH = d.payInstruction ? 62 : 48;
  ops.push(strokeRect(MARGIN, y - boxH + 16, PAGE_W - MARGIN * 2, boxH, YELLOW, 1.2));
  ops.push(BLACK, text(MARGIN + 14, y, 10, "F2", "PAYMENT STATUS"));
  ops.push(rgbOp(toneColour(status.tone)), text(MARGIN + 190, y, 10.5, "F2", status.label));
  if (d.payInstruction) {
    ops.push(
      rgbOp(toneColour(status.tone)),
      text(MARGIN + 190, y - 14, 10, "F2", clamp(d.payInstruction, 40)),
    );
  }
  ops.push(gray(0.35), text(MARGIN + 14, y - (d.payInstruction ? 32 : 18), 9, "F1",
    clamp(status.detail, 88)));
  y -= boxH + 10;

  // ── The note, built from the figures rather than typed again ─────────────
  const note = d.note?.trim() || bookingDocNote(m, hasDeposit, money);
  ops.push(gray(0.3));
  for (const line of wrap(note, 96)) {
    ops.push(text(MARGIN, y, 9, "F1", line));
    y -= 12;
  }

  // ── Footer, pinned to the bottom ─────────────────────────────────────────
  ops.push(rect(MARGIN, MARGIN + 22, PAGE_W - MARGIN * 2, 0.5, HAIRLINE));
  ops.push(
    gray(0.6),
    text(MARGIN, MARGIN + 8, 8.5, "F1",
      "Thank you for choosing Roulé Rodrigues — take the long way."),
  );

  return ops.join("\n");
}

export function buildBookingDocPdf(d: BookingDocData, now: Date = new Date()): Uint8Array {
  const dateLabel = now.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return assembleOnePagePdf(buildContent(d, dateLabel));
}

/** What the owner will look for in his downloads folder. */
export function bookingDocFilename(ref: string): string {
  return `${ref.replace(/[^A-Za-z0-9-]/g, "") || "booking"}.pdf`;
}

// Referenced so the logo import is not dropped as unused by a bundler that
// cannot see the `/Im1 Do` string above.
export const LOGO_WIDTH = RECEIPT_LOGO.width;
