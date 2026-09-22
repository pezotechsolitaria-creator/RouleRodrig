"use client";

import Image from "next/image";
import {
  PAGE, CONTENT_WIDTH, TABLE, TYPE, SPACE, INK, STATUS_COLOUR, STATUS_TINT,
  FOOTER_RESERVE, LOGO_BOX,
} from "@/lib/receiptly/theme";
import { RECEIPT_LOGO_DATA_URL as BUILT_IN_MARK } from "@/lib/receipt-logo";
import {
  computeMoney, docStatus, heroAmount, formatMoney, currencyByCode,
  DOC_KIND_LABEL, MAX_LINES, type ReceiptlyDoc,
} from "@/lib/receiptly/model";
import { longDate } from "@/lib/receiptly/pdf";

// ── THE LIVE PREVIEW ────────────────────────────────────────────────────────
//
// The same document the PDF draws, in HTML, reading the SAME constants from
// theme.ts — the greys, the type scale and the column fractions are not
// written twice. Where the PDF says `L + CONTENT_WIDTH * TABLE.qtyRight`, this
// says `${TABLE.qtyRight * 100}%`, which is the same position expressed the
// way CSS wants it.
//
// Laid out at true A4 point size and then SCALED to fit its container, so what
// is on screen is the page, not an approximation of it: a line that would be
// cut off in the PDF is cut off here, at the same character.

