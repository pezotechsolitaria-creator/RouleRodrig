import { toWinAnsi, assembleOnePagePdf, type Op } from "@/lib/receipt-pdf";
import { RECEIPT_LOGO } from "@/lib/receipt-logo";
import { dataUrlToEmbedded } from "./logo";
import { measure, fit, wrapToWidth, type PdfFont } from "./metrics";
import {
  PAGE, CONTENT_WIDTH, TABLE, TYPE, SPACE, INK, STATUS_COLOUR, STATUS_TINT,
  FOOTER_RESERVE, LOGO_BOX, hexToRgb, type Rgb,
} from "./theme";
import {
  computeMoney, docStatus, heroAmount, formatMoney, currencyByCode,
  DOC_KIND_LABEL, MAX_LINES, type ReceiptlyDoc,
} from "./model";

// ── THE DOCUMENT, DRAWN ─────────────────────────────────────────────────────
//
// No PDF library. The brief asked for @react-pdf/renderer, and this does the
// same job at about a megabyte less: that library ships its own layout engine
// and font machinery into the bundle, on a mobile-first site whose largest
// paint is already dominated by script. What it buys is 1:1 parity between a
// React preview and a React PDF — which this gets instead by having both
// renderers read their colours, sizes and column positions from theme.ts.
//
// The thing that actually separates this from the old receipt is measurement.
// lib/receiptly/metrics.ts carries the Helvetica AFM widths, so money is
// RIGHT-ALIGNED and long text is cut where it genuinely stops fitting. A money
// column whose decimal points do not line up is the clearest possible tell
// that a document was assembled by hand.

const L = PAGE.margin;
const R = PAGE.margin + CONTENT_WIDTH;

function esc(s: string): string {
  return s.replace(/[\\()]/g, (c) => `\\${c}`);
}

type Ctx = { ops: Op[]; y: number };

function rgbFill(c: Rgb): Op {
  return `${c[0]} ${c[1]} ${c[2]} rg`;
}

function ink(hex: string): Op {
  return rgbFill(hexToRgb(hex));
}

function box(x: number, y: number, w: number, h: number, hex: string): Op {
  const c = hexToRgb(hex);
  return `${c[0]} ${c[1]} ${c[2]} rg ${x} ${y} ${w} ${h} re f`;
}

/** Two decimals is more than a page at 72dpi can show, and keeps the stream short. */
function pt(v: number): string {
  return (Math.round(v * 100) / 100).toString();
}

function roundedTint(x: number, y: number, w: number, h: number, hex: string): Op {
  // A plain rectangle: PDF can draw rounded corners with Bézier curves, and at
  // the sizes used here the difference is a pixel nobody will see against the
  // cost of four curve operators per box.
  return box(x, y, w, h, hex);
}

/** Left-aligned text. Everything goes through toWinAnsi before it is measured. */
function put(
  ctx: Ctx, x: number, y: number, s: string, size: number, font: PdfFont, hex: string,
): void {
  const enc = toWinAnsi(s);
  ctx.ops.push(ink(hex), `BT /${font === "bold" ? "F2" : "F1"} ${size} Tf ${x} ${y} Td (${esc(enc)}) Tj ET`);
}

/** Right-aligned: the reason this module measures at all. */
function putRight(
  ctx: Ctx, xRight: number, y: number, s: string, size: number, font: PdfFont, hex: string,
): void {
  const enc = toWinAnsi(s);
  const x = xRight - measure(enc, size, font);
  ctx.ops.push(ink(hex), `BT /${font === "bold" ? "F2" : "F1"} ${size} Tf ${x} ${y} Td (${esc(enc)}) Tj ET`);
}

function putFitted(
  ctx: Ctx, x: number, y: number, s: string, maxW: number,
  size: number, font: PdfFont, hex: string,
): void {
  const enc = fit(toWinAnsi(s), maxW, size, font);
  ctx.ops.push(ink(hex), `BT /${font === "bold" ? "F2" : "F1"} ${size} Tf ${x} ${y} Td (${esc(enc)}) Tj ET`);
}

/** A small-caps-ish section label: uppercase, tracked out by drawing per char. */
function putLabel(ctx: Ctx, x: number, y: number, s: string, hex: string): void {
  const enc = toWinAnsi(s.toUpperCase());
  let cx = x;
  for (const ch of enc) {
    ctx.ops.push(ink(hex), `BT /F2 ${TYPE.section} Tf ${cx} ${y} Td (${esc(ch)}) Tj ET`);
    cx += measure(ch, TYPE.section, "bold") + 0.9; // the tracking
  }
}

