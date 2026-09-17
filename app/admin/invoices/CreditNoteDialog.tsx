"use client";

import { useMemo, useState } from "react";
import { X, RotateCcw } from "lucide-react";
import type { Invoice } from "@/lib/invoicing/types";
import { money } from "@/lib/invoicing/register";
import { projectCredit, creditBlockedReason, creditConsequence } from "@/lib/invoicing/credit-form";

// ── UNDOING A DOCUMENT THAT CANNOT BE UNDONE ────────────────────────────────
//
// An issued invoice is immutable and a paid one cannot be voided, which leaves
// exactly one honest way to reverse a sale: a second numbered document that
// says how much of it is being taken back, and why.
//
// The reason is required, here and in the database. It ends up on the credit
// note itself, so it is read by the customer as well as by whoever reconciles
// the month — "Customer cancelled, driver never dispatched" is an answer;
// "correction" is not.

export default function CreditNoteDialog({
  invoice, onClose, onDone,
}: {
  invoice: Invoice;
  onClose: () => void;
  onDone: (note: Invoice) => void;
}) {
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blocked = creditBlockedReason(invoice);
  const p = useMemo(() => projectCredit(invoice, typed), [invoice, typed]);
  const ready = !blocked && p.ok && reason.trim().length > 2;

  async function submit() {
    if (!ready || !p.ok) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/invoices/${invoice.id}/credit-note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: reason.trim(),
          // Omitted entirely for a full credit, so the database decides the
          // figure from the invoice rather than trusting one sent over a wire.
          ...(p.amountCents === null ? {} : { amountCents: p.amountCents }),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Could not raise the credit note.");
      onDone(body.invoice as Invoice);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not raise the credit note.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Raise a credit note against ${invoice.number}`}
      className="fixed inset-0 z-[600] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/12 bg-dark-card p-5 sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-syne text-lg font-extrabold text-offwhite">Raise a credit note</h2>
            <p className="mt-0.5 font-dm text-xs text-muted">
              Against {invoice.number} · {money(invoice.totalCents)}
            </p>
          </div>
          <button
            type="button" onClick={onClose} aria-label="Close"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/12"
          >
            <X size={16} />
          </button>
        </div>

        {blocked ? (
          <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 font-dm text-sm text-amber-200">
            {blocked}
          </p>
        ) : (
          <>
            <label
              htmlFor="credit-reason"
              className="mt-4 block font-bebas text-[10px] tracking-[0.22em] text-muted"
            >
              Why — this is printed on the credit note
            </label>
            <textarea
              id="credit-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              autoFocus
              placeholder="Customer cancelled, driver never dispatched"
              className="mt-1.5 w-full rounded-xl border border-white/12 bg-dark px-4 py-3 font-dm text-sm text-offwhite"
            />

            <label
              htmlFor="credit-amount"
              className="mt-3 block font-bebas text-[10px] tracking-[0.22em] text-muted"
            >
              How much, in rupees — leave empty for the whole invoice
            </label>
            <input
              id="credit-amount"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              inputMode="decimal"
              placeholder={(invoice.totalCents / 100).toFixed(2)}
              className="mt-1.5 min-h-14 w-full rounded-xl border border-white/12 bg-dark px-4 font-mono text-lg text-offwhite"
            />

            {/* ── WHAT WILL HAPPEN, BEFORE IT HAPPENS ──────────────────────
                The converted figure and the consequence, both in words. The
                consequence matters as much as the figure: a full credit on an
                unpaid invoice writes it off, and on a paid one it does not. */}
            {p.ok ? (
              <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 font-dm text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">Crediting</span>
                  <span className="tabular-nums font-semibold">
                    {p.amountLabel}
                    {p.full ? " — all of it" : ""}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-muted">{creditConsequence(invoice, p.full)}</p>
              </div>
            ) : (
              <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 font-dm text-sm text-amber-200">
                {p.reason}
              </p>
            )}

            {error && (
              <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 font-dm text-sm text-red-300">
                {error}
              </p>
            )}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-12 flex-1 rounded-xl border border-white/12 font-dm text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={!ready || busy}
                className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-yellow font-syne text-sm font-bold text-dark disabled:opacity-50"
              >
                <RotateCcw size={15} />
                {busy ? "Raising…" : p.ok ? `Credit ${p.amountLabel}` : "Credit"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
