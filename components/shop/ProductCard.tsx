import Link from "next/link";
import { ImageOff } from "lucide-react";
import { centsToDecimalString } from "@/lib/money";
import QuickAdd, { type QuickAddVariant } from "./QuickAdd";

export type ShopProductCard = {
  slug: string;
  name: string;
  minPrice: number;
  imageUrl: string | null;
  inStock: boolean;
  /** Present only when the product has exactly ONE purchasable variant — that
   * is the case quick-add can serve without a variant choice. */
  quickAddVariant?: QuickAddVariant | null;
  /** >1 → the card shows "options" and the tap opens the product page. */
  variantCount?: number;
};

export default function ProductCard({
  storeSlug, storeId, storeName, product,
}: {
  storeSlug: string;
  storeId?: string;
  storeName?: string;
  product: ShopProductCard;
}) {
  const canQuickAdd = Boolean(product.inStock && product.quickAddVariant && storeId && storeName);
  return (
    <Link
      href={`/shop/${storeSlug}/${product.slug}`}
      className="group overflow-hidden rounded-2xl border border-white/10 bg-dark-card transition-all hover:border-yellow/30 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-white/5">
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted/40">
            <ImageOff size={28} />
          </div>
        )}
        {!product.inStock && (
          <span className="absolute right-2 top-2 rounded-full bg-dark/90 px-2 py-0.5 font-dm text-[10px] font-medium text-muted">
            Out of stock
          </span>
        )}
        {canQuickAdd && (
          <div className="absolute bottom-2 right-2">
            <QuickAdd
              storeId={storeId!}
              storeName={storeName!}
              productName={product.name}
              variant={product.quickAddVariant!}
            />
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="truncate font-dm text-sm font-medium text-offwhite">{product.name}</p>
        <p className="mt-0.5 font-dm text-sm text-yellow">
          {(product.variantCount ?? 1) > 1 && <span className="text-muted">from </span>}
          Rs {centsToDecimalString(product.minPrice)}
        </p>
      </div>
    </Link>
  );
}
