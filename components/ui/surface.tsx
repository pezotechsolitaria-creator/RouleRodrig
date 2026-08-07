import { cn } from "@/lib/utils";

// ── The hairline-of-light container ─────────────────────────────────────────
//
// 165 distinct card class strings for 214 occurrences — 77% of them used
// exactly once. The three most common recipes are the same component spelled
// three ways, two of which disagree about whether the hairline is translucent
// white or solid #222:
//
//   rounded-2xl border border-white/10 bg-dark-card        ×33
//   rounded-xl  border border-white/10 bg-dark-card        ×15
//   rounded-xl  border border-dark-border bg-dark-card     ×13
//
// DESIGN.md's Light-Not-Shadow rule says depth is a hairline of light plus a
// top-lit gradient, never a drop shadow — yet 11 bespoke black drop-shadows had
// accumulated on cards, seven of them near-identical. Centralising the decision
// is the only way that rule survives contact with a growing codebase.

const TONES = {
  /** Default raised surface. */
  card: "border-white/10 bg-dark-card",
  /** Top-lit — the signature treatment, for surfaces that should feel premium. */
  lit: "border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01]",
  /** Quiet inset panel inside another surface. */
  inset: "border-white/5 bg-white/[0.03]",
  /** Attention without alarm — deadlines, holds, gentle warnings. */
  accent: "border-yellow/25 bg-yellow/[0.06]",
  /** Genuine problems only. */
  danger: "border-red-500/25 bg-red-500/[0.05]",
} as const;

const RADII = {
  md: "rounded-xl",
  lg: "rounded-2xl",
  xl: "rounded-3xl",
} as const;

export function Surface({
  children,
  tone = "card",
  radius = "lg",
  interactive = false,
  className,
  ...rest
}: {
  children?: React.ReactNode;
  tone?: keyof typeof TONES;
  radius?: keyof typeof RADII;
  /** Adds hover-warm + press feedback. Use on cards that are themselves links. */
  interactive?: boolean;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "border",
        RADII[radius],
        TONES[tone],
        interactive &&
          "transition-all hover:border-yellow/30 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export default Surface;
