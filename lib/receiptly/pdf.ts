import { toWinAnsi, assembleOnePagePdf, type Op } from "@/lib/receipt-pdf";
import { RECEIPT_LOGO } from "@/lib/receipt-logo";
import { dataUrlToEmbedded } from "./logo";
import { measure, measureTracked, fit, wrapToWidth, type PdfFont } from "./metrics";
import {
  PAGE, CONTENT_WIDTH, RIGHT, AXIS, TABLE, TYPE, TRACK, SPACE, INK, STATUS_COLOUR,
  FOOTER_RESERVE, LOGO_BOX, Y, FLOW_TOP, hexToRgb, type Rgb,
} from "./theme";
import {
  computeMoney, docStatus, heroAmount, formatMoney, currencyByCode,
  DOC_KIND_LABEL, MAX_LINES, type DetailRow, type ReceiptlyDoc,
} from "./model";

// ── THE DOCUMENT, DRAWN ─────────────────────────────────────────────────────
//
// No PDF library. The brief asked for @react-pdf/renderer, and this does the
// same job at about a megabyte less: that library ships its own layout engine
// and font machinery into the bundle, on a mobile-first site whose largest
// paint is already dominated by script. What it buys is 1:1 parity between a
// React preview and a React PDF — which this gets instead by having both
// renderers read their colours, sizes, axes and baselines from theme.ts.
//
// The thing that actually separates this from the old receipt is measurement.
// lib/receiptly/metrics.ts carries the Helvetica AFM widths, so money is
// RIGHT-ALIGNED and long text is cut where it genuinely stops fitting. A money
// column whose figures do not line up is the clearest possible tell that a
// document was assembled by hand.
//
// ── ENGRAVED, NOT STYLED ────────────────────────────────────────────────────
//
// This page has no coloured rectangles on it. It used to have three — a tinted
// status pill, a tinted "how to pay" band, and a 2pt green bar under the
// masthead — and between them they carried the most visual weight on the sheet
// while conveying the least information. A pill is browser chrome; a tint is
// what a layout reaches for when the type is not doing the work; a brand
// colour that appears once, on a divider, is a stripe rather than branding,
// and in greyscale it is a meaningless dark bar.
//
// What replaces them is geometry the renderer can actually draw: four 0.5pt
// ink hairlines, three vertical axes, and a frozen skeleton of baselines that
// does not move between documents.

const L = PAGE.margin;

function esc(s: string): string {
  return s.replace(/[\\()]/g, (c) => `\\${c}`);
}

type Ctx = { ops: Op[] };

/** From-top coordinates, because that is how a page is read and specified. */
const yOf = (fromTop: number): number => PAGE.height - fromTop;

/** An axis, as an absolute x. */
const axis = (i: 0 | 1 | 2): number => L + CONTENT_WIDTH * AXIS[i];

/** Two decimals is more than a page at 72dpi can show, and keeps the stream short. */
function pt(v: number): string {
  return (Math.round(v * 100) / 100).toString();
}

function rgbFill(c: Rgb): Op {
  return `${c[0]} ${c[1]} ${c[2]} rg`;
}

function ink(hex: string): Op {
  return rgbFill(hexToRgb(hex));
}

function box(x: number, yFromTop: number, w: number, h: number, hex: string): Op {
  const c = hexToRgb(hex);
  return `${c[0]} ${c[1]} ${c[2]} rg ${pt(x)} ${pt(yOf(yFromTop))} ${pt(w)} ${pt(h)} re f`;
}

type Draw = {
  x: number;
  /** From the top of the page. */
  y: number;
  text: string;
  size: number;
  font: PdfFont;
  hex: string;
  track?: number;
  /** Right-align to this x instead of starting at it. */
  right?: boolean;
  /** Clip to this width with an ellipsis. */
  maxW?: number;
};

/**
 * One text run.
 *
 * `Tc` is emitted for a tracked run and reset immediately after, because it is
 * part of the graphics state and would otherwise leak into every string drawn
 * afterwards — which is a whole document set in tracked type.
 */
