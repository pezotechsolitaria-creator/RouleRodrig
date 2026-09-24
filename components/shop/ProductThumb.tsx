import SmartImage from "@/components/SmartImage";
import { productArt } from "@/lib/marketplace/product-art";

// The small square: a cart line, an order line, a "buy again" row.
//
// Same rule as the full plate (components/shop/ProductImage.tsx) — a product
// with no photograph gets a designed tile rather than a grey icon — but at
// 56px there is no room for two words, so it carries initials. Deterministic
// from the slug, so the same product looks the same everywhere it appears.
export default function ProductThumb({
  imageUrl, name, slug, categoryName, className = "h-14 w-14 rounded-lg", size = 56,
}: {
  imageUrl: string | null;
  name: string;
  /** Anything stable and unique to the product — slug or variant id. */
  slug: string;
  categoryName?: string | null;
  className?: string;
  /** The rendered edge in CSS pixels — what the optimiser should fetch for.
   *  The className still draws the box; this only sizes the download. */
  size?: number;
}) {
  if (imageUrl) {
    // ── 56 PIXELS, NOT THREE AND A HALF MEGABYTES ─────────────────────────
    //
    // This was a raw <img src={imageUrl}>, so the box pulled the merchant's
    // full-size original. Measured live: the Flame-Grilled Lobster Package
    // photo is a 3,490,045-byte PNG, downloaded whole to fill a 56x56 square
    // on /cart — the ONE page a buyer has to load before paying. On a
    // Rodrigues mobile connection that is tens of seconds of blank card at
    // the moment of highest abandonment, and it bills against Supabase
    // Storage egress, which is this project's actual constraint.
    //
    // SmartImage serves a resized WebP for a host that is configured and
    // renders exactly what this did for one that is not, so a URL a merchant
    // pasted can never blank the page.
    return (
      <SmartImage
        src={imageUrl}
        alt=""
        width={size}
        height={size}
        sizes={`${size}px`}
        className={`${className} object-cover`}
      />
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
