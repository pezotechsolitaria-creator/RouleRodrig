"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, AlertTriangle, RefreshCw, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { centsToDecimalString } from "@/lib/money";

type Settings = {
  accepts_cash: boolean;
  accepts_bank_transfer: boolean;
  bank_name: string | null;
  account_holder: string | null;
  account_number: string | null;
  payment_instructions: string | null;
  require_receipt: boolean;
  offers_rr_delivery: boolean;
  offers_pickup: boolean;
  offers_customer_delivery: boolean;
};

type Zone = { id: string; name: string; fee: number };

export default function PaymentSettingsForm({
  zones, maxMinutes, deliveryEnabled,
}: { zones: Zone[]; maxMinutes: number; deliveryEnabled: boolean }) {
  const [s, setS] = useState<Settings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    fetch("/api/merchant/payment-settings")
      .then(async (r) => {
        const b = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(b.error || "Couldn't load your payment settings.");
        return b;
      })
      .then((b) => { if (!cancelled) setS(b.settings); })
      .catch((e) => { if (!cancelled) setLoadError(e instanceof Error ? e.message : "Couldn't load your payment settings."); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!s) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/merchant/payment-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acceptsCash: s.accepts_cash,
          acceptsBankTransfer: s.accepts_bank_transfer,
          bankName: s.bank_name ?? "",
          accountHolder: s.account_holder ?? "",
          accountNumber: s.account_number ?? "",
          paymentInstructions: s.payment_instructions ?? "",
          requireReceipt: s.require_receipt,
          offersRrDelivery: s.offers_rr_delivery,
          offersPickup: s.offers_pickup,
          offersCustomerDelivery: s.offers_customer_delivery,
        }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || "Couldn't save.");
      toast.success("Payment settings saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <div role="alert" className="rounded-2xl border border-red-500/25 bg-red-500/[0.05] p-6 text-center">
        <AlertTriangle className="mx-auto text-red-400" size={22} />
        <p className="mt-2 font-dm text-sm text-red-400">{loadError}</p>
        <Button variant="outline" className="mt-3" onClick={() => setReloadKey((k) => k + 1)}>
          <RefreshCw size={15} className="mr-1.5" /> Try again
        </Button>
      </div>
    );
  }

  if (!s) {
    return (
      <div className="space-y-3" aria-busy="true"><span className="sr-only">Loading…</span>
        <Skeleton className="h-32 w-full rounded-xl bg-white/[0.04]" />
        <Skeleton className="h-40 w-full rounded-xl bg-white/[0.04]" />
      </div>
    );
  }

  const set = (patch: Partial<Settings>) => setS({ ...s, ...patch });
  const bankIncomplete = s.accepts_bank_transfer &&
    !(s.bank_name?.trim() && s.account_holder?.trim() && s.account_number?.trim());
  const noMethod = !s.accepts_cash && !s.accepts_bank_transfer;

  return (
    <form onSubmit={save} className="space-y-6">
      <fieldset className="rounded-2xl border border-white/10 bg-dark-card p-4">
        <legend className="px-1 font-bebas text-[11px] tracking-[0.3em] text-yellow">HOW CUSTOMERS PAY</legend>
        <p className="mt-1 font-dm text-xs text-muted">
          Marketplace orders are paid directly to you — cash in person, or a bank transfer.
          Card payments are only used for vehicle rentals.
        </p>
        <div className="mt-3 space-y-2">
          <label className="flex items-center gap-3 rounded-xl border border-white/15 px-4 py-3">
            <input type="checkbox" checked={s.accepts_cash} onChange={(e) => set({ accepts_cash: e.target.checked })} className="accent-yellow" />
            <span className="font-dm text-sm text-offwhite">Cash</span>
          </label>
          <label className="flex items-center gap-3 rounded-xl border border-white/15 px-4 py-3">
            <input type="checkbox" checked={s.accepts_bank_transfer} onChange={(e) => set({ accepts_bank_transfer: e.target.checked })} className="accent-yellow" />
            <span className="font-dm text-sm text-offwhite">Direct bank transfer</span>
          </label>
        </div>
        {noMethod && <p role="alert" className="mt-2 font-dm text-xs text-red-400">Enable at least one payment method.</p>}
      </fieldset>

      {s.accepts_bank_transfer && (
        <fieldset className="rounded-2xl border border-white/10 bg-dark-card p-4">
          <legend className="px-1 font-bebas text-[11px] tracking-[0.3em] text-yellow">YOUR BANK DETAILS</legend>
          <p className="mt-1 font-dm text-xs text-muted">Shown to a customer after they place a bank-transfer order.</p>
          <div className="mt-3 space-y-3">
            {([
              ["bank_name", "Bank name", "e.g. MCB"],
              ["account_holder", "Account holder", "Name on the account"],
              ["account_number", "Account number", ""],
            ] as const).map(([key, label, ph]) => (
              <div key={key}>
                <label htmlFor={key} className="mb-1 block font-dm text-xs text-muted">{label}</label>
                <input
                  id={key} value={s[key] ?? ""} placeholder={ph}
                  onChange={(e) => set({ [key]: e.target.value } as Partial<Settings>)}
                  className="w-full rounded-xl border border-dark-border bg-dark px-4 py-3 font-dm text-sm text-offwhite placeholder:text-muted/50 focus:border-yellow focus:outline-none"
                />
              </div>
            ))}
            <div>
              <label htmlFor="pi" className="mb-1 block font-dm text-xs text-muted">Payment instructions (optional)</label>
              <Textarea id="pi" rows={2} maxLength={1000} value={s.payment_instructions ?? ""}
                onChange={(e) => set({ payment_instructions: e.target.value })}
                placeholder="e.g. Use your order number as the reference." />
            </div>
            <label className="flex items-center gap-3 rounded-xl border border-white/15 px-4 py-3">
              <input type="checkbox" checked={s.require_receipt} onChange={(e) => set({ require_receipt: e.target.checked })} className="accent-yellow" />
              <span className="font-dm text-sm text-offwhite">Require a payment receipt before I confirm</span>
            </label>
          </div>
          {bankIncomplete && (
            <p role="alert" className="mt-2 font-dm text-xs text-red-400">
              Bank name, account holder and account number are all required for bank transfer.
            </p>
          )}
        </fieldset>
      )}

      <fieldset className="rounded-2xl border border-white/10 bg-dark-card p-4">
        <legend className="px-1 font-bebas text-[11px] tracking-[0.3em] text-yellow">DELIVERY</legend>
        <label className="mt-3 flex items-center gap-3 rounded-xl border border-white/15 px-4 py-3">
          <input type="checkbox" checked={s.offers_rr_delivery} disabled={!deliveryEnabled}
            onChange={(e) => set({ offers_rr_delivery: e.target.checked })} className="accent-yellow" />
          <span className="font-dm text-sm text-offwhite">Roulé Rodrigues delivers for me</span>
        </label>
        {/* The other two ways a customer can receive an order. Both columns
            default to true and create_order() enforces them, so a shop with no
            counter was offering "come and collect" to everyone with no way to
            say no — and a shop that will not hand goods to a stranger's taxi had
            the same problem. */}
        <label className="mt-2 flex items-center gap-3 rounded-xl border border-white/15 px-4 py-3">
          <input type="checkbox" checked={s.offers_pickup}
            onChange={(e) => set({ offers_pickup: e.target.checked })} className="accent-yellow" />
          <span className="font-dm text-sm text-offwhite">Customers can collect from me</span>
        </label>
        <label className="mt-2 flex items-center gap-3 rounded-xl border border-white/15 px-4 py-3">
          <input type="checkbox" checked={s.offers_customer_delivery}
            onChange={(e) => set({ offers_customer_delivery: e.target.checked })} className="accent-yellow" />
          <span className="font-dm text-sm text-offwhite">Customers can send their own driver</span>
        </label>
        {!s.offers_rr_delivery && !s.offers_pickup && !s.offers_customer_delivery && (
          <p role="alert" className="mt-2 rounded-xl border border-orange-400/30 bg-orange-400/[0.07] px-4 py-2.5 font-dm text-xs text-orange-200">
            With all three off, a customer could order and have no way to receive it. Leave at least one on.
          </p>
        )}
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-white/[0.03] px-4 py-3">
          <Truck size={15} className="mt-0.5 shrink-0 text-muted" />
          <div className="font-dm text-xs text-muted">
            {deliveryEnabled ? (
              <>
                <p>
                  Delivery fees are set by Roulé Rodrigues, not by your shop, and depend on where the
                  customer is. The customer picks their area at checkout and pays that fee.
                </p>
                {zones.length > 0 && (
                  <ul className="mt-2 space-y-0.5">
                    {zones.map((z) => (
                      <li key={z.id} className="flex justify-between gap-3">
                        <span>{z.name}</span>
                        <span className="shrink-0 text-offwhite">Rs {centsToDecimalString(z.fee)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-2">
                  Deliveries usually happen within {Math.round(maxMinutes / 60)} hours — the customer and the
                  driver agree the exact time between themselves, so it is not a guarantee your shop makes.
                  Customers can always choose pickup or arrange their own driver.
                </p>
              </>
            ) : (
              <p>Roulé Rodrigues delivery is paused platform-wide at the moment.</p>
            )}
          </div>
        </div>
      </fieldset>

      {error && <p role="alert" className="font-dm text-sm text-red-400">{error}</p>}

      <Button type="submit" className="w-full" disabled={saving || noMethod || !!bankIncomplete}>
        {saving ? <Loader2 size={16} className="animate-spin" /> : "Save payment settings"}
      </Button>
    </form>
  );
}
