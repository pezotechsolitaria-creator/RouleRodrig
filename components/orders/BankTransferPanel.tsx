"use client";

import { useState } from "react";
import { Copy, Check, Landmark, Clock } from "lucide-react";
import { centsToDecimalString } from "@/lib/money";
import ReceiptUploader from "./ReceiptUploader";

export type BankDetails = {
  bank_name: string | null;
  account_holder: string | null;
  account_number: string | null;
  payment_instructions: string | null;
  require_receipt: boolean;
};

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] py-2.5 last:border-0">
      <div className="min-w-0">
        <dt className="font-dm text-[11px] uppercase tracking-wide text-muted">{label}</dt>
        <dd className="truncate font-dm text-sm text-offwhite">{value}</dd>
      </div>
      <button
        type="button"
        // The label names the field, so a screen-reader user isn't left with
        // four identical "Copy" buttons.
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
      <span className="sr-only" aria-live="polite">{copied ? `${label} copied` : ""}</span>
    </div>
  );
}

export default function BankTransferPanel({
  orderId, orderNumber, amount, bank, awaitingConfirmation, children,
}: {
  /** Omitted for a guest order, which has no session and so no file upload. */
  orderId?: string;
  orderNumber: string;
  amount: number;
  bank: BankDetails | null;
  awaitingConfirmation: boolean;
  /** Replaces the receipt uploader. A GUEST cannot upload — storage RLS needs a
   *  session — so /orders/track passes a "I have sent the transfer" button here
   *  instead, and the panel itself stays identical for both buyers (M21). */
  children?: React.ReactNode;
}) {
  // Already reported — the customer's work is done; they're waiting on the shop.
  if (awaitingConfirmation) {
    return (
      <section aria-labelledby="pay-h" className="rounded-2xl border border-yellow/25 bg-yellow/[0.05] p-5">
        <h2 id="pay-h" className="flex items-center gap-2 font-syne text-base font-bold text-offwhite">
          <Clock size={16} className="text-yellow" /> Awaiting confirmation
        </h2>
        <p className="mt-1.5 font-dm text-sm text-muted">
          Thanks — we&apos;ve told them you&apos;ve paid. They&apos;ll check their account and confirm your
          order shortly. You&apos;ll get a notification the moment they do.
        </p>
      </section>
    );
  }

  const hasBank = bank?.bank_name && bank?.account_holder && bank?.account_number;

  return (
    <section aria-labelledby="pay-h" className="rounded-2xl border border-white/10 bg-dark-card p-5">
      <h2 id="pay-h" className="flex items-center gap-2 font-syne text-base font-bold text-offwhite">
        <Landmark size={16} className="text-yellow" /> Pay by bank transfer
      </h2>

      <div className="mt-3 rounded-xl border border-yellow/25 bg-yellow/[0.06] px-4 py-3">
        <p className="font-dm text-xs text-muted">Transfer exactly</p>
        {/* Server-derived; the customer wires this figure, so it is never
            computed in the browser. */}
        <p className="font-syne text-2xl font-extrabold text-yellow">Rs {centsToDecimalString(amount)}</p>
        <p className="mt-0.5 font-dm text-xs text-muted">
          Use <span className="text-offwhite">{orderNumber}</span> as the reference.
        </p>
      </div>

      {hasBank ? (
        <dl className="mt-3">
          <CopyRow label="Bank" value={bank!.bank_name!} />
          <CopyRow label="Account holder" value={bank!.account_holder!} />
          <CopyRow label="Account number" value={bank!.account_number!} />
          <CopyRow label="Reference" value={orderNumber} />
        </dl>
      ) : (
        <p role="alert" className="mt-3 font-dm text-sm text-red-400">
          They haven&apos;t published bank details yet. Please contact them before transferring.
        </p>
      )}

      {bank?.payment_instructions && (
        <p className="mt-3 rounded-xl bg-white/[0.03] px-4 py-3 font-dm text-xs text-muted">
          {bank.payment_instructions}
        </p>
      )}

      {hasBank && (
        <div className="mt-4 border-t border-white/10 pt-4">
          {children ?? (orderId ? <ReceiptUploader orderId={orderId} required={!!bank?.require_receipt} /> : null)}
        </div>
      )}
    </section>
  );
}
