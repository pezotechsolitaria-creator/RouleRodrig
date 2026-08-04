import Link from "next/link";
import { ImageOff } from "lucide-react";
import { centsToDecimalString } from "@/lib/money";

export type ShopProductCard = {
  slug: string;
  name: string;
  minPrice: number;
  imageUrl: string | null;
  inStock: boolean;
};

export default function ProductCard({ storeSlug, product }: { storeSlug: string; product: ShopProductCard }) {
  return (
    <Link
      href={`/shop/${storeSlug}/${product.slug}`}
      className="group overflow-hidden rounded-2xl border border-white/10 bg-dark-card transition-colors hover:border-yellow/30"
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
      </div>
      <div className="p-3">
        <p className="truncate font-dm text-sm font-medium text-offwhite">{product.name}</p>
        <p className="mt-0.5 font-dm text-sm text-yellow">Rs {centsToDecimalString(product.minPrice)}</p>
      </div>
    </Link>
  );
}
