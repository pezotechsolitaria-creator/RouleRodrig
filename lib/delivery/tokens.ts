// ── The Roulé Delivery design system ────────────────────────────────────────
//
// ── WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT ──────────────────────────
// The brief asked for a DoorDash rebuild: #eb1700 on white, their card system,
// their mental model. Two of those three are taken, one is refused, and the
// refusal is the important part.
//
// TAKEN — the CRAFT. Progressive disclosure, a sticky primary action that is
// always reachable, cost shown before the user has invested effort, one clear
// hierarchy per screen, real empty and offline states, motion that explains a
// state change rather than decorating it, touch targets a thumb can hit on a
// scooter. This is what actually makes DoorDash feel effortless, and almost
// none of it is visual.
//
// REFUSED — the PALETTE. #eb1700 is DoorDash's trade dress, and dropping a red
// light theme into a dark amber tourism brand would make /deliver look like a
// different company's page bolted onto roulerodrig.com. The brief's own §55
// settles this: reproduce the quality through an original Rodrigues identity.
// So the accent stays #F5C842 and the ground stays near-black.
//
// TAKEN BACK — the MODEL. DoorDash sells a fixed menu at a fixed price. Roulé
// Delivery is a reverse auction: a customer describes a thing, drivers quote,
// the customer picks. "Add to cart" has no meaning for a gas bottle nobody will
// carry on a scooter. The DoorDash checkout psychology still applies — show the
// cost early, never surprise, one decision per screen — but the object being
// decided is a QUOTE, not a basket.
//
// ── THE NUMBER THAT SHAPED THIS ────────────────────────────────────────────
// delivery_requests has ZERO rows. The flow is built, deployed and has never
// been completed by anybody. The screens show why: about ten fields on one
// scroll, with the only button below the fold and nothing learned until the
// end. That is the problem this system exists to fix, and it is a structure
// problem rather than a colour problem.
//
// Every value below is a token because a value scattered across forty
// components is a value nobody can change.

// ── COLOUR ──────────────────────────────────────────────────────────────────
// Mapped to the CSS custom properties already declared in app/globals.css, so
// this layer never introduces a second source of truth for the brand. Tailwind
// class strings rather than hex, because the components are Tailwind.

export const surface = {
  /** The page itself. */
  ground: "bg-dark",
  /** A raised card on the ground. */
  card: "bg-dark-card",
  /** A field or a well INSIDE a card — one step darker, not lighter, because
   *  on a dark ground recessed reads as editable and raised reads as static. */
  well: "bg-white/[0.03]",
  /** The accent wash behind a selected or highlighted card. */
  accent: "bg-yellow/[0.07]",
  /** A sheet or bar that floats over content and must stay legible above it. */
  overlay: "bg-dark/95 backdrop-blur-md",
} as const;

export const border = {
  hairline: "border-white/10",
  /** A card the user can act on. Slightly stronger, so it reads as a target. */
  interactive: "border-white/[0.14]",
  selected: "border-yellow/60",
  danger: "border-red-500/40",
} as const;

export const text = {
  primary: "text-offwhite",
  /** Body copy and anything secondary. #888888 on #0a0a0a is 5.58:1 and on
   *  #111111 is 5.33:1 — AA either way, and the reason it is not lighter is
   *  that everything cannot be primary. */
  secondary: "text-muted",
  /** Deliberately NOT text-muted at reduced opacity. Dimming an already-dim
   *  grey is how dark UIs fail contrast without anybody noticing -- which is
   *  exactly what happened here: this was white/45, and white/45 composited
   *  over #0a0a0a is 4.48:1. It FAILED AA by two hundredths while the comment
   *  above it claimed otherwise. Measured, not eyeballed:
   *
   *      white/30  2.61     white/45  4.48  <- was here
   *      white/35  3.15     white/55  6.28  <- is here
   *      white/40  3.77     #888888   5.58  (text.secondary)
   *
   *  Anything below white/55 is for decoration only, never for words. */
  faint: "text-white/55",
  accent: "text-yellow",
  danger: "text-red-400",
  onAccent: "text-dark",
} as const;

// ── TYPE ────────────────────────────────────────────────────────────────────
// Three faces, each with exactly one job. Syne is the voice, Bebas is the
// signpost, DM Sans is everything a person actually reads.

