"use client";

import { useState } from "react";
import { X, Ban } from "lucide-react";
import type { Invoice } from "@/lib/invoicing/types";
import { money } from "@/lib/invoicing/register";
import { voidBlockedReason, DOC_KIND_WORD } from "@/lib/invoicing/void-form";

// ── CANCELLING A DOCUMENT ───────────────────────────────────────────────────
//
// The endpoint has existed since phase 2 and nothing in the app could reach it.
// Two places now need it: an invoice issued by mistake before anyone paid, and
// a credit note raised in error — M207 refuses a second credit note with
// "Cancel that one first if it was wrong", which was another promise with no
// button behind it.
//
// A reason is required here and in the database. A cancelled financial document
// with no stated reason is exactly what nobody can answer a question about a
// year later.
//
// What this dialog will NOT do is offer to cancel something with money against
// it. The trigger refuses that on a locked row — the remedy is a credit note,
// and the block message says so rather than letting somebody find out by
// pressing a button.

export default function VoidDialog({
  invoice, onClose, onDone,
}: {
  invoice: Invoice;
  onClose: () => void;
  onDone: (updated: Invoice) => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blocked = voidBlockedReason(invoice);
  const word = DOC_KIND_WORD[invoice.docKind];
  const ready = !blocked && reason.trim().length >= 3;

  async function submit() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/invoices/${invoice.id}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      // The database's message is the useful one — "already has money received
      // against it" — so it is shown as it comes.
      if (!res.ok) throw new Error(body?.error ?? "Could not cancel it.");
      onDone(body.invoice as Invoice);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel it.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Cancel ${invoice.number}`}
      className="fixed inset-0 z-[600] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/12 bg-dark-card p-5 sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-syne text-lg font-extrabold text-offwhite">Cancel this {word}</h2>
            <p className="mt-0.5 font-dm text-xs text-muted">
              {invoice.number} · {money(invoice.totalCents)}
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
            <p className="mt-4 font-dm text-sm text-muted">
              The number is not reused and the {word} stays in the register, marked
              cancelled. The transaction can be invoiced again afterwards.
            </p>

            <label
              htmlFor="void-reason"
              className="mt-4 block font-bebas text-[10px] tracking-[0.22em] text-muted"
            >
              Why — kept with the record
            </label>
            <textarea
              id="void-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              autoFocus
              placeholder="Issued against the wrong booking"
              className="mt-1.5 w-full rounded-xl border border-white/12 bg-dark px-4 py-3 font-dm text-sm text-offwhite"
            />

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
                Keep it
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={!ready || busy}
                className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-red-500/40 bg-red-500/15 font-syne text-sm font-bold text-red-200 disabled:opacity-50"
              >
                <Ban size={15} />
                {busy ? "Cancelling…" : `Cancel ${invoice.number}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
