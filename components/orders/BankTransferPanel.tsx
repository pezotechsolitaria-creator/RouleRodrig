"use client";

import { useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { Copy, Check, Landmark, Clock } from "lucide-react";
import { centsToDecimalString } from "@/lib/money";
import PaymentHelp from "@/components/payments/PaymentHelp";
import type { PaymentTopic } from "@/lib/payment-help";
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
  orderId, orderNumber, amount, bank, awaitingConfirmation, children, reportFailure = null,
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
  /** `children` own their failure state, so the caller says here when that
   *  report just failed, and how — the help card then lights up with it. */
  reportFailure?: Extract<PaymentTopic, "upload_failed" | "transfer_not_showing"> | null;
}) {
  const { t } = useLanguage();
  // Lifted out of ReceiptUploader (the signed-in path) for the help card.
  const [receiptFailed, setReceiptFailed] = useState(false);

  // `amount` is orders.total — CENTS. One string, used both for the figure the
  // customer wires and for the help message, so the two can never disagree.
  const amountLabel = `Rs ${centsToDecimalString(amount)}`;

  // ── Payment help, in every state this panel has ───────────────────────────
  // Directly under the panel rather than inside it: the panel ends on the pay
  // action, so this sits right beneath the button, and it keeps its own full
  // width instead of becoming a card nested in a card. Only this panel places
  // it, so /orders/[id] and /orders/track (both render this) get exactly one.
  const help = (emphasis: boolean, defaultTopic?: PaymentTopic) => (
    <PaymentHelp
      section="order"
      reference={orderNumber}
      amount={amountLabel}
      method="bank_transfer"
      defaultTopic={defaultTopic}
      emphasis={emphasis}
    />
  );

  // Already reported — the customer's work is done; they're waiting on the shop.
  // Help stays: "I paid, but it isn't showing" is THIS state's question.
  if (awaitingConfirmation) {
    return (
      <div className="space-y-4">
        <section aria-labelledby="pay-h" className="rounded-2xl border border-yellow/25 bg-yellow/[0.05] p-5">
          <h2 id="pay-h" className="flex items-center gap-2 font-syne text-base font-bold text-offwhite">
            <Clock size={16} className="text-yellow" /> {t.bankPanel.awaiting}
          </h2>
          <p className="mt-1.5 font-dm text-sm text-muted">
            Thanks — we&apos;ve told them you&apos;ve paid. They&apos;ll check their account and confirm your
            order shortly. You&apos;ll get a notification the moment they do.
          </p>
        </section>
        {help(false, "transfer_not_showing")}
      </div>
    );
  }

  const hasBank = bank?.bank_name && bank?.account_holder && bank?.account_number;

  return (
    <div className="space-y-4">
      <section aria-labelledby="pay-h" className="rounded-2xl border border-white/10 bg-dark-card p-5">
        <h2 id="pay-h" className="flex items-center gap-2 font-syne text-base font-bold text-offwhite">
          <Landmark size={16} className="text-yellow" /> {t.bankPanel.payByTransfer}
        </h2>

        <div className="mt-3 rounded-xl border border-yellow/25 bg-yellow/[0.06] px-4 py-3">
          <p className="font-dm text-xs text-muted">{t.bankPanel.transferExactly}</p>
          {/* Server-derived; the customer wires this figure, so it is never
              computed in the browser. */}
          <p className="font-syne text-2xl font-extrabold text-yellow">{amountLabel}</p>
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
            {t.bankPanel.noBankDetails}
          </p>
        )}

        {bank?.payment_instructions && (
          <p className="mt-3 rounded-xl bg-white/[0.03] px-4 py-3 font-dm text-xs text-muted">
            {bank.payment_instructions}
          </p>
        )}

        {hasBank && (
          <div className="mt-4 border-t border-white/10 pt-4">
            {children ?? (orderId ? (
              <ReceiptUploader
                orderId={orderId}
                required={!!bank?.require_receipt}
                onError={(message) => setReceiptFailed(message !== null)}
              />
            ) : null)}
          </div>
        )}
      </section>

      {/* No bank details is a dead end — there is nowhere to send the money —
          so the card is lit from the start. The "order" section offers no
          "how do I pay" problem, so "Something else" is preselected rather
          than the misleading "I paid, but it isn't showing". Otherwise it
          lights up the moment a receipt or a guest's report fails. */}
      {!hasBank
        ? help(true, "how_to_pay")
        : reportFailure
          ? help(true, reportFailure)
          : help(receiptFailed, receiptFailed ? "upload_failed" : undefined)}
    </div>
  );
}
