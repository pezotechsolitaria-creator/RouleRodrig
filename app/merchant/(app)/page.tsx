import Link from "next/link";
import { redirect } from "next/navigation";
import { Store, Package, Clock, AlertTriangle, XCircle, Plus, List, ShoppingBag, ImageOff, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMerchantDashboard, getDashboardStats, getOrderCount } from "@/lib/merchant/context";
import { getMerchantSubscription } from "@/lib/merchant/subscription";
import { centsToDecimalString } from "@/lib/money";
import { todayLine, deliveryLine, nextOpenLabel, type ScheduleStatus } from "@/lib/schedule";
import { isPrepaymentOnly } from "@/lib/payments/prepayment";
import RefundsOwed from "@/components/merchant/RefundsOwed";

export default async function MerchantHome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const dashboard = await getMerchantDashboard(supabase);

  // No shop yet → the onboarding flow IS the home screen for a new merchant.
  if (!dashboard) redirect("/merchant/onboarding");

  const stats = dashboard.store ? await getDashboardStats(supabase, dashboard.store.id) : null;
  const orderCount = dashboard.store ? await getOrderCount(supabase, dashboard.store.id) : 0;
  const greetName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "there";

  // Live trading state, in one batch. The open/closed verdict comes from
  // store_schedule_status() — the SAME function create_order() gates on — so
  // this badge can never claim the shop is open while checkout refuses orders.
  const storeId = dashboard.store?.id ?? null;
  const [schedule, payment, subscription, prepaymentOnly] = storeId
    ? await Promise.all([
        supabase.rpc("store_schedule_status", { p_store_id: storeId }).single()
          .then((r) => (r.data as ScheduleStatus | null) ?? null),
        supabase
          .from("store_payment_settings")
          .select("accepts_cash, accepts_bank_transfer, offers_rr_delivery, offers_pickup, offers_customer_delivery")
          .eq("store_id", storeId)
          .maybeSingle()
          .then((r) => r.data),
        getMerchantSubscription(supabase, dashboard.merchantId),
        isPrepaymentOnly(supabase),
      ])
    : [null, null, null, true];

  // Column defaults, so an unconfigured shop reads here exactly as it behaves
  // in create_order().
  //
  // M89 — cash is subject to the platform switch. This line said "Taking cash"
  // straight from the column, which after the switch is a lie told on the
  // merchant's own home screen: checkout offers no cash and the payments
  // trigger refuses it. What a merchant is told they accept has to be what a
  // customer is actually offered.
  const pay = {
    acceptsCash: !prepaymentOnly && (payment?.accepts_cash ?? false),
    acceptsBankTransfer: payment?.accepts_bank_transfer ?? false,
    offersRrDelivery: payment?.offers_rr_delivery ?? true,
    offersPickup: payment?.offers_pickup ?? true,
    offersCustomerDelivery: payment?.offers_customer_delivery ?? true,
  };
  // The shop cannot be paid at all. Loudest thing on the page when true —
  // every other number here is meaningless while no order can complete.
  const cannotBePaid = !pay.acceptsCash && !pay.acceptsBankTransfer;

  return (
    <div className="py-8">
      <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">WELCOME</p>
      <h1 className="mt-1 font-syne text-2xl font-extrabold text-offwhite">Bonzour, {greetName} 👋</h1>
      <p className="mt-1.5 font-dm text-sm text-muted">
        You&apos;re signed in as <span className="text-offwhite/90">{user?.email}</span>.
      </p>

      {/* THE ONLY THING THAT MATTERS WHEN IT IS TRUE.
          Roulé Rodrigues stopped taking cash so that nothing leaves a shop
          before the money has arrived. For a shop that had only ever ticked
          "cash", that means checkout now has nothing to offer — and without
          this banner the merchant would see a normal-looking dashboard, a
          healthy product list and simply no orders, with no way to find out
          why. It names the cause, the fix, and links straight to it. */}
      {storeId && cannotBePaid && (
        <div className="mt-7 rounded-2xl border border-red-400/40 bg-red-500/[0.08] p-5">
          <p className="flex items-center gap-2 font-syne text-base font-bold text-red-300">
            <AlertTriangle size={17} /> Customers cannot pay you yet
          </p>
          <p className="mt-1.5 font-dm text-sm text-offwhite/90">
            Roulé Rodrigues orders are now paid by bank transfer before you prepare them, so nothing
            leaves your shop unpaid. Add your bank details and your shop can take orders again — it
            takes a minute.
          </p>
          <Link
            href="/merchant/payments"
            className="mt-3 inline-flex min-h-[44px] items-center rounded-xl bg-yellow px-5 font-syne text-sm font-bold text-dark"
          >
            Add my bank details
          </Link>
        </div>
      )}

      {/* Money owed back to a customer (M90). Renders nothing when there is
          none, and sits above the shop summary because it is the only thing on
          this page where somebody else is out of pocket. */}
      <RefundsOwed />

      {/* Shop summary + approval status */}
      <div className="mt-7 rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-yellow/10 text-yellow ring-1 ring-inset ring-yellow/20">
            <Store size={20} />
          </span>
          <div>
            <h2 className="font-syne text-lg font-bold text-offwhite">{dashboard.store?.name ?? dashboard.displayName}</h2>
            {dashboard.status === "pending" && (
              <p className="mt-0.5 flex items-center gap-1.5 font-dm text-xs text-yellow">
                <Clock size={12} /> Pending approval — we&apos;ll review your shop shortly
              </p>
            )}
            {dashboard.status === "approved" && (
              <p className="mt-0.5 flex items-center gap-1.5 font-dm text-xs text-green-400">
                <CheckCircle2 size={12} /> Approved — your shop is live
              </p>
            )}
            {dashboard.status === "suspended" && (
              <p className="mt-0.5 flex items-center gap-1.5 font-dm text-xs text-red-400">
                <XCircle size={12} /> Suspended — contact support
              </p>
            )}
          </div>
        </div>

        {/* Am I trading right now? The single question a shop owner opens this
            page to answer. */}
        {schedule && (
          <div className="mt-5 border-t border-white/10 pt-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-dm text-xs font-medium ${
                  !schedule.has_schedule
                    ? "bg-white/10 text-muted"
                    : schedule.is_open
                      ? "bg-green-500/15 text-green-400"
                      : "bg-red-500/15 text-red-400"
                }`}
              >
                <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${
                  !schedule.has_schedule ? "bg-muted" : schedule.is_open ? "bg-green-400" : "bg-red-400"
                }`} />
                {!schedule.has_schedule ? "Hours not set" : schedule.is_open ? "Open now" : "Closed"}
              </span>
              <span className="font-dm text-xs text-muted">Today {todayLine(schedule)}</span>
              {!schedule.is_open && nextOpenLabel(schedule) && (
                <span className="font-dm text-xs text-muted">{nextOpenLabel(schedule)}</span>
              )}
            </div>

            {pay.offersRrDelivery && (
              <p className="mt-1.5 font-dm text-xs text-muted">
                Delivery{" "}
                <span className={schedule.delivery_available ? "text-green-400" : "text-muted"}>
                  {schedule.delivery_available ? "running now" : "not running"}
                </span>
                {deliveryLine(schedule) && ` · ${deliveryLine(schedule)}`}
              </p>
            )}

            <p className="mt-1 font-dm text-xs text-muted">
              Taking{" "}
              {[pay.acceptsCash && "cash", pay.acceptsBankTransfer && "bank transfer"]
                .filter(Boolean).join(" and ") || <span className="text-red-400">no payment method</span>}
              {" · "}
              {[pay.offersPickup && "pickup", pay.offersCustomerDelivery && "own driver", pay.offersRrDelivery && "RR delivery"]
                .filter(Boolean).join(", ") || <span className="text-red-400">no fulfillment method</span>}
            </p>

            {!schedule.has_schedule && (
              <p className="mt-2 font-dm text-xs text-orange-300">
                You haven&apos;t set opening hours yet, so your shop is treated as always open.{" "}
                <Link href="/merchant/hours" className="underline hover:text-yellow">Set them now</Link>.
              </p>
            )}
          </div>
        )}

        {/* Subscription — expiry is the thing that silently stops orders. */}
        {subscription && (
          <div className="mt-4 border-t border-white/10 pt-4">
            <p className="font-dm text-xs text-muted">
              Plan <span className="text-offwhite">{subscription.plan}</span>
              {" · "}
              <span className={subscription.isActive ? "text-green-400" : "text-red-400"}>
                {subscription.status}
              </span>
              {subscription.currentPeriodEnd && (
                <> · renews {new Date(subscription.currentPeriodEnd).toLocaleDateString("en-GB", {
                  day: "2-digit", month: "short", year: "numeric",
                })}</>
              )}
            </p>
            <Link href="/merchant/subscription" className="font-dm text-xs text-yellow hover:underline">
              Manage plan
            </Link>
          </div>
        )}
      </div>

      {/* Quick actions — the five places a merchant actually goes. */}
      <nav aria-label="Quick actions" className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {([
          { href: "/merchant/orders", label: "Orders", icon: ShoppingBag },
          { href: "/merchant/products", label: "Products", icon: Package },
          { href: "/merchant/hours", label: "Hours", icon: Clock },
          { href: "/merchant/payments", label: "Payments", icon: Store },
          { href: "/merchant/subscription", label: "Plan", icon: CheckCircle2 },
        ] as const).map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex min-h-[64px] flex-col items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-dark-card px-3 py-3 font-dm text-xs text-offwhite transition-colors hover:border-yellow/40 hover:text-yellow"
          >
            <Icon size={17} aria-hidden="true" />
            {label}
          </Link>
        ))}
      </nav>

      {/* Quick stats */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Package} label="Products" value={dashboard.productCount} />
        <StatCard icon={AlertTriangle} label="Low stock" value={stats?.lowStockCount ?? 0} tone={stats && stats.lowStockCount > 0 ? "warn" : undefined} />
        <StatCard icon={XCircle} label="Out of stock" value={stats?.outOfStockCount ?? 0} tone={stats && stats.outOfStockCount > 0 ? "danger" : undefined} />
        <Link href="/merchant/orders">
          <StatCard icon={ShoppingBag} label="Orders" value={orderCount} />
        </Link>
      </div>

      {/* Quick actions */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Link
          href="/merchant/products/new"
          className="flex items-center justify-center gap-2 rounded-full bg-yellow px-5 py-3 font-syne text-sm font-bold text-dark transition-colors hover:bg-yellow-dark"
        >
          <Plus size={15} /> Add product
        </Link>
        <Link
          href="/merchant/products"
          className="flex items-center justify-center gap-2 rounded-full border border-white/15 px-5 py-3 font-syne text-sm font-bold text-offwhite transition-colors hover:bg-white/[0.06]"
        >
          <List size={15} /> View products
        </Link>
        <Link
          href="/merchant/orders"
          className="col-span-2 flex items-center justify-center gap-2 rounded-full border border-white/15 px-5 py-3 font-syne text-sm font-bold text-offwhite transition-colors hover:bg-white/[0.06] sm:col-span-1"
        >
          <ShoppingBag size={15} /> View orders
        </Link>
      </div>

      {/* Recent products */}
      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="font-syne text-base font-bold text-offwhite">Recent products</h2>
          {stats && stats.recentProducts.length > 0 && (
            <Link href="/merchant/products" className="font-dm text-xs text-yellow hover:underline">View all</Link>
          )}
        </div>

        {!stats || stats.recentProducts.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-8 text-center">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-yellow/10 text-yellow ring-1 ring-inset ring-yellow/20">
              <Package size={20} />
            </span>
            <h3 className="mt-3 font-syne text-sm font-bold text-offwhite">No products yet</h3>
            <p className="mx-auto mt-1 max-w-xs font-dm text-xs text-muted">Add your first product to start selling.</p>
            <Link
              href="/merchant/products/new"
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-yellow px-4 py-2 font-syne text-xs font-bold text-dark transition-colors hover:bg-yellow-dark"
            >
              <Plus size={13} /> Add product
            </Link>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {stats.recentProducts.map((p) => (
              <Link
                key={p.id}
                href={`/merchant/products/${p.id}/edit`}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-dark-card p-3 transition-colors hover:border-yellow/30"
              >
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/5 text-muted/50">
                    <ImageOff size={16} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-dm text-sm font-medium text-offwhite">{p.name}</p>
                  <p className="font-dm text-xs text-muted">Rs {centsToDecimalString(p.price)} · {p.stockQuantity} in stock</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon, label, value, tone, hint,
}: { icon: typeof Package; label: string; value: number; tone?: "warn" | "danger"; hint?: string }) {
  const toneCls = tone === "danger" ? "text-red-400" : tone === "warn" ? "text-yellow" : "text-offwhite";
  return (
    <div className="rounded-xl border border-white/10 bg-dark-card p-3.5">
      <Icon size={15} className="text-muted" />
      <p className={`mt-2 font-syne text-xl font-extrabold ${toneCls}`}>{value}</p>
      <p className="font-dm text-[11px] text-muted">{label}{hint && <span className="text-muted/60"> · {hint}</span>}</p>
    </div>
  );
}
