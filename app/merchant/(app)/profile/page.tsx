import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasShop } from "@/lib/merchant/context";
import ShopProfileForm from "@/components/merchant/ShopProfileForm";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// The shop's own details — the one part of a merchant's shop they could never
// edit. Not by decision: `stores` grants authenticated SELECT only, so the
// dangerous columns and the harmless ones were locked together. M98 opened a
// narrow door for the harmless half.
export default async function MerchantProfilePage() {
  const supabase = await createClient();
  if (!(await hasShop(supabase))) redirect("/merchant/onboarding");

  return (
    <div className="py-8">
      <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">SETTINGS</p>
      <h1 className="mt-1 font-syne text-2xl font-extrabold text-offwhite">Shop details</h1>
      <p className="mt-1.5 font-dm text-sm text-muted">
        Your name, your description, and how customers reach you. This is what they see on your shop
        page and next to everything you sell.
      </p>

      <div className="mt-6 max-w-2xl">
        <ShopProfileForm />
      </div>
    </div>
  );
}
