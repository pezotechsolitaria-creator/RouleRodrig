import AutoPhotos from "@/components/AutoPhotos";
import { uniquePhotos } from "@/lib/photos";
import { productArt } from "@/lib/marketplace/product-art";

// ── The product surface ─────────────────────────────────────────────────────
//
// On a phone the photograph IS the product; everything else is a caption. The
// marketplace has almost no photographs yet, and the honest fix is that shops
// upload them — but until they do, the grid has to hold its own design rather
// than render as a wall of grey boxes that reads "this site is unfinished".
//
// So a product with no photo gets a printed catalogue plate: its own name set
// large in the display face on a category-tinted ground, captioned like a
// catalogue entry. Deliberately typographic and deliberately NOT the food
// surface's emoji treatment — a marketplace tile has to read as commerce, and
// a row of emoji reads as a chat window. See lib/marketplace/product-art.ts.
//
// It never pretends to be a photograph. No silhouettes, no stock imagery, no
// generated jar of honey: inventing a picture of goods somebody is about to pay
// for is a lie with a price tag on it.
export default function ProductImage({
  imageUrl, imageUrls, name, slug, categoryName, className = "", priority = false, stagger = 0,
}: {
  imageUrl: string | null;
  /** The rest of the shop's photos. More than one turns the plate into a gallery. */
  imageUrls?: string[];
  name: string;
  slug: string;
  categoryName?: string | null;
  className?: string;
  /** The first card above the fold — everything else lazy-loads. */
  priority?: boolean;
  /** Position in the grid — offsets this card's photo cycle. */
  stagger?: number;
}) {
  if (imageUrl) {
    const gallery = uniquePhotos([imageUrl, ...(imageUrls ?? [])]);
    // One photo keeps the plain <img>: no client component, no timer, no
    // hydration — which is most of this catalogue and should stay that cheap.
    if (gallery.length > 1) {
      return (
        <AutoPhotos
          images={gallery}
          alt={name}
          sizes="(max-width: 640px) 50vw, 260px"
          priority={priority}
          stagger={stagger}
          className={className}
        />
      );
    }
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt=""
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        className={`h-full w-full object-cover ${className}`}
      />
    );
  }

  const art = productArt(slug, name, categoryName);
  return (
    <div
      aria-hidden
      className={`relative flex h-full w-full flex-col items-center justify-center overflow-hidden px-3 text-center ${className}`}
      style={{ background: `linear-gradient(150deg, ${art.from} 0%, ${art.to} 100%)` }}
    >
      {/* A hairline plate mark. Enough to make the tile read as a deliberate
          design object rather than as an unloaded image. */}
      <span className="pointer-events-none absolute inset-[7%] rounded-[10px] border border-white/[0.07]" />
      <span className="font-syne text-[15px] font-extrabold leading-[1.15] text-offwhite/80 sm:text-base">
        {art.wordmark}
      </span>
      {art.caption && (
        <span className="mt-2 font-bebas text-[9px] leading-none tracking-[0.28em] text-white/30">
          {art.caption.toUpperCase()}
        </span>
      )}
    </div>
  );
}
