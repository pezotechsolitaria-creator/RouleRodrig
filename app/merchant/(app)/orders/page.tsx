import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasShop } from "@/lib/merchant/context";
import OrdersTable from "@/components/merchant/orders/OrdersTable";
import RedeemPickupCode from "@/components/merchant/orders/RedeemPickupCode";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function MerchantOrdersPage() {
  const supabase = await createClient();
  if (!(await hasShop(supabase))) redirect("/merchant/onboarding");

  return (
    <div className="py-8">
      <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">SALES</p>
      <h1 className="mt-1 font-syne text-2xl font-extrabold text-offwhite">Orders</h1>
      <p className="mt-1.5 font-dm text-sm text-muted">Track and fulfil orders placed against your shop.</p>

      {/* Above the list on purpose: when someone is standing at the counter the
          merchant does not yet know which order is theirs — the code is what
          tells them, so it must not be behind a search. */}
      <div className="mt-6">
        <RedeemPickupCode />
      </div>

      <div className="mt-4">
        <OrdersTable />
      </div>
    </div>
  );
}
