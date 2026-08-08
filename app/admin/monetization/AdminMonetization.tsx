"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, AlertTriangle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { centsToDecimalString, toCents } from "@/lib/money";
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
