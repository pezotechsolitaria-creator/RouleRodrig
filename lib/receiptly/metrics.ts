// ── HOW WIDE IS THAT STRING, REALLY ─────────────────────────────────────────
//
// lib/receipt-pdf.ts deliberately ships no font metrics, and says why: a
// character budget was enough for a two-line note, and a width table felt like
// a lot of numbers for that. It was the right call there.
//
// It is the wrong call here. Without measurement you cannot right-align a
// money column, and a money column that is not right-aligned is the single
// clearest tell that a document was not produced by a real system:
//
//      Subtotal    Rs 3,600            Subtotal        Rs 3,600
//      Deposit     Rs 950      versus  Deposit           Rs 950
//      Total       Rs 12,400           Total          Rs 12,400
//
// The decimal points line up on the right or they do not, and every invoice
// anyone has ever been handed by a bank has them lined up.
//
// So: the Adobe AFM widths for the two base-14 fonts this platform already
// uses. Nothing is embedded in the PDF — Helvetica and Helvetica-Bold are in
// every reader on earth — so this table costs bytes in the bundle and none in
// the document. Widths are in 1/1000 em, which is how AFM states them: a
// character at size S is (width / 1000) * S points wide.

/** Adobe Helvetica, WinAnsiEncoding, widths per 1000 em. */
const HELVETICA: Readonly<Record<number, number>> = {
  32: 278, 33: 278, 34: 355, 35: 556, 36: 556, 37: 889, 38: 667, 39: 191,
  40: 333, 41: 333, 42: 389, 43: 584, 44: 278, 45: 333, 46: 278, 47: 278,
  48: 556, 49: 556, 50: 556, 51: 556, 52: 556, 53: 556, 54: 556, 55: 556,
  56: 556, 57: 556, 58: 278, 59: 278, 60: 584, 61: 584, 62: 584, 63: 556,
  64: 1015, 65: 667, 66: 667, 67: 722, 68: 722, 69: 667, 70: 611, 71: 778,
  72: 722, 73: 278, 74: 500, 75: 667, 76: 556, 77: 833, 78: 722, 79: 778,
  80: 667, 81: 778, 82: 722, 83: 667, 84: 611, 85: 722, 86: 667, 87: 944,
  88: 667, 89: 667, 90: 611, 91: 278, 92: 278, 93: 278, 94: 469, 95: 556,
  96: 333, 97: 556, 98: 556, 99: 500, 100: 556, 101: 556, 102: 278, 103: 556,
  104: 556, 105: 222, 106: 222, 107: 500, 108: 222, 109: 833, 110: 556,
  111: 556, 112: 556, 113: 556, 114: 333, 115: 500, 116: 278, 117: 556,
  118: 500, 119: 722, 120: 500, 121: 500, 122: 500, 123: 334, 124: 260,
  125: 334, 126: 584,
  // The WinAnsi range this platform actually reaches: typography and the
  // accents in Rodriguan names.
  0x85: 1000, 0x91: 222, 0x92: 222, 0x93: 333, 0x94: 333, 0x95: 350,
  0x96: 556, 0x97: 1000, 0xa0: 278, 0xa3: 556, 0xb0: 400, 0xb7: 278,
  0xe0: 556, 0xe1: 556, 0xe2: 556, 0xe7: 500, 0xe8: 556, 0xe9: 556,
  0xea: 556, 0xeb: 556, 0xee: 278, 0xef: 278, 0xf4: 556, 0xf9: 556,
  0xfb: 556, 0xc0: 667, 0xc7: 722, 0xc9: 667, 0xce: 278,
};

