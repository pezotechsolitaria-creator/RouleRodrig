import { redirect } from "next/navigation";
import { Store, Package, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export default async function MerchantHome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // RLS-scoped read (staff_read policy → only this user's memberships).
  const { data: staff } = await supabase.from("merchant_staff").select("merchant_id").limit(1);
  const merchantId = staff?.[0]?.merchant_id;

  // No shop yet → the onboarding flow IS the home screen for a new merchant.
  if (!merchantId) redirect("/merchant/onboarding");

  const { data: merchant } = await supabase
    .from("merchants")
    .select("display_name, status")
    .eq("id", merchantId)
    .single();
  const { data: store } = await supabase
    .from("stores")
    .select("id, name")
    .eq("merchant_id", merchantId)
    .limit(1)
    .single();
  const { count: productCount } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("store_id", store?.id ?? "");

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
        <h2 className="mt-4 font-syne text-lg font-bold text-offwhite">{store?.name ?? merchant?.display_name}</h2>

        {merchant?.status === "pending" && (
          <p className="mt-2 flex items-center gap-1.5 font-dm text-xs text-yellow">
            <Clock size={13} /> Pending approval — we&apos;ll review your shop shortly.
          </p>
        )}

        <p className="mt-3 flex items-center gap-1.5 font-dm text-sm text-muted">
          <Package size={14} /> {productCount ?? 0} product{productCount === 1 ? "" : "s"} listed
        </p>

        <p className="mt-4 font-dm text-sm leading-relaxed text-muted">
          Your full dashboard — today&apos;s stock, orders to prepare, and cash collected — is the next milestone.
        </p>
      </div>
    </div>
  );
}
