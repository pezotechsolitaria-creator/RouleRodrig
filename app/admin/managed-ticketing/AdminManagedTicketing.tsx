"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Handshake, Receipt, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { centsToDecimalString, toCents } from "@/lib/money";

// Quoting and settling the managed-ticketing fee.
//
// NO PRICE IS SUGGESTED HERE. There is no placeholder amount, no default rate
// and no pre-filled service description: the commercial terms are the owner's,
// set per agreement, and a "typical" number baked into a form is how a default
// quietly becomes a policy.
//
// The fee and the organiser's ticket revenue are shown side by side and never
// combined. The revenue column is read-only context — nothing on this screen can
// change it, and the server offers no netted figure to display even if it tried.

type Agreement = {
  id: string;
  storeId: string;
  eventName: string;
  eventSlug: string;
  startsAt: string | null;
  status: "requested" | "approved" | "active" | "completed" | "cancelled";
  feeType: "fixed" | "percentage" | null;
  feeAmountCents: number | null;
  feeRateE5: number | null;
  serviceIncludes: string | null;
  organiserNote: string | null;
  requestedAt: string;
  acceptedAt: string | null;
  paymentStatus: "unpaid" | "invoiced" | "paid" | "waived";
  invoicedFeeCents: number | null;
  invoicedBasisCents: number | null;
  ticketRevenueCents: number;
};

const STATUS_STYLE: Record<Agreement["status"], string> = {
  requested: "border-yellow/30 bg-yellow/10 text-yellow",
  approved: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  active: "border-green-500/30 bg-green-500/10 text-green-300",
  completed: "border-white/15 bg-white/5 text-muted",
  cancelled: "border-red-500/25 bg-red-500/10 text-red-300",
};

