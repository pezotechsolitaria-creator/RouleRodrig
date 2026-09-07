"use client";

import { useState } from "react";
import ProductImage from "./ProductImage";
import SmartImage from "@/components/SmartImage";
import { useShopCopy } from "./ShopCopy";

// The product gallery.
//
// Thumbnails that actually SWITCH the main image — the old page rendered them
// as decoration, so a product with four photographs showed one and three
// unclickable squares. They are real buttons with a pressed state, so the
// gallery works on a keyboard and reads correctly to a screen reader.
//
// A product with no photograph gets the catalogue plate (ProductImage) at full
// size and no thumbnail strip. A product with exactly one gets the photo and no
// strip either: a single thumbnail under a single image is a control with
// nothing to control.
export default function ProductGallery({
  media, name, slug, categoryName,
}: {
  media: { url: string; alt: string | null }[];
  name: string;
  slug: string;
  categoryName?: string | null;
}) {
  const [index, setIndex] = useState(0);
  const copy = useShopCopy();
  const current = media[index] ?? media[0] ?? null;

  return (
    <div>
      {/* `relative` so the fill below has this box to fill. */}
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-white/10 bg-white/5">
        {current ? (
          <SmartImage
            src={current.url}
            alt={current.alt ?? name}
            fill
            className="object-cover"
            // The largest thing on the page and the thing a shopper waits for;
            // everything behind it can wait for them. `priority` is next/image's
            // version of the fetchPriority="high" this used to set by hand, and
            // it adds the preload hint the hand-written version could not.
            priority
            // Square, and capped by the two-column layout on a desktop. Without
            // this the optimiser assumes a full-width viewport and ships a file
            // several times the size of the slot.
            sizes="(max-width: 1024px) 100vw, 512px"
          />
        ) : (
          <ProductImage imageUrl={null} name={name} slug={slug} categoryName={categoryName} priority />
        )}
      </div>

      {media.length > 1 && (
        <div className="mt-2 grid grid-cols-5 gap-2">
          {media.slice(0, 10).map((m, i) => (
            <button
              key={m.url}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={copy.gallery.photo(i + 1, media.length)}
              aria-pressed={i === index}
              className={`relative aspect-square overflow-hidden rounded-lg border transition-colors ${
                i === index ? "border-yellow" : "border-white/10 hover:border-white/30"
              }`}
            >
              {/* These were the quiet expensive ones. Ten thumbnails in a
                  five-column grid are about 60px wide each, and every one of
                  them was downloading the shop's full-size original -- so a
                  product page with a real gallery could pull several megabytes
                  to paint a strip of postage stamps. */}
              <SmartImage src={m.url} alt="" fill className="object-cover" sizes="72px" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