/** Adobe Helvetica-Bold, same encoding and units. */
const HELVETICA_BOLD: Readonly<Record<number, number>> = {
  32: 278, 33: 333, 34: 474, 35: 556, 36: 556, 37: 889, 38: 722, 39: 238,
  40: 333, 41: 333, 42: 389, 43: 584, 44: 278, 45: 333, 46: 278, 47: 278,
  48: 556, 49: 556, 50: 556, 51: 556, 52: 556, 53: 556, 54: 556, 55: 556,
  56: 556, 57: 556, 58: 333, 59: 333, 60: 584, 61: 584, 62: 584, 63: 611,
  64: 975, 65: 722, 66: 722, 67: 722, 68: 722, 69: 667, 70: 611, 71: 778,
  72: 722, 73: 278, 74: 556, 75: 722, 76: 611, 77: 833, 78: 722, 79: 778,
  80: 667, 81: 778, 82: 722, 83: 667, 84: 611, 85: 722, 86: 667, 87: 944,
  88: 667, 89: 667, 90: 611, 91: 333, 92: 278, 93: 333, 94: 584, 95: 556,
  96: 333, 97: 556, 98: 611, 99: 556, 100: 611, 101: 556, 102: 333, 103: 611,
  104: 611, 105: 278, 106: 278, 107: 556, 108: 278, 109: 889, 110: 611,
  111: 611, 112: 611, 113: 611, 114: 389, 115: 556, 116: 333, 117: 611,
  118: 556, 119: 778, 120: 556, 121: 556, 122: 500, 123: 389, 124: 280,
  125: 389, 126: 584,
  0x85: 1000, 0x91: 278, 0x92: 278, 0x93: 500, 0x94: 500, 0x95: 350,
  0x96: 556, 0x97: 1000, 0xa0: 278, 0xa3: 556, 0xb0: 400, 0xb7: 278,
  0xe0: 556, 0xe1: 556, 0xe2: 556, 0xe7: 556, 0xe8: 556, 0xe9: 556,
  0xea: 556, 0xeb: 556, 0xee: 278, 0xef: 278, 0xf4: 611, 0xf9: 611,
  0xfb: 611, 0xc0: 722, 0xc7: 722, 0xc9: 667, 0xce: 278,
};

export type PdfFont = "regular" | "bold";

/**
 * Width of an already-WinAnsi-encoded string, in points.
 *
 * MUST be given the encoded string, not the source one: toWinAnsi() maps an
 * em-dash to byte 0x97, and measuring the source U+2014 would look it up under
 * a codepoint this table has never heard of. Everything the renderer draws
 * goes through the encoder first, so the two always agree.
 *
 * An unknown byte falls back to 556 — the width of a digit, and of most
 * lower-case letters. Being 20% wrong about one exotic character shifts a
 * right-aligned string by a couple of points; being wrong about a digit would
 * be visible on every line, and digits are exact.
 */
export function measure(encoded: string, size: number, font: PdfFont): number {
  const table = font === "bold" ? HELVETICA_BOLD : HELVETICA;
  let units = 0;
  for (let i = 0; i < encoded.length; i++) {
    units += table[encoded.charCodeAt(i)] ?? 556;
  }
  return (units * size) / 1000;
}

/**
 * Cut a string to a width, with a real ellipsis when it does not fit.
 *
 * Measured rather than counted, so "Îles aux Cocos" and "MMMMMMMMMMMMMM" are
 * treated as the different widths they are — a character budget has to assume
 * the worst and throws away space on every line that is not worst case.
 */
export function fit(encoded: string, maxWidth: number, size: number, font: PdfFont): string {
  if (measure(encoded, size, font) <= maxWidth) return encoded;
  const ellipsis = ""; // WinAnsi ellipsis
  const room = maxWidth - measure(ellipsis, size, font);
  let out = "";
  for (const ch of encoded) {
    if (measure(out + ch, size, font) > room) break;
    out += ch;
  }
  return out.trimEnd() + ellipsis;
}

/** Greedy wrap to a WIDTH, not a character count. */
export function wrapToWidth(
  encoded: string, maxWidth: number, size: number, font: PdfFont,
): string[] {
  const words = encoded.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (measure(next, size, font) <= maxWidth) {
      line = next;
    } else {
      if (line) lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}
