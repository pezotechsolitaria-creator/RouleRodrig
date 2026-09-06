import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasShop, getMerchantDashboard } from "@/lib/merchant/context";
import { getEarningLines } from "@/lib/merchant/earnings";
import PaymentSettingsForm from "@/components/merchant/PaymentSettingsForm";
import EarningsStatement from "@/components/merchant/home/EarningsStatement";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function MerchantPaymentSettingsPage() {
  const supabase = await createClient();
  if (!(await hasShop(supabase))) redirect("/merchant/onboarding");

  // Platform-owned delivery pricing, shown read-only: the fees belong to the
  // Roulé Rodrigues delivery network, so a merchant sees them but cannot set
  // them. Since M7 the price depends on the customer's region, so the merchant
  // is shown the actual per-zone table rather than one island-wide figure.
  // The money comes first on this page now. A merchant opening "Payments"
  // wants to know what they were paid far more often than they want to change
  // which methods they accept — the settings are a thing you do once.
  const dashboard = await getMerchantDashboard(supabase);
  const lines = dashboard?.store ? await getEarningLines(supabase, dashboard.store.id) : [];

  const [{ data: settings }, { data: zones }] = await Promise.all([
    supabase
      .from("marketplace_settings")
      .select("delivery_enabled, delivery_max_minutes")
      .eq("id", "main")
      .maybeSingle(),
    supabase
      .from("delivery_zones")
      .select("id, name, fee")
      .eq("is_active", true)
      .order("position"),
  ]);

  return (
    <div className="py-8">
      <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">MONEY</p>
      <h1 className="mt-1 font-syne text-2xl font-extrabold text-offwhite">Payments &amp; delivery</h1>
      <p className="mt-1.5 font-dm text-sm text-muted">
        What you have been paid, and how customers can pay you.
      </p>

      <div className="mt-6 max-w-lg">
        <h2 className="mb-2 font-bebas text-[11px] tracking-[0.3em] text-muted">YOUR SALES</h2>
        <EarningsStatement lines={lines} />
      </div>

      <div className="mt-8 max-w-lg">
        <h2 className="mb-2 font-bebas text-[11px] tracking-[0.3em] text-muted">
          HOW CUSTOMERS PAY YOU
        </h2>
        <PaymentSettingsForm
          zones={zones ?? []}
          maxMinutes={settings?.delivery_max_minutes ?? 120}
          deliveryEnabled={settings?.delivery_enabled ?? false}
        />
      </div>
    </div>
  );
}
