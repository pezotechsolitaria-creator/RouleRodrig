// ── ONE SET OF NUMBERS, TWO RENDERERS ───────────────────────────────────────
//
// The live preview is HTML and the download is a PDF, drawn by completely
// different code. They look the same because they read the same constants from
// here: the same two inks, the same four sizes, the same axes expressed as
// fractions of the content width, the same frozen baselines.
//
// Anything a designer would want to change lives in this file. Neither
// renderer holds a colour or a size of its own.
//
// ── WHY THERE ARE SO FEW NUMBERS ────────────────────────────────────────────
//
// This file used to hold seven type sizes, four greys, two background tints
// and four status colours. Two of those sizes were the same number under
// different names, which means the scale was never a scale, and the lightest
// grey is the first thing a photocopier drops.
//
// Hierarchy a reader cannot perceive is not hierarchy — it is inconsistency.
// So: FOUR sizes, TWO inks, ONE accent, and the levels the deleted sizes were
// pretending to carry are carried by case, weight and tracking instead.

export type Rgb = [number, number, number];

/** "#121212" → [0.07, 0.07, 0.07], which is what a PDF colour operator wants. */
export function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = Number.parseInt(full.slice(0, 6), 16);
  if (!Number.isFinite(n)) return [0, 0, 0];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Readable text on a given background — white on dark, ink on light. */
export function contrastInk(hex: string): Rgb {
  const [r, g, b] = hexToRgb(hex);
  // Rec. 709 luma. Above 0.6 the colour is pale and needs dark text.
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6 ? [0.07, 0.07, 0.07] : [1, 1, 1];
}

/**
 * A4 in points, and a margin wide enough to look expensive.
 *
 * White space is the cheapest luxury signal there is, and 467pt of measure is
 * still plenty for a three-column table.
 */
export const PAGE = {
  width: 595.28,
  height: 841.89,
  margin: 64,
} as const;

export const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;
/** The right edge every figure on the page aligns to. */
export const RIGHT = PAGE.margin + CONTENT_WIDTH;

// ── INK ─────────────────────────────────────────────────────────────────────
//
// Two greys and one accent. The old ramp had a fourth step, `faint`, which is
// the first thing a hotel photocopier drops and the signature of a document
// that was decorated rather than set.
//
// THE ACCENT APPEARS ONLY AS WORDS, and only in two places: the status line,
// and the last line of the totals ladder. It means "this money is settled" and
// nothing else. There are no coloured rectangles on the page at all — a pill
// is browser chrome, and in greyscale a coloured bar is a meaningless dark
// stripe. An unsettled document is therefore fully monochrome, which is more
// serious than a red badge, not less.
export const INK = {
  ink: "#121212",
  /** 4.9:1 on white — survives a photocopy, unlike the grey this replaced. */
  muted: "#6B6B6B",
  /** Deep bottle green. ~32% in greyscale, so it still reads darker than ink. */
  accent: "#14543A",
  hairline: "#121212",
  page: "#ffffff",
} as const;

/**
 * The status word's colour, by tone.
 *
 * Green ONLY for settled. Green-and-amber would be the same mid-grey once
 * printed, so the pair carries no information in mono; green against black
 * differs by lightness and survives.
 */
export const STATUS_COLOUR = {
  paid: INK.accent,
  part: INK.ink,
  pending: INK.ink,
  quote: INK.ink,
} as const;

// ── TYPE ────────────────────────────────────────────────────────────────────
//
// FOUR sizes, six roles. `label` and `fine` are the same face at the same size,
// separated by CASE, TRACKING and WEIGHT alone — which is how a level of
// hierarchy survives deleting a size.
export const TYPE = {
  /** The one figure. Once per document. */
  hero: 28,
  /** The business name. One string on the page; forbidden elsewhere. */
  brand: 12,
  /** Reference, guest name, service name, the TOTAL row, the pay line. */
  strong: 9,
  /** About 80% of the words. */
  body: 9,
  /** THE ONLY LABEL ROLE: bold, all caps, tracked, muted. */
  label: 7.5,
  /** Masthead contact line, notes, terms, footer. */
  fine: 7.5,
} as const;

