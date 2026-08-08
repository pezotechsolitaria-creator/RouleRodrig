import { centsToDecimalString } from "@/lib/money";
import { formatRate } from "@/lib/marketplace/fees";

// What Roulé Rodrigues costs this shop — in the shop's own words.
//
// Every number here comes from merchant_fee_summary(), which aggregates
// order_financials in the database and only ever counts orders that were
// actually PAID and not refunded. Nothing is computed in the browser, and
// nothing about the platform's configuration leaks: a merchant sees their own
// effective rate and their own totals, never the model, never another shop.
//
// The copy rule is the one the owner set: "Roulé Rodrigues fees", not
// "effective blended platform take rate". A shopkeeper in Port Mathurin should
// be able to read this and know exactly what they owe and why.

export type FeeSummaryData = {
  commissionRate: number;
  plan: { slug: string; name: string; priceCents: number; interval: string; currency: string } | null;
  lifetime: { orders: number; grossSales: number; commission: number; net: number } | null;
  subscriptionPaid: number;
  subscriptionDue: number;
};

const rs = (cents: number) => `Rs ${centsToDecimalString(cents ?? 0)}`;

export default function FeeSummary({ data }: { data: FeeSummaryData }) {
  const rate = Number(data.commissionRate ?? 0);
  const takesCommission = rate > 0;
  const lifetime = data.lifetime ?? { orders: 0, grossSales: 0, commission: 0, net: 0 };
  const planPrice = data.plan?.priceCents ?? 0;
  const hasPlanFee = planPrice > 0;

  // Total cost of selling here = commission actually charged + subscriptions
  // actually paid. Deliberately NOT "commission + every invoice ever raised":
  // an unpaid invoice is a debt, not a cost incurred, and mixing them would
  // overstate what the shop has spent.
  const totalPlatformCost = lifetime.commission + data.subscriptionPaid;

  return (
    <section
      aria-labelledby="fees-h"
      className="mt-4 rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-5"
    >
      <h2 id="fees-h" className="font-syne text-base font-bold text-offwhite">
        Roulé Rodrigues fees
      </h2>

      {/* The headline sentence changes with the actual configuration. The old
          hardcoded "we never take a commission on your sales" became false the
          moment the platform could be switched to commission or hybrid. */}
      <p className="mt-1.5 font-dm text-sm leading-relaxed text-muted">
        {takesCommission && hasPlanFee ? (
          <>
            You pay <span className="text-offwhite">{rs(planPrice)} a month</span> to sell here, and Roulé
            Rodrigues keeps <span className="text-offwhite">{formatRate(rate)}</span> of each sale.
          </>
        ) : takesCommission ? (
          <>
            There is no monthly fee. Roulé Rodrigues keeps{" "}
            <span className="text-offwhite">{formatRate(rate)}</span> of each completed sale.
          </>
        ) : hasPlanFee ? (
          <>
            You pay <span className="text-offwhite">{rs(planPrice)} a month</span> to sell here and keep
            every rupee of your sales — no commission.
          </>
        ) : (
          <>Selling here is free at the moment — no monthly fee and no commission.</>
        )}
      </p>

      {lifetime.orders > 0 ? (
        <>
          <dl className="mt-4 space-y-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 font-dm text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Your sales ({lifetime.orders} paid order{lifetime.orders === 1 ? "" : "s"})</dt>
              <dd className="text-offwhite">{rs(lifetime.grossSales)}</dd>
            </div>
            {takesCommission && (
              <div className="flex justify-between">
                <dt className="text-muted">Commission ({formatRate(rate)})</dt>
                <dd className="text-offwhite">− {rs(lifetime.commission)}</dd>
              </div>
            )}
            {data.subscriptionPaid > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted">Monthly fees paid</dt>
                <dd className="text-offwhite">− {rs(data.subscriptionPaid)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-white/10 pt-2 font-bold">
              <dt className="text-offwhite">You keep</dt>
              <dd className="font-syne text-yellow">{rs(lifetime.net - data.subscriptionPaid)}</dd>
            </div>
          </dl>

          {totalPlatformCost > 0 && (
            <p className="mt-2 font-dm text-xs text-muted">
              Total paid to Roulé Rodrigues so far: {rs(totalPlatformCost)}.
            </p>
          )}
        </>
      ) : (
        <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 font-dm text-xs text-muted">
          Once you have your first paid order, your sales and fees will be broken down here.
        </p>
      )}

      {data.subscriptionDue > 0 && (
        <p className="mt-3 font-dm text-xs text-orange-300">
          {rs(data.subscriptionDue)} in membership fees is still outstanding.
        </p>
      )}

      {/* Counted the same way the platform counts it, said out loud, because a
          merchant who cannot reconcile these numbers will assume the worst. */}
      <p className="mt-3 border-t border-white/10 pt-3 font-dm text-[11px] leading-relaxed text-muted">
        Sales figures count orders that were paid and not refunded. Commission applies to the goods only —
        never to tax, and never to a Roulé Rodrigues delivery fee. A change to our pricing only affects new
        orders; every past order keeps the terms it was placed under.
      </p>
    </section>
  );
}
