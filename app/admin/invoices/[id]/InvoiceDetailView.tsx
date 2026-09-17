"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Wallet, Ban } from "lucide-react";
import type { Invoice, InvoiceLine, InvoicePayment } from "@/lib/invoicing/types";
import { SUBJECTS } from "@/lib/invoicing/subjects";
import { STATE_TONE, STATE_LABEL, money } from "@/lib/invoicing/register";
import { PAYMENT_METHOD_LABEL, type PaymentMethod } from "@/lib/invoicing/payments";
import { invoiceToReceipt } from "@/lib/invoicing/document";
import { downloadReceipt } from "@/lib/receipt";
import PaymentDialog from "../PaymentDialog";

// ── ONE INVOICE, AND THE DOCUMENT IT PRODUCES ───────────────────────────────
//
// The PDF is built from THIS page's data by lib/receipt-pdf.ts — the renderer
// already in the repo that writes a PDF with no library at all. On a serverless
// free tier that is not a compromise: a headless browser would cost tens of
// megabytes of function bundle and a cold start on every download, to produce
// the same page of A4.
//
// Regenerating on demand is safe because an issued invoice is IMMUTABLE. The
// guard trigger refuses to let its number, total or issue date move, so the
// document printed today and the one printed next year are the same document.
// Nothing is stored; there is nothing to go stale.

