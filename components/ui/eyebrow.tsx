import { cn } from "@/lib/utils";

// ── The Bebas micro-label ───────────────────────────────────────────────────
//
// The single most-repeated string in this codebase: ~215 longhand spellings
// across 77 files, in four different sizes and three different tracking values:
//
//   font-bebas text-[11px] tracking-[0.3em] text-yellow             ×29
//   font-bebas text-yellow text-xs tracking-[0.3em]                 ×27
//   font-bebas text-muted text-[10px] tracking-[0.25em] block mb-2  ×20
//   font-bebas text-yellow text-xs tracking-[0.35em] mb-2           ×17
//
// One component, one ramp. This is also the fix for two systemic problems the
// audit surfaced: the type scale had fragmented to ~51 sizes (nine steps in a
// five-pixel band, all from this label), and tracking to ten values of which
// six sat outside DESIGN.md's documented 0.25–0.3em.
//
// `tone` encodes the Gold-Is-Information rule: gold marks a section the reader
// is meant to navigate by; a form's field label is structural, so it is muted.

const SIZES = {
  sm: "text-[10px] tracking-[0.25em]",
  md: "text-[11px] tracking-[0.3em]",
} as const;

const TONES = {
  gold: "text-yellow",
  muted: "text-muted",
  offwhite: "text-offwhite",
} as const;

export function Eyebrow({
  children,
  tone = "gold",
  size = "md",
  as: Tag = "p",
  className,
}: {
  children: React.ReactNode;
  tone?: keyof typeof TONES;
  size?: keyof typeof SIZES;
  /** `label` for form fields, `p` (default) for section eyebrows. */
  as?: "p" | "span" | "div" | "label";
  className?: string;
}) {
  return <Tag className={cn("font-bebas uppercase", SIZES[size], TONES[tone], className)}>{children}</Tag>;
}

export default Eyebrow;
