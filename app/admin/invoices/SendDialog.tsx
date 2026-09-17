"use client";

import { useState } from "react";
import { X, Send, Paperclip } from "lucide-react";
import type { Invoice } from "@/lib/invoicing/types";
import { money } from "@/lib/invoicing/register";
import { invoiceEmailSubject, invoiceAttachmentName } from "@/lib/invoicing/email";

// ── SENDING THE DOCUMENT ────────────────────────────────────────────────────
//
// The address is editable and prefilled from the invoice. Two real cases need
// it: a customer who booked with a typo, and a customer who asks for it to go
// to whoever pays their bills. Neither is worth a database edit on an issued
// document — the address the mail actually went to is recorded on the invoice,
// which is the fact anyone would later want.
//
// The subject line and the attachment name are shown because they are what the
// customer will search their inbox for.

export default function SendDialog({
  invoice, onClose, onSent,
}: {
  invoice: Invoice;
  onClose: () => void;
  onSent: (updated: Invoice | null, message: string) => void;
}) {
  const [to, setTo] = useState(invoice.billToEmail ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to.trim());

  async function submit() {
    if (!looksLikeEmail || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/invoices/${invoice.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: to.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Could not send the invoice.");
      onSent(
        (body.invoice as Invoice | undefined) ?? null,
        body.message ?? `${invoice.number} sent.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the invoice.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Send ${invoice.number} to the customer`}
      className="fixed inset-0 z-[600] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/12 bg-dark-card p-5 sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-syne text-lg font-extrabold text-offwhite">Send to the customer</h2>
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

        <label
          htmlFor="send-to"
          className="mt-4 block font-bebas text-[10px] tracking-[0.22em] text-muted"
        >
          Email address
        </label>
        <input
          id="send-to"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          type="email"
          inputMode="email"
          autoFocus
          placeholder="name@example.com"
          className="mt-1.5 min-h-14 w-full rounded-xl border border-white/12 bg-dark px-4 font-dm text-base text-offwhite"
        />
        {!invoice.billToEmail && (
          <p className="mt-1.5 font-dm text-xs text-amber-200">
            There is no address on this invoice. Whatever you type is recorded as where it went.
          </p>
        )}

        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
          <p className="font-dm text-sm text-offwhite">{invoiceEmailSubject(invoice)}</p>
          <p className="mt-1.5 inline-flex items-center gap-1.5 font-dm text-xs text-muted">
            <Paperclip size={12} /> {invoiceAttachmentName(invoice)}
          </p>
        </div>

        {invoice.sentAt && (
          <p className="mt-3 font-dm text-xs text-muted">
            Last sent {invoice.sentAt.slice(0, 10)} to {invoice.sentTo}
            {invoice.sendCount > 1 ? ` · ${invoice.sendCount} times in total` : ""}.
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
            onClick={submit}
            disabled={!looksLikeEmail || busy}
            className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-yellow font-syne text-sm font-bold text-dark disabled:opacity-50"
          >
            <Send size={15} />
            {busy ? "Sending…" : invoice.sentAt ? "Send again" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
