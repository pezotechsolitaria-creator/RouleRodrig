"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Undo2, Check, Copy } from "lucide-react";
import { centsToDecimalString } from "@/lib/money";

// ── Money this shop has to send back (M90) ─────────────────────────────────
//
// On the merchant HOME rather than behind a new page, because a refund is not
// something anybody goes looking for. It is created automatically when a paid
// order is cancelled, and if it sits somewhere nobody visits it becomes a
// customer who never got their money and a platform that never knew.
//
// Roulé Rodrigues never held this money — it went straight into the shop's own
// account — so the shop does the sending. This screen's whole job is to make
// that one action obvious: here is who, here is how much, here is the account,
// tap when it is gone.
//
// It renders NOTHING when nothing is owed, so a healthy shop never sees it.

type Refund = {
  id: string;
  order_number: string;
  customer_name: string | null;
  amount: number;
  currency: string;
  status: "owed" | "sent" | "received" | "waived";
  dest_bank_name: string | null;
  dest_account_holder: string | null;
  dest_account_number: string | null;
  sent_at: string | null;
};

function Field({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] py-2 last:border-0">
      <div className="min-w-0">
        <p className="font-dm text-[11px] uppercase tracking-wide text-muted">{label}</p>
        <p className="truncate font-dm text-sm text-offwhite">{value}</p>
      </div>
      <button
        type="button"
        aria-label={`Copy ${label}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          } catch {
            /* clipboard blocked — the value is on screen to copy by hand */
          }
        }}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/15 text-muted transition-colors hover:border-yellow/50 hover:text-yellow"
      >
        {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
      </button>
    </div>
  );
}

export default function RefundsOwed() {
  const [refunds, setRefunds] = useState<Refund[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/merchant/refunds", { cache: "no-store" });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || "Could not load refunds.");
      setRefunds((b.refunds as Refund[]) ?? []);
    } catch (e) {
      // Quiet: this block is additive to the dashboard. A failure here must not
      // take the merchant's home screen down with it.
      console.error(e);
      setRefunds([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function markSent(r: Refund) {
    if (
      !window.confirm(
        `Confirm you have sent Rs ${centsToDecimalString(r.amount)} back to ${r.customer_name || "the customer"} for ${r.order_number}?`,
      )
    )
      return;
    setBusy(r.id);
    setError(null);
    try {
      const res = await fetch("/api/merchant/refunds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refundId: r.id }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(b.error || "That didn't work.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  }

  const open = (refunds ?? []).filter((r) => r.status === "owed" || r.status === "sent");
  if (!refunds || open.length === 0) return null;

  return (
    <div className="mt-7 rounded-2xl border border-red-400/40 bg-red-500/[0.07] p-5">
      <p className="flex items-center gap-2 font-syne text-base font-bold text-red-300">
        <Undo2 size={17} /> {open.filter((r) => r.status === "owed").length > 0
          ? "You owe a customer their money back"
          : "Refunds waiting to be confirmed"}
      </p>
      <p className="mt-1.5 font-dm text-sm text-offwhite/85">
        These orders were cancelled after the customer had already paid you. Send the money back to
        the account shown, then mark it sent — they are told straight away.
      </p>

      {error && (
        <p role="alert" className="mt-3 font-dm text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="mt-4 space-y-3">
        {open.map((r) => (
          <div key={r.id} className="rounded-xl border border-white/12 bg-dark-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bebas text-[10px] tracking-[0.25em] text-yellow">{r.order_number}</p>
                <p className="font-syne text-base font-bold text-offwhite">
                  {r.customer_name || "Customer"}
                </p>
              </div>
              <p className="shrink-0 font-syne text-lg font-extrabold text-red-300">
                Rs {centsToDecimalString(r.amount)}
              </p>
            </div>

            {r.status === "sent" ? (
              <p className="mt-3 font-dm text-sm text-muted">
                Sent{r.sent_at ? ` on ${new Date(r.sent_at).toLocaleDateString()}` : ""} — waiting for
                the customer to confirm it arrived.
              </p>
            ) : r.dest_account_number ? (
              <>
                <dl className="mt-3">
                  {r.dest_bank_name && <Field label="Bank" value={r.dest_bank_name} />}
                  <Field label="Account holder" value={r.dest_account_holder ?? ""} />
                  <Field label="Account number" value={r.dest_account_number} />
                  <Field label="Reference" value={r.order_number} />
                </dl>
                <button
                  onClick={() => void markSent(r)}
                  disabled={busy !== null}
                  className="mt-3 min-h-[48px] w-full rounded-xl bg-yellow font-syne text-sm font-bold text-dark disabled:opacity-50"
                >
                  {busy === r.id ? (
                    <Loader2 size={16} className="mx-auto animate-spin" />
                  ) : (
                    "I have sent this refund"
                  )}
                </button>
              </>
            ) : (
              // The customer has not said where to send it yet. Stated rather
              // than left as an absent button, which reads as a broken card.
              <p className="mt-3 rounded-lg border border-white/12 px-3 py-2 font-dm text-sm text-muted">
                Waiting for the customer to give their bank details. They have been asked — you will
                see the account here as soon as they do.
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
