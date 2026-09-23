"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import Image from "next/image";
import {
  PAGE, CONTENT_WIDTH, RIGHT, AXIS, TABLE, TYPE, TRACK, SPACE, INK,
  STATUS_COLOUR, FOOTER_RESERVE, LOGO_BOX, Y, FLOW_TOP,
} from "@/lib/receiptly/theme";
import { RECEIPT_LOGO_DATA_URL as BUILT_IN_MARK } from "@/lib/receipt-logo";
import {
  computeMoney, docStatus, heroAmount, formatMoney, currencyByCode,
  DOC_KIND_LABEL, MAX_LINES, type DetailRow, type ReceiptlyDoc,
} from "@/lib/receiptly/model";
import { longDate } from "@/lib/receiptly/pdf";

// ── THE LIVE PREVIEW ────────────────────────────────────────────────────────
//
// The same document the PDF draws, in HTML, reading the SAME constants from
// theme.ts — the two inks, the four sizes, the three axes, the frozen
// baselines. Nothing here is a number of its own.
//
// ── POSITIONED BY BASELINE, LIKE THE PDF ────────────────────────────────────
//
// This used to be a flow layout whose spacing was tuned by hand to resemble
// the PDF's, and it drifted: its table rows were ~31pt against the PDF's 21,
// so every basket pushed everything below it to a different height on the two
// pages, and the longer the basket the wider the gap.
//
// Now every run is absolutely positioned at the SAME from-top baseline the PDF
// uses. Parity is structural rather than maintained.
//
// The one hard part is that CSS positions a box and PDF positions a baseline.
// `top` is therefore `baseline − ascent`, and the ascent ratio is MEASURED at
// runtime: hard-coding Helvetica's 0.718 breaks the moment a browser resolves
// Arial instead, which it does on Windows, and then every line lands high.
// Arial's advance widths are identical to Helvetica's across WinAnsi, so the
// shared width tables still describe what is drawn.

const FALLBACK_ASCENT = 0.847;

function useAscent(): number {
  const [asc, setAsc] = useState(FALLBACK_ASCENT);
  useEffect(() => {
    try {
      const ctx = document.createElement("canvas").getContext("2d");
      if (!ctx) return;
      ctx.font = "100px Helvetica, Arial, sans-serif";
      const a = ctx.measureText("Hg").fontBoundingBoxAscent;
      if (Number.isFinite(a) && a > 0) setAsc(a / 100);
    } catch {
      /* keep the fallback */
    }
  }, []);
  return asc;
}

type RunProps = {
  x: number;
  /** Baseline, from the top of the page. */
  y: number;
  size: number;
  bold?: boolean;
  colour?: string;
  track?: number;
  /** Right-align the run's right edge to `x`. */
  right?: boolean;
  /** Clip with an ellipsis at this width. */
  maxW?: number;
  tabular?: boolean;
  children: ReactNode;
};

function makeRun(ascent: number) {
  return function Run({
    x, y, size, bold, colour = INK.ink, track = 0, right, maxW, tabular, children,
  }: RunProps) {
    const base: CSSProperties = {
      position: "absolute",
      top: y - ascent * size,
      fontSize: size,
      lineHeight: 1,
      fontWeight: bold ? 700 : 400,
      color: colour,
      letterSpacing: track ? `${track}px` : undefined,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      ...(tabular ? { fontVariantNumeric: "tabular-nums" } : {}),
    };
    if (right) {
      // CSS letter-spacing, like PDF's Tc, adds the space AFTER the last glyph
      // too — so a tracked right-aligned run ends one letter-space short of
      // its box. The negative margin gives that space back, which is what puts
      // the tracked column heads on the same x in both renderers.
      return (
        <div style={{
          ...base, left: 0, width: x, textAlign: "right",
          marginRight: track ? -track : undefined,
        }}>{children}</div>
      );
    }
    return <div style={{ ...base, left: x, maxWidth: maxW }}>{children}</div>;
  };
}

