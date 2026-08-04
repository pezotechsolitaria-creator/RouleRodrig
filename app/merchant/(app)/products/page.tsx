import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasShop } from "@/lib/merchant/context";
import ProductsTable from "@/components/merchant/products/ProductsTable";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function MerchantProductsPage() {
  const supabase = await createClient();
  if (!(await hasShop(supabase))) redirect("/merchant/onboarding");

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .eq("is_active", true)
    .order("position");

  return (
    <div className="py-8">
      <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">CATALOG</p>
      <h1 className="mt-1 font-syne text-2xl font-extrabold text-offwhite">Products</h1>
      <p className="mt-1.5 font-dm text-sm text-muted">Manage what your shop sells.</p>

      <div className="mt-6">
        <ProductsTable categories={categories ?? []} />
      </div>
    </div>
  );
}