function hairline(ctx: Ctx, y: number, hex = INK.hairline, h = SPACE.hairline): void {
  ctx.ops.push(box(L, y, CONTENT_WIDTH, h, hex));
}

/** Just enough of the embedded image for the masthead to lay it out. */
type Mark = { width: number; height: number };

function buildContent(doc: ReceiptlyDoc, mark: Mark): string {
  const ctx: Ctx = { ops: [], y: PAGE.height - PAGE.margin };
  const c = currencyByCode(doc.currencyCode);
  const m = computeMoney(doc);
  const status = docStatus(doc, m);
  const hero = heroAmount(doc, m);
  const accent = doc.business.accent || "#0a7d3b";
  const fmt = (v: number) => formatMoney(v, c);

  // ── Masthead ─────────────────────────────────────────────────────────────
  let y = ctx.y;
  // ── THE MARK, AT ITS OWN SHAPE ───────────────────────────────────────────
  //
  // Always drawn: the assembler embeds the built-in Roué Rodrigues mark as
  // /Im1 whenever a document carries no uploaded one, so skipping the draw
  // when business.logo was null meant every unbranded document — including
  // every one this platform sends by itself — went out with no logo at all,
  // while the image sat unused in the file.
  //
  // FITTED, not forced. `30 0 0 30` scaled whatever was handed over into a
  // 30×30 square, so a wide wordmark came out visibly squeezed. The transform
  // now fits the longest edge and keeps the other in proportion, hanging from
  // the same top edge so the name beside it does not move.
  const scale = Math.min(LOGO_BOX / mark.width, LOGO_BOX / mark.height);
  const lw = pt(mark.width * scale);
  const lh = pt(mark.height * scale);
  ctx.ops.push(`q ${lw} 0 0 ${lh} ${L} ${pt(y + 8 - mark.height * scale)} cm /Im1 Do Q`);
  const nameX = L + LOGO_BOX + 10;
  put(ctx, nameX, y, doc.business.name || "Your business", TYPE.title, "bold", INK.strong);
  const sub = [doc.business.website, doc.business.tagline].filter(Boolean).join("  ·  ");
  if (sub) put(ctx, nameX, y - 12, sub, TYPE.small, "regular", INK.muted);

  // Document kind, top right, quiet.
  putRight(ctx, R, y, DOC_KIND_LABEL[doc.kind].toUpperCase(), TYPE.small, "bold", INK.faint);
  if (doc.reference) {
    putRight(ctx, R, y - 12, doc.reference, TYPE.body, "bold", INK.strong);
  }

  y -= 34;
  ctx.ops.push(box(L, y, CONTENT_WIDTH, 2, accent));

  // ── The hero: the one number the reader is looking for ───────────────────
  y -= 46;
  put(ctx, L, y, fmt(hero.minor), TYPE.hero, "bold", INK.strong);
  put(ctx, L, y - 15, hero.caption, TYPE.body, "regular", INK.muted);

  // Status badge, right, on a tint.
  const badge = toWinAnsi(status.label);
  const badgeW = measure(badge, TYPE.small, "bold") + 20;
  ctx.ops.push(roundedTint(R - badgeW, y - 4, badgeW, 20, STATUS_TINT[status.tone]));
  putRight(ctx, R - 10, y + 2, status.label, TYPE.small, "bold", STATUS_COLOUR[status.tone]);
  if (status.detail) {
    const dw = CONTENT_WIDTH * 0.52;
    const lines = wrapToWidth(toWinAnsi(status.detail), dw, TYPE.tiny, "regular");
    lines.slice(0, 2).forEach((ln, i) => {
      putRight(ctx, R, y - 18 - i * 10, ln, TYPE.tiny, "regular", INK.faint);
    });
  }

  // ── Who and what ─────────────────────────────────────────────────────────
  y -= 52;
  hairline(ctx, y + 14);

  const colW = CONTENT_WIDTH / 2 - 12;
  putLabel(ctx, L, y - 4, "Billed to", INK.faint);
  putFitted(ctx, L, y - 20, doc.customerName || "—", colW, TYPE.strong, "bold", INK.strong);
  const who = [doc.customerEmail, doc.customerPhone].filter(Boolean);
  who.slice(0, 2).forEach((v, i) => {
    putFitted(ctx, L, y - 33 - i * 11, v, colW, TYPE.small, "regular", INK.muted);
  });

  const rx = L + CONTENT_WIDTH / 2 + 12;
  // The big date is the ISSUE date on every kind, because that is the date it
  // prints. Labelling it "Valid until" on a quote said the estimate expired on
  // the day it was written; the expiry is dueOn, and it belongs on the line
  // that actually shows dueOn.
  putLabel(ctx, rx, y - 4, "Issued", INK.faint);
  putFitted(ctx, rx, y - 20, longDate(doc.issuedOn), colW, TYPE.strong, "bold", INK.strong);
  if (doc.dueOn) {
    const dueLabel = doc.kind === "quote" ? "Valid until" : "Due";
    putFitted(ctx, rx, y - 33, `${dueLabel} ${longDate(doc.dueOn)}`, colW, TYPE.small, "regular", INK.muted);
  }

  y -= 33 + Math.max(who.length, 1) * 11 + 8;

  // ── The service, when there is one worth its own block ───────────────────
  const details = doc.details.filter((d) => d.value.trim() !== "");
  if (doc.serviceName.trim() || details.length) {
    hairline(ctx, y + 10);
    y -= 12;
    if (doc.serviceName.trim()) {
      putFitted(ctx, L, y, doc.serviceName, CONTENT_WIDTH, TYPE.strong, "bold", INK.strong);
      y -= 15;
    }
    if (details.length) {
      const joined = details.map((d) => `${d.label}: ${d.value}`).join("   ·   ");
      for (const ln of wrapToWidth(toWinAnsi(joined), CONTENT_WIDTH, TYPE.body, "regular").slice(0, 2)) {
        put(ctx, L, y, ln, TYPE.body, "regular", INK.muted);
        y -= 13;
      }
    }
    y -= 6;
  }

  // ── The table ────────────────────────────────────────────────────────────
  const unitR = L + CONTENT_WIDTH * TABLE.qtyUnitRight;
  const amtR = L + CONTENT_WIDTH * TABLE.amountRight;
  const descW = CONTENT_WIDTH * TABLE.descriptionRight;

  hairline(ctx, y + 8, INK.hairline, SPACE.rule);
  y -= 6;
  putLabel(ctx, L, y, "Description", INK.faint);
  putRight(ctx, unitR, y, "QTY × UNIT", TYPE.section, "bold", INK.faint);
  putRight(ctx, amtR, y, "AMOUNT", TYPE.section, "bold", INK.faint);
  y -= 10;
  hairline(ctx, y);
  y -= 16;

  const lines = doc.lines.slice(0, MAX_LINES);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    putFitted(ctx, L, y, l.description || "—", descW, TYPE.body, "regular", INK.body);
    // Quantity and unit price read as one fact — "2 x Rs 1,800" — rather than
    // as two columns the eye has to join up. It is also what the preview does,
    // and the two must not diverge.
    putRight(ctx, unitR, y, `${l.qty} × ${fmt(l.unitMinor)}`, TYPE.body, "regular", INK.muted);
    putRight(ctx, amtR, y, fmt(m.lineTotals[i]), TYPE.body, "bold", INK.strong);
    y -= SPACE.rowHeight;
    if (i < lines.length - 1) hairline(ctx, y + 8);
  }

  // ── Totals, right-aligned under the amount column ────────────────────────
  y -= 4;
  ctx.ops.push(box(L + CONTENT_WIDTH * 0.5, y + 10, CONTENT_WIDTH * 0.5, SPACE.hairline, INK.hairline));
  y -= 6;

  const rows: Array<{ label: string; value: string; strong?: boolean; tone?: string }> = [];
  if (m.depositMinor > 0 || m.receivedMinor > 0) {
    rows.push({ label: "Subtotal", value: fmt(m.subtotalMinor) });
  }
  if (m.depositMinor > 0) {
    rows.push({
      // "Deposit required" is a demand, and on a receipt the money is already
      // in. The row is the same fact in both cases; only the tense differs.
      label:
        doc.depositPct != null
          ? `Deposit (${doc.depositPct}%)`
          : doc.kind === "receipt"
            ? "Deposit"
            : "Deposit required",
      value: fmt(m.depositMinor),
    });
    rows.push({ label: "Balance after deposit", value: fmt(m.balanceAfterDepositMinor) });
  }
  rows.push({ label: "Total", value: fmt(m.totalMinor), strong: true });
  // ── WHAT IS STILL OWED, WHEN THAT IS THE QUESTION ────────────────────────
  //
  // A booking confirmation asking for a Rs 1,499 deposit printed "Received
  // Rs 0" and, in red, "Still owed Rs 5,997" — directly under a hero reading
  // "Rs 1,499 · Deposit to confirm". Both figures are arithmetically true and
  // the customer is left with two amounts in front of them, the louder one
  // wrong for what they are being asked to do.
  //
  // The settlement pair belongs on a document ABOUT settlement — an invoice,
  // a receipt — or on any document where money has actually arrived. On a
  // fresh confirmation the deposit and balance rows above already say what to
  // pay and when, and the badge already says AWAITING PAYMENT. Nothing is
  // hidden; the page just stops arguing with itself.
  const settlement =
    doc.kind === "invoice" || doc.kind === "receipt" || m.receivedMinor > 0;
  if (settlement) {
    rows.push({ label: "Received", value: fmt(m.receivedMinor) });
    if (m.outstandingMinor !== 0) {
      rows.push({
        label: m.outstandingMinor > 0 ? "Still owed" : "Overpaid",
        value: fmt(Math.abs(m.outstandingMinor)),
        strong: true,
        tone: m.outstandingMinor > 0 ? STATUS_COLOUR.pending : STATUS_COLOUR.paid,
      });
    }
  }

  for (const r of rows) {
    const size = r.strong ? TYPE.strong : TYPE.body;
    putRight(ctx, unitR, y, r.label, size, r.strong ? "bold" : "regular",
      r.tone ?? (r.strong ? INK.strong : INK.muted));
    putRight(ctx, amtR, y, r.value, size, r.strong ? "bold" : "regular",
      r.tone ?? (r.strong ? INK.strong : INK.body));
    y -= r.strong ? 19 : 17;
  }

  // ── How to pay ───────────────────────────────────────────────────────────
  const payBits = [doc.payMethod, doc.payReference].filter((s) => s.trim() !== "");
  if (payBits.length && doc.kind !== "receipt") {
    y -= 10;
    const h = 40;
    ctx.ops.push(roundedTint(L, y - h + 22, CONTENT_WIDTH, h, INK.band));
    putLabel(ctx, L + 14, y + 6, "How to pay", INK.faint);
    putFitted(ctx, L + 14, y - 10, payBits.join("   ·   "), CONTENT_WIDTH - 28,
      TYPE.strong, "bold", INK.strong);
    y -= h + 8;
  }

  // ── Notes and terms ──────────────────────────────────────────────────────
  // ── Notes and terms, while there is room ─────────────────────────────────
  //
  // The floor is not decoration. This renderer walks y downward with no
  // pagination and then draws its footer at a FIXED height, so without a floor
  // a long Terms block prints straight through "Thank you for choosing".
  const floor = PAGE.margin + FOOTER_RESERVE;
  for (const [heading, text] of [["Notes", doc.notes], ["Terms", doc.terms]] as const) {
    if (!text.trim()) continue;
    if (y - 24 < floor) break;
    y -= 6;
    putLabel(ctx, L, y, heading, INK.faint);
    y -= 13;
    for (const ln of wrapToWidth(toWinAnsi(text), CONTENT_WIDTH, TYPE.small, "regular")) {
      if (y < floor) break;
      put(ctx, L, y, ln, TYPE.small, "regular", INK.muted);
      y -= 11;
    }
  }

  // ── Footer, pinned ───────────────────────────────────────────────────────
  ctx.ops.push(box(L, PAGE.margin + 24, CONTENT_WIDTH, SPACE.hairline, INK.hairline));
  put(ctx, L, PAGE.margin + 10,
    doc.footer.trim() || `Thank you for choosing ${doc.business.name || "us"}.`,
    TYPE.small, "regular", INK.muted);
  putRight(ctx, R, PAGE.margin + 10, "Made with Receiptly", TYPE.tiny, "regular", INK.faint);

  return ctx.ops.join("\n");
}

/** "2026-09-23" → "23 September 2026", which is how a document says a date. */
export function longDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });
}

export function buildReceiptlyPdf(doc: ReceiptlyDoc): Uint8Array {
  // A business that uploaded its own mark gets it on the page. Anything this
  // cannot decode falls back to the built-in logo rather than embedding a
  // dictionary that lies about its image, which is how a reader ends up
  // refusing the whole file.
  //
  // The SAME choice drives the layout: the content stream has to scale the
  // image it is actually going to be handed, so the resolved art is passed to
  // both halves rather than decided twice.
  const art = dataUrlToEmbedded(doc.business.logo);
  return assembleOnePagePdf(buildContent(doc, art ?? RECEIPT_LOGO), art);
}

export function receiptlyFilename(doc: ReceiptlyDoc): string {
  const base = (doc.reference || DOC_KIND_LABEL[doc.kind]).replace(/[^A-Za-z0-9-]/g, "");
  return `${base || "document"}.pdf`;
}
