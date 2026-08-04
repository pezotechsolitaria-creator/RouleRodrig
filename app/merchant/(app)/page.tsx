import { redirect } from "next/navigation";
import { Store, Package, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMerchantDashboard } from "@/lib/merchant/context";

export default async function MerchantHome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const dashboard = await getMerchantDashboard(supabase);

  // No shop yet → the onboarding flow IS the home screen for a new merchant.
  if (!dashboard) redirect("/merchant/onboarding");

  const greetName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "there";

  return (
    <div className="py-8">
      <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">WELCOME</p>
      <h1 className="mt-1 font-syne text-2xl font-extrabold text-offwhite">Bonzour, {greetName} 👋</h1>
      <p className="mt-1.5 font-dm text-sm text-muted">
        You&apos;re signed in as <span className="text-offwhite/90">{user?.email}</span>.
      </p>

      <div className="mt-7 rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-6">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-yellow/10 text-yellow ring-1 ring-inset ring-yellow/20">
          <Store size={20} />
        </span>
        <h2 className="mt-4 font-syne text-lg font-bold text-offwhite">{dashboard.store?.name ?? dashboard.displayName}</h2>

        {dashboard.status === "pending" && (
          <p className="mt-2 flex items-center gap-1.5 font-dm text-xs text-yellow">
            <Clock size={13} /> Pending approval — we&apos;ll review your shop shortly.
          </p>
        )}

        <p className="mt-3 flex items-center gap-1.5 font-dm text-sm text-muted">
          <Package size={14} /> {dashboard.productCount} product{dashboard.productCount === 1 ? "" : "s"} listed
        </p>

        <p className="mt-4 font-dm text-sm leading-relaxed text-muted">
          Your full dashboard — today&apos;s stock, orders to prepare, and cash collected — is the next milestone.
        </p>
      </div>
    </div>
  );
}
