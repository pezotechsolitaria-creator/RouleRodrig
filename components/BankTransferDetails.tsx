"use client";

import { useState } from "react";
import { Landmark, Copy, Check } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import BookingReceiptUpload from "@/components/BookingReceiptUpload";
import { PAYMENT } from "@/lib/payment-details";

// Local payment option, for customers (often locals) who'd rather pay the
// deposit by MCB Juice or transfer than by card. Hidden behind a button so it
// doesn't clutter the card, then reveals the real account details.
//
// READ, NOT REPEATED. These three lines used to be literals here AND in
// lib/email.ts, which meant the page and the confirmation email could quietly
// disagree about where to send money. One module now, and the same digits on
// every surface.

export default function BankTransferDetails({
  name,
  vehicle,
  settlement = "deposit",
  bookingId,
  email,
  onReceiptFailedChange,
}: {
  name: string;
  vehicle: string;
  /** The booking this transfer is for. With `email`, unlocks the receipt
   *  upload — the credential is reference + email, exactly as on /track. */
  bookingId?: string;
  email?: string;
  /** Passed through to the receipt upload: true while its error is showing.
   *  The page owns the one payment-help card, so this panel does not draw one. */
  onReceiptFailedChange?: (failed: boolean) => void;
  /**
   * "full" when the amount alongside is the whole price rather than a deposit.
   * Activities are settled in full at booking, and "transfer the deposit" would
   * tell that customer to send part of it and wait for a bill that never comes.
   */
  settlement?: "deposit" | "full";
}) {
  const { t } = useLanguage();
  const { language } = useLanguage();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // "MCB Juice" is named in every language because it is how most people on the
  // island actually pay. A label reading only "bank transfer" sends somebody
  // looking for a branch app instead of the one already on their home screen —
  // and the destination is the same account either way.
  const T = {
    en: { request: "Pay by MCB Juice or bank transfer", bank: "Bank", holder: "Account name", account: "Account number (Juice or transfer)", ref: "Reference", note: "Send the deposit by Juice or transfer, quote the reference, then send us the receipt on WhatsApp. We confirm your booking once it's received." },
    fr: { request: "Payer par MCB Juice ou virement", bank: "Banque", holder: "Nom du compte", account: "Numéro de compte (Juice ou virement)", ref: "Référence", note: "Envoyez l'acompte par Juice ou virement, indiquez la référence, puis envoyez-nous le reçu sur WhatsApp. Nous confirmons dès réception." },
    cr: { request: "Pey ar MCB Juice ou vireman", bank: "Labank", holder: "Non kont", account: "Nimero kont (Juice ou vireman)", ref: "Referans", note: "Avoy depo par Juice ou vireman, met referans, apre avoy nou resi lor WhatsApp. Nou konfirmen kan nou resevwar li." },
  }[language] ?? { request: "Pay by MCB Juice or bank transfer", bank: "Bank", holder: "Account name", account: "Account number (Juice or transfer)", ref: "Reference", note: "Send the deposit by Juice or transfer, quote the reference, then send us the receipt on WhatsApp." };

  // Same instructions, minus the word that promises a balance later.
  const FULL_NOTE = {
    en: "Send the full amount by Juice or transfer, quote the reference, then send us the receipt on WhatsApp. We confirm your booking once it's received.",
    fr: "Envoyez la totalité par Juice ou virement, indiquez la référence, puis envoyez-nous le reçu sur WhatsApp. Nous confirmons dès réception.",
    cr: "Avoy tou montan par Juice ou vireman, met referans, apre avoy nou resi lor WhatsApp. Nou konfirmen kan nou resevwar li.",
  };
  const note = settlement === "full" ? (FULL_NOTE[language as keyof typeof FULL_NOTE] ?? FULL_NOTE.en) : T.note;

  const reference = `${name} — ${vehicle}`.slice(0, 60);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(PAYMENT.account);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 w-full flex items-center justify-center gap-2 border border-dark-border text-offwhite/90 font-syne font-bold text-sm py-3 rounded-xl hover:border-yellow/40 hover:text-yellow transition-colors"
      >
        <Landmark size={16} /> {T.request}
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-dark-border bg-dark-card/60 p-4">
      <dl className="space-y-2 text-sm font-dm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">{T.bank}</dt>
          <dd className="text-offwhite text-right">{PAYMENT.bank}</dd>
        </div>
        {/* The name a banking app asks for before it asks for the number. */}
        <div className="flex justify-between gap-3">
          <dt className="text-muted">{T.holder}</dt>
          <dd className="text-offwhite text-right">{PAYMENT.accountName}</dd>
        </div>
        <div className="flex justify-between gap-3 items-center">
          <dt className="text-muted">{T.account}</dt>
          <dd className="flex items-center gap-2">
            <span className="text-offwhite font-mono">{PAYMENT.account}</span>
            <button type="button" onClick={copy} className="text-muted hover:text-yellow" aria-label={t.common.copyAccountNumber}>
              {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
            </button>
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted shrink-0">{T.ref}</dt>
          <dd className="text-offwhite text-right">{reference}</dd>
        </div>
      </dl>
      <p className="mt-3 text-muted/80 text-xs font-dm leading-relaxed">{note}</p>

      {/* Upload it here rather than on WhatsApp — the proof then lives ON the
          booking, where /admin reads it, instead of in a chat thread the owner
          has to scroll. Falls back to the WhatsApp instruction above when there
          is no email on the booking: email is optional for vehicle rentals, and
          reference + email is the credential this upload is proven by. */}
      {bookingId && email ? (
        <BookingReceiptUpload bookingId={bookingId} email={email} onFailedChange={onReceiptFailedChange} />
      ) : null}
    </div>
  );
}