/**
 * Letter-spacing in points, applied with the PDF `Tc` operator.
 *
 * Tracked caps at 7.5pt is what buys back the hierarchy the deleted sizes were
 * carrying; untracked Helvetica caps is the cheapest-looking typography there
 * is. Nothing that passes through the word-wrapper is ever tracked.
 */
export const TRACK = {
  hero: -0.3,
  brand: 0.2,
  reference: 0.3,
  label: 0.6,
  status: 0.6,
  none: 0,
} as const;

// ── THE GRID ────────────────────────────────────────────────────────────────
//
// Three axes at thirds of the measure, reused by the masthead, the meta band,
// the service band and the table heads; every figure right-aligned to RIGHT.
// The page used to carry five or six unrelated vertical axes and four
// unrelated baselines in the masthead alone, which is most of what the owner
// was seeing when he said it did not look premium.
export const AXIS = [0, 1 / 3, 2 / 3] as const;

/** Column right-edges as fractions of the measure. */
export const TABLE = {
  /** "4 × Rs 1,424.25" — gathered into the right-hand numeric field. */
  qtyUnitRight: 0.72,
  amountRight: 1,
  /** The description wraps here, leaving a guaranteed gutter. */
  descriptionRight: 0.6,
  /** Totals-ladder labels sit to the left of their figures. */
  ladderLabelRight: 0.834,
} as const;

export const SPACE = {
  /** EVERY rule on the page. No other weight exists. Solid ink, never a tint:
   *  thin-and-grey reads as a smudge on the laser printer this will meet. */
  rule: 0.5,
  /** 22pt of pitch separates rows better than a hairline between them does. */
  rowPitch: 22,
  ladderPitch: 15,
  leadMeta: 13,
  leadFine: 11,
  gapBlock: 32,
} as const;

/**
 * The masthead mark, fitted inside this square.
 *
 * 34, not 30: beside a 12pt name, 30 reads as a favicon.
 */
export const LOGO_BOX = 34;

// ── THE FROZEN SKELETON ─────────────────────────────────────────────────────
//
// Baselines measured FROM THE TOP of the page. Everything from the masthead
// down to the table's column-head rule sits at the same absolute y in every
// document this business ever issues — with or without a logo, with two detail
// fields or five.
//
// EMPTY FIELDS DO NOT COLLAPSE. No due date means the DUE label and its value
// are simply not drawn and the space stays white; nothing below moves. That is
// the opposite of flow layout and it is the entire point: it is what makes a
// stack of these register with itself, which is the actual mechanism behind
// "premium" in print.
const TOP = PAGE.margin;
export const Y = {
  logoTop: TOP,
  brand: TOP + 15,
  contact: TOP + 27,
  rule1: TOP + 50,
  heroCaption: TOP + 72,
  hero: TOP + 104,
  status: TOP + 122,
  metaLabel: TOP + 154,
  metaValue: TOP + 168,
  /** Two rows of three fields, so four details never push the table down. */
  serviceLabel: [TOP + 226, TOP + 275] as const,
  serviceValue: [TOP + 240, TOP + 289] as const,
  /** A service name long enough to need a second line has one reserved. */
  serviceWrap: TOP + 253,
  columnHeads: TOP + 317,
  rule2: TOP + 323,
} as const;

/** Where the flowed half of the document begins, in from-top points. */
export const FLOW_TOP = Y.rule2 + SPACE.rowPitch;

/**
 * Room kept at the foot of the page for the footer rule and its line.
 *
 * The renderer walks downward and has no pagination, so this is the number
 * that stops a long Terms block printing through the footer.
 */
export const FOOTER_RESERVE = 40;
