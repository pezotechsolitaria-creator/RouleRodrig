"use client";

import { useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Banknote, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { OrganizerPaymentSettings } from "@/lib/events/organizer";

// How the organiser gets paid.
//
// This exists because an event store starts with cash-only and no bank details,
// and the only writer for store_payment_settings was the merchant dashboard —
// which an organiser deliberately cannot reach (M43). Without this screen, bank
// transfer could never be switched on for an event, which meant the entire
// payment path built in M49 had no way to be used.
//
// The account number is the organiser's own, and they are the payee: Roulé
// Rodrigues never touches ticket money. The database enforces the parts that
// matter — at least one payment method, and complete bank details whenever
// transfer is on (a CHECK constraint, not just this form).
export default function PaymentSetup({
  storeId,
  initial,
}: {
  storeId: string;
  initial: OrganizerPaymentSettings | null;
}) {
  const { t } = useLanguage();
  const router = useRouter();
  // M89 — a NEW organiser no longer arrives with Cash pre-ticked and transfer
  // off. That default let somebody set up, save happily, and sell nothing:
  // cash is refused platform-wide, so the only configuration that can actually
  // take money is a bank account. Starting with transfer on surfaces the empty
  // required fields immediately, which is the guidance they need. An existing
  // organiser's saved values are untouched.
  const [cash, setCash] = useState(initial?.acceptsCash ?? false);
  const [bank, setBank] = useState(initial?.acceptsBankTransfer ?? true);
  const [bankName, setBankName] = useState(initial?.bankName ?? "");
  const [holder, setHolder] = useState(initial?.accountHolder ?? "");
  const [account, setAccount] = useState(initial?.accountNumber ?? "");
  const [instructions, setInstructions] = useState(initial?.instructions ?? "");
  const [requireReceipt, setRequireReceipt] = useState(initial?.requireReceipt ?? false);
  const [saving, setSaving] = useState(false);

  const bankComplete = bankName.trim() && holder.trim() && account.trim();
  const blocked = !cash && !bank
    ? "Choose at least one way to be paid, or nobody can buy a ticket."
    : bank && !bankComplete
      ? "Bank transfer needs the bank name, the account holder and the account number."
      : null;

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/organizer/payments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId,
          acceptsCash: cash,
          acceptsBankTransfer: bank,
          bankName, accountHolder: holder, accountNumber: account,
          instructions, requireReceipt,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not save that.");
      toast.success("Payment details saved");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save that.");
    } finally {
      setSaving(false);
    }
  }

  const nothingSetUp = !initial || (!initial.acceptsCash && !initial.acceptsBankTransfer);

  return (
    <div className="rounded-2xl border border-white/10 bg-dark-card p-5">
      <h2 className="flex items-center gap-2 font-bebas text-[11px] tracking-[0.3em] text-yellow">
        <Banknote size={14} /> {t.eventPayout.title}
      </h2>

      {nothingSetUp && (
        <p className="mt-2 flex items-start gap-2 rounded-xl border border-orange-400/30 bg-orange-400/[0.06] p-3 font-dm text-xs text-orange-200">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          {t.eventPayout.untilSetUp}
        </p>
      )}

      <p className="mt-2 font-dm text-xs leading-relaxed text-muted">
        Buyers pay you directly — Roulé Rodrigues never holds your ticket money. That is also why
        you are the one who confirms a payment landed.
      </p>

      <div className="mt-4 space-y-2">
        <Toggle checked={cash} onChange={setCash} label="Cash" hint="Paid to you in person." />
        <Toggle
          checked={bank}
          onChange={setBank}
          label="Bank transfer"
          hint="Your account details are shown to the buyer after they order."
        />
      </div>

      {bank && (
        <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
          <label className="block">
            <span className="font-dm text-xs text-muted">Bank</span>
            <Input value={bankName} onChange={(e) => setBankName(e.target.value)} className="mt-1" />
          </label>
          <label className="block">
            <span className="font-dm text-xs text-muted">{t.eventPayout.accountHolder}</span>
            <Input value={holder} onChange={(e) => setHolder(e.target.value)} className="mt-1" />
          </label>
          <label className="block">
            <span className="font-dm text-xs text-muted">{t.eventPayout.accountNumber}</span>
            <Input value={account} onChange={(e) => setAccount(e.target.value)} className="mt-1" />
          </label>
          <label className="block">
            <span className="font-dm text-xs text-muted">{t.eventPayout.buyerNote}</span>
            <Textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={2}
              className="mt-1"
            />
          </label>

          <Toggle
            checked={requireReceipt}
            onChange={setRequireReceipt}
            label="Ask for proof of transfer"
            hint="Buyers must attach a photo or PDF before they can report a payment. They do not need an account."
          />
        </div>
      )}

      {blocked && <p className="mt-3 font-dm text-xs text-orange-300">{blocked}</p>}

      <Button className="mt-4 w-full" disabled={saving || !!blocked} onClick={() => void save()}>
        {saving ? <Loader2 size={15} className="animate-spin" /> : "Save payment details"}
      </Button>
    </div>
  );
}

function Toggle({
  checked, onChange, label, hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      className={`block w-full rounded-xl border p-3 text-left transition ${
        checked ? "border-yellow/60 bg-yellow/[0.06]" : "border-white/10 bg-white/[0.02] hover:border-white/20"
      }`}
    >
      <span className="font-syne text-sm font-bold text-offwhite">{label}</span>
      <span className="mt-0.5 block font-dm text-xs leading-relaxed text-muted">{hint}</span>
    </button>
  );
}
