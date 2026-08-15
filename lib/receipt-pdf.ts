import type { ReceiptData } from "./receipt";

// ── A real PDF, with no dependency ───────────────────────────────────────────
//
// The receipt used to be an HTML document rendered into a hidden iframe, with
// window.print() called on it — a button labelled "Download receipt" that
// actually opened a print dialog and asked the customer to find "Save as PDF".
// That failed in the two places most of this site's traffic lives: iframe
// print() is unreliable on iOS/WebKit, and in an installed PWA there is often
// no print UI at all. It also removed the iframe on a 4-second timer, which
// cancelled the dialog for anyone who took longer than that to choose.
//
// A PDF whose content is a page of text is a small, completely specified file
// format, so we emit one directly rather than adding a PDF library to a
// mobile-first bundle. What comes back is a real .pdf that downloads, opens and
// prints anywhere, with no dialog in the way.
//
// Deliberately Type1 base-14 fonts (Helvetica): every reader has them built in,
// so nothing has to be embedded and the file stays around 2 KB.

const PAGE_W = 595.28; // A4 at 72dpi
const PAGE_H = 841.89;
const MARGIN = 56;
const VALUE_X = 330; // values sit in a fixed second column — see fmtRow below

/**
 * PDF text strings are Latin-1 (WinAnsiEncoding here). Rodrigues names are
 * routinely accented — Éloïse, Perrine, Ançois — and those all fit. Anything
 * outside the range (emoji, for instance) becomes "?" rather than corrupting
 * the byte stream and producing a file no reader will open.
 */
function toLatin1(input: string): string {
  let out = "";
  for (const ch of input) {
    const cp = ch.codePointAt(0) ?? 63;
    out += cp <= 0xff ? String.fromCharCode(cp) : "?";
  }
  return out;
}

/** Escapes the three characters that terminate or nest a PDF literal string. */
function pdfEscape(s: string): string {
  return toLatin1(s).replace(/[\\()]/g, (c) => `\\${c}`);
}

type Op = string;

function text(x: number, y: number, size: number, font: "F1" | "F2", value: string): Op {
  return `BT /${font} ${size} Tf ${x} ${y} Td (${pdfEscape(value)}) Tj ET`;
}

function rect(x: number, y: number, w: number, h: number, rgb: [number, number, number]): Op {
  return `${rgb[0]} ${rgb[1]} ${rgb[2]} rg ${x} ${y} ${w} ${h} re f`;
}

function gray(v: number): Op {
  return `${v} ${v} ${v} rg`;
}

const BLACK: Op = "0 0 0 rg";
const YELLOW: [number, number, number] = [0.961, 0.784, 0.259]; // #F5C842
const GREEN: [number, number, number] = [0.039, 0.49, 0.231]; // #0a7d3b

/**
 * Wraps a long string to a character budget. Crude by design: proportional font
 * metrics would mean shipping a width table for a note that is two lines long.
 * The budget is conservative enough that Helvetica 9pt never overruns the page.
 */
function wrap(s: string, maxChars: number): string[] {
  const words = toLatin1(s).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  for (const w of words) {
    if (!line.length) line = w;
    else if (line.length + 1 + w.length <= maxChars) line += ` ${w}`;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line.length) lines.push(line);
  return lines;
}

