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
  // THROUGH THE RPC, NOT THE TABLE. store_payment_settings has no SELECT grant
  // to `authenticated` and must not get one: its customer_read policy is
  // `store_is_visible(store_id) OR ...`, and RLS is ROW-level, so a grant would
  // publish every column of every visible shop — bank_name, account_holder and
  // account_number included. The absent grant is the only thing standing
  // between those and any signed-in visitor.
  //
  // So this read has silently returned NULL for every merchant, and the
  // delivery half of this editor has never once rendered. Same failure as the
  // /account delivery door: a permission error the page reads as "no".
  const storeId = await getOwnStoreId(supabase);
  const { data: payRows } = await supabase.rpc("store_payment_options", {
    p_store_id: storeId ?? "",
  });
  const pay = (payRows as { offers_rr_delivery?: boolean }[] | null)?.[0] ?? null;

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