export default function AdminManagedTicketing() {
  const [rows, setRows] = useState<Agreement[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/managed-ticketing");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not load these.");
      setRows(body.agreements ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load these.");
      setRows([]);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const patch = useCallback(async (payload: object, ok: string, key: string) => {
    setBusy(key);
    try {
      const res = await fetch("/api/admin/managed-ticketing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "That didn't work.");
      toast.success(ok);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  }, [load]);

  if (rows === null) {
    return <p className="flex items-center gap-2 font-dm text-sm text-muted"><Loader2 size={15} className="animate-spin" /> Loading…</p>;
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-dark-card p-10 text-center">
        <Handshake className="mx-auto text-muted" size={22} />
        <p className="mt-3 font-syne text-base font-bold text-offwhite">No requests yet</p>
        <p className="mx-auto mt-1 max-w-sm font-dm text-sm text-muted">
          When an organiser asks Roulé Rodrigues to run their ticketing, it appears here for you to
          quote.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {rows.map((a) => (
        <Card key={a.id} a={a} busy={busy} patch={patch} />
      ))}
    </div>
  );
}

function Card({
  a, busy, patch,
}: {
  a: Agreement;
  busy: string | null;
  patch: (payload: object, ok: string, key: string) => Promise<void>;
}) {
  const [feeType, setFeeType] = useState<"fixed" | "percentage">(a.feeType ?? "fixed");
  const [amount, setAmount] = useState(a.feeAmountCents != null ? centsToDecimalString(a.feeAmountCents) : "");
  const [pct, setPct] = useState(a.feeRateE5 != null ? String(a.feeRateE5 / 1000) : "");
  const [includes, setIncludes] = useState(a.serviceIncludes ?? "");
  const [reason, setReason] = useState("");

  const amountCents = toCents(amount || "0");
  const rateE5 = Math.round((Number.parseFloat(pct || "0") || 0) * 1000);
  const feeValid =
    feeType === "fixed" ? amountCents !== null && amount.trim() !== ""
                        : pct.trim() !== "" && rateE5 >= 0 && rateE5 <= 50000;
  const editable = a.status === "requested" || a.status === "approved";

  return (
    <div className="rounded-2xl border border-white/10 bg-dark-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-syne text-lg font-bold text-offwhite">{a.eventName}</h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 font-dm text-xs text-muted">
            {a.startsAt && (
              <span className="flex items-center gap-1"><CalendarDays size={11} /> {new Date(a.startsAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
            )}
            <span>Requested {new Date(a.requestedAt).toLocaleDateString("en-GB")}</span>
          </p>
        </div>
        <span className={`shrink-0 rounded-full border px-3 py-1 font-dm text-[11px] ${STATUS_STYLE[a.status]}`}>
          {a.status}
        </span>
      </div>

      {a.organiserNote && (
        <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 font-dm text-sm text-muted">
          “{a.organiserNote}”
        </p>
      )}

      {/* Two columns, never one net figure. */}
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="font-dm text-[11px] text-muted">Their ticket sales (not ours)</p>
          <p className="mt-1 font-syne text-base font-bold text-offwhite">Rs {centsToDecimalString(a.ticketRevenueCents)}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="font-dm text-[11px] text-muted">Our service fee</p>
          <p className="mt-1 font-syne text-base font-bold text-yellow">
            {a.invoicedFeeCents != null ? `Rs ${centsToDecimalString(a.invoicedFeeCents)}` : "—"}
          </p>
          <p className="mt-0.5 font-dm text-[10px] text-muted">
            {a.invoicedFeeCents != null ? "Invoiced — frozen" : "Not invoiced"}
          </p>
        </div>
      </div>

      {editable && (
        <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
          <p className="font-syne text-sm font-bold text-offwhite">Quote the fee</p>
          <div className="flex gap-2">
            <Button size="sm" variant={feeType === "fixed" ? "default" : "outline"} onClick={() => setFeeType("fixed")}>Fixed</Button>
            <Button size="sm" variant={feeType === "percentage" ? "default" : "outline"} onClick={() => setFeeType("percentage")}>Percentage</Button>
          </div>

          {feeType === "fixed" ? (
            <label className="block">
              <span className="font-dm text-xs text-muted">Amount (Rs)</span>
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="mt-1" />
            </label>
          ) : (
            <label className="block">
              <span className="font-dm text-xs text-muted">Percentage of their ticket sales (max 50)</span>
              <Input value={pct} onChange={(e) => setPct(e.target.value)} inputMode="decimal" className="mt-1" />
              {a.ticketRevenueCents > 0 && feeValid && (
                <span className="mt-1 block font-dm text-xs text-muted">
                  At today&apos;s sales that is Rs {centsToDecimalString(Math.floor((a.ticketRevenueCents * rateE5 + 50000) / 100000))}.
                </span>
              )}
            </label>
          )}

          <label className="block">
            <span className="font-dm text-xs text-muted">What the service includes</span>
            <Textarea value={includes} onChange={(e) => setIncludes(e.target.value)} rows={3} className="mt-1" />
          </label>

          <Button
            className="w-full"
            disabled={!feeValid || busy === a.id}
            onClick={() => void patch({
              action: "fee", agreementId: a.id, feeType,
              amountCents: feeType === "fixed" ? amountCents : null,
              rateE5: feeType === "percentage" ? rateE5 : null,
              includes,
            }, "Fee sent to the organiser", a.id)}
          >
            {busy === a.id ? <Loader2 size={15} className="animate-spin" /> : "Send this quote"}
          </Button>
          {a.status === "approved" && !a.acceptedAt && (
            <p className="font-dm text-xs text-muted">Waiting for the organiser to accept.</p>
          )}
        </div>
      )}

      {(a.status === "active" || a.status === "completed") && (
        <div className="mt-4 space-y-2 border-t border-white/10 pt-4">
          <p className="font-dm text-sm text-muted">
            Accepted {a.acceptedAt ? new Date(a.acceptedAt).toLocaleDateString("en-GB") : ""} ·{" "}
            {a.feeType === "fixed"
              ? `Rs ${centsToDecimalString(a.feeAmountCents ?? 0)}`
              : `${(a.feeRateE5 ?? 0) / 1000}% of ticket sales`}
          </p>
          <div className="flex flex-wrap gap-2">
            {(["invoiced", "paid", "waived"] as const).map((s) => (
              <Button key={s} size="sm" variant="outline" disabled={busy === a.id || a.paymentStatus === s}
                onClick={() => void patch({ action: "payment", agreementId: a.id, paymentStatus: s }, `Marked ${s}`, a.id)}>
                <Receipt size={13} className="mr-1" /> {s}
              </Button>
            ))}
            {a.status === "active" && (
              <Button size="sm" variant="outline" disabled={busy === a.id}
                onClick={() => void patch({ action: "status", agreementId: a.id, status: "completed" }, "Marked completed", a.id)}>
                Complete
              </Button>
            )}
          </div>
          <p className="font-dm text-[11px] text-muted">
            Payment status: <span className="text-offwhite">{a.paymentStatus}</span>
            {a.invoicedBasisCents != null && ` · invoiced against Rs ${centsToDecimalString(a.invoicedBasisCents)} of sales`}
          </p>
        </div>
      )}

      {a.status !== "cancelled" && a.status !== "completed" && (
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-white/10 pt-4">
          <label className="min-w-[12rem] flex-1">
            <span className="font-dm text-xs text-muted">Reason (required to cancel)</span>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1" />
          </label>
          <Button size="sm" variant="outline" disabled={busy === a.id || !reason.trim()}
            onClick={() => void patch({ action: "status", agreementId: a.id, status: "cancelled", reason }, "Cancelled", a.id)}>
            Cancel agreement
          </Button>
        </div>
      )}
    </div>
  );
}
