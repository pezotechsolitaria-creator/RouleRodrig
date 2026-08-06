"use client";

import { useState } from "react";
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
  orderId, provider, paymentStatus, orderStatus, amount, hasReceipt, receiptSubmittedAt, onConfirmed,
}: {
  orderId: string;
  provider: string;
  paymentStatus: string;
  orderStatus: string;
  amount: number;
  hasReceipt: boolean;
  receiptSubmittedAt: string | null;
  onConfirmed: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [opening, setOpening] = useState(false);
  const [dialog, setDialog] = useState(false);
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

  async function confirm() {
    setDialog(false);
    setConfirming(true);
    setError(null);
    try {
      const r = await fetch(`/api/merchant/orders/${orderId}/confirm-payment`, { method: "POST" });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || "Could not confirm the payment.");
      toast.success("Payment confirmed.");
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
        <Button type="button" className="mt-3 w-full" onClick={() => setDialog(true)} disabled={confirming}>
          {confirming ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : <ShieldCheck size={15} className="mr-1.5" />}
          {confirmLabel}
        </Button>
      )}

      <AlertDialog open={dialog} onOpenChange={setDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm you received Rs {centsToDecimalString(amount)}?</AlertDialogTitle>
            <AlertDialogDescription>{confirmBlurb}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction onClick={confirm}>Yes, I received it</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