function put(ctx: Ctx, d: Draw): void {
  let enc = toWinAnsi(d.text);
  if (d.maxW != null) enc = fit(enc, d.maxW, d.size, d.font);
  if (!enc) return;
  const track = d.track ?? 0;
  const x = d.right ? d.x - measureTracked(enc, d.size, d.font, track) : d.x;
  const f = d.font === "bold" ? "F2" : "F1";
  ctx.ops.push(
    ink(d.hex),
    `BT ${track ? `${pt(track)} Tc ` : ""}/${f} ${d.size} Tf ${pt(x)} ${pt(yOf(d.y))} Td (${esc(enc)}) Tj${track ? " 0 Tc" : ""} ET`,
  );
}

/** THE only label role: bold, all caps, tracked, muted. */
function label(ctx: Ctx, x: number, y: number, text: string, right = false): void {
  put(ctx, {
    x, y, text: text.toUpperCase(), size: TYPE.label, font: "bold",
    hex: INK.muted, track: TRACK.label, right,
  });
}

/** A label above a value, on one of the three axes. The page's one field module. */
function field(
  ctx: Ctx, x: number, yLabel: number, yValue: number,
  name: string, value: string, maxW: number, bold = false,
): void {
  if (!value.trim()) return;
  label(ctx, x, yLabel, name);
  put(ctx, {
    x, y: yValue, text: value, size: bold ? TYPE.strong : TYPE.body,
    font: bold ? "bold" : "regular", hex: INK.ink, maxW,
  });
}

function rule(ctx: Ctx, yFromTop: number): void {
  ctx.ops.push(box(L, yFromTop, CONTENT_WIDTH, SPACE.rule, INK.hairline));
}

type Mark = { width: number; height: number };

/** The widest a field on one of the three axes may be. */
const FIELD_W = CONTENT_WIDTH / 3 - 14;

