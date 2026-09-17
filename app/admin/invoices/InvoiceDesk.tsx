"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, Download, RefreshCw, Plus, Wallet } from "lucide-react";
import PaymentDialog from "./PaymentDialog";
import IssueDialog from "./IssueDialog";
import type { Invoice, InvoiceState, InvoiceSubjectType } from "@/lib/invoicing/types";
import { SUBJECTS } from "@/lib/invoicing/subjects";
import {
  STATE_TONE, STATE_LABEL, matchesFilters, summarise, csvRows, money,
  type InvoiceFilters,
} from "@/lib/invoicing/register";
import { downloadCsv, toCsv } from "@/lib/download";

// ── THE INVOICE REGISTER ────────────────────────────────────────────────────
//
// This component RENDERS. Every figure on it, and every decision about which
// rows to show, comes from lib/invoicing/register.ts, which is pure and tested
// — so the money the owner reads here is verified without a browser.
//
// The filters and the CSV share one predicate on purpose: an export that does
// not match what is on screen is a report somebody reconciles against the
// wrong set and only discovers much later.

function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 font-dm text-[10.5px] ${tone}`}>
      {children}
    </span>
  );
}

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3">
      <p className="font-bebas text-[10px] tracking-[0.22em] text-muted">{label}</p>
      <p className="mt-1 font-syne text-xl font-extrabold text-offwhite">{value}</p>
      {hint ? <p className="mt-0.5 font-dm text-[11px] text-muted">{hint}</p> : null}
    </div>
  );
}

export default function InvoiceDesk() {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState<InvoiceFilters>({ state: "all", subjectType: "all" });
  const [issuing, setIssuing] = useState(false);
  const [paying, setPaying] = useState<Invoice | null>(null);
  // Said out loud rather than toasted: this desk has no Toaster mounted, and
  // adding one for a single confirmation would be a dependency for a sentence.
  const [said, setSaid] = useState<string | null>(null);

  /** Replace one row in place, so the table does not flash on every payment. */
  function replace(updated: Invoice) {
    setInvoices((prev) =>
      (prev ?? []).map((i) => (i.id === updated.id ? { ...i, ...updated } : i)),
    );
  }

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/invoices", { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Could not load the invoices.");
      setInvoices(body.invoices ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the invoices.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const shown = useMemo(
    () => (invoices ?? []).filter((i) => matchesFilters(i, f)),
    [invoices, f],
  );
  // Summarised over the FILTERED set, so the cards answer the question the
  // filters just asked rather than a different one.
  const sum = useMemo(() => summarise(shown), [shown]);

  return (
    <main className="min-h-screen bg-dark px-4 py-8 text-offwhite md:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-syne text-2xl font-extrabold uppercase">Invoices</h1>
            <p className="mt-1 font-dm text-sm text-muted">
              Operational figures, not an accounting report. Cancelled and
              written-off documents are counted but never summed.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIssuing(true)}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-yellow/50 bg-yellow/10 px-4 font-syne text-sm font-bold text-yellow"
            >
              <Plus size={15} /> Issue invoice
            </button>
            <button
              type="button"
              onClick={() => void load()}
              disabled={busy}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/12 px-4 font-dm text-sm disabled:opacity-50"
            >
              <RefreshCw size={15} className={busy ? "animate-spin" : ""} /> Refresh
            </button>
            <button
              type="button"
              disabled={shown.length === 0}
              onClick={() =>
                downloadCsv(
                  toCsv(csvRows(shown)),
                  `roule-invoices-${new Date().toISOString().slice(0, 10)}.csv`,
                )
              }
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-yellow px-4 font-syne text-sm font-bold text-dark disabled:opacity-40"
            >
              <Download size={15} /> Export {shown.length > 0 ? `(${shown.length})` : ""}
            </button>
          </div>
        </div>

        {said && (
          <p className="mt-4 rounded-xl border border-green-500/30 bg-green-500/10 px-3 py-2.5 font-dm text-sm text-green-200">
            {said}
          </p>
        )}

        {/* ── The cards ─────────────────────────────────────────────────── */}
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Card label="Invoiced" value={money(sum.invoicedCents)} hint={`${sum.count} documents`} />
          <Card label="Collected" value={money(sum.collectedCents)} />
          <Card
            label="Outstanding"
            value={money(sum.outstandingCents)}
            hint={sum.outstandingCount > 0 ? `${sum.outstandingCount} awaiting payment` : "nothing owed"}
          />
          <Card
            label="Held in credit"
            value={money(sum.creditCents)}
            hint={sum.creditCents > 0 ? "overpaid — owed back" : undefined}
          />
          <Card label="Cancelled" value={String(sum.cancelledCount)} hint="not counted as money" />
        </div>

        {sum.byService.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {sum.byService.map((s) => (
              <span
                key={s.subjectType}
                className="rounded-full border border-white/10 bg-white/[0.02] px-3 py-1 font-dm text-xs text-muted"
              >
                {s.label} · <span className="text-offwhite">{money(s.totalCents)}</span> · {s.count}
              </span>
            ))}
          </div>
        )}

        {/* ── Filters ───────────────────────────────────────────────────── */}
        <div className="mt-6 flex flex-wrap gap-2">
          <input
            value={f.q ?? ""}
            onChange={(e) => setF({ ...f, q: e.target.value })}
            placeholder="Invoice number, customer, or their booking reference"
            aria-label="Search invoices"
            className="min-h-11 min-w-[18rem] flex-1 rounded-xl border border-white/12 bg-dark px-4 font-dm text-sm text-offwhite placeholder:text-muted"
          />
          <select
            value={f.state ?? "all"}
            onChange={(e) => setF({ ...f, state: e.target.value as InvoiceFilters["state"] })}
            aria-label="Status"
            className="min-h-11 rounded-xl border border-white/12 bg-dark px-3 font-dm text-sm"
          >
            <option value="all">Any status</option>
            <option value="outstanding">Still owed</option>
            {(Object.keys(STATE_LABEL) as InvoiceState[]).map((s) => (
              <option key={s} value={s}>{STATE_LABEL[s]}</option>
            ))}
          </select>
          <select
            value={f.subjectType ?? "all"}
            onChange={(e) =>
              setF({ ...f, subjectType: e.target.value as InvoiceSubjectType | "all" })
            }
            aria-label="Service"
            className="min-h-11 rounded-xl border border-white/12 bg-dark px-3 font-dm text-sm"
          >
            <option value="all">Any service</option>
            {(Object.keys(SUBJECTS) as InvoiceSubjectType[]).map((s) => (
              <option key={s} value={s}>{SUBJECTS[s].label}</option>
            ))}
          </select>
          <input
            type="date" value={f.from ?? ""} aria-label="Issued from"
            onChange={(e) => setF({ ...f, from: e.target.value || undefined })}
            className="min-h-11 rounded-xl border border-white/12 bg-dark px-3 font-dm text-sm"
          />
          <input
            type="date" value={f.to ?? ""} aria-label="Issued to"
            onChange={(e) => setF({ ...f, to: e.target.value || undefined })}
            className="min-h-11 rounded-xl border border-white/12 bg-dark px-3 font-dm text-sm"
          />
        </div>

        {/* ── The book ──────────────────────────────────────────────────── */}
        <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[56rem] border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-left">
                {["Number", "Issued", "Service", "Customer", "Total", "Paid", "Balance", "Status", ""].map(
                  (h) => (
                    <th key={h} className="px-3 py-2.5 font-bebas text-[10px] tracking-[0.2em] text-muted">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {shown.map((i) => (
                <tr key={i.id} className="border-b border-white/[0.06] last:border-0">
                  <td className="px-3 py-2.5 font-mono text-xs text-offwhite">{i.number}</td>
                  <td className="px-3 py-2.5 font-dm text-xs text-muted">
                    {i.issuedAt ? i.issuedAt.slice(0, 10) : "—"}
                  </td>
                  <td className="px-3 py-2.5 font-dm text-xs text-muted">
                    {SUBJECTS[i.subjectType].label}
                    <span className="block text-[11px] text-muted/70">{i.reference}</span>
                  </td>
                  <td className="px-3 py-2.5 font-dm text-xs text-offwhite">{i.billToName}</td>
                  <td className="px-3 py-2.5 font-dm text-xs tabular-nums">{money(i.totalCents)}</td>
                  <td className="px-3 py-2.5 font-dm text-xs tabular-nums text-muted">
                    {i.paidCents > 0 ? money(i.paidCents) : "—"}
                  </td>
                  <td className="px-3 py-2.5 font-dm text-xs tabular-nums">
                    {i.balanceCents < 0 ? (
                      <span className="text-sky-300">{money(-i.balanceCents)} credit</span>
                    ) : i.balanceCents > 0 ? (
                      money(i.balanceCents)
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge tone={STATE_TONE[i.state]}>{STATE_LABEL[i.state]}</Badge>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {/* Offered only where money can actually be taken. The
                        database refuses the rest, and a button that always
                        errors teaches people to distrust the screen. */}
                    {(i.state === "issued" || i.state === "part_paid" || i.state === "paid") && (
                      <button
                        type="button"
                        onClick={() => setPaying(i)}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/12 px-2.5 font-dm text-xs text-offwhite"
                      >
                        <Wallet size={13} /> Payment
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Four different nothings, which must not look the same: still
              loading, broken, genuinely empty, or filtered to nothing. */}
          {invoices === null && !error && (
            <p className="px-4 py-10 text-center font-dm text-sm text-muted">Loading…</p>
          )}
          {error && (
            <p className="px-4 py-10 text-center font-dm text-sm text-red-300">{error}</p>
          )}
          {invoices !== null && invoices.length === 0 && !error && (
            <div className="px-4 py-12 text-center">
              <FileText size={22} className="mx-auto text-muted" />
              <p className="mt-2 font-dm text-sm text-muted">
                No invoices yet. One is created from a booking, an order or a ride.
              </p>
            </div>
          )}
          {invoices !== null && invoices.length > 0 && shown.length === 0 && (
            <p className="px-4 py-10 text-center font-dm text-sm text-muted">
              Nothing matches those filters.
            </p>
          )}
        </div>
      </div>

      {issuing && (
        <IssueDialog
          onClose={() => setIssuing(false)}
          onIssued={(inv) => {
            setIssuing(false);
            setSaid(`${inv.number} issued.`);
            void load();
          }}
        />
      )}

      {paying && (
        <PaymentDialog
          invoice={paying}
          onClose={() => setPaying(null)}
          onDone={(updated) => {
            replace(updated);
            setPaying(null);
            setSaid(
              updated.balanceCents <= 0
                ? `${updated.number} is settled.`
                : `Payment recorded. ${money(updated.balanceCents)} still owed on ${updated.number}.`,
            );
          }}
        />
      )}
    </main>
  );
}