// ── THE SIZES CHANGED, AND HERE IS THE EVIDENCE ────────────────────────────
// The owner's brief is that an older person must be able to order unaided. On
// Rodrigues that is not an edge case: the 2022 census counts 5,548 people aged
// 60+ on an island of 43,604 — 12.7% — and 96.8% of them own a mobile phone
// while only 12.6% can use a computer (CMPHS 2024). This surface is their
// computer.
//
// A systematic review of mobile font size for older adults (Hou et al. 2020,
// participants aged 57–70) reports ~14px for information search and ~17px for
// intensive reading on smartphones, and stresses there is a critical size below
// which readability falls away. The previous scale put field LABELS and the
// single most consequential sentence on the form — the one explaining that a
// shopping budget is repaid separately from the fee — at 12px.
//
// So the floor is raised: nothing a person must read in order to answer a
// question sits below 14px, and body copy is at the intensive-reading size.
// This is set for EVERYONE rather than behind a "large text" switch, because a
// mode that has to be discovered will not be discovered by the people who need
// it.

export const type = {
  /** Page title. One per screen. */
  display: "font-syne text-3xl font-extrabold leading-[1.1] tracking-tight md:text-4xl",
  /** Section heading inside a screen. */
  heading: "font-syne text-xl font-bold leading-snug",
  /** A card's own title. */
  cardTitle: "font-syne text-lg font-bold leading-snug",
  /** The small tracked capitals above a section. A signpost, never a sentence —
   *  Bebas has no lowercase worth reading at this size. */
  eyebrow: "font-bebas text-[11px] tracking-[0.3em] uppercase",
  /** Anything read to make a decision. 17px is the intensive-reading size for
   *  57–70 year olds in Hou et al. (2020); it was 15px. */
  body: "font-dm text-[17px] leading-relaxed",
  bodySm: "font-dm text-[15px] leading-relaxed",
  /** Field labels, hints, timestamps. 14px is the information-search floor from
   *  the same review; it was 12px, which is where every label on the form sat.
   *  Nothing below this may carry a word somebody needs. */
  meta: "font-dm text-sm leading-normal",
  /** Money and quantities. Tabular so a column of prices does not shimmer as it
   *  updates — the single most common polish failure in a checkout. */
  numeric: "font-dm tabular-nums",
} as const;

// ── SPACE ───────────────────────────────────────────────────────────────────
// A 4px base. Named by intent rather than size, so "the gap between cards" is
// one decision made once.

export const space = {
  /** Between a label and its field. */
  tight: "gap-1.5",
  /** Between fields in a group. */
  field: "gap-4",
  /** Between cards in a list. */
  card: "gap-3",
  /** Between sections of a screen. */
  section: "gap-8",
  /** The page gutter. 20px on mobile is the most thumb-reachable value that
   *  still leaves a 16px card inset feeling deliberate. */
  gutter: "px-5",
  /** Bottom padding that clears BOTH the sticky action bar and the app's
   *  floating bottom nav. Getting this wrong hides the last card. */
  bottomSafe: "pb-40",
} as const;

// ── SHAPE ───────────────────────────────────────────────────────────────────

export const radius = {
  field: "rounded-xl",
  card: "rounded-2xl",
  /** Pills: bottom nav, chips, the primary action. */
  pill: "rounded-full",
  sheet: "rounded-t-3xl",
} as const;

// ── ELEVATION ───────────────────────────────────────────────────────────────
// On a near-black ground a drop shadow is invisible. Elevation is expressed as
// a lighter border plus, for the accent, a glow — which is exactly what the
// existing bottom nav already does for its active item.

export const elevation = {
  flat: "",
  card: "border " + border.hairline,
  raised: "border " + border.interactive,
  /** The active/primary state. The glow is the elevation. */
  glow: "shadow-[0_0_24px_-6px] shadow-yellow/40",
} as const;

// ── TOUCH ───────────────────────────────────────────────────────────────────
// WCAG 2.2 AA asks 24×24 minimum. 44 is the real-world floor for a thumb, and
// this is an app used one-handed, outdoors, sometimes in the rain.

// WCAG 2.2 SC 2.5.8 (AA) asks 24x24 and SC 2.5.5 (AAA) asks 44x44. AAA is the
// floor here, not the ceiling: reduced dexterity and tremor are common in the
// cohort this is for, and every one of these targets is a whole decision.
export const touch = {
  /** The AAA minimum. Only for controls that are not part of the main path. */
  min: "min-h-11", // 44px — WCAG 2.5.5
  comfortable: "min-h-14", // 56px — anything on the path to ordering
  /** The primary action. Big enough to hit without looking, in the sun. */
  primary: "min-h-[60px]",
} as const;

