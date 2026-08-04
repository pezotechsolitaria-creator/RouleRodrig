import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ImageOff } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import AddToCartForm, { type CartableVariant } from "@/components/shop/AddToCartForm";

export const revalidate = 60;

// The untyped Supabase client can't statically parse a 2-embed select string
// inside an async helper (falls back to an unusable GenericStringError type)
// — same workaround used elsewhere in this codebase: fetch, then assert.
type ProductDetailRow = {
  id: string; name: string; slug: string; description: string | null; status: string; store_id: string;
  product_variants: { id: string; name: string | null; price: number; stock_quantity: number; is_active: boolean }[];
  product_media: { url: string; position: number }[];
};

async function getProduct(storeSlug: string, productSlug: string) {
  const supabase = await createClient();
  const { data: store } = await supabase.from("stores").select("id, name, slug").eq("slug", storeSlug).maybeSingle();
  if (!store) return null;

  const { data } = await supabase
    .from("products")
    .select(
      "id, name, slug, description, status, store_id, " +
        "product_variants(id, name, price, stock_quantity, is_active), " +
        "product_media(url, position)",
    )
    .eq("store_id", store.id)
    .eq("slug", productSlug)
    .eq("status", "active")
    .maybeSingle();
  if (!data) return null;
  const product = data as unknown as ProductDetailRow;

  return { store, product };
}

export async function generateMetadata({
  params,
}: { params: Promise<{ storeSlug: string; productSlug: string }> }): Promise<Metadata> {
  const { storeSlug, productSlug } = await params;
  const found = await getProduct(storeSlug, productSlug);
  if (!found) return {};
  return {
    title: `${found.product.name} | ${found.store.name} | Roulé Rodrigues`,
    description: found.product.description || `${found.product.name} from ${found.store.name}.`,
  };
}

export default async function ProductPage({
  params,
}: { params: Promise<{ storeSlug: string; productSlug: string }> }) {
  const { storeSlug, productSlug } = await params;
  const found = await getProduct(storeSlug, productSlug);
  if (!found) notFound();
  const { store, product } = found;

  const media = ((product.product_media ?? []) as { url: string; position: number }[])
    .slice()
    .sort((a, b) => a.position - b.position);
  const variants: CartableVariant[] = ((product.product_variants ?? []) as {
    id: string; name: string | null; price: number; stock_quantity: number; is_active: boolean;
  }[]).map((v) => ({ id: v.id, name: v.name, price: v.price, stockQuantity: v.stock_quantity, isActive: v.is_active }));

  return (
    <main className="min-h-screen bg-dark px-4 pb-16 pt-10 text-offwhite">
      <div className="mx-auto max-w-4xl">
        <Link href={`/shop/${store.slug}`} className="inline-flex items-center gap-1.5 font-dm text-sm text-muted hover:text-yellow">
          <ArrowLeft size={14} /> {store.name}
        </Link>

        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          <div>
            <div className="aspect-square w-full overflow-hidden rounded-2xl bg-white/5">
              {media[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={media[0].url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted/40">
                  <ImageOff size={40} />
                </div>
              )}
            </div>
            {media.length > 1 && (
              <div className="mt-2 grid grid-cols-4 gap-2">
                {media.slice(1, 5).map((m) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={m.url} src={m.url} alt="" className="aspect-square w-full rounded-lg object-cover" />
                ))}
              </div>
            )}
          </div>

          <div>
            <h1 className="font-syne text-2xl font-extrabold text-offwhite">{product.name}</h1>
            {product.description && (
              <p className="mt-2 font-dm text-sm leading-relaxed text-muted">{product.description}</p>
            )}

            <div className="mt-5 rounded-2xl border border-white/10 bg-dark-card p-4">
              <AddToCartForm storeId={store.id} storeName={store.name} productName={product.name} variants={variants} />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
