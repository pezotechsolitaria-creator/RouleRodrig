import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasShop, getOwnStoreId } from "@/lib/merchant/context";
import StoreHoursForm from "@/components/merchant/StoreHoursForm";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function MerchantHoursPage() {
  const supabase = await createClient();
  if (!(await hasShop(supabase))) redirect("/merchant/onboarding");

  // The delivery half of the editor is only shown to shops that actually take
  // part in the Roulé Rodrigues delivery network — the same flag create_order()
  // gates rr_delivery on, so the form never offers a setting that has no effect.
  const storeId = await getOwnStoreId(supabase);
  const { data: pay } = await supabase
    .from("store_payment_settings")
    .select("offers_rr_delivery")
    .eq("store_id", storeId ?? "")
    .maybeSingle();

  return (
    <div className="py-8">
      <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">SETTINGS</p>
      <h1 className="mt-1 font-syne text-2xl font-extrabold text-offwhite">Opening hours</h1>
      <p className="mt-1.5 font-dm text-sm text-muted">
        When your shop takes orders, and when the delivery team can bring them out. Customers can&apos;t
        place an order while you&apos;re closed.
      </p>

      <div className="mt-6 max-w-2xl">
        <StoreHoursForm offersRrDelivery={pay?.offers_rr_delivery ?? true} />
      </div>
    </div>
  );
}