// ── MOTION ──────────────────────────────────────────────────────────────────
// Framer Motion configs, not class strings, because these are passed to the
// library. Every one of them communicates something; none of them decorate.
//
// Named `transition` rather than `motion` on purpose: every component that
// uses these also imports framer-motion's `motion`, and two things called the
// same in one file is an import alias somebody eventually gets wrong.

export const transition = {
  /** A sheet or drawer arriving. Spring, because it is a physical object being
   *  pulled into place and a linear tween reads as a slideshow. */
  sheet: { type: "spring", stiffness: 380, damping: 34, mass: 0.9 },
  /** A card being selected. Fast and small — confirmation, not celebration. */
  select: { type: "spring", stiffness: 500, damping: 30 },
  /** Content fading in after load. */
  fade: { duration: 0.18, ease: [0.22, 1, 0.36, 1] },
  /** A step advancing in the request flow. Slightly slower than a fade so the
   *  eye follows the direction of travel and understands it can go back. */
  step: { duration: 0.26, ease: [0.22, 1, 0.36, 1] },
  /** The skeleton pulse. */
  pulse: { duration: 1.6, repeat: Infinity, ease: "easeInOut" },
} as const;

/** Distances for enter/exit. Small: motion should point, not travel. */
export const travel = {
  step: 16,
  sheet: 24,
  nudge: 4,
} as const;

// ── RECIPES ─────────────────────────────────────────────────────────────────
// The half-dozen patterns that would otherwise be retyped, slightly
// differently, in every component — which is how a design system becomes a
// suggestion.

export const recipe = {
  /** A tappable card: the request-kind chooser, a quote, a saved place. */
  cardButton: [
    "w-full text-left transition-colors",
    radius.card,
    surface.card,
    "border " + border.interactive,
    "p-4",
    touch.comfortable,
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow/70 focus-visible:ring-offset-2 focus-visible:ring-offset-dark",
  ].join(" "),

  /** The same card, chosen. Colour is NOT the only signal — the selected card
   *  also carries a check mark, because ~8% of men here cannot rely on hue. */
  cardButtonSelected: [
    "w-full text-left transition-colors",
    radius.card,
    surface.accent,
    "border " + border.selected,
    "p-4",
    touch.comfortable,
  ].join(" "),

  /** A text input. */
  field: [
    "w-full transition-colors",
    radius.field,
    surface.well,
    "border " + border.hairline,
    "px-4 py-3",
    type.body,
    text.primary,
    "placeholder:text-white/35",
    touch.comfortable,
    "focus:border-yellow/50 focus:outline-none focus:ring-2 focus:ring-yellow/25",
  ].join(" "),

  /** The primary action. Yellow on dark is 11.6:1 — the strongest contrast pair
   *  in the brand, which is why it is reserved for the one action per screen. */
  primaryAction: [
    "w-full font-syne font-bold transition-all",
    radius.pill,
    "bg-yellow text-dark",
    touch.primary,
    "px-6",
    "disabled:opacity-35 disabled:cursor-not-allowed",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow focus-visible:ring-offset-2 focus-visible:ring-offset-dark",
  ].join(" "),

  secondaryAction: [
    "font-dm font-medium transition-colors",
    radius.pill,
    "border " + border.interactive,
    text.primary,
    touch.min,
    "px-5",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow/70",
  ].join(" "),

  /** The bar pinned above the bottom nav that carries the primary action. The
   *  single most important structural fix: in the current form the only button
   *  is below ten fields, so nobody ever sees it while deciding. */
  stickyBar: [
    "fixed inset-x-0 z-30",
    "border-t " + border.hairline,
    surface.overlay,
    space.gutter,
    "pt-3 pb-3",
  ].join(" "),
} as const;

/**
 * Motion props that collapse to nothing when the reader has asked for less.
 *
 * Reading the media query here rather than in each component is what makes
 * "respect prefers-reduced-motion" true across the surface instead of true in
 * the three places somebody remembered.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/** The breakpoints this surface actually designs for. Mobile is not a
 *  fallback here — it is the only device most of these orders come from. */
export const screens = {
  xs: 360,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const;
