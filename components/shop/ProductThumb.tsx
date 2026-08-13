import { productArt } from "@/lib/marketplace/product-art";

// The small square: a cart line, an order line, a "buy again" row.
//
// Same rule as the full plate (components/shop/ProductImage.tsx) — a product
// with no photograph gets a designed tile rather than a grey icon — but at
// 56px there is no room for two words, so it carries initials. Deterministic
// from the slug, so the same product looks the same everywhere it appears.
export default function ProductThumb({
  imageUrl, name, slug, categoryName, className = "h-14 w-14 rounded-lg",
}: {
  imageUrl: string | null;
  name: string;
  /** Anything stable and unique to the product — slug or variant id. */
  slug: string;
  categoryName?: string | null;
  className?: string;
}) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={imageUrl} alt="" loading="lazy" className={`${className} object-cover`} />
    );
  }

  const art = productArt(slug, name, categoryName);
  const initials = art.wordmark
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <span
      aria-hidden
      className={`${className} flex items-center justify-center font-syne text-sm font-extrabold text-offwhite/70`}
      style={{ background: `linear-gradient(145deg, ${art.from}, ${art.to})` }}
    >
      {initials || "·"}
    </span>
  );
}