function buildContent(doc: ReceiptlyDoc, mark: Mark): string {
  const ctx: Ctx = { ops: [] };
  const c = currencyByCode(doc.currencyCode);
  const m = computeMoney(doc);
  const status = docStatus(doc, m);
  const hero = heroAmount(doc, m);
  const fmt = (v: number) => formatMoney(v, c);
  /** Bare, because the column head says RS once for the whole numeric field. */
  const bare = (v: number) => fmt(v).replace(/^[^\d-]+\s*/, "");

  // ══ FROZEN ZONE ══════════════════════════════════════════════════════════
  // Every baseline below is an absolute from theme.Y. Nothing here moves
  // because of content, which is what makes two of these look like the same
  // stationery rather than two templates.

  // ── Masthead ─────────────────────────────────────────────────────────────
  // The mark is ALWAYS drawn: the assembler embeds the built-in one whenever a
  // document carries no upload, so skipping the draw left an unbranded
  // document with no logo and an unused image sitting in the file. Fitted to
  // its own aspect rather than forced into a square.
  const scale = Math.min(LOGO_BOX / mark.width, LOGO_BOX / mark.height);
  const lw = mark.width * scale;
  const lh = mark.height * scale;
  ctx.ops.push(
    `q ${pt(lw)} 0 0 ${pt(lh)} ${pt(L)} ${pt(yOf(Y.logoTop + lh))} cm /Im1 Do Q`,
  );
  const nameX = L + LOGO_BOX + 12;

  put(ctx, {
    x: nameX, y: Y.brand, text: doc.business.name || "Your business",
    size: TYPE.brand, font: "bold", hex: INK.ink, track: TRACK.brand,
    maxW: CONTENT_WIDTH * 0.55,
  });
  // The tagline is gone. Marketing copy between a business name and a payment
  // reference weakens both; what a guest with a problem needs at 9pm is a way
  // to reach somebody.
  put(ctx, {
    x: nameX, y: Y.contact, text: doc.business.website,
    size: TYPE.fine, font: "regular", hex: INK.muted, maxW: CONTENT_WIDTH * 0.55,
  });

  // Right half of the masthead, on the SAME two baselines as the left half.
  // Four text items on four unrelated baselines was the actual defect here.
  label(ctx, RIGHT, Y.brand, DOC_KIND_LABEL[doc.kind], true);
  put(ctx, {
    x: RIGHT, y: Y.contact, text: doc.reference, size: TYPE.strong, font: "bold",
    hex: INK.ink, track: TRACK.reference, right: true, maxW: CONTENT_WIDTH * 0.4,
  });

  rule(ctx, Y.rule1);

  // ── The one figure ───────────────────────────────────────────────────────
  // Caption ABOVE the number, which is the difference between a receipt and a
  // poster: the reader never sees the figure before knowing what it is.
  label(ctx, L, Y.heroCaption, hero.caption);
  put(ctx, {
    x: L, y: Y.hero, text: fmt(hero.minor), size: TYPE.hero, font: "bold",
    hex: INK.ink, track: TRACK.hero,
  });
  // The status is a WORD, not a badge. The explanatory sentence that used to
  // sit under the badge is gone too: the word and the pay block already say
  // it, and a third statement in the smallest type on the page is anxiety
  // rather than service.
  put(ctx, {
    x: L, y: Y.status, text: status.label, size: TYPE.strong, font: "bold",
    hex: STATUS_COLOUR[status.tone], track: TRACK.status,
  });

  // ── Who, and when ────────────────────────────────────────────────────────
  field(ctx, axis(0), Y.metaLabel, Y.metaValue, "Billed to", doc.customerName || "—", FIELD_W, true);
  const contact = [doc.customerEmail, doc.customerPhone].filter(Boolean);
  contact.slice(0, 2).forEach((v, i) => {
    put(ctx, {
      x: axis(0), y: Y.metaValue + SPACE.leadMeta * (i + 1), text: v,
      size: TYPE.body, font: "regular", hex: INK.muted, maxW: FIELD_W,
    });
  });
  field(ctx, axis(1), Y.metaLabel, Y.metaValue, "Issued", longDate(doc.issuedOn), FIELD_W, true);
  field(
    ctx, axis(2), Y.metaLabel, Y.metaValue,
    doc.kind === "quote" ? "Valid until" : "Due",
    doc.dueOn ? longDate(doc.dueOn) : "", FIELD_W, true,
  );

  // ── What it is for ───────────────────────────────────────────────────────
  //
  // Label-above-value fields on the same three axes, NOT a " · "-joined line.
  // That chain flattened structured key/value data the system already holds
  // into prose that cannot be scanned, wrapped or aligned with anything.
  //
  // Six slots across two frozen rows. An empty slot stays white and nothing
  // below it moves.
  const details = doc.details.filter((d) => d.value.trim() !== "");
  const slots: (DetailRow | null)[] = [
    doc.serviceName.trim() ? { label: "Service", value: doc.serviceName } : null,
    ...details.slice(0, 5).map((d) => d as DetailRow),
  ];
  slots.forEach((slot, i) => {
    if (!slot) return;
    const row = i < 3 ? 0 : 1;
    const col = (i % 3) as 0 | 1 | 2;
    const isService = i === 0;
    if (isService) {
      label(ctx, axis(0), Y.serviceLabel[0], slot.label);
      // The service name is the one field allowed a second line, and the line
      // is reserved whether or not it is used.
      const lines = wrapToWidth(toWinAnsi(slot.value), FIELD_W, TYPE.strong, "bold").slice(0, 2);
      lines.forEach((ln, j) => {
        put(ctx, {
          x: axis(0), y: j === 0 ? Y.serviceValue[0] : Y.serviceWrap, text: ln,
          size: TYPE.strong, font: "bold", hex: INK.ink,
        });
      });
      return;
    }
    field(
      ctx, axis(col), Y.serviceLabel[row], Y.serviceValue[row],
      slot.label, slot.value, FIELD_W,
    );
  });

  // ── Column heads ─────────────────────────────────────────────────────────
  // "AMOUNT · RS" states the currency ONCE for the whole numeric field, so the
  // rows below carry bare numerals. Helvetica's digits are all 556/1000, which
  // makes a column of them genuinely tabular.
  const unitR = L + CONTENT_WIDTH * TABLE.qtyUnitRight;
  const amtR = L + CONTENT_WIDTH * TABLE.amountRight;
  const descW = CONTENT_WIDTH * TABLE.descriptionRight;
  label(ctx, L, Y.columnHeads, "Description");
  label(ctx, unitR, Y.columnHeads, `Qty × Unit`, true);
  label(ctx, amtR, Y.columnHeads, `Amount · ${c.code}`, true);
  rule(ctx, Y.rule2);

  // ══ FLOW ZONE ════════════════════════════════════════════════════════════
  let y = FLOW_TOP;
  const floor = PAGE.height - PAGE.margin - FOOTER_RESERVE;

  // ── The table ────────────────────────────────────────────────────────────
  // No rule between rows. 22pt of pitch separates them better than a hairline
  // does, and a rule per row is exported-spreadsheet styling — at 21pt against
  // 9.5pt text the old rows were visually heavier than the data in them.
  const lines = doc.lines.slice(0, MAX_LINES);
  const pitch = lines.length > 8 ? 19 : SPACE.rowPitch;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    put(ctx, {
      x: L, y, text: l.description || "—", size: TYPE.body, font: "regular",
      hex: INK.ink, maxW: descW,
    });
    // A quantity of one needs no arithmetic shown: "1 x 300" beside "300" is
    // the same fact twice, and a column of them turns the numeric field into
    // noise. The rate appears only where it is doing work.
    if (l.qty !== 1) {
      put(ctx, {
        x: unitR, y, text: `${l.qty} × ${bare(l.unitMinor)}`, size: TYPE.body,
        font: "regular", hex: INK.muted, right: true,
      });
    }
    put(ctx, {
      x: amtR, y, text: bare(m.lineTotals[i]), size: TYPE.body, font: "regular",
      hex: INK.ink, right: true,
    });
    y += pitch;
  }

  // ── The ladder ───────────────────────────────────────────────────────────
  //
  // EVERY LINE WHOSE VALUE IS ZERO OR ABSENT IS OMITTED. Six unconditional
  // rows used to restate the same two numbers up to three times; "Balance
  // after deposit" and "Total" three lines apart is genuinely ambiguous about
  // which figure to hand over; and "Still owed", in red, is accusatory copy to
  // give somebody who has just paid you.
  //
  // What is left is at most one settlement line, called "Amount due" — the
  // same words as the hero's caption, so the big number at the top and the
  // last line at the bottom are demonstrably the same money.
  y += 10;
  const labelR = L + CONTENT_WIDTH * TABLE.ladderLabelRight;
  ctx.ops.push(box(labelR - 40, y - 6, amtR - labelR + 40, SPACE.rule, INK.hairline));
  y += 22;

  type Row = { label: string; value: number; strong?: boolean; hex?: string };
  const rows: Row[] = [];
  if (lines.length > 1 && (m.depositMinor > 0 || m.receivedMinor > 0)) {
    rows.push({ label: "Subtotal", value: m.subtotalMinor });
  }
  // The deposit row is dropped when "Paid" below is about to state the same
  // figure. Two labels for one number is the ambiguity this ladder was
  // rebuilt to remove.
  if (m.depositMinor > 0 && m.depositMinor !== m.receivedMinor) {
    rows.push({
      label: doc.depositPct != null ? `Deposit (${doc.depositPct}%)` : "Deposit",
      value: m.depositMinor,
    });
  }
  rows.push({ label: "Total", value: m.totalMinor, strong: true });
  // ONE settlement line, and only when it says something the Total does not.
  //
  // It is labelled with the HERO'S OWN CAPTION whenever the two figures are
  // the same money, so the big number at the top of the page and the last line
  // at the bottom are demonstrably about one thing. "Deposit to confirm" up
  // there and "Amount due" down here is two names for one figure, which is
  // exactly the ambiguity the old six-row ladder was full of.
  // "Amount due" on a RECEIPT would read as "pay this now" to somebody who has
  // just paid; what is left on a deposit receipt is a balance settled later,
  // as the email says. Elsewhere the line takes the HERO'S OWN CAPTION when
  // the two figures are the same money, so the big number at the top and the
  // last line at the bottom are demonstrably about one thing.
  const due = (value: number): Row => ({
    label:
      doc.kind === "receipt" ? "Balance"
      : value === hero.minor ? hero.caption
      : "Amount due",
    value,
    strong: true,
  });
  if (doc.kind !== "quote") {
    if (m.receivedMinor > 0 && m.outstandingMinor === 0) {
      rows.push({ label: "Paid", value: m.receivedMinor, strong: true, hex: INK.accent });
    } else if (m.receivedMinor > 0) {
      rows.push({ label: "Paid", value: m.receivedMinor });
      rows.push(due(m.outstandingMinor));
    } else if (doc.kind === "invoice" || m.depositMinor > 0) {
      rows.push(due(m.depositMinor > 0 ? m.depositMinor : m.outstandingMinor));
    }
  }

  for (const r of rows) {
    const bold = r.strong === true;
    put(ctx, {
      x: labelR, y, text: r.label, size: bold ? TYPE.strong : TYPE.body,
      font: bold ? "bold" : "regular", hex: r.hex ?? (bold ? INK.ink : INK.muted),
      right: true,
    });
    put(ctx, {
      x: amtR, y, text: bold ? fmt(r.value) : bare(r.value),
      size: bold ? TYPE.strong : TYPE.body, font: bold ? "bold" : "regular",
      hex: r.hex ?? INK.ink, right: true,
    });
    y += SPACE.ladderPitch;
  }

  // ── How to pay ───────────────────────────────────────────────────────────
  // No band behind it. Printed only when something is actually owed: telling
  // somebody how to pay a document they have already settled is how a customer
  // pays twice.
  const payBits = [doc.payMethod, doc.payReference].filter((s) => s.trim() !== "");
  const owes = doc.kind !== "receipt" && m.outstandingMinor > 0;
  if (payBits.length && owes) {
    y += 18;
    label(ctx, L, y, "How to pay");
    y += 14;
    put(ctx, {
      x: L, y, text: payBits[0], size: TYPE.strong, font: "bold", hex: INK.ink,
      maxW: CONTENT_WIDTH,
    });
    if (payBits[1]) {
      y += SPACE.leadFine + 2;
      put(ctx, {
        x: L, y, text: payBits[1], size: TYPE.body, font: "regular", hex: INK.muted,
        maxW: CONTENT_WIDTH,
      });
    }
  }

  // ── Notes and terms, while there is room ─────────────────────────────────
  //
  // The floor is not decoration. This renderer walks downward with no
  // pagination and then draws its footer at a FIXED height, so without a floor
  // a long Terms block prints straight through it.
  for (const [heading, text] of [["Notes", doc.notes], ["Terms", doc.terms]] as const) {
    if (!text.trim()) continue;
    if (y + 26 > floor) break;
    y += 26;
    label(ctx, L, y, heading);
    y += 12;
    for (const ln of wrapToWidth(toWinAnsi(text), CONTENT_WIDTH, TYPE.fine, "regular")) {
      if (y > floor) break;
      put(ctx, { x: L, y, text: ln, size: TYPE.fine, font: "regular", hex: INK.muted });
      y += SPACE.leadFine;
    }
  }

  // ── Footer, pinned ───────────────────────────────────────────────────────
  //
  // The hard facts, and no vendor credit. "Thank you for choosing X" and "Made
  // with Receiptly" used to sit here at the same size and grey, which gave the
  // software equal billing with the business on the business's own paper.
  const footY = PAGE.height - PAGE.margin + 4;
  rule(ctx, footY - 14);
  const footer = doc.footer.trim() ||
    [doc.business.name, doc.business.website].filter(Boolean).join("  ·  ");
  put(ctx, { x: L, y: footY, text: footer, size: TYPE.fine, font: "regular", hex: INK.muted, maxW: CONTENT_WIDTH * 0.7 });
  // The reference again, so a page separated from its email still says what it
  // is and which booking it belongs to.
  put(ctx, { x: RIGHT, y: footY, text: doc.reference, size: TYPE.fine, font: "regular", hex: INK.muted, right: true });

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
