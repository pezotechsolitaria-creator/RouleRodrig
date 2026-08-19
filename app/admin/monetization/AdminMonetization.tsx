"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, AlertTriangle, Check, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { centsToDecimalString, toCents } from "@/lib/money";
import { holdWindowLabel } from "@/lib/orders/hold";
import {
  MODEL_COPY,
  MONETIZATION_MODELS,
  formatRate,
  modelChargesCommission,
  modelChargesSubscription,
  type MonetizationModel,
} from "@/lib/marketplace/fees";

// The admin's view of how Roulé Rodrigues earns.
//
// This screen changes real money, so two rules shape it:
//   1. It NEVER computes a fee. Every figure shown comes from
//      admin_financial_overview(), which aggregates order_financials in the
//      database. The browser is a display surface, not a calculator.
//   2. The rate travels as a RATE (0.10), the same units the column stores. The
//      "%" only exists in the input box, so there is no wire format in which a
//      factor-of-100 mistake could hide.

type Plan = {
  slug: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  billing_interval: string;
  commission_rate: number | null;
  max_products: number | null;
  max_staff: number | null;
  allows_selling: boolean;
  is_active: boolean;
};

type Overview = {
  earned?: { orders: number; gmv: number; merchandise: number; commission: number; merchantNet: number; deliveryFees: number };
  /** Genuinely still open — not paid, not closed. */
  pending?: { orders: number; commission: number };
  /** Earned and then given back. The only bucket that is money LOST. */
  reversed?: { orders: number; commission: number };
  /** Closed without ever becoming revenue: expired holds, abandoned checkouts.
   *  Kept separate from `reversed` because "we lost revenue" and "this never
   *  became revenue" are different facts (M26). */
  closedUnpaid?: { orders: number; wouldHaveBeen: number };
  subscriptions?: { paid: number; due: number; overdueCount: number };
  merchants?: { total: number; approved: number; withOverride: number };
};

const rs = (cents: number) => `Rs ${centsToDecimalString(cents ?? 0)}`;