function buildContent(d: ReceiptData, dateLabel: string): string {
  const ops: Op[] = [];
  let y = PAGE_H - MARGIN;

  // ── Header ────────────────────────────────────────────────────────────────
  ops.push(BLACK, text(MARGIN, y, 17, "F2", "ROULE RODRIGUES"));
  ops.push(gray(0.4), text(MARGIN, y - 15, 9, "F1", "roulerodrig.com  -  Rodrigues Island"));
  ops.push(gray(0.4), text(VALUE_X + 90, y, 9, "F1", dateLabel));
  ops.push(gray(0.4), text(VALUE_X + 90, y - 13, 9, "F1", `Ref: ${d.ref}`));

  y -= 30;
  ops.push(rect(MARGIN, y, PAGE_W - MARGIN * 2, 2.5, YELLOW));

  // ── Heading ───────────────────────────────────────────────────────────────
  y -= 34;
  ops.push(BLACK, text(MARGIN, y, 12, "F2", d.heading.toUpperCase()));

  // ── Rows ──────────────────────────────────────────────────────────────────
  y -= 24;
  const rows: Array<{ label: string; value: string; strong?: boolean }> = [
    { label: "Name", value: d.customer },
    { label: d.itemLabel, value: d.item },
    ...d.rows,
  ];

  for (const r of rows) {
    if (r.strong) {
      // The total gets a rule above it and the brand green, mirroring the old
      // HTML receipt so the printed artefact still looks like the same document.
      ops.push(rect(MARGIN, y + 15, PAGE_W - MARGIN * 2, 1, [0, 0, 0]));
      y -= 4;
      ops.push(
        `${GREEN[0]} ${GREEN[1]} ${GREEN[2]} rg`,
        text(MARGIN, y, 12, "F2", r.label),
        text(VALUE_X, y, 12, "F2", r.value),
      );
      y -= 24;
    } else {
      ops.push(BLACK, text(MARGIN, y, 10, "F1", r.label));
      ops.push(text(VALUE_X, y, 10, "F2", r.value));
      ops.push(rect(MARGIN, y - 7, PAGE_W - MARGIN * 2, 0.5, [0.9, 0.9, 0.9]));
      y -= 21;
    }
  }

  // ── Note ──────────────────────────────────────────────────────────────────
  if (d.note) {
    y -= 12;
    ops.push(gray(0.4));
    for (const line of wrap(d.note, 92)) {
      ops.push(text(MARGIN, y, 9, "F1", line));
      y -= 12;
    }
  }

  // ── Footer, pinned to the bottom ──────────────────────────────────────────
  ops.push(rect(MARGIN, MARGIN + 22, PAGE_W - MARGIN * 2, 0.5, [0.9, 0.9, 0.9]));
  ops.push(
    gray(0.6),
    text(MARGIN, MARGIN + 8, 8.5, "F1", "Thank you for choosing Roule Rodrigues - take the long way."),
  );

  return ops.join("\n");
}

/**
 * Assembles the object table, cross-reference table and trailer.
 *
 * The xref entries are BYTE offsets into the finished file, which is why every
 * string here stays inside Latin-1: one character is one byte, so the running
 * length is the offset. Get this wrong and readers reject the file outright.
 */
export function buildReceiptPdf(d: ReceiptData, now: Date = new Date()): Uint8Array {
  const dateLabel = now.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const content = buildContent(d, dateLabel);

  const objects: string[] = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    `<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${PAGE_W} ${PAGE_H}]` +
      "/Resources<</Font<</F1 5 0 R/F2 6 0 R>>>>/Contents 4 0 R>>",
    `<</Length ${content.length}>>\nstream\n${content}\nendstream`,
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>",
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica-Bold/Encoding/WinAnsiEncoding>>",
  ];

  let file = "%PDF-1.4\n";
  const offsets: number[] = [];

  objects.forEach((body, i) => {
    offsets.push(file.length);
    file += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefStart = file.length;
  file += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    file += `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  file +=
    `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\n` +
    `startxref\n${xrefStart}\n%%EOF\n`;

  // One char === one byte, guaranteed by toLatin1 on every dynamic string.
  const bytes = new Uint8Array(file.length);
  for (let i = 0; i < file.length; i++) bytes[i] = file.charCodeAt(i) & 0xff;
  return bytes;
}

/** Filename customers will recognise in their downloads folder. */
export function receiptFilename(ref: string): string {
  return `${ref.replace(/[^A-Za-z0-9-]/g, "") || "receipt"}.pdf`;
}
