"use client";

import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { toast } from "sonner";
import { Loader2, Handshake, Check, X, Info, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { centsToDecimalString } from "@/lib/money";
import type { ManagedTicketing } from "@/lib/events/organizer";

// Roulé Rodrigues running the ticketing, for a fee.
//
// ── THE ONE THING THIS SCREEN MUST NEVER DO ─────────────────────────────────
// Blur the two amounts. "You've taken Rs X" is ticket money the BUYER paid the
// ORGANISER, and it never passes through this platform. "You owe Rs Y" is a
// service fee the ORGANISER owes ROULÉ RODRIGUES. They are different debts
// between different parties, and a UI that showed a single net number would be
// the first step towards an accounting mistake nobody could later unpick.
//
// So they are rendered as two separate figures, side by side, with the
// relationship stated in words. The fee is never subtracted from the revenue
// here or anywhere else — the server does not even offer a netted number.
//
// No price is displayed unless Roulé Rodrigues has quoted one. There is no
// default, no "typically 10%", and no placeholder amount: the commercial terms
// are the owner's to set per agreement.
export default function ManagedTicketingCard({ storeId }: { storeId: string }) {
  const { t } = useLanguage();
  const [data, setData] = useState<ManagedTicketing | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/organizer/managed-ticketing?storeId=${encodeURIComponent(storeId)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not load this.");
      setData(body as ManagedTicketing);
    } catch {
      setData(null);
    }
  }, [storeId]);

  useEffect(() => { void load(); }, [load]);

  async function act(method: "POST" | "PATCH" | "DELETE", payload: object, ok: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/organizer/managed-ticketing", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, ...payload }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "That didn't work.");
      toast.success(ok);
      setNote("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  if (!data) return null;

  const feeLabel =
    data.feeType === "fixed" && data.feeAmountCents != null
      ? `Rs ${centsToDecimalString(data.feeAmountCents)}`
      : data.feeType === "percentage" && data.feeRateE5 != null
        ? `${(data.feeRateE5 / 1000).toFixed(data.feeRateE5 % 1000 === 0 ? 0 : 2)}% of ticket sales`
        : null;

  return (
    <div className="rounded-2xl border border-white/10 bg-dark-card p-5">
      <h2 className="flex items-center gap-2 font-bebas text-[11px] tracking-[0.3em] text-yellow">
        <Handshake size={14} /> {t.eventManaged.title}
      </h2>

      {/* The two amounts, always apart. */}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="font-dm text-[11px] leading-tight text-muted">{t.eventManaged.yourSales}</p>
          <p className="mt-1 font-syne text-base font-bold text-offwhite">
            Rs {centsToDecimalString(data.ticketRevenueCents)}
          </p>
          <p className="mt-0.5 font-dm text-[10px] leading-tight text-muted">{t.eventManaged.paidDirectly}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="font-dm text-[11px] leading-tight text-muted">{t.eventManaged.serviceFee}</p>
          <p className="mt-1 font-syne text-base font-bold text-yellow">
            {data.invoicedFeeCents != null
              ? `Rs ${centsToDecimalString(data.invoicedFeeCents)}`
              : data.estimatedFeeCents != null
                ? `Rs ${centsToDecimalString(data.estimatedFeeCents)}`
                : "—"}
          </p>
          <p className="mt-0.5 font-dm text-[10px] leading-tight text-muted">
            {data.invoicedFeeCents != null
              ? "Invoiced — this figure is fixed"
              : data.feeType === "percentage"
                ? "Estimate at today's sales"
                : data.feeType === "fixed"
                  ? "Agreed fee"
                  : "Not quoted yet"}
          </p>
        </div>
      </div>

      <p className="mt-2 flex items-start gap-1.5 font-dm text-[11px] leading-relaxed text-muted">
        <Info size={12} className="mt-0.5 shrink-0" />
        {data.separationNote}
      </p>

      {/* ── The state machine, in the organiser's language ─────────────── */}
      {data.status === "not_requested" && (
        <div className="mt-4 border-t border-white/10 pt-4">
          <p className="font-dm text-sm text-muted">
            Want us to run the ticketing for this event? Ask, and Roulé Rodrigues will come back to
            you with what it would cost and what it covers. Nothing is agreed until you accept.
          </p>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder={t.eventManaged.notes}
            className="mt-3"
          />
          <Button className="mt-3 w-full" disabled={busy} onClick={() => void act("POST", { note }, "Request sent")}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : "Ask about managed ticketing"}
          </Button>
        </div>
      )}

      {data.status === "requested" && (
        <div className="mt-4 border-t border-white/10 pt-4">
          <p className="font-dm text-sm text-muted">
            Request sent. Roulé Rodrigues will quote a fee and say what it includes — you&apos;ll see
            it here, and nothing happens until you accept it.
          </p>
          <Button
            variant="outline" className="mt-3 w-full" disabled={busy}
            onClick={() => void act("DELETE", { reason: "Withdrawn by the organiser" }, "Request withdrawn")}
          >
            <X size={14} className="mr-1.5" /> {t.eventManaged.withdraw}
          </Button>
        </div>
      )}

      {data.status === "approved" && (
        <div className="mt-4 border-t border-white/10 pt-4">
          <p className="font-syne text-sm font-bold text-offwhite">{t.eventManaged.quoted}</p>
          <p className="mt-1 font-syne text-xl font-extrabold text-yellow">{feeLabel ?? "—"}</p>
          {data.serviceIncludes && (
            <p className="mt-2 whitespace-pre-line font-dm text-sm text-muted">{data.serviceIncludes}</p>
          )}
          <p className="mt-2 font-dm text-xs text-muted">
            This is charged to you separately. It does not change what buyers pay, and it is not
            taken out of your ticket sales.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => void act("PATCH", {}, "Accepted — the service is now active")}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : (<><Check size={15} className="mr-1.5" /> Accept</>)}
            </Button>
            <Button variant="outline" disabled={busy}
              onClick={() => void act("DELETE", { reason: "Declined by the organiser" }, "Declined")}>
              Decline
            </Button>
          </div>
        </div>
      )}

      {(data.status === "active" || data.status === "completed") && (
        <div className="mt-4 border-t border-white/10 pt-4">
          <p className="font-dm text-sm text-offwhite">
            {data.status === "active"
              ? "Roulé Rodrigues is running ticketing for this event."
              : "This service has finished."}
          </p>
          <p className="mt-1 font-dm text-sm text-muted">Agreed fee: {feeLabel ?? "—"}</p>
          {data.serviceIncludes && (
            <p className="mt-2 whitespace-pre-line font-dm text-sm text-muted">{data.serviceIncludes}</p>
          )}
          <p className="mt-3 flex items-center gap-1.5 font-dm text-xs text-muted">
            <Receipt size={12} />
            {data.paymentStatus === "paid" ? "Fee paid — thank you."
              : data.paymentStatus === "invoiced" ? "Invoiced. This amount no longer changes, even if tickets are refunded."
              : data.paymentStatus === "waived" ? "Fee waived."
              : "Not invoiced yet."}
          </p>
        </div>
      )}

      {data.status === "cancelled" && (
        <div className="mt-4 border-t border-white/10 pt-4">
          <p className="font-dm text-sm text-muted">
            This request was cancelled{data.cancelledReason ? `: ${data.cancelledReason}` : "."}
          </p>
          <Button className="mt-3 w-full" variant="outline" disabled={busy}
            onClick={() => void act("POST", { note: "" }, "Request sent")}>
            {t.eventManaged.askAgain}
          </Button>
        </div>
      )}
    </div>
  );
}
