import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMerchantDashboard, getDashboardStats, getWorkQueue } from "@/lib/merchant/context";
import type { WorkQueue as WorkQueueResult } from "@/lib/merchant/context";
import type { ScheduleStatus } from "@/lib/schedule";
import { isPrepaymentOnly } from "@/lib/payments/prepayment";
import { getEarnings } from "@/lib/merchant/earnings";
import { getBilling } from "@/lib/merchant/billing";
import { KIND_VOCAB } from "@/lib/merchant/kind";
import RefundsOwed from "@/components/merchant/RefundsOwed";
import MerchantPushSetup from "@/components/merchant/MerchantPushSetup";
import { HOME_BLOCKS } from "@/components/merchant/home/blocks";
import CannotBePaid from "@/components/merchant/home/CannotBePaid";
import TradingNow from "@/components/merchant/home/TradingNow";
import WorkQueue from "@/components/merchant/home/WorkQueue";
import Earnings from "@/components/merchant/home/Earnings";
import Stock from "@/components/merchant/home/Stock";
import ServingToday from "@/components/merchant/home/ServingToday";
import { getServingToday } from "@/lib/merchant/serving";

// ── THE MERCHANT HOME, AS A COMPOSER ────────────────────────────────────────
//
// This screen was 390 lines rendering FOURTEEN blocks, of which exactly one
// number came from an order — an unfiltered lifetime count that never moved. It
// also hand-copied the six navigation destinations into a tile grid, so the grid
// and the tab bar could disagree, and it ended with a "Recent products" list
// answering a question nobody opens a merchant app to ask.
//
// It is now a spine plus a registry.
//
//   SPINE — every kind, same order. Three of the five render null on a healthy
//   business, which is why a working shop's home is short rather than padded:
//     1. CannotBePaid      the one blocker that outranks every number
//     2. RefundsOwed       the only place someone else is out of pocket
//     3. MerchantPushSetup
//     4. WorkQueue         who is waiting, soonest real deadline first
//     5. TradingNow        am I open, and what am I actually taking
//
//   KIND SLOT — chosen by HOME_BLOCKS, never by a branch in here. The rule that
//   keeps it cheap is that a block NEVER RECEIVES KIND: if a block would need to
//   say "dishes" for a kitchen and "products" for a shop, that is two blocks and
//   the registry picks between them. Grep this file for `kind ===` and there is
//   nothing to find.
//
// A shop's home and a kitchen's home differ by ONE block and one noun in the
// nav. That is the point.
export default async function MerchantHome() {
  const supabase = await createClient();
  const [{ data: { user } }, dashboard] = await Promise.all([
    supabase.auth.getUser(),
    getMerchantDashboard(supabase),
  ]);

  // No shop yet → the onboarding flow IS the home screen for a new merchant.
  if (!dashboard) redirect("/merchant/onboarding");

  const storeId = dashboard.store?.id ?? null;
  const kind = dashboard.store?.kind ?? "shop";
  const vocab = KIND_VOCAB[kind];

  const wantsServing = HOME_BLOCKS[kind].includes("ServingToday");

  const [stats, queue, earnings, billing, schedule, payment, prepaymentOnly, serving] =
    await Promise.all([
    storeId ? getDashboardStats(supabase, storeId) : null,
    storeId
      ? getWorkQueue(supabase, storeId)
      : Promise.resolve({
          ok: true,
          items: [],
          openCount: 0,
          lastCollectedAt: null,
        } as WorkQueueResult),
    storeId
      ? getEarnings(supabase, storeId)
      : Promise.resolve({
          ok: true as const,
          netCents: 0,
          commissionCents: 0,
          rate: null,
          orderCount: 0,
        }),
    getBilling(supabase),
    storeId
      ? supabase
          .rpc("store_schedule_status", { p_store_id: storeId })
          .single()
          .then((r) => (r.data as ScheduleStatus | null) ?? null)
      : null,
    // Through store_payment_options(), never the table: it carries bank details
    // and has no SELECT grant to `authenticated`, so a direct read returns
    // nothing and a `??` default turns that silence into an answer. That exact
    // mistake shipped twice on the storefront.
    storeId
      ? supabase
          .rpc("store_payment_options", { p_store_id: storeId })
          .then((r) => (r.data as Record<string, boolean>[] | null)?.[0] ?? null)
      : null,
    isPrepaymentOnly(supabase),
    // Only fetched when a block actually asks for it — the registry decides
    // what the page loads, not just what it renders.
    wantsServing && storeId
      ? getServingToday(supabase, storeId)
      : Promise.resolve({ ok: true as const, total: 0, orderable: 0, off: [] }),
  ]);

  // Column defaults, so an unconfigured shop reads here exactly as it behaves
  // inside create_order(). Cash is subject to the platform switch (M89): a shop
  // whose column still says cash is offered nothing at checkout, and telling the
  // merchant otherwise on their own home screen is a lie with consequences.
  const pay = {
    acceptsCash: !prepaymentOnly && (payment?.accepts_cash ?? false),
    acceptsBankTransfer: payment?.accepts_bank_transfer ?? false,
    offersRrDelivery: payment?.offers_rr_delivery ?? true,
    offersPickup: payment?.offers_pickup ?? true,
    offersCustomerDelivery: payment?.offers_customer_delivery ?? true,
  };

  const greetName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "there";
  const storeSlug =
    storeId && queue.ok && queue.items.length === 0
      ? (await supabase.from("stores").select("slug").eq("id", storeId).maybeSingle()).data?.slug ??
        null
      : null;

  return (
    <div className="py-8">
      <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">{vocab.badge}</p>
      <h1 className="mt-1 font-syne text-2xl font-extrabold text-offwhite">
        Bonzour, {greetName} 👋
      </h1>

      {/* ── SPINE ─────────────────────────────────────────────────────── */}
      <CannotBePaid cannotBePaid={!pay.acceptsCash && !pay.acceptsBankTransfer} />
      <RefundsOwed />
      <MerchantPushSetup />
      <WorkQueue queue={queue} storeSlug={storeSlug} />

      <div className="mt-4 rounded-2xl border border-white/10 bg-dark-card p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-syne text-base font-bold text-offwhite">
            {dashboard.store?.name ?? dashboard.displayName}
          </h2>
          {dashboard.status === "pending" && (
            <span className="inline-flex items-center gap-1.5 font-dm text-xs text-muted">
              <Clock size={12} /> Pending approval
            </span>
          )}
        </div>

        <TradingNow
          schedule={schedule}
          payment={pay}
          hasFulfilmentChoice={vocab.hasFulfilmentChoice}
        />

        {/* HOW YOU ARE CHARGED — ONE SENTENCE, NOT THREE CONTRADICTIONS. This
            read "Plan premium · cancelled · renews 11 Sept": a tier, a status
            denying it, and a renewal date for a cancelled thing (M171). */}
        {billing.chargesCommission && !billing.chargesSubscription && (
          <p className="mt-4 border-t border-white/10 pt-4 font-dm text-xs text-muted">
            No monthly fee.{" "}
            <span className="text-offwhite">
              Roulé Rodrigues keeps {Number((billing.defaultRate * 100).toFixed(2))}% of each
              completed sale
            </span>{" "}
            — on the goods only, never on delivery or tax.
          </p>
        )}
        {billing.chargesSubscription && (
          <p className="mt-4 border-t border-white/10 pt-4 font-dm text-xs">
            <Link href="/merchant/subscription" className="text-yellow underline">
              Manage your plan
            </Link>
          </p>
        )}
      </div>

      {/* ── KIND SLOT — the registry decides, not this file ────────────── */}
      {HOME_BLOCKS[kind].map((block) => {
        switch (block) {
          case "Stock":
            return <Stock key={block} stats={stats} productCount={dashboard.productCount} />;
          case "ServingToday":
            return <ServingToday key={block} serving={serving} />;
          case "Earnings":
            return <Earnings key={block} earnings={earnings} />;
        }
      })}
    </div>
  );
}
