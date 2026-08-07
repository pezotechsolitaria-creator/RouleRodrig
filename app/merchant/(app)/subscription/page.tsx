import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, CheckCircle2, AlertTriangle, Clock, Receipt, FileDown } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMerchantDashboard } from "@/lib/merchant/context";
import { getMerchantSubscription, getBillingHistory, PLAN_LABEL, type SubscriptionStatus } from "@/lib/merchant/subscription";
import { centsToDecimalString } from "@/lib/money";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { robots: { index: false, follow: false } };

const PAGE_SIZE = 10;

const STATUS_BADGE: Record<SubscriptionStatus, string> = {
  trialing: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  active: "bg-green-500/15 text-green-400 border-green-500/30",
  past_due: "bg-orange-400/15 text-orange-300 border-orange-400/30",
  suspended: "bg-red-500/10 text-red-400 border-red-500/25",
  cancelled: "bg-white/10 text-muted border-white/15",
};

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  trialing: "Trial",
  active: "Active",
  past_due: "Past due",
  suspended: "Suspended",
  cancelled: "Cancelled",
};

const INVOICE_BADGE: Record<string, string> = {
  paid: "bg-green-500/15 text-green-400 border-green-500/30",
  due: "bg-yellow/15 text-yellow border-yellow/30",
  void: "bg-white/10 text-muted border-white/15",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default async function MerchantSubscriptionPage({
  searchParams,
}: { searchParams: Promise<{ page?: string }> }) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);

  const supabase = await createClient();
  const dashboard = await getMerchantDashboard(supabase);
  if (!dashboard) redirect("/merchant/onboarding");

  const sub = await getMerchantSubscription(supabase, dashboard.merchantId);
  const { invoices, total } = await getBillingHistory(supabase, dashboard.merchantId, { page, pageSize: PAGE_SIZE });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="py-8">
      <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">ACCOUNT</p>
      <h1 className="mt-1 font-syne text-2xl font-extrabold text-offwhite">Subscription</h1>
      <p className="mt-1.5 font-dm text-sm text-muted">
        Selling on Roulé Rodrigues is a monthly membership — we never take a commission on your sales.
      </p>

      {/* The layout already renders <SubscriptionBanner> on every merchant
          route, including this one. Rendering it again stacked two identical
          alerts, each with a solid-gold "Renew subscription" CTA pointing at
          /merchant/subscription — the page the merchant is already on. The
          plan card below is the real renewal surface. */}

      {!sub ? (
        <div className="rounded-2xl border border-white/10 bg-dark-card p-6">
          <h2 className="font-syne text-base font-bold text-offwhite">No plan assigned yet</h2>
          <p className="mt-1.5 font-dm text-sm text-muted">
            Your shop is selling normally. We&apos;ll be in touch before any plan starts — nothing changes until then.
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-dm text-xs text-muted">Current plan</p>
                <p className="font-syne text-xl font-extrabold text-offwhite">{PLAN_LABEL[sub.plan]}</p>
              </div>
              <Badge variant="outline" className={STATUS_BADGE[sub.status]}>{STATUS_LABEL[sub.status]}</Badge>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-white/[0.03] px-3 py-2.5">
                <dt className="font-dm text-[11px] text-muted">Renews / expires</dt>
                <dd className="font-dm text-sm text-offwhite">{fmtDate(sub.currentPeriodEnd)}</dd>
              </div>
              <div className="rounded-xl bg-white/[0.03] px-3 py-2.5">
                <dt className="font-dm text-[11px] text-muted">Next billing date</dt>
                <dd className="font-dm text-sm text-offwhite">{fmtDate(sub.currentPeriodEnd)}</dd>
              </div>
              <div className="rounded-xl bg-white/[0.03] px-3 py-2.5">
                <dt className="font-dm text-[11px] text-muted">
                  {sub.hasExpired ? "Status" : sub.inGracePeriod ? "Grace remaining" : "Days remaining"}
                </dt>
                <dd className="flex items-center gap-1.5 font-dm text-sm">
                  {sub.hasExpired ? (
                    <><AlertTriangle size={13} className="text-red-400" /><span className="text-red-400">Expired</span></>
                  ) : sub.inGracePeriod ? (
                    <><Clock size={13} className="text-orange-300" /><span className="text-orange-300">{sub.graceDaysRemaining} day{sub.graceDaysRemaining === 1 ? "" : "s"}</span></>
                  ) : (
                    <><CheckCircle2 size={13} className="text-green-400" /><span className="text-offwhite">{sub.daysRemaining} day{sub.daysRemaining === 1 ? "" : "s"}</span></>
                  )}
                </dd>
              </div>
              <div className="rounded-xl bg-white/[0.03] px-3 py-2.5">
                <dt className="font-dm text-[11px] text-muted">Grace period</dt>
                <dd className="font-dm text-sm text-offwhite">{sub.graceDays} days</dd>
              </div>
              <div className="rounded-xl bg-white/[0.03] px-3 py-2.5">
                <dt className="font-dm text-[11px] text-muted">Member since</dt>
                <dd className="font-dm text-sm text-offwhite">{fmtDate(sub.startedAt)}</dd>
              </div>
            </dl>

            {/* Online subscription payment isn't built yet — renewals are arranged
                with the team, so this is an honest contact route rather than a
                dead button that pretends to charge a card. */}
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/#contact"
                className="inline-flex items-center gap-1.5 rounded-full bg-yellow px-4 py-2 font-syne text-sm font-bold text-dark transition-colors hover:bg-yellow-dark"
              >
                <CalendarClock size={15} /> Renew or change plan
              </Link>
              <span className="inline-flex items-center font-dm text-xs text-muted">
                Online self-service renewal is coming — for now we&apos;ll sort it with you directly.
              </span>
            </div>
          </div>

          <section aria-labelledby="billing-h" className="mt-6">
            <h2 id="billing-h" className="flex items-center gap-1.5 font-syne text-base font-bold text-offwhite">
              <Receipt size={15} className="text-yellow" /> Billing history
            </h2>

            {invoices.length === 0 ? (
              <p className="mt-3 rounded-2xl border border-white/10 bg-dark-card p-6 text-center font-dm text-sm text-muted">
                No invoices yet.
              </p>
            ) : (
              <>
                <div className="mt-3 hidden overflow-hidden rounded-2xl border border-white/10 sm:block">
                  <table className="w-full text-left">
                    <thead className="bg-white/[0.03]">
                      <tr className="font-dm text-xs text-muted">
                        <th scope="col" className="px-4 py-3 font-medium">Date</th>
                        <th scope="col" className="px-4 py-3 font-medium">Plan</th>
                        <th scope="col" className="px-4 py-3 font-medium">Period</th>
                        <th scope="col" className="px-4 py-3 font-medium">Amount</th>
                        <th scope="col" className="px-4 py-3 font-medium">Status</th>
                        <th scope="col" className="px-4 py-3 font-medium">Reference</th>
                        <th scope="col" className="px-4 py-3 font-medium">Invoice</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((inv) => (
                        <tr key={inv.id} className="border-t border-white/10 font-dm text-sm text-offwhite">
                          <td className="px-4 py-3">{fmtDate(inv.created_at)}</td>
                          <td className="px-4 py-3 text-muted">{PLAN_LABEL[inv.plan as keyof typeof PLAN_LABEL]}</td>
                          <td className="px-4 py-3 text-muted">{fmtDate(inv.period_start)} – {fmtDate(inv.period_end)}</td>
                          <td className="px-4 py-3">Rs {centsToDecimalString(inv.amount)}</td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className={INVOICE_BADGE[inv.status] ?? INVOICE_BADGE.due}>{inv.status}</Badge>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-muted">{inv.id.slice(0, 8).toUpperCase()}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1 font-dm text-xs text-muted/60" title="PDF invoices are coming soon">
                              <FileDown size={12} /> Soon
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-3 space-y-2 sm:hidden">
                  {invoices.map((inv) => (
                    <div key={inv.id} className="rounded-xl border border-white/10 bg-dark-card p-3">
                      <div className="flex items-center justify-between">
                        <span className="font-dm text-sm text-offwhite">Rs {centsToDecimalString(inv.amount)}</span>
                        <Badge variant="outline" className={INVOICE_BADGE[inv.status] ?? INVOICE_BADGE.due}>{inv.status}</Badge>
                      </div>
                      <p className="mt-1 font-dm text-xs text-muted">
                        {PLAN_LABEL[inv.plan as keyof typeof PLAN_LABEL]} · {fmtDate(inv.period_start)} – {fmtDate(inv.period_end)}
                      </p>
                      <p className="font-dm text-[11px] text-muted/70">Ref {inv.id.slice(0, 8).toUpperCase()}</p>
                    </div>
                  ))}
                </div>

                {totalPages > 1 && (
                  <nav aria-label="Billing history pages" className="mt-4 flex items-center justify-between font-dm text-xs text-muted">
                    <span>Page {page} of {totalPages}</span>
                    <div className="flex gap-2">
                      {page > 1 && (
                        <Link href={{ pathname: "/merchant/subscription", query: { page: page - 1 } }}
                          className="rounded-full border border-white/15 px-3 py-1.5 transition-colors hover:border-yellow/40 hover:text-yellow">
                          Previous
                        </Link>
                      )}
                      {page < totalPages && (
                        <Link href={{ pathname: "/merchant/subscription", query: { page: page + 1 } }}
                          className="rounded-full border border-white/15 px-3 py-1.5 transition-colors hover:border-yellow/40 hover:text-yellow">
                          Next
                        </Link>
                      )}
                    </div>
                  </nav>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
