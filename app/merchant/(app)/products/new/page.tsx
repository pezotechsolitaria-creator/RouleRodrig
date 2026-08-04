import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnStoreId } from "@/lib/merchant/context";
import ProductForm from "@/components/merchant/products/ProductForm";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function NewProductPage() {
  const supabase = await createClient();
  const storeId = await getOwnStoreId(supabase);
  if (!storeId) redirect("/merchant/onboarding");

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .eq("is_active", true)
    .order("position");

  return <ProductForm mode="create" storeId={storeId} categories={categories ?? []} />;
}
