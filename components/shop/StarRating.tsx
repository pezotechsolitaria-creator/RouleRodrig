"use client";

import { Star } from "lucide-react";
import { useShopCopy } from "./ShopCopy";

// Read-only stars. Half-stars are deliberately NOT drawn: rating_avg is rounded
// to two decimals and shown as a number right beside this, so a fractional
// glyph would add ambiguity ("is that 3.5 or 3.6?") without adding information.
// The filled count is rounded, and the number carries the precision.
//
// A CLIENT component only so its aria-label can be translated: the label is the
// whole of what a screen-reader user gets from this, since every glyph inside is
// aria-hidden. The props and the markup are unchanged.
export default function StarRating({
  value,
  size = 14,
  className = "",
}: {
  value: number;
  size?: number;
  className?: string;
}) {
  const copy = useShopCopy();
  const filled = Math.round(value);
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} aria-label={copy.rating.outOfFive(value.toFixed(1))}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          aria-hidden
          className={i <= filled ? "fill-yellow text-yellow" : "text-muted/40"}
        />
      ))}
    </span>
  );
}
