"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import type { Invoice } from "@/lib/invoicing/types";
import { money } from "@/lib/invoicing/register";
import {
  projectPayment, settlementAmount, paymentBlockedReason,
} from "@/lib/invoicing/payment-form";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABEL, type PaymentMethod } from "@/lib/invoicing/payments";

// ── RECORDING MONEY ─────────────────────────────────────────────────────────
//
// The admin types RUPEES because that is what is written on a bank slip. The
// database stores CENTS. That conversion is shown BACK to them, in full, before
// the button can be pressed.
//
// This platform has shipped a rupee/cent confusion four times and not one was
// caught by somebody reading code. All four would have been caught by a screen
// saying "you are recording Rs 2,999" next to a live remaining balance.

export default function PaymentDialog({
  invoice, onClose, onDone,
}: {
  invoice: Invoice;
  onClose: () => void;
  onDone: (updated: Invoice) => void;
}) {
  const [typed, setTyped] = useState(() => settlementAmount(invoice));
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [ref, setRef] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blocked = paymentBlockedReason(invoice);
  const p = useMemo(() => projectPayment(invoice, typed), [invoice, typed]);

  async function submit() {
    if (!p.ok || blocked) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/invoices/${invoice.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountCents: p.amountCents,
          method,
          externalRef: ref.trim() || undefined,
          note: note.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      // The database's own message is the useful one here — "already has money
      // received against it", "was cancelled" — so it is shown verbatim.
      if (!res.ok) throw new Error(body?.error ?? "Could not record the payment.");
      onDone(body.invoice as Invoice);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record the payment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Record a payment against ${invoice.number}`}
      className="fixed inset-0 z-[600] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/12 bg-dark-card p-5 sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-syne text-lg font-extrabold text-offwhite">Record a payment</h2>
            <p className="mt-0.5 font-dm text-xs text-muted">
              {invoice.number} · {invoice.billToName}
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
            <label className="mt-4 block font-bebas text-[10px] tracking-[0.22em] text-muted">
              How much was received, in rupees
            </label>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              inputMode="decimal"
              autoFocus
              aria-label="Amount received in rupees"
              className="mt-1.5 min-h-14 w-full rounded-xl border border-white/12 bg-dark px-4 font-mono text-lg text-offwhite"
            />

            {/* ── WHAT WILL HAPPEN, BEFORE IT HAPPENS ──────────────────────
                The converted figure is shown back deliberately. Typing rupees
                and storing cents is where this platform has gone wrong four
                times, and a person can only catch it if they are shown it. */}
            {p.ok ? (
              <dl className="mt-3 space-y-1.5 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 font-dm text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted">Invoice total</dt>
                  <dd className="tabular-nums">{money(invoice.totalCents)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Already paid</dt>
                  <dd className="tabular-nums">{money(p.alreadyPaidCents)}</dd>
                </div>
                <div className="flex justify-between font-semibold text-offwhite">
                  <dt>Recording now</dt>
                  <dd className="tabular-nums">{p.amountLabel}</dd>
                </div>
                <div className="flex justify-between border-t border-white/10 pt-1.5">
                  <dt className="text-muted">
                    {p.overpays ? "Owed back to them" : "Remaining after this"}
                  </dt>
                  <dd
                    className={`tabular-nums font-semibold ${
                      p.overpays ? "text-sky-300" : p.settles ? "text-green-300" : "text-amber-200"
                    }`}
                  >
                    {p.overpays ? money(p.overpayByCents) : money(p.remainingCents)}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-3 font-dm text-sm text-amber-200">{p.reason}</p>
            )}

            {p.ok && p.overpays && (
              <p className="mt-2 font-dm text-xs text-sky-300">
                This is more than is owed. It will be recorded, and the invoice
                will show a credit.
              </p>
            )}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <div>
                <label className="block font-bebas text-[10px] tracking-[0.22em] text-muted">
                  How was it paid
                </label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                  aria-label="Payment method"
                  className="mt-1.5 min-h-12 w-full rounded-xl border border-white/12 bg-dark px-3 font-dm text-sm"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-bebas text-[10px] tracking-[0.22em] text-muted">
                  Reference
                </label>
                <input
                  value={ref}
                  onChange={(e) => setRef(e.target.value)}
                  placeholder="Bank ref, Juice ID"
                  aria-label="Payment reference"
                  className="mt-1.5 min-h-12 w-full rounded-xl border border-white/12 bg-dark px-3 font-dm text-sm"
                />
              </div>
            </div>
            {/* A reference is what makes a double tap harmless: the database
                has a unique index on it per invoice, so the same payment
                cannot be recorded twice. */}
            <p className="mt-1.5 font-dm text-[11px] text-muted">
              Optional, but a reference stops the same payment being recorded twice.
            </p>

            <label className="mt-3 block font-bebas text-[10px] tracking-[0.22em] text-muted">
              Note
            </label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Deposit taken at pickup"
              aria-label="Note"
              className="mt-1.5 min-h-12 w-full rounded-xl border border-white/12 bg-dark px-3 font-dm text-sm"
            />

            {error && (
              <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 font-dm text-sm text-red-300">
                {error}
              </p>
            )}

            <div className="mt-5 flex gap-2">
              <button
                type="button" onClick={onClose}
                className="min-h-12 flex-1 rounded-xl border border-white/12 font-dm text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={!p.ok || busy}
                className="min-h-12 flex-[2] rounded-xl bg-yellow font-syne text-sm font-bold text-dark disabled:opacity-40"
              >
                {busy ? "Recording…" : p.ok ? `Record ${p.amountLabel}` : "Record payment"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
