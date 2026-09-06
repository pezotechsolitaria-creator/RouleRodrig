import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasShop } from "@/lib/merchant/context";
import OwnDeliveryPanel from "@/components/merchant/OwnDeliveryPanel";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Delivering your own orders. Free and untracked by default; tracked delivery
// with per-driver links is switched on per shop by Roulé Rodrigues.
export default async function MerchantDeliveryPage() {
  const supabase = await createClient();
  if (!(await hasShop(supabase))) redirect("/merchant/onboarding");

  return (
    <div className="py-8">
      <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">DELIVERY</p>
      <h1 className="mt-1 font-syne text-2xl font-extrabold text-offwhite">Your own delivery</h1>
      <p className="mt-1.5 max-w-lg font-dm text-sm text-muted">
        Taking orders to your customers yourself, with your own people.
      </p>

      <div className="mt-6 max-w-lg">
        <OwnDeliveryPanel />
      </div>
    </div>
  );
}
