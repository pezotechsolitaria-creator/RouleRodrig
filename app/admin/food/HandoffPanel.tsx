"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Loader2, ScanLine, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { centsToDecimalString } from "@/lib/money";
import { formatPickupCode, normalizePickupCode, isCompletePickupCode } from "@/lib/orders/pickup";
import { foodWrite } from "./types";

// The counter.
//
// Two steps, deliberately: PREVIEW is read-only and answers "who is this and
// what is in the bag"; HAND OVER commits. A single-use token that gets spent
// merely by looking at it is a token that gets spent by accident, and there is
// no way back from that — the customer is standing there with no code and an
// order the system believes was collected.
//
// Everything that makes this safe lives in the database (M54): the code is
// looked up by SHA-256 hash so the raw code is never stored, the row is locked
// before any decision, the token burns after ten wrong attempts, and it refuses
// any order that is not a kitchen order — so this screen can never close a
// merchant shop's sale.

type Preview = {
  orderId: string;
  orderNumber: string;
  customerName: string | null;
  customerPhone: string | null;
  total: number;
  status: string;
  items: { name: string; variant: string | null; qty: number }[];
  alreadyRedeemed: boolean;
  redeemedAt: string | null;
  expiresAt: string;
  redeemable: boolean;
  reason: string | null;
};

export default function HandoffPanel({ onCollected }: { onCollected: () => void }) {
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const normalized = normalizePickupCode(code);

  const check = useCallback(async () => {
    if (!isCompletePickupCode(code)) return;
    setBusy(true);
    setError(null);
    setPreview(null);
    setDone(null);
    const res = await foodWrite("/api/admin/food/pickup", {
      method: "POST",
      body: JSON.stringify({ code: normalized }),
    });
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    setPreview(res.data as Preview);
  }, [code, normalized]);

  const redeem = useCallback(async () => {
    if (!preview) return;
    setBusy(true);
    const res = await foodWrite("/api/admin/food/pickup", {
      method: "POST",
      body: JSON.stringify({ code: normalized, redeem: true }),
    });
    setBusy(false);
    if (!res.ok) { setError(res.error); setPreview(null); return; }
    const result = res.data as { orderNumber: string; alreadyRedeemed: boolean };
    setDone(result.orderNumber);
    setPreview(null);
    setCode("");
    toast.success(
      result.alreadyRedeemed
        ? `${result.orderNumber} was already collected.`
        : `${result.orderNumber} handed over.`,
    );
    onCollected();
  }, [preview, normalized, onCollected]);

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-2xl border border-white/10 bg-dark-card p-5">
        <p className="flex items-center gap-2 font-bebas text-[11px] tracking-[0.3em] text-yellow">
          <ScanLine size={14} /> PICKUP CODE
        </p>
        <h3 className="mt-1 font-syne text-xl font-extrabold text-offwhite">Hand an order over</h3>
        <p className="mt-1.5 font-dm text-sm text-muted">
          Scan the customer&apos;s QR with any camera, or type the eight characters they show you.
        </p>

        <input
          value={formatPickupCode(normalized)}
          onChange={(e) => {
            setCode(e.target.value);
            setError(null);
            setPreview(null);
            setDone(null);
          }}
          onKeyDown={(e) => { if (e.key === "Enter") void check(); }}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="ABCD-2345"
          className="mt-4 w-full rounded-xl border border-white/10 bg-dark px-4 py-4 text-center font-bebas text-3xl tracking-[0.3em] text-offwhite placeholder:text-muted/40 focus:border-yellow/50 focus:outline-none"
        />

        <button
          onClick={() => void check()}
          disabled={busy || !isCompletePickupCode(code)}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-yellow px-4 py-3 font-dm text-sm font-bold text-dark disabled:opacity-40"
        >
          {busy && <Loader2 size={15} className="animate-spin" />}
          Check this code
        </button>
        <p className="mt-2 text-center font-dm text-[11px] text-muted">
          Checking changes nothing. Only &ldquo;Hand it over&rdquo; does.
        </p>
      </div>

      {error && (
        <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-4">
          <p className="flex items-center gap-2 font-syne text-base font-bold text-red-200">
            <XCircle size={17} /> Not valid
          </p>
          <p className="mt-1 font-dm text-sm text-red-200/90">{error}</p>
        </div>
      )}

      {done && (
        <div className="mt-4 rounded-2xl border border-green-500/30 bg-green-500/10 px-4 py-5 text-center">
          <p className="flex items-center justify-center gap-2 font-syne text-lg font-extrabold text-green-200">
            <CheckCircle2 size={19} /> {done} collected
          </p>
          <p className="mt-1 font-dm text-sm text-green-200/80">The customer has been emailed.</p>
        </div>
      )}

      {preview && (
        <div
          className={`mt-4 rounded-2xl border px-4 py-4 ${
            preview.redeemable ? "border-green-500/30 bg-green-500/5" : "border-orange-400/30 bg-orange-400/5"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-syne text-lg font-extrabold text-offwhite">{preview.orderNumber}</p>
              <p className="font-dm text-sm text-muted">
                {preview.customerName ?? "Customer"}
                {preview.customerPhone ? ` · ${preview.customerPhone}` : ""}
              </p>
            </div>
            <p className="font-syne text-lg font-extrabold text-yellow">
              Rs {centsToDecimalString(preview.total)}
            </p>
          </div>

          <ul className="mt-3 space-y-1 border-y border-white/10 py-2.5">
            {preview.items.map((i, n) => (
              <li key={n} className="font-dm text-sm text-offwhite">
                <span className="font-bold text-yellow">{i.qty}×</span> {i.name}
                {i.variant && <span className="text-muted"> · {i.variant}</span>}
              </li>
            ))}
          </ul>

          {preview.redeemable ? (
            <button
              onClick={() => void redeem()}
              disabled={busy}
              className="mt-3.5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-green-500 px-4 py-3.5 font-dm text-sm font-bold text-dark disabled:opacity-50"
            >
              {busy && <Loader2 size={15} className="animate-spin" />}
              Hand it over
            </button>
          ) : (
            <p className="mt-3 flex items-start gap-2 font-dm text-sm text-orange-200">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              {preview.reason ?? "This code cannot be used right now."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