export default function DocumentPreview({
  doc, scale = 1,
}: {
  doc: ReceiptlyDoc;
  scale?: number;
}) {
  const c = currencyByCode(doc.currencyCode);
  const m = computeMoney(doc);
  const status = docStatus(doc, m);
  const hero = heroAmount(doc, m);
  const accent = doc.business.accent || "#0a7d3b";
  const fmt = (v: number) => formatMoney(v, c);
  const lines = doc.lines.slice(0, MAX_LINES);
  const settlement =
    doc.kind === "invoice" || doc.kind === "receipt" || m.receivedMinor > 0;
  const details = doc.details.filter((d) => d.value.trim() !== "");
  const payBits = [doc.payMethod, doc.payReference].filter((s) => s.trim() !== "");

  const pad = PAGE.margin;

  return (
    <div
      className="relative shrink-0 overflow-hidden bg-white shadow-[0_24px_70px_-20px_rgba(15,23,42,0.35)] ring-1 ring-black/5"
      style={{
        width: PAGE.width,
        height: PAGE.height,
        transform: `scale(${scale})`,
        transformOrigin: "top left",
        fontFamily: "Helvetica, Arial, sans-serif",
        color: INK.body,
      }}
      aria-label={`${DOC_KIND_LABEL[doc.kind]} preview`}
    >
      <div style={{
        padding: pad,
        paddingBottom: 0,
        width: PAGE.width,
        // The HEIGHT is what clips, not the padding — overflow:hidden cuts at
        // the padding box, so reserving space with padding-bottom would still
        // have let Terms render into it. This is the HTML twin of the PDF's
        // floor: the page does not paginate, so the content stops where the
        // footer starts and nothing prints through "Thank you for choosing".
        height: PAGE.height - FOOTER_RESERVE,
        boxSizing: "border-box",
        overflow: "hidden",
      }}>
        {/* ── Masthead ──────────────────────────────────────────────── */}
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-2.5">
            {/* ── THE SAME MARK, THE SAME SHAPE ─────────────────────────
                Always rendered, because the PDF always draws one: with no
                upload the assembler embeds the built-in Roulé Rodrigues mark,
                so a preview that showed nothing was a preview of a document
                that does not exist.

                `contain`, because the PDF fits the mark inside the box. It was
                `cover`, which centre-crops — so a wide wordmark lost its ends
                on screen and came out squeezed on the page: two different
                wrong pictures of one upload. */}
            <Image
              src={doc.business.logo ?? BUILT_IN_MARK}
              alt=""
              width={LOGO_BOX}
              height={LOGO_BOX}
              unoptimized
              className="rounded"
              style={{ width: LOGO_BOX, height: LOGO_BOX, objectFit: "contain" }}
            />
            <div>
              <div style={{ fontSize: TYPE.title, fontWeight: 700, color: INK.strong, lineHeight: 1.1 }}>
                {doc.business.name || "Your business"}
              </div>
              {(doc.business.website || doc.business.tagline) && (
                <div style={{ fontSize: TYPE.small, color: INK.muted, marginTop: 3 }}>
                  {[doc.business.website, doc.business.tagline].filter(Boolean).join("  ·  ")}
                </div>
              )}
            </div>
          </div>
          <div className="text-right">
            <div style={{ fontSize: TYPE.small, fontWeight: 700, color: INK.faint, letterSpacing: "0.09em" }}>
              {DOC_KIND_LABEL[doc.kind].toUpperCase()}
            </div>
            {doc.reference && (
              <div style={{ fontSize: TYPE.body, fontWeight: 700, color: INK.strong, marginTop: 3 }}>
                {doc.reference}
              </div>
            )}
          </div>
        </div>

        <div style={{ height: 2, background: accent, marginTop: 18 }} />

        {/* ── Hero ─────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between" style={{ marginTop: 26 }}>
          <div>
            <div style={{ fontSize: TYPE.hero, fontWeight: 700, color: INK.strong, lineHeight: 1 }}>
              {fmt(hero.minor)}
            </div>
            <div style={{ fontSize: TYPE.body, color: INK.muted, marginTop: 6 }}>{hero.caption}</div>
          </div>
          <div className="text-right" style={{ maxWidth: CONTENT_WIDTH * 0.52 }}>
            <span
              className="inline-block rounded-full"
              style={{
                background: STATUS_TINT[status.tone],
                color: STATUS_COLOUR[status.tone],
                fontSize: TYPE.small,
                fontWeight: 700,
                letterSpacing: "0.05em",
                padding: "5px 11px",
              }}
            >
              {status.label}
            </span>
            {status.detail && (
              <div style={{ fontSize: TYPE.tiny, color: INK.faint, marginTop: 6, lineHeight: 1.45 }}>
                {status.detail}
              </div>
            )}
          </div>
        </div>

        {/* ── Parties ──────────────────────────────────────────────── */}
        <div style={{ height: 1, background: INK.hairline, marginTop: 22 }} />
        <div className="flex gap-6" style={{ marginTop: 14 }}>
          <div style={{ width: "50%" }}>
            <Label>Billed to</Label>
            <div style={{ fontSize: TYPE.strong, fontWeight: 700, color: INK.strong, marginTop: 6 }}>
              {doc.customerName || "—"}
            </div>
            {[doc.customerEmail, doc.customerPhone].filter(Boolean).map((v) => (
              <div key={v} style={{ fontSize: TYPE.small, color: INK.muted, marginTop: 2 }}>{v}</div>
            ))}
          </div>
          <div style={{ width: "50%" }}>
            <Label>Issued</Label>
            <div style={{ fontSize: TYPE.strong, fontWeight: 700, color: INK.strong, marginTop: 6 }}>
              {longDate(doc.issuedOn) || "—"}
            </div>
            {doc.dueOn && (
              <div style={{ fontSize: TYPE.small, color: INK.muted, marginTop: 2 }}>
                {doc.kind === "quote" ? "Valid until" : "Due"} {longDate(doc.dueOn)}
              </div>
            )}
          </div>
        </div>

        {/* ── The service ──────────────────────────────────────────── */}
        {(doc.serviceName.trim() || details.length > 0) && (
          <>
            <div style={{ height: 1, background: INK.hairline, marginTop: 18 }} />
            <div style={{ marginTop: 12 }}>
              {doc.serviceName.trim() && (
                <div style={{ fontSize: TYPE.strong, fontWeight: 700, color: INK.strong }}>
                  {doc.serviceName}
                </div>
              )}
              {details.length > 0 && (
                <div style={{ fontSize: TYPE.body, color: INK.muted, marginTop: 5, lineHeight: 1.5 }}>
                  {details.map((d) => `${d.label}: ${d.value}`).join("   ·   ")}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Table ────────────────────────────────────────────────── */}
        <div style={{ height: 1.2, background: INK.hairline, marginTop: 20 }} />
        <div className="flex" style={{ marginTop: 7 }}>
          <div style={{ width: `${TABLE.descriptionRight * 100}%` }}><Label>Description</Label></div>
          <div style={{ width: `${(TABLE.qtyUnitRight - TABLE.descriptionRight) * 100}%`, textAlign: "right" }}>
            <Label>Qty × Unit</Label>
          </div>
          <div style={{ width: `${(1 - TABLE.qtyUnitRight) * 100}%`, textAlign: "right" }}><Label>Amount</Label></div>
        </div>
        <div style={{ height: 1, background: INK.hairline, marginTop: 7 }} />

        {/* ── ONE ROW HEIGHT, NOT TWO ────────────────────────────────
            These rows were 10 + line + 10 ≈ 31pt against the PDF's 21, so
            every basket pushed the totals, the payment band and the notes to a
            different place on the two pages — and the longer the basket the
            wider the gap. SPACE.rowHeight is the PDF's own step; the preview
            steps by exactly the same amount. */}
        {lines.map((l, i) => (
          <div key={i} style={{ height: SPACE.rowHeight, position: "relative" }}>
            <div className="flex items-baseline" style={{ paddingTop: 5 }}>
              <div style={{ width: `${TABLE.descriptionRight * 100}%`, fontSize: TYPE.body, color: INK.body,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 12 }}>
                {l.description || "—"}
              </div>
              <div style={{ width: `${(TABLE.qtyUnitRight - TABLE.descriptionRight) * 100}%`, textAlign: "right",
                            fontSize: TYPE.body, color: INK.muted }}>
                {l.qty} <span style={{ color: INK.faint }}>×</span> {fmt(l.unitMinor)}
              </div>
              <div style={{ width: `${(1 - TABLE.qtyUnitRight) * 100}%`, textAlign: "right",
                            fontSize: TYPE.body, fontWeight: 700, color: INK.strong }}>
                {fmt(m.lineTotals[i])}
              </div>
            </div>
            {i < lines.length - 1 && (
              <div style={{ position: "absolute", left: 0, right: 0, bottom: 0,
                            height: 1, background: INK.hairline }} />
            )}
          </div>
        ))}

        {/* ── Totals ───────────────────────────────────────────────── */}
        <div className="flex justify-end" style={{ marginTop: 14 }}>
          <div style={{ width: "58%" }}>
            <div style={{ height: 1, background: INK.hairline, marginBottom: 10 }} />
            {(m.depositMinor > 0 || m.receivedMinor > 0) && (
              <Row label="Subtotal" value={fmt(m.subtotalMinor)} />
            )}
            {m.depositMinor > 0 && (
              <>
                <Row
                  label={
                    doc.depositPct != null
                      ? `Deposit (${doc.depositPct}%)`
                      : doc.kind === "receipt" ? "Deposit" : "Deposit required"
                  }
                  value={fmt(m.depositMinor)}
                />
                <Row label="Balance after deposit" value={fmt(m.balanceAfterDepositMinor)} />
              </>
            )}
            <Row label="Total" value={fmt(m.totalMinor)} strong />
            {/* The same rule as the PDF, and for the reason written there: a
                fresh confirmation printing "Still owed <the whole total>" in
                red under a hero reading "Deposit to confirm" gives the reader
                two amounts and shouts the wrong one. */}
            {settlement && <Row label="Received" value={fmt(m.receivedMinor)} />}
            {settlement && m.outstandingMinor !== 0 && (
              <Row
                label={m.outstandingMinor > 0 ? "Still owed" : "Overpaid"}
                value={fmt(Math.abs(m.outstandingMinor))}
                strong
                tone={m.outstandingMinor > 0 ? STATUS_COLOUR.pending : STATUS_COLOUR.paid}
              />
            )}
          </div>
        </div>

        {/* ── How to pay ───────────────────────────────────────────── */}
        {payBits.length > 0 && doc.kind !== "receipt" && (
          <div style={{ background: INK.band, borderRadius: 6, padding: "10px 14px", marginTop: 16 }}>
            <Label>How to pay</Label>
            <div style={{ fontSize: TYPE.strong, fontWeight: 700, color: INK.strong, marginTop: 4 }}>
              {payBits.join("   ·   ")}
            </div>
          </div>
        )}

        {/* ── Notes & terms ────────────────────────────────────────── */}
        {[["Notes", doc.notes], ["Terms", doc.terms]].map(([h, t]) =>
          (t as string).trim() ? (
            <div key={h as string} style={{ marginTop: 14 }}>
              <Label>{h as string}</Label>
              <div style={{ fontSize: TYPE.small, color: INK.muted, marginTop: 4, lineHeight: 1.55 }}>
                {t as string}
              </div>
            </div>
          ) : null,
        )}
      </div>

      {/* ── Footer, pinned ─────────────────────────────────────────── */}
      <div style={{ position: "absolute", left: pad, right: pad, bottom: pad - 16 }}>
        <div style={{ height: 1, background: INK.hairline, marginBottom: 8 }} />
        <div className="flex items-center justify-between">
          <span style={{ fontSize: TYPE.small, color: INK.muted }}>
            {doc.footer.trim() || `Thank you for choosing ${doc.business.name || "us"}.`}
          </span>
          <span style={{ fontSize: TYPE.tiny, color: INK.faint }}>Made with Receiptly</span>
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: TYPE.section, fontWeight: 700, color: INK.faint,
      letterSpacing: "0.1em", textTransform: "uppercase",
    }}>
      {children}
    </span>
  );
}

function Row({
  label, value, strong, tone,
}: { label: string; value: string; strong?: boolean; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between" style={{ marginBottom: strong ? 7 : 5 }}>
      <span style={{
        fontSize: strong ? TYPE.strong : TYPE.body,
        fontWeight: strong ? 700 : 400,
        color: tone ?? (strong ? INK.strong : INK.muted),
      }}>{label}</span>
      <span style={{
        fontSize: strong ? TYPE.strong : TYPE.body,
        fontWeight: strong ? 700 : 400,
        color: tone ?? (strong ? INK.strong : INK.body),
        fontVariantNumeric: "tabular-nums",
      }}>{value}</span>
    </div>
  );
}