export default function AdminMonetization() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [model, setModel] = useState<MonetizationModel>("subscription");
  const [ratePct, setRatePct] = useState("0");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [savedModel, setSavedModel] = useState<MonetizationModel>("subscription");
  const [savedRatePct, setSavedRatePct] = useState("0");

  // The order reservation window (backlog #53). Kept in its own state and saved
  // by its own button: it shares a row with the commission model but is not the
  // same decision, and an owner shortening a deadline must not also re-publish
  // the platform's revenue model.
  const [hold, setHold] = useState({ cash: "168", bankTransfer: "48", manual: "48" });
  const [savedHold, setSavedHold] = useState({ cash: "168", bankTransfer: "48", manual: "48" });
  const [savingHold, setSavingHold] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/monetization");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not load monetization settings.");
      const pct = String(Math.round((body.defaultCommissionRate ?? 0) * 100 * 1000) / 1000);
      setModel(body.model as MonetizationModel);
      setSavedModel(body.model as MonetizationModel);
      setRatePct(pct);
      setSavedRatePct(pct);
      const h = body.orderHoldHours ?? {};
      const asText = {
        cash: String(h.cash ?? 168),
        bankTransfer: String(h.bankTransfer ?? 48),
        manual: String(h.manual ?? 48),
      };
      setHold(asText);
      setSavedHold(asText);
      setPlans(body.plans ?? []);
      setOverview(body.overview ?? null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load monetization settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const pctNumber = Number.parseFloat(ratePct.replace(",", "."));
  const pctValid = Number.isFinite(pctNumber) && pctNumber >= 0 && pctNumber <= 50;
  const dirty = model !== savedModel || ratePct !== savedRatePct;

  async function save() {
    if (!pctValid) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/monetization", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // A rate, not a percentage — matching the column.
        body: JSON.stringify({ model, defaultCommissionRate: pctNumber / 100 }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not save.");
      setSavedModel(model);
      setSavedRatePct(ratePct);
      toast.success("Monetization updated");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  const holdNums = {
    cash: Number(hold.cash),
    bankTransfer: Number(hold.bankTransfer),
    manual: Number(hold.manual),
  };
  const holdValid = Object.values(holdNums).every(
    (n) => Number.isInteger(n) && n >= 1 && n <= 8760,
  );
  const holdDirty =
    hold.cash !== savedHold.cash ||
    hold.bankTransfer !== savedHold.bankTransfer ||
    hold.manual !== savedHold.manual;

  async function saveHold() {
    setSavingHold(true);
    try {
      const res = await fetch("/api/admin/monetization", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(holdNums),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not save the reservation window.");
      setSavedHold({ ...hold });
      toast.success("Reservation window saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the reservation window.");
    } finally {
      setSavingHold(false);
    }
  }

  async function savePlan(plan: Plan, priceInput: string) {
    const cents = toCents(priceInput);
    if (cents === null) {
      toast.error("That price isn't valid.");
      return;
    }
    try {
      const res = await fetch("/api/admin/monetization", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: plan.slug,
          name: plan.name,
          description: plan.description ?? "",
          priceCents: cents,
          commissionRate: plan.commission_rate,
          maxProducts: plan.max_products,
          maxStaff: plan.max_staff,
          allowsSelling: plan.allows_selling,
          isActive: plan.is_active,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not save that plan.");
      toast.success(`${plan.name} saved`);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save that plan.");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 font-dm text-sm text-muted" aria-busy="true">
        <Loader2 size={16} className="animate-spin" /> Loading…
      </div>
    );
  }

  if (loadError) {
    return (
      <div role="alert" className="rounded-2xl border border-red-500/25 bg-red-500/[0.05] p-6 text-center">
        <AlertTriangle className="mx-auto text-red-400" size={22} />
        <p className="mt-3 font-dm text-sm text-muted">{loadError}</p>
        <Button variant="outline" className="mt-4" onClick={() => void load()}>
          <RefreshCw size={15} className="mr-1.5" /> Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── The choice ─────────────────────────────────────────────────── */}
      <section aria-labelledby="model-h" className="rounded-2xl border border-white/10 bg-dark-card p-5">
        <h2 id="model-h" className="font-syne text-base font-bold text-offwhite">
          How Roulé Rodrigues earns
        </h2>
        <p className="mt-1 font-dm text-sm text-muted">
          This decides what every shop is charged from the next sale onwards. Orders already placed keep
          the terms they were placed under — changing this never rewrites a past order.
        </p>

        <fieldset className="mt-4 space-y-2">
          <legend className="sr-only">Monetization model</legend>
          {MONETIZATION_MODELS.map((m) => (
            <label
              key={m}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
                model === m ? "border-yellow bg-yellow/10" : "border-white/15 hover:bg-white/[0.04]"
              }`}
            >
              <input
                type="radio"
                name="monetization-model"
                value={m}
                checked={model === m}
                onChange={() => setModel(m)}
                className="mt-1 accent-yellow"
              />
              <span>
                <span className={`block font-dm text-sm font-medium ${model === m ? "text-yellow" : "text-offwhite"}`}>
                  {MODEL_COPY[m].label}
                </span>
                <span className="block font-dm text-xs leading-relaxed text-muted">{MODEL_COPY[m].help}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {/* Only asked for when it is actually used — a commission box on a
            subscription-only marketplace is a question with no consequence. */}
        {modelChargesCommission(model) && (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <label htmlFor="rate" className="block font-dm text-xs text-muted">
              Commission on each sale
            </label>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                id="rate"
                inputMode="decimal"
                value={ratePct}
                onChange={(e) => setRatePct(e.target.value)}
                aria-invalid={!pctValid}
                className={`w-28 rounded-xl border bg-dark px-4 py-2.5 font-dm text-sm text-offwhite focus:outline-none ${
                  pctValid ? "border-dark-border focus:border-yellow" : "border-red-500/60"
                }`}
              />
              <span className="font-syne text-lg font-bold text-yellow">%</span>
            </div>
            {!pctValid ? (
              <p role="alert" className="mt-1.5 font-dm text-xs text-red-400">
                Enter a number between 0 and 50.
              </p>
            ) : (
              // The concrete example is the point: a percentage is abstract, and
              // "you keep Rs 900" is the sentence the owner is actually deciding.
              <p className="mt-2 font-dm text-xs text-muted">
                On a Rs 1,000 sale, Roulé Rodrigues keeps{" "}
                <span className="text-offwhite">
                  Rs {centsToDecimalString(Math.floor((100_000 * Math.round((pctNumber / 100) * 100_000) + 50_000) / 100_000))}
                </span>{" "}
                and the shop keeps{" "}
                <span className="text-offwhite">
                  Rs {centsToDecimalString(100_000 - Math.floor((100_000 * Math.round((pctNumber / 100) * 100_000) + 50_000) / 100_000))}
                </span>
                . A shop can be given its own rate individually, which overrides this.
              </p>
            )}
          </div>
        )}

        {!modelChargesCommission(model) && (
          <p className="mt-4 font-dm text-xs text-muted">
            No commission is taken under this model, whatever a plan or an individual shop is set to.
          </p>
        )}

        <div className="mt-5 flex items-center gap-3">
          <Button onClick={() => void save()} disabled={!dirty || !pctValid || saving}>
            {saving ? <Loader2 size={16} className="mr-1.5 animate-spin" /> : null}
            Save
          </Button>
          {!dirty && <span className="flex items-center gap-1.5 font-dm text-xs text-green-400"><Check size={14} /> Saved</span>}
        </div>
      </section>

      {/* ── The reservation window (backlog #53) ───────────────────────
          The dial behind the deadline the customer now sees at checkout and on
          /track. It was configurable in the database from M13 and editable by
          nobody, which meant the one number governing "how long does a customer
          have to reach a bank" could only be changed by hand-writing SQL
          against production.

          Cash and bank transfer are separate on purpose and the copy says why:
          a cash customer owes nothing until handover, so their window costs the
          shop only shelf space, while a transfer customer is racing a bank. */}
      <section aria-labelledby="hold-h" className="rounded-2xl border border-white/10 bg-dark-card p-5">
        <h2 id="hold-h" className="flex items-center gap-2 font-syne text-base font-bold text-offwhite">
          <Clock size={16} className="text-yellow" /> Reservation window
        </h2>
        <p className="mt-1 font-dm text-sm text-muted">
          How long a new order holds its stock before it is released and the order is cancelled. The
          customer is told this deadline at checkout and on their tracking page, as a date and time.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {([
            ["bankTransfer", "Bank transfer", "They are racing a bank. Too short and a customer who orders on Friday cannot pay until Monday."],
            ["cash", "Cash", "Nothing is owed until handover, so this costs the shop shelf space rather than a lost sale."],
            ["manual", "Other", "Anything arranged directly with the shop."],
          ] as const).map(([key, label, why]) => {
            const n = Number(hold[key]);
            const ok = Number.isInteger(n) && n >= 1 && n <= 8760;
            return (
              <div key={key}>
                <label htmlFor={`hold-${key}`} className="block font-bebas text-[11px] tracking-[0.2em] text-muted">
                  {label.toUpperCase()}
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    id={`hold-${key}`}
                    type="number"
                    min={1}
                    max={8760}
                    value={hold[key]}
                    onChange={(e) => setHold((h) => ({ ...h, [key]: e.target.value }))}
                    aria-invalid={!ok}
                    className={`w-24 rounded-xl border bg-dark px-3 py-2 font-dm text-sm text-offwhite focus:outline-none ${
                      ok ? "border-white/15 focus:border-yellow/50" : "border-red-500/50"
                    }`}
                  />
                  <span className="font-dm text-xs text-muted">
                    hours{ok ? ` · ${holdWindowLabel(n)}` : ""}
                  </span>
                </div>
                <p className="mt-1.5 font-dm text-[11px] leading-relaxed text-muted">{why}</p>
              </div>
            );
          })}
        </div>

        {!holdValid && (
          <p role="alert" className="mt-3 font-dm text-xs text-red-400">
            A window must be a whole number of hours between 1 and 8760 (365 days).
          </p>
        )}

        <div className="mt-5 flex items-center gap-3">
          <Button onClick={() => void saveHold()} disabled={!holdDirty || !holdValid || savingHold}>
            {savingHold ? <Loader2 size={16} className="mr-1.5 animate-spin" /> : null}
            Save window
          </Button>
          {!holdDirty && (
            <span className="flex items-center gap-1.5 font-dm text-xs text-green-400">
              <Check size={14} /> Saved
            </span>
          )}
        </div>
        <p className="mt-3 font-dm text-[11px] text-muted">
          Changing this affects orders placed from now on. Orders already waiting keep the deadline
          they were given — the customer was shown it and may have acted on it.
        </p>
      </section>

      {/* ── Plans ──────────────────────────────────────────────────────── */}
      {modelChargesSubscription(model) && (
        <section aria-labelledby="plans-h" className="rounded-2xl border border-white/10 bg-dark-card p-5">
          <h2 id="plans-h" className="font-syne text-base font-bold text-offwhite">Monthly plans</h2>
          <p className="mt-1 font-dm text-sm text-muted">
            What each plan costs a shop per month. Leave a plan at Rs 0.00 while you are still onboarding.
          </p>
          <div className="mt-4 space-y-3">
            {plans.map((plan) => (
              <PlanRow key={plan.slug} plan={plan} onSave={savePlan} />
            ))}
          </div>
        </section>
      )}

      {/* ── Where the money actually went ──────────────────────────────── */}
      <section aria-labelledby="rev-h" className="rounded-2xl border border-white/10 bg-dark-card p-5">
        <h2 id="rev-h" className="font-syne text-base font-bold text-offwhite">Platform revenue</h2>
        <p className="mt-1 font-dm text-sm text-muted">
          Counted from orders that were actually paid and not refunded.
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Sales through the marketplace" value={rs(overview?.earned?.gmv ?? 0)} />
          <Stat label="Commission earned" value={rs(overview?.earned?.commission ?? 0)} accent />
          <Stat label="Paid to shops" value={rs(overview?.earned?.merchantNet ?? 0)} />
          <Stat label="Delivery fees" value={rs(overview?.earned?.deliveryFees ?? 0)} />
          <Stat label="Subscriptions collected" value={rs(overview?.subscriptions?.paid ?? 0)} accent />
          <Stat label="Subscriptions unpaid" value={rs(overview?.subscriptions?.due ?? 0)} />
        </dl>
        {/* Three different things that all used to look like "pending". An
            expired reservation is not a sale waiting to happen, and counting it
            as one made the pipeline figure meaningless within a few weeks. */}
        <dl className="mt-4 space-y-1.5 border-t border-white/10 pt-3 font-dm text-xs text-muted">
          <div className="flex justify-between gap-3">
            <dt>Still waiting to be paid</dt>
            <dd className="text-offwhite">
              {overview?.pending?.orders ?? 0} order(s) · {rs(overview?.pending?.commission ?? 0)} to come
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Refunded or cancelled after paying</dt>
            <dd className="text-offwhite">
              {overview?.reversed?.orders ?? 0} order(s) · {rs(overview?.reversed?.commission ?? 0)} given back
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Expired or abandoned before paying</dt>
            <dd className="text-offwhite">
              {overview?.closedUnpaid?.orders ?? 0} order(s) · {rs(overview?.closedUnpaid?.wouldHaveBeen ?? 0)} missed
            </dd>
          </div>
          <div className="flex justify-between gap-3 border-t border-white/[0.06] pt-1.5">
            <dt>Shops</dt>
            <dd className="text-offwhite">
              {overview?.merchants?.approved ?? 0} of {overview?.merchants?.total ?? 0} approved
              {(overview?.merchants?.withOverride ?? 0) > 0
                ? ` · ${overview?.merchants?.withOverride} on a custom rate`
                : ""}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <dt className="font-dm text-[11px] leading-tight text-muted">{label}</dt>
      <dd className={`mt-1 font-syne text-base font-bold ${accent ? "text-yellow" : "text-offwhite"}`}>{value}</dd>
    </div>
  );
}

function PlanRow({ plan, onSave }: { plan: Plan; onSave: (p: Plan, price: string) => Promise<void> }) {
  const [price, setPrice] = useState(centsToDecimalString(plan.price_cents));
  const [busy, setBusy] = useState(false);
  const dirty = price !== centsToDecimalString(plan.price_cents);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-dm text-sm font-medium text-offwhite">{plan.name}</p>
        <p className="font-dm text-xs text-muted">
          {plan.description}
          {plan.commission_rate != null && ` · ${formatRate(Number(plan.commission_rate))} commission`}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-dm text-xs text-muted">Rs</span>
        <label htmlFor={`price-${plan.slug}`} className="sr-only">{plan.name} monthly price</label>
        <input
          id={`price-${plan.slug}`}
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="w-24 rounded-lg border border-dark-border bg-dark px-3 py-2 font-dm text-sm text-offwhite focus:border-yellow focus:outline-none"
        />
        <span className="font-dm text-xs text-muted">/month</span>
        <Button
          size="sm"
          variant="outline"
          disabled={!dirty || busy}
          onClick={async () => { setBusy(true); await onSave(plan, price); setBusy(false); }}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : "Save"}
        </Button>
      </div>
    </div>
  );
}
