import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasShop } from "@/lib/merchant/context";
import ScanHandoff from "@/components/merchant/orders/ScanHandoff";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Where a scanned pickup QR lands. Inside the (app) group on purpose: the
// layout's auth guard, the merchant chrome and the query client all apply, so
// a scan by anyone who is not signed-in merchant staff gets the login wall
// before this page renders anything at all.
export default async function MerchantPickupScanPage() {
  const supabase = await createClient();
  if (!(await hasShop(supabase))) redirect("/merchant/onboarding");

  return (
    <div className="py-8">
      <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">PICKUP</p>
      <h1 className="mt-1 font-syne text-2xl font-extrabold text-offwhite">Confirm a handover</h1>
      <p className="mt-1.5 font-dm text-sm text-muted">
        Check the order below matches the customer in front of you, then confirm.
      </p>
      <div className="mt-6 max-w-lg">
        <ScanHandoff />
      </div>
    </div>
  );
}
