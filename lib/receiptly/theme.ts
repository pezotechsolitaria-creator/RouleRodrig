// ── ONE SET OF NUMBERS, TWO RENDERERS ───────────────────────────────────────
//
// The live preview is HTML and the download is a PDF, drawn by completely
// different code. They look the same because they read the same constants from
// here: the same greys, the same type scale, the same column positions
// expressed as fractions of the content width.
//
// Anything a designer would want to change lives in this file. Neither
// renderer holds a colour or a size of its own.

export type Rgb = [number, number, number];

/** "#0a7d3b" → [0.039, 0.49, 0.231], which is what a PDF colour operator wants. */
export function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = Number.parseInt(full.slice(0, 6), 16);
  if (!Number.isFinite(n)) return [0, 0, 0];
  return [
    ((n >> 16) & 255) / 255,
    ((n >> 8) & 255) / 255,
    (n & 255) / 255,
  ];
}

/** Readable text on a given background — white on dark, ink on light. */
export function contrastInk(hex: string): Rgb {
  const [r, g, b] = hexToRgb(hex);
  // Rec. 709 luma. Above 0.6 the accent is a pale colour and needs dark text.
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6 ? [0.09, 0.1, 0.12] : [1, 1, 1];
}

/**
 * The neutral ramp. Warm-neutral rather than pure grey, which is what makes
 * Stripe and Linear documents feel printed rather than screenshotted.
 */
export const INK = {
  strong: "#111827",
  body: "#374151",
  muted: "#6b7280",
  faint: "#9ca3af",
  hairline: "#e5e7eb",
  band: "#f9fafb",
  page: "#ffffff",
} as const;

export const STATUS_COLOUR = {
  paid: "#047857",
  part: "#b45309",
  pending: "#b91c1c",
  quote: "#4338ca",
} as const;

export const STATUS_TINT = {
  paid: "#ecfdf5",
  part: "#fffbeb",
  pending: "#fef2f2",
  quote: "#eef2ff",
} as const;

/**
 * A4 in points, and a margin wide enough to look expensive.
 *
 * 56pt was the old receipt's margin. 64 is deliberately more: white space is
 * the cheapest luxury signal there is, and the content still has 467pt of
 * width, which is plenty for a four-column table.
 */
export const PAGE = {
  width: 595.28,
  height: 841.89,
  margin: 64,
} as const;

export const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;

/**
 * Column positions as FRACTIONS of the content width, so the HTML preview can
 * use the same numbers as percentages and the two stay aligned.
 *
 * The three numeric columns are RIGHT edges — money is right-aligned, which is
 * the whole reason lib/receiptly/metrics.ts exists.
 */
export const TABLE = {
  /** Right edge of the "2 × Rs 1,800" column, as a fraction of content width. */
  qtyUnitRight: 0.8,
  /** Right edge of the amount column — the page's right margin. */
  amountRight: 1,
  /** The description stops here, leaving a gutter before the figures. */
  descriptionRight: 0.58,
} as const;

/**
 * Room kept at the foot of the page for the footer rule and its line.
 *
 * The renderer walks y downward and has no pagination, so this is the number
 * that stops a long Terms block printing through "Thank you for choosing".
 */
export const FOOTER_RESERVE = 54;

/** The type scale. One ratio, applied consistently, is most of "designed". */
export const TYPE = {
  hero: 30,
  title: 15,
  section: 8.5,
  body: 9.5,
  strong: 10.5,
  small: 8.5,
  tiny: 7.5,
} as const;

export const SPACE: {
  hairline: number; rule: number; rowHeight: number; sectionGap: number;
} = {
  hairline: 0.6,
  rule: 1.2,
  rowHeight: 21,
  sectionGap: 26,
};
