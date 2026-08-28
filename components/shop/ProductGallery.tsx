"use client";

import { useState } from "react";
import ProductImage from "./ProductImage";
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
      <div className="aspect-square w-full overflow-hidden rounded-2xl border border-white/10 bg-white/5">
        {current ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={current.url}
            alt={current.alt ?? name}
            className="h-full w-full object-cover"
            // The first image is the largest thing on the page and the thing a
            // shopper waits for; everything behind it can wait for them.
            fetchPriority="high"
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
              className={`aspect-square overflow-hidden rounded-lg border transition-colors ${
                i === index ? "border-yellow" : "border-white/10 hover:border-white/30"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.url} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
