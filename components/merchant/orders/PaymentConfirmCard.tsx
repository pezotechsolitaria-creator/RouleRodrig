"use client";

import { useState } from "react";
import posthog from "posthog-js";
import { toast } from "sonner";
import { Receipt, Loader2, ExternalLink, ShieldCheck, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { centsToDecimalString } from "@/lib/money";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Confirming payment is the one action the platform cannot verify for the
// merchant — the money moves directly between customer and shop — so the UI
// makes the merchant look at the receipt and then assert it explicitly.
export default function PaymentConfirmCard({
  orderId, provider, paymentStatus, orderStatus, amount, hasReceipt, receiptSubmittedAt, balanceDue = 0, allowSplit = true, onConfirmed,
}: {
  orderId: string;
  provider: string;
  paymentStatus: string;
  orderStatus: string;
  amount: number;
  hasReceipt: boolean;
  receiptSubmittedAt: string | null;
  /** Cash still owed on a split payment, in minor units. */
  balanceDue?: number;
  /**
   * M89 — false while the platform is prepayment-only. Recording a PART
   * payment books the remainder as a pending cash row, which the payments
   * trigger now refuses, so the control would fail with a raw database error.
   * A balance already on an older order still renders and can still be settled.
   */
  allowSplit?: boolean;
  onConfirmed: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [opening, setOpening] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [settling, setSettling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const settled = paymentStatus === "captured";
  const canConfirm = !settled && (orderStatus === "pending_payment" || orderStatus === "awaiting_payment_confirmation");

  // Cash and bank transfer are different acts, and the copy said only one of
  // them. "Confirm payment received … once the money is actually in your
  // account" is bank-transfer language, and it was shown verbatim to cash
  // merchants — for whom there is no account to check, because the customer
  // hands over notes at pickup or delivery. A merchant reading an instruction
  // that does not match what they are doing either hesitates or clicks through
  // it, and on cash this is the button that turns money into evidence.
  const isCash = provider === "cash";
  const confirmLabel = isCash ? "Record payment received" : "Confirm payment received";
  const confirmBlurb = isCash
    ? "Do this once the customer has actually handed you the money. It records the payment against this order — it can't be undone here."
    : "Only do this once the money is actually in your account. This marks the order as paid and tells the customer to expect it — it can't be undone here.";

  async function openReceipt() {
    setOpening(true);
    setError(null);
    try {
      const r = await fetch(`/api/merchant/orders/${orderId}/receipt-url`);
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || "Could not open the receipt.");
      // Signed, short-lived URL — opened in a new tab rather than embedded so
      // PDFs and images both work without a viewer dependency.
      window.open(b.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the receipt.");
    } finally {
      setOpening(false);
    }
  }

  /** window.confirm, aliased: the local confirm() below shadows the global. */
  const askConfirm = (msg: string) => window.confirm(msg);

  async function confirm(amountReceived?: number) {
    setDialog(false);
    setConfirming(true);
    setError(null);
    try {
      const r = await fetch(`/api/merchant/orders/${orderId}/confirm-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(amountReceived ? { amountReceived } : {}),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || "Could not confirm the payment.");
      posthog.capture("merchant_payment_confirmed", {
        order_id: orderId,
        payment_method: provider,
        has_receipt: hasReceipt,
      });
      toast.success(amountReceived ? "Deposit recorded. The rest is due in cash." : "Payment confirmed.");
      onConfirmed();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not confirm the payment.");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-dark-card p-4">
      <h2 className="flex items-center gap-1.5 font-syne text-sm font-bold text-offwhite">
        <Receipt size={14} className="text-yellow" /> Payment
      </h2>

      <dl className="mt-3 space-y-1 font-dm text-sm">
        <div className="flex justify-between">
          <dt className="text-muted">Method</dt>
          <dd className="capitalize text-offwhite">{provider.replace("_", " ")}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Amount</dt>
          <dd className="text-offwhite">Rs {centsToDecimalString(amount)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Status</dt>
          <dd className={settled ? "text-green-400" : "text-yellow"}>{settled ? "Paid" : paymentStatus}</dd>
        </div>
      </dl>

      {provider === "bank_transfer" && (
        <div className="mt-3 border-t border-white/10 pt-3">
          {hasReceipt ? (
            <>
              <p className="font-dm text-xs text-muted">
                Receipt sent{receiptSubmittedAt ? ` ${new Date(receiptSubmittedAt).toLocaleString()}` : ""}
              </p>
              <Button type="button" variant="outline" size="sm" className="mt-2" onClick={openReceipt} disabled={opening}>
                {opening ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <ExternalLink size={14} className="mr-1.5" />}
                View receipt
              </Button>
            </>
          ) : (
            <p className="flex items-start gap-1.5 font-dm text-xs text-muted">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              The customer hasn&apos;t uploaded a receipt yet.
            </p>
          )}
        </div>
      )}

      {error && <p role="alert" className="mt-2 font-dm text-xs text-red-400">{error}</p>}

      {canConfirm && (
        <>
          <Button type="button" className="mt-3 w-full" onClick={() => setDialog(true)} disabled={confirming}>
            {confirming ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : <ShieldCheck size={15} className="mr-1.5" />}
            {confirmLabel}
          </Button>

          {/* A deposit now, the rest in cash on handover. Secondary to paying in
              full because it is the rarer case, but on the SAME card: sending
              somebody elsewhere to record a half-payment means it does not get
              recorded at all. Hidden entirely once cash is off (M89) — a
              half-paid order is precisely the exposure prepayment removes. */}
          {allowSplit && (
          <Button
            type="button"
            variant="outline"
            className="mt-2 w-full"
            disabled={confirming}
            onClick={() => {
              const answer = window.prompt(
                `How much did you actually receive?

The order is Rs ${centsToDecimalString(amount)}. The rest becomes cash to collect on handover.`,
                centsToDecimalString(Math.round(amount / 2)),
              );
              if (answer === null) return;
              const n = Number(answer.replace(",", ".").trim());
              if (!Number.isFinite(n) || n <= 0) { setError("Enter how much was received, for example 250."); return; }
              const minor = Math.round(n * 100);
              if (minor > amount) { setError("That is more than the order total."); return; }
              void confirm(minor);
            }}
          >
            Only part of it arrived…
          </Button>
          )}
        </>
      )}

      {/* Money still owed. Loud, because it is the one thing on this card that
          costs real money if whoever hands the order over forgets it. */}
      {balanceDue > 0 && (
        <div className="mt-3 rounded-xl border border-red-400/40 bg-red-500/[0.08] p-3">
          <p className="font-syne text-sm font-bold text-red-300">
            Collect Rs {centsToDecimalString(balanceDue)} in cash
          </p>
          <p className="mt-0.5 font-dm text-xs text-muted">Due when the customer takes the order.</p>
          <Button
            type="button"
            className="mt-2 w-full"
            disabled={settling}
            onClick={async () => {
              if (!askConfirm(`Confirm you received Rs ${centsToDecimalString(balanceDue)} in cash?`)) return;
              setSettling(true);
              setError(null);
              try {
                const r = await fetch(`/api/merchant/orders/${orderId}/settle-balance`, { method: "POST" });
                const b = await r.json().catch(() => ({}));
                if (!r.ok) throw new Error(b.error || "Could not record that.");
                toast.success("Cash recorded.");
                onConfirmed();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Could not record that.");
              } finally {
                setSettling(false);
              }
            }}
          >
            {settling ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : null}
            Cash received
          </Button>
        </div>
      )}

      <AlertDialog open={dialog} onOpenChange={setDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm you received Rs {centsToDecimalString(amount)}?</AlertDialogTitle>
            <AlertDialogDescription>{confirmBlurb}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirm()}>Yes, I received it</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
