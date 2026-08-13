"use client";

import { useState } from "react";
import { Landmark, Copy, Check } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import BookingReceiptUpload from "@/components/BookingReceiptUpload";

// Local bank-transfer option, for customers (often locals) who'd rather pay the
// deposit by MCB transfer than card. Hidden behind a "Request bank details"
// button so it doesn't clutter the card, then reveals the real account details.
// These are the owner's public payment details (same as the confirmation email).
const BANK = "MCB (Mauritius Commercial Bank)";
const ACCOUNT = "000447902350";

export default function BankTransferDetails({
  name,
  vehicle,
  settlement = "deposit",
  bookingId,
  email,
}: {
  name: string;
  vehicle: string;
  /** The booking this transfer is for. With `email`, unlocks the receipt
   *  upload — the credential is reference + email, exactly as on /track. */
  bookingId?: string;
  email?: string;
  /**
   * "full" when the amount alongside is the whole price rather than a deposit.
   * Activities are settled in full at booking, and "transfer the deposit" would
   * tell that customer to send part of it and wait for a bill that never comes.
   */
  settlement?: "deposit" | "full";
}) {
  const { language } = useLanguage();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const T = {
    en: { request: "Pay by local bank transfer", bank: "Bank", account: "Account number", ref: "Reference", note: "Transfer the deposit, quote the reference, then send us the receipt on WhatsApp. We confirm your booking once it's received." },
    fr: { request: "Payer par virement bancaire local", bank: "Banque", account: "Numéro de compte", ref: "Référence", note: "Virez l'acompte, indiquez la référence, puis envoyez-nous le reçu sur WhatsApp. Nous confirmons dès réception." },
    cr: { request: "Pey par vireman labank lokal", bank: "Labank", account: "Nimero kont", ref: "Referans", note: "Vir depo, met referans, apre avoy nou resi lor WhatsApp. Nou konfirmen kan nou resevwar li." },
  }[language] ?? { request: "Pay by local bank transfer", bank: "Bank", account: "Account number", ref: "Reference", note: "Transfer the deposit, quote the reference, then send us the receipt on WhatsApp." };

  // Same instructions, minus the word that promises a balance later.
  const FULL_NOTE = {
    en: "Transfer the full amount, quote the reference, then send us the receipt on WhatsApp. We confirm your booking once it's received.",
    fr: "Virez la totalité, indiquez la référence, puis envoyez-nous le reçu sur WhatsApp. Nous confirmons dès réception.",
    cr: "Vir tou montan, met referans, apre avoy nou resi lor WhatsApp. Nou konfirmen kan nou resevwar li.",
  };
  const note = settlement === "full" ? (FULL_NOTE[language as keyof typeof FULL_NOTE] ?? FULL_NOTE.en) : T.note;

  const reference = `${name} — ${vehicle}`.slice(0, 60);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ACCOUNT);
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
          <dd className="text-offwhite text-right">{BANK}</dd>
        </div>
        <div className="flex justify-between gap-3 items-center">
          <dt className="text-muted">{T.account}</dt>
          <dd className="flex items-center gap-2">
            <span className="text-offwhite font-mono">{ACCOUNT}</span>
            <button type="button" onClick={copy} className="text-muted hover:text-yellow" aria-label="Copy account number">
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
      {bookingId && email ? <BookingReceiptUpload bookingId={bookingId} email={email} /> : null}
    </div>
  );
}