export default function InvoiceDetailView({ id }: { id: string }) {
  const [inv, setInv] = useState<Invoice | null>(null);
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [payments, setPayments] = useState<InvoicePayment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/invoices/${id}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Could not load the invoice.");
      setInv(body.invoice as Invoice);
      setLines((body.lines ?? []) as InvoiceLine[]);
      setPayments((body.payments ?? []) as InvoicePayment[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the invoice.");
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  if (error) {
    return (
      <main className="min-h-screen bg-dark px-4 py-10 text-offwhite">
        <div className="mx-auto max-w-3xl">
          <Link href="/admin/invoices" className="font-dm text-sm text-muted">
            ← Invoices
          </Link>
          <p className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 font-dm text-sm text-red-300">
            {error}
          </p>
        </div>
      </main>
    );
  }

  if (!inv) {
    return (
      <main className="min-h-screen bg-dark px-4 py-10 text-offwhite">
        <p className="text-center font-dm text-sm text-muted">Loading…</p>
      </main>
    );
  }

  const subject = SUBJECTS[inv.subjectType];

  return (
    <main className="min-h-screen bg-dark px-4 py-8 text-offwhite md:px-8">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/admin/invoices"
          className="inline-flex items-center gap-1.5 font-dm text-sm text-muted hover:text-yellow"
        >
          <ArrowLeft size={14} /> Invoices
        </Link>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-mono text-2xl font-bold text-offwhite">{inv.number}</h1>
            <p className="mt-1 font-dm text-sm text-muted">
              {subject.label} · {inv.reference}
              {inv.issuedAt ? ` · issued ${inv.issuedAt.slice(0, 10)}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => downloadReceipt(invoiceToReceipt(inv, lines))}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-yellow px-4 font-syne text-sm font-bold text-dark"
            >
              <Download size={15} /> Download PDF
            </button>
            {(inv.state === "issued" || inv.state === "part_paid" || inv.state === "paid") && (
              <button
                type="button"
                onClick={() => setPaying(true)}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/12 px-4 font-dm text-sm"
              >
                <Wallet size={15} /> Record a payment
              </button>
            )}
          </div>
        </div>

        {said && (
          <p className="mt-4 rounded-xl border border-green-500/30 bg-green-500/10 px-3 py-2.5 font-dm text-sm text-green-200">
            {said}
          </p>
        )}

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 md:col-span-2">
            <p className="font-bebas text-[10px] tracking-[0.22em] text-muted">Billed to</p>
            <p className="mt-1 font-dm text-sm text-offwhite">{inv.billToName}</p>
            {inv.billToEmail && (
              <p className="font-dm text-xs text-muted">{inv.billToEmail}</p>
            )}
            {inv.billToPhone && (
              <p className="font-dm text-xs text-muted">{inv.billToPhone}</p>
            )}
            <p className="mt-3 font-bebas text-[10px] tracking-[0.22em] text-muted">From</p>
            <p className="mt-1 font-dm text-sm text-offwhite">{inv.sellerName}</p>
            <p className="font-dm text-xs text-muted">{inv.sellerAddress}</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-dm text-[10.5px] ${STATE_TONE[inv.state]}`}>
              {STATE_LABEL[inv.state]}
            </span>
            <dl className="mt-3 space-y-1.5 font-dm text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Total</dt>
                <dd className="tabular-nums font-semibold">{money(inv.totalCents)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Paid</dt>
                <dd className="tabular-nums">{money(inv.paidCents)}</dd>
              </div>
              <div className="flex justify-between border-t border-white/10 pt-1.5">
                <dt className="text-muted">
                  {inv.balanceCents < 0 ? "Owed back" : "Balance"}
                </dt>
                <dd className={`tabular-nums font-semibold ${inv.balanceCents < 0 ? "text-sky-300" : ""}`}>
                  {money(Math.abs(inv.balanceCents))}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {/* ── What is being charged for ──────────────────────────────────── */}
        <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[34rem] border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-left">
                {["Description", "Qty", "Unit", "Amount"].map((h) => (
                  <th key={h} className="px-3 py-2.5 font-bebas text-[10px] tracking-[0.2em] text-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-b border-white/[0.06] last:border-0">
                  <td className="px-3 py-2.5 font-dm text-sm text-offwhite">{l.description}</td>
                  <td className="px-3 py-2.5 font-dm text-sm tabular-nums text-muted">{l.qty}</td>
                  <td className="px-3 py-2.5 font-dm text-sm tabular-nums text-muted">
                    {money(l.unitPriceCents)}
                  </td>
                  <td className="px-3 py-2.5 font-dm text-sm tabular-nums">
                    {money(l.lineTotalCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Every payment, in the order it arrived ─────────────────────── */}
        <h2 className="mt-6 font-syne text-sm font-bold uppercase tracking-wide text-offwhite">
          Payments
        </h2>
        {payments.length === 0 ? (
          <p className="mt-2 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-6 text-center font-dm text-sm text-muted">
            Nothing received yet.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {payments.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3"
              >
                <span className="font-dm text-sm tabular-nums font-semibold text-offwhite">
                  {money(p.amountCents)}
                </span>
                <span className="font-dm text-xs text-muted">
                  {PAYMENT_METHOD_LABEL[p.method as PaymentMethod] ?? p.method}
                </span>
                <span className="font-dm text-xs text-muted">{p.receivedAt.slice(0, 10)}</span>
                {p.externalRef && (
                  <span className="font-mono text-[11px] text-muted">{p.externalRef}</span>
                )}
                {p.note && (
                  <span className="w-full font-dm text-xs text-muted/80">{p.note}</span>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* ── THE PROVENANCE, SHOWN ON PURPOSE ───────────────────────────
            What the source column held, and which unit it was in. Four 100x
            bugs have shipped here, so the one screen where somebody would
            check a suspect figure says exactly where it came from. */}
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3">
          <p className="font-bebas text-[10px] tracking-[0.22em] text-muted">Where this figure came from</p>
          <p className="mt-1 font-dm text-xs text-muted">
            {subject.table}.{subject.amountColumn ?? "—"} held{" "}
            <span className="font-mono text-offwhite">{inv.sourceAmountRaw}</span> in{" "}
            <span className="text-offwhite">{inv.sourceAmountUnit}</span>, which is{" "}
            <span className="text-offwhite">{money(inv.sourceTotalCents)}</span>.
          </p>
        </div>

        {inv.state === "void" && (
          <p className="mt-4 inline-flex items-center gap-2 rounded-xl border border-white/12 px-3 py-2 font-dm text-sm text-muted">
            <Ban size={14} /> This invoice was cancelled.
          </p>
        )}
      </div>

      {paying && (
        <PaymentDialog
          invoice={inv}
          onClose={() => setPaying(false)}
          onDone={(updated) => {
            setPaying(false);
            setSaid(
              updated.balanceCents <= 0
                ? `${updated.number} is settled.`
                : `Payment recorded. ${money(updated.balanceCents)} still owed.`,
            );
            void load();
          }}
        />
      )}
    </main>
  );
}
