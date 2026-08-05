import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasShop } from "@/lib/merchant/context";
import PaymentSettingsForm from "@/components/merchant/PaymentSettingsForm";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function MerchantPaymentSettingsPage() {
  const supabase = await createClient();
  if (!(await hasShop(supabase))) redirect("/merchant/onboarding");

  // Platform-owned delivery pricing, shown read-only: the fee belongs to the
  // Roulé Rodrigues delivery network, so a merchant sees it but cannot set it.
  const { data: settings } = await supabase
    .from("marketplace_settings")
    .select("delivery_enabled, delivery_base_fee, delivery_eta_minutes")
    .eq("id", "main")
    .maybeSingle();

  return (
    <div className="py-8">
      <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">SETTINGS</p>
      <h1 className="mt-1 font-syne text-2xl font-extrabold text-offwhite">Payments &amp; delivery</h1>
      <p className="mt-1.5 font-dm text-sm text-muted">
        Choose how customers pay you, and whether you use our delivery team.
      </p>

      <div className="mt-6 max-w-lg">
        <PaymentSettingsForm
          deliveryFee={settings?.delivery_base_fee ?? 0}
          deliveryEtaMinutes={settings?.delivery_eta_minutes ?? 60}
          deliveryEnabled={settings?.delivery_enabled ?? false}
        />
      </div>
    </div>
  );
}
