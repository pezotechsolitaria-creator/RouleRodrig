import { Star } from "lucide-react";

// Read-only stars. Half-stars are deliberately NOT drawn: rating_avg is rounded
// to two decimals and shown as a number right beside this, so a fractional
// glyph would add ambiguity ("is that 3.5 or 3.6?") without adding information.
// The filled count is rounded, and the number carries the precision.
export default function StarRating({
  value,
  size = 14,
  className = "",
}: {
  value: number;
  size?: number;
  className?: string;
}) {
  const filled = Math.round(value);
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} aria-label={`${value.toFixed(1)} out of 5`}>
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
