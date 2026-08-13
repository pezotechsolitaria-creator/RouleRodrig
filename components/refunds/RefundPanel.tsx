"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Undo2, CheckCircle2 } from "lucide-react";
import { centsToDecimalString } from "@/lib/money";

// ── "Where is my money?" (M90) ─────────────────────────────────────────────
//
// The customer's half of a refund. Before this, an order cancelled after
// payment simply said "cancelled" and the money was never mentioned again —
// the single worst screen a marketplace can show someone who has paid.
//
// Roulé Rodrigues never held the money, so it cannot push a button and return
// it. What it CAN do is name the amount, collect where to send it, show that
// the shop has sent it, and let the customer say it arrived. This component is
// all four, and it is the same for a signed-in buyer and a guest — only the
// credential differs, which is why every request goes through one prop.
//
// It renders nothing when there is no refund, so a normal order is unaffected.

type Refund = {
  id: string;
  amount: number;
  currency: string;
  status: "owed" | "sent" | "received" | "waived";
  reason: string | null;
  has_destination: boolean;
  sent_at: string | null;
  received_at: string | null;
};

/** Signed in: the order's id. Guest: the number + email they looked it up with. */
export type RefundCredential =
  | { orderId: string }
  | { orderNumber: string; email: string };

function query(cred: RefundCredential): string {
  return "orderId" in cred
    ? `orderId=${encodeURIComponent(cred.orderId)}`
    : `orderNumber=${encodeURIComponent(cred.orderNumber)}&email=${encodeURIComponent(cred.email)}`;
}

export default function RefundPanel({ credential }: { credential: RefundCredential }) {
  const [refunds, setRefunds] = useState<Refund[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [holder, setHolder] = useState("");
  const [account, setAccount] = useState("");
  const [bank, setBank] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/refunds?${query(credential)}`, { cache: "no-store" });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || "Could not load your refund.");
      setRefunds((b.refunds as Refund[]) ?? []);
    } catch {
      // Additive to the order page — never take it down over this.
      setRefunds([]);
    }
  }, [credential]);

  useEffect(() => {
    void load();
  }, [load]);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/refunds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...credential, ...body }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || "That didn't work.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  const open = (refunds ?? []).filter((r) => r.status !== "waived");
  if (open.length === 0) return null;

  return (
    <>
      {open.map((r) => (
        <section
          key={r.id}
          aria-labelledby={`refund-${r.id}`}
          className={`rounded-2xl border p-5 ${
            r.status === "received"
              ? "border-green-500/30 bg-green-500/[0.06]"
              : "border-yellow/25 bg-yellow/[0.05]"
          }`}
        >
          <h2
            id={`refund-${r.id}`}
            className="flex items-center gap-2 font-syne text-base font-bold text-offwhite"
          >
            {r.status === "received" ? (
              <CheckCircle2 size={16} className="text-green-400" />
            ) : (
              <Undo2 size={16} className="text-yellow" />
            )}
            {r.status === "received" ? "Refunded" : "Refund due to you"}
          </h2>

          <p className="mt-2 font-syne text-2xl font-extrabold text-yellow">
            Rs {centsToDecimalString(r.amount)}
          </p>
          {r.reason && <p className="mt-1 font-dm text-xs text-muted">{r.reason}</p>}

          {r.status === "received" ? (
            <p className="mt-2 font-dm text-sm text-muted">
              You confirmed this arrived
              {r.received_at ? ` on ${new Date(r.received_at).toLocaleDateString()}` : ""}. Nothing
              further to do.
            </p>
          ) : r.status === "sent" ? (
            <>
              <p className="mt-2 font-dm text-sm text-offwhite/85">
                The shop has sent your money back
                {r.sent_at ? ` on ${new Date(r.sent_at).toLocaleDateString()}` : ""}. Bank transfers
                on the island usually land the same or next working day.
              </p>
              <button
                onClick={() => void post({ refundId: r.id, confirm: true })}
                disabled={busy}
                className="mt-3 min-h-[48px] w-full rounded-xl bg-yellow font-syne text-sm font-bold text-dark disabled:opacity-50"
              >
                {busy ? <Loader2 size={16} className="mx-auto animate-spin" /> : "It arrived, thanks"}
              </button>
            </>
          ) : r.has_destination ? (
            <p className="mt-2 font-dm text-sm text-offwhite/85">
              The shop has your account details and has been asked to return the money. You will be
              told the moment they send it.
            </p>
          ) : (
            <>
              {/* The one thing only the customer can supply. Without it the
                  merchant has nowhere to send the money, so this is the
                  blocking step and it is asked for plainly. */}
              <p className="mt-2 font-dm text-sm text-offwhite/85">
                Tell us where to send it. The shop transfers directly to you — Roulé Rodrigues never
                holds your money.
              </p>
              <div className="mt-3 space-y-2">
                <input
                  value={holder}
                  onChange={(e) => setHolder(e.target.value)}
                  placeholder="Account holder name"
                  aria-label="Account holder name"
                  maxLength={200}
                  className="min-h-[44px] w-full rounded-xl border border-white/15 bg-transparent px-3 font-dm text-sm text-offwhite placeholder:text-muted"
                />
                <input
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  placeholder="Account number"
                  aria-label="Account number"
                  maxLength={64}
                  className="min-h-[44px] w-full rounded-xl border border-white/15 bg-transparent px-3 font-dm text-sm text-offwhite placeholder:text-muted"
                />
                <input
                  value={bank}
                  onChange={(e) => setBank(e.target.value)}
                  placeholder="Bank (optional, e.g. MCB)"
                  aria-label="Bank name"
                  maxLength={120}
                  className="min-h-[44px] w-full rounded-xl border border-white/15 bg-transparent px-3 font-dm text-sm text-offwhite placeholder:text-muted"
                />
              </div>
              <button
                onClick={() =>
                  void post({
                    refundId: r.id,
                    accountHolder: holder.trim(),
                    accountNumber: account.trim(),
                    bankName: bank.trim() || undefined,
                  })
                }
                disabled={busy || !holder.trim() || !account.trim()}
                className="mt-3 min-h-[48px] w-full rounded-xl bg-yellow font-syne text-sm font-bold text-dark disabled:opacity-50"
              >
                {busy ? <Loader2 size={16} className="mx-auto animate-spin" /> : "Send my refund here"}
              </button>
            </>
          )}

          {error && (
            <p role="alert" className="mt-2 font-dm text-sm text-red-400">
              {error}
            </p>
          )}
        </section>
      ))}
    </>
  );
}
