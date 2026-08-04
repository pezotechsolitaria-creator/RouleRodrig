import Link from "next/link";
import { redirect } from "next/navigation";
import { Store, Package, Clock, AlertTriangle, XCircle, Plus, List, ShoppingBag, ImageOff, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMerchantDashboard, getDashboardStats, getOrderCount } from "@/lib/merchant/context";
import { centsToDecimalString } from "@/lib/money";

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

  return (
    <div className="py-8">
      <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">WELCOME</p>
      <h1 className="mt-1 font-syne text-2xl font-extrabold text-offwhite">Bonzour, {greetName} 👋</h1>
      <p className="mt-1.5 font-dm text-sm text-muted">
        You&apos;re signed in as <span className="text-offwhite/90">{user?.email}</span>.
      </p>

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
      </div>

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
