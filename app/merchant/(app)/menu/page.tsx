import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasShop, getOwnStoreId } from "@/lib/merchant/context";
import MenuPanel from "@/app/kitchen/MenuPanel";

export const metadata: Metadata = { title: "Today's menu", robots: { index: false, follow: false } };

// The food half of the combination the owner asked for: the merchant dashboard,
// plus what /kitchen does that a shop never needed.
//
// Reuses app/kitchen/MenuPanel verbatim rather than growing a second copy. It
// talks to /api/kitchen, which is scoped by kitchen_staff — and a restaurant
// owner IS kitchen_staff with role 'owner' (M81), so it works here unchanged
// and there is exactly one menu editor in the product.
//
// Only reachable for a store that is actually a kitchen. A marketplace seller
// landing here would be shown a menu editor for a shop that has no menu.
export default async function MerchantMenuPage() {
  const supabase = await createClient();
  if (!(await hasShop(supabase))) redirect("/merchant/onboarding");

  const storeId = await getOwnStoreId(supabase);
  if (!storeId) redirect("/merchant/onboarding");

  const { data: kitchen } = await supabase
    .from("food_kitchens")
    .select("store_id")
    .eq("store_id", storeId)
    .maybeSingle();
  // Not an error page: the shop simply has no menu, and Products is where its
  // catalogue lives.
  if (!kitchen) redirect("/merchant/products");

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="font-syne text-2xl font-extrabold text-offwhite">Today’s menu</h1>
      <p className="mt-1.5 font-dm text-sm text-muted">
        What you are cooking today. Marking a dish sold out puts it back on the menu
        automatically tomorrow, so nobody has to remember to undo it before service.
      </p>
      <div className="mt-6">
        <MenuPanel />
      </div>
    </div>
  );
}