const axis = (i: 0 | 1 | 2) => PAGE.margin + CONTENT_WIDTH * AXIS[i];
const FIELD_W = CONTENT_WIDTH / 3 - 14;

export default function DocumentPreview({
  doc, scale = 1,
}: {
  doc: ReceiptlyDoc;
  scale?: number;
}) {
  const ascent = useAscent();
  const Run = makeRun(ascent);

  const c = currencyByCode(doc.currencyCode);
  const m = computeMoney(doc);
  const status = docStatus(doc, m);
  const hero = heroAmount(doc, m);
  const fmt = (v: number) => formatMoney(v, c);
  const bare = (v: number) => fmt(v).replace(/^[^\d-]+\s*/, "");
  const lines = doc.lines.slice(0, MAX_LINES);
  const details = doc.details.filter((d) => d.value.trim() !== "");
  const payBits = [doc.payMethod, doc.payReference].filter((s) => s.trim() !== "");

  const L = PAGE.margin;
  const unitR = L + CONTENT_WIDTH * TABLE.qtyUnitRight;
  const amtR = L + CONTENT_WIDTH * TABLE.amountRight;
  const labelR = L + CONTENT_WIDTH * TABLE.ladderLabelRight;
  const descW = CONTENT_WIDTH * TABLE.descriptionRight;

  const Label = ({ x, y, text, right }: {
    x: number; y: number; text: string; right?: boolean;
  }) => (
    <Run x={x} y={y} size={TYPE.label} bold colour={INK.muted} track={TRACK.label} right={right}>
      {text.toUpperCase()}
    </Run>
  );

  const Field = ({ x, yL, yV, name, value, bold }: {
    x: number; yL: number; yV: number; name: string; value: string; bold?: boolean;
  }) =>
    value.trim() ? (
      <>
        <Label x={x} y={yL} text={name} />
        <Run x={x} y={yV} size={bold ? TYPE.strong : TYPE.body} bold={bold} maxW={FIELD_W}>
          {value}
        </Run>
      </>
    ) : null;

  const Rule = ({ y, x = L, w = CONTENT_WIDTH }: { y: number; x?: number; w?: number }) => (
    <div style={{
      position: "absolute", left: x, top: y, width: w,
      height: SPACE.rule, background: INK.hairline,
    }} />
  );

  // ── The flowed half, walked exactly as the PDF walks it ──────────────────
  let y = FLOW_TOP;
  const floor = PAGE.height - PAGE.margin - FOOTER_RESERVE;
  const flow: ReactNode[] = [];
  const pitch = lines.length > 8 ? 19 : SPACE.rowPitch;

  lines.forEach((l, i) => {
    const at = y;
    flow.push(
      <Run key={`d${i}`} x={L} y={at} size={TYPE.body} maxW={descW}>{l.description || "—"}</Run>,
    );
    if (l.qty !== 1) {
      flow.push(
        <Run key={`q${i}`} x={unitR} y={at} size={TYPE.body} colour={INK.muted} right tabular>
          {`${l.qty} × ${bare(l.unitMinor)}`}
        </Run>,
      );
    }
    flow.push(
      <Run key={`a${i}`} x={amtR} y={at} size={TYPE.body} right tabular>
        {bare(m.lineTotals[i])}
      </Run>,
    );
    y += pitch;
  });

  y += 10;
  flow.push(<Rule key="sum" y={y - 6} x={labelR - 40} w={amtR - labelR + 40} />);
  y += 22;

  type Row = { label: string; value: number; strong?: boolean; colour?: string };
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
      rows.push({ label: "Paid", value: m.receivedMinor, strong: true, colour: INK.accent });
    } else if (m.receivedMinor > 0) {
      rows.push({ label: "Paid", value: m.receivedMinor });
      rows.push(due(m.outstandingMinor));
    } else if (doc.kind === "invoice" || m.depositMinor > 0) {
      rows.push(due(m.depositMinor > 0 ? m.depositMinor : m.outstandingMinor));
    }
  }

  rows.forEach((r, i) => {
    const bold = r.strong === true;
    const at = y;
    flow.push(
      <Run key={`ll${i}`} x={labelR} y={at} size={bold ? TYPE.strong : TYPE.body} bold={bold}
        colour={r.colour ?? (bold ? INK.ink : INK.muted)} right>{r.label}</Run>,
      <Run key={`lv${i}`} x={amtR} y={at} size={bold ? TYPE.strong : TYPE.body} bold={bold}
        colour={r.colour ?? INK.ink} right tabular>{bold ? fmt(r.value) : bare(r.value)}</Run>,
    );
    y += SPACE.ladderPitch;
  });

  const owes = doc.kind !== "receipt" && m.outstandingMinor > 0;
  if (payBits.length && owes) {
    y += 18;
    flow.push(<Label key="payl" x={L} y={y} text="How to pay" />);
    y += 14;
    flow.push(
      <Run key="pay0" x={L} y={y} size={TYPE.strong} bold maxW={CONTENT_WIDTH}>{payBits[0]}</Run>,
    );
    if (payBits[1]) {
      y += SPACE.leadFine + 2;
      flow.push(
        <Run key="pay1" x={L} y={y} size={TYPE.body} colour={INK.muted} maxW={CONTENT_WIDTH}>
          {payBits[1]}
        </Run>,
      );
    }
  }

  for (const [heading, text] of [["Notes", doc.notes], ["Terms", doc.terms]] as const) {
    if (!text.trim()) continue;
    if (y + 26 > floor) break;
    y += 26;
    flow.push(<Label key={`${heading}l`} x={L} y={y} text={heading} />);
    y += 12;
    // Wrapped by the browser rather than by the width table, so this block is
    // the one place the two renderers can break a line differently. It is
    // prose, it is muted, and it is the last thing on the page; everything
    // above it is positioned run by run.
    flow.push(
      <div key={`${heading}b`} style={{
        position: "absolute", left: L, top: y - ascent * TYPE.fine, width: CONTENT_WIDTH,
        fontSize: TYPE.fine, lineHeight: `${SPACE.leadFine}px`, color: INK.muted,
        maxHeight: Math.max(0, floor - y + SPACE.leadFine), overflow: "hidden",
      }}>{text}</div>,
    );
    y += SPACE.leadFine * Math.ceil(text.length / 118) + 6;
  }

  const footY = PAGE.height - PAGE.margin + 4;
  const footer = doc.footer.trim() ||
    [doc.business.name, doc.business.website].filter(Boolean).join("  ·  ");

  // Slots: the service name, then up to five detail fields, across two frozen
  // rows of three. An empty slot stays white and nothing below it moves.
  const slots: (DetailRow | null)[] = [
    doc.serviceName.trim() ? { label: "Service", value: doc.serviceName } : null,
    ...details.slice(0, 5),
  ];

  return (
    <div
      className="relative shrink-0 overflow-hidden bg-white shadow-[0_24px_70px_-20px_rgba(15,23,42,0.35)] ring-1 ring-black/5"
      style={{
        width: PAGE.width,
        height: PAGE.height,
        transform: `scale(${scale})`,
        transformOrigin: "top left",
        fontFamily: "Helvetica, Arial, sans-serif",
        color: INK.ink,
      }}
      aria-label={`${DOC_KIND_LABEL[doc.kind]} preview`}
    >
      {/* ── Masthead ─────────────────────────────────────────────────── */}
      {/* Always shown: the assembler embeds the built-in mark whenever nothing
          was uploaded, so a preview showing none previewed a document that
          does not exist. `contain`, because the PDF fits rather than crops. */}
      <Image
        src={doc.business.logo ?? BUILT_IN_MARK}
        alt=""
        width={LOGO_BOX}
        height={LOGO_BOX}
        unoptimized
        style={{
          position: "absolute", left: L, top: Y.logoTop,
          width: LOGO_BOX, height: LOGO_BOX, objectFit: "contain",
        }}
      />
      <Run x={L + LOGO_BOX + 12} y={Y.brand} size={TYPE.brand} bold track={TRACK.brand}
        maxW={CONTENT_WIDTH * 0.55}>
        {doc.business.name || "Your business"}
      </Run>
      <Run x={L + LOGO_BOX + 12} y={Y.contact} size={TYPE.fine} colour={INK.muted}
        maxW={CONTENT_WIDTH * 0.55}>
        {doc.business.website}
      </Run>
      <Label x={RIGHT} y={Y.brand} text={DOC_KIND_LABEL[doc.kind]} right />
      <Run x={RIGHT} y={Y.contact} size={TYPE.strong} bold track={TRACK.reference} right>
        {doc.reference}
      </Run>
      <Rule y={Y.rule1} />

      {/* ── The one figure ───────────────────────────────────────────── */}
      <Label x={L} y={Y.heroCaption} text={hero.caption} />
      <Run x={L} y={Y.hero} size={TYPE.hero} bold track={TRACK.hero} tabular>
        {fmt(hero.minor)}
      </Run>
      <Run x={L} y={Y.status} size={TYPE.strong} bold track={TRACK.status}
        colour={STATUS_COLOUR[status.tone]}>
        {status.label}
      </Run>

      {/* ── Who, and when ────────────────────────────────────────────── */}
      <Field x={axis(0)} yL={Y.metaLabel} yV={Y.metaValue} name="Billed to"
        value={doc.customerName || "—"} bold />
      {[doc.customerEmail, doc.customerPhone].filter(Boolean).slice(0, 2).map((v, i) => (
        <Run key={v} x={axis(0)} y={Y.metaValue + SPACE.leadMeta * (i + 1)} size={TYPE.body}
          colour={INK.muted} maxW={FIELD_W}>{v}</Run>
      ))}
      <Field x={axis(1)} yL={Y.metaLabel} yV={Y.metaValue} name="Issued"
        value={longDate(doc.issuedOn)} bold />
      <Field x={axis(2)} yL={Y.metaLabel} yV={Y.metaValue}
        name={doc.kind === "quote" ? "Valid until" : "Due"}
        value={doc.dueOn ? longDate(doc.dueOn) : ""} bold />

      {/* ── What it is for ───────────────────────────────────────────── */}
      {slots.map((slot, i) => {
        if (!slot) return null;
        const row = i < 3 ? 0 : 1;
        const col = (i % 3) as 0 | 1 | 2;
        if (i === 0) {
          return (
            <span key="svc">
              <Label x={axis(0)} y={Y.serviceLabel[0]} text={slot.label} />
              <div style={{
                position: "absolute", left: axis(0),
                top: Y.serviceValue[0] - ascent * TYPE.strong,
                width: FIELD_W, fontSize: TYPE.strong, fontWeight: 700,
                lineHeight: `${Y.serviceWrap - Y.serviceValue[0]}px`,
                maxHeight: (Y.serviceWrap - Y.serviceValue[0]) * 2, overflow: "hidden",
              }}>{slot.value}</div>
            </span>
          );
        }
        return (
          <Field key={`${slot.label}-${i}`} x={axis(col)} yL={Y.serviceLabel[row]}
            yV={Y.serviceValue[row]} name={slot.label} value={slot.value} />
        );
      })}

      {/* ── Column heads ─────────────────────────────────────────────── */}
      <Label x={L} y={Y.columnHeads} text="Description" />
      <Label x={unitR} y={Y.columnHeads} text="Qty × Unit" right />
      <Label x={amtR} y={Y.columnHeads} text={`Amount · ${c.code}`} right />
      <Rule y={Y.rule2} />

      {flow}

      {/* ── Footer, pinned ───────────────────────────────────────────── */}
      <Rule y={footY - 14} />
      <Run x={L} y={footY} size={TYPE.fine} colour={INK.muted} maxW={CONTENT_WIDTH * 0.7}>
        {footer}
      </Run>
      <Run x={RIGHT} y={footY} size={TYPE.fine} colour={INK.muted} right>
        {doc.reference}
      </Run>
    </div>
  );
}
