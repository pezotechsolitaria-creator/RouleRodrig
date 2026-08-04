import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnStoreId } from "@/lib/merchant/context";
import { isUuid } from "@/lib/file-signature";
import ProductForm from "@/components/merchant/products/ProductForm";
import type { ProductDetail } from "@/lib/merchant/queries";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const supabase = await createClient();
  const storeId = await getOwnStoreId(supabase);
  if (!storeId) redirect("/merchant/onboarding");

  // Scoped to the caller's own store by construction, same as the API route
  // — a mismatched id renders notFound(), never another merchant's product.
  const { data: product } = await supabase
    .from("products")
    .select(
      "id, name, description, status, category_id, product_variants(id, sku, price, stock_quantity, is_active), product_media(id, url, position)",
    )
    .eq("id", id)
    .eq("store_id", storeId)
    .maybeSingle();

  if (!product) notFound();

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .eq("is_active", true)
    .order("position");

  return (
    <ProductForm
      mode="edit"
      storeId={storeId}
      categories={categories ?? []}
      product={product as unknown as ProductDetail}
    />
  );
}
