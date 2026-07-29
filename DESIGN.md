---
name: Roule Rodrigues
description: The golden-hour island concierge — a dark, app-first travel OS for Rodrigues.
colors:
  gold: "#F5C842"
  gold-deep: "#d4a800"
  ink: "#0a0a0a"
  ink-card: "#111111"
  ink-border: "#222222"
  offwhite: "#F5F5F0"
  muted: "#888888"
  ember: "#f97316"
typography:
  display:
    fontFamily: "Syne, sans-serif"
    fontSize: "clamp(1.875rem, 9vw, 3rem)"
    fontWeight: 800
    lineHeight: 0.98
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Syne, sans-serif"
    fontSize: "clamp(1.875rem, 5vw, 2.25rem)"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Syne, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "normal"
  body:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Bebas Neue, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0.25em"
rounded:
  sm: "0.75rem"
  md: "1rem"
  lg: "1.5rem"
  full: "9999px"
spacing:
  xs: "0.5rem"
  sm: "0.75rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    padding: "1rem 2.5rem"
  button-primary-hover:
    backgroundColor: "{colors.gold-deep}"
    textColor: "{colors.ink}"
  button-ghost:
    backgroundColor: "rgba(245,200,66,0.10)"
    textColor: "{colors.gold}"
    rounded: "{rounded.full}"
    padding: "1rem 2rem"
  input:
    backgroundColor: "{colors.ink-card}"
    textColor: "{colors.offwhite}"
    rounded: "{rounded.sm}"
    padding: "0.875rem 1rem"
  card-photo:
    backgroundColor: "{colors.ink-card}"
    rounded: "{rounded.md}"
  chip:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    padding: "0.25rem 0.75rem"
  nav-pill:
    backgroundColor: "rgba(10,10,10,0.80)"
    rounded: "{rounded.md}"
    padding: "0.375rem"
---

# Design System: Roule Rodrigues

## Overview

**Creative North Star: "Golden Hour on Rodrigues"**

The interface is the last hour of island daylight rendered as software: a deep,
near-black canvas — the lagoon after sunset — lit by warm marigold gold. It is
app-first, not brochure-first: the primary scene is a traveler holding a phone,
so every surface behaves like a native app the moment it loads (installable PWA,
a cinematic branded splash, a floating glass tab bar) rather than a scrolling
marketing page. Warmth carries the emotion — golden glows, a slow Ken Burns
drift on hero imagery, an ember-orange bloom low in the frame — while structure
keeps it trustworthy enough to take a payment.

Density is calm and generous: full-bleed photography, one clear action per view,
hairline-bordered cards floating on ink. The mood is **premium travel concierge,
warm but disciplined** — closer to a boutique hotel app than a discount OTA. Gold
is never decoration; it is wayfinding. It marks the one thing to do next, the
active tab, the required field, the price that matters. Because the canvas is so
dark, a single gold element reads as light in a room.

This world is deliberately **not** a bright, white, corporate SaaS dashboard, and
**not** a flat material-design grid of equal-weight cards. Photography and warmth
lead; chrome recedes.

**Key Characteristics:**
- Near-black canvas (#0a0a0a) with warm marigold gold (#F5C842) as the only true accent.
- App-first: floating glass bottom nav, PWA splash, native-feeling motion — never a static webpage.
- Full-bleed island photography inside hairline-bordered, gently-rounded cards.
- Gold is structural wayfinding, not decoration.
- Three-typeface system: geometric display (Syne), humanist body (DM Sans), condensed tracked labels (Bebas Neue).
- 60fps transform/opacity/filter motion, fully disabled under `prefers-reduced-motion`.

## Colors

A monochrome ink foundation lit by a single warm gold, with an ember-orange used
only as atmosphere. The restraint is the point: with almost no color competing,
gold becomes information.

### Primary
- **Rodrigues Gold** (#F5C842): The signature. Used for the one primary action per
  view, active navigation state, required-field markers, price highlights, key
  labels, and focus rings. It is the system's only saturated UI color.
- **Deep Brass** (#d4a800): The pressed/hover shade of gold on solid gold buttons
  and gradient bottoms (`from-yellow to-yellow-dark`). Never used as a text color
  on ink.

### Secondary
- **Ember** (#f97316): Atmosphere only — a low-opacity radial bloom behind the hero
  and splash (sunset warmth near the horizon line). Never a fill, border, or text
  color. It exists to make the dark feel warm, not to compete with gold.

### Neutral
- **Island Ink** (#0a0a0a): The primary background everywhere. The lagoon at night.
- **Ink Card** (#111111): Raised surfaces, inputs, and the sampled base of cards —
  one step up from the canvas.
- **Ink Border** (#222222): Solid hairline dividers and input strokes. On
  photographic cards this is expressed as translucent `rgba(255,255,255,0.10)`
  instead, so the border reads as a rim of light rather than a dark line.
- **Offwhite** (#F5F5F0): Primary text and headings. A warm off-white, never pure
  #fff — it belongs to golden hour, not fluorescent light.
- **Muted** (#888888): Secondary text, captions, inactive nav labels, placeholder
  text (often at reduced opacity, e.g. `muted/50`).

### Named Rules
**The Gold-Is-Information Rule.** Gold is structural, never ornamental. If a gold
element is not the next action, the active state, a required marker, or the price
that matters, it is wrong — recolor it offwhite or muted. A screen should have
exactly one primary-gold call to action.

**The Warm-Black Rule.** Backgrounds are warm near-black (#0a0a0a), text is warm
off-white (#F5F5F0). Never pure #000 or pure #fff — the whole world sits at golden
hour, and clinical black-on-white breaks the spell.

## Typography

**Display Font:** Syne (with sans-serif fallback) — a geometric, slightly
idiosyncratic grotesque; confident and modern.
**Body Font:** DM Sans (with sans-serif fallback) — a clean humanist workhorse for
readable, trustworthy running text.
**Label/Mono Font:** Bebas Neue (with sans-serif fallback) — tall, condensed,
all-caps; used only as tracked eyebrows and micro-labels.

**Character:** Syne carries personality and brand at the top of the hierarchy; DM
Sans does the honest work of legibility; Bebas adds an editorial, transit-sign
cadence to labels. The three never blur — each owns a tier and stays in it.

### Hierarchy
- **Display** (Syne 800, clamp 1.875–3rem, line-height 0.98, uppercase, -0.01em):
  Hero wordmark and splash. Tight, monumental, often stacked as its own lines.
- **Headline** (Syne 800, clamp 1.875–2.25rem / text-3xl→4xl, line-height 1.1):
  Page titles (`<h1>`). One per screen.
- **Title** (Syne 700, ~1.125–1.25rem / text-lg→xl, line-height 1.2): Section and
  card headings, the label on a photo card.
- **Body** (DM Sans 400, 0.875–1rem / text-sm→base, line-height ~1.5): All running
  copy, descriptions, form values. Muted for secondary detail.
- **Label** (Bebas Neue, 10–11px, letter-spacing 0.25–0.3em, uppercase): Section
  eyebrows ("OUR FLEET"), field labels, badges, nav captions. Frequently gold.

### Named Rules
**The Three-Voice Rule.** Syne for display/headings, DM Sans for body, Bebas for
tracked labels — never substitute one for another's job. A body paragraph in Syne
or a heading in Bebas is a system violation.

**The Whole-Word Rule.** Headings never hyphenate or break a word across lines
(`word-break: keep-all; hyphens: none`). On small phones, whole words stay intact —
readability outranks a tidy right edge.

## Layout

Mobile-first and single-column by default; content lives in a centered column
(`max-w-2xl`/`max-w-sm` for app views, wider only for editorial/guide pages).
Rhythm is generous and vertical: sections breathe with `space-y-7`+ and cards
carry internal padding at the `md`/`lg` steps.

The signature spatial pattern is the **horizontal snap rail**: full-bleed rows of
photo cards (`overflow-x-auto`, `snap-start`, fixed card widths like `w-36`/`w-40`)
that scroll sideways under a titled section — Discover, Experiences, Stays. This is
what makes it feel like an app, not a page.

Two persistent chrome elements frame every app view: a slim top **app header**
(logo + location chip + language toggle + wishlist) and a floating **bottom tab
bar**. Content reserves space for the bar with generous bottom padding
(`pb-[116px]`) so nothing hides beneath it. Spacing follows the Tailwind scale;
the working rhythm is 0.5 / 0.75 / 1 / 1.5 / 2rem.

## Elevation & Depth

Depth is drawn with **light, not shadow**. Surfaces are essentially flat; they are
separated from the ink canvas by a hairline of translucent white
(`border-white/10`) and, on richer cards, a subtle top-lit gradient
(`from-white/[0.04] to-white/[0.01]`) — as if lit from above. This keeps the UI
calm and premium instead of chunky.

Real shadows are rare and reserved for two jobs: (1) the floating glass bottom nav,
which must read as hovering above the page, and (2) a **gold glow** that blooms
under primary/active elements to make them feel lit rather than merely colored.

### Shadow Vocabulary
- **Floating nav** (`box-shadow: 0 16px 44px -12px rgba(0,0,0,0.75)`): The one heavy
  drop shadow — lifts the glass tab bar off the content.
- **Gold glow — nav/active** (`box-shadow: 0 6px 18px -4px rgba(245,200,66,0.55)`):
  Under the active gold tab and the Ti Roulé button.
- **Gold glow — hover CTA** (`box-shadow: 0 10px 36px rgba(245,200,66,0.4)`): Blooms
  on primary buttons on hover, paired with a slight scale.

### Named Rules
**The Light-Not-Shadow Rule.** Separate surfaces with a hairline of light
(`border-white/10`) and a top-lit gradient, not a drop shadow. Shadows appear only
under the floating nav and as a gold glow on the active/primary element.

## Shapes

A soft, friendly-but-precise radius language. Corners are consistently rounded, and
the scale is deliberate: **inputs and small tiles at 12px (`rounded-xl`)**, **cards
and panels at 16px (`rounded-2xl`)**, **larger feature panels at 24px
(`rounded-3xl`)**, and **all interactive pills/buttons fully round
(`rounded-full`)**. Nothing is sharp-cornered; nothing is a perfect circle except
avatars, badges, and dot indicators.

Photo cards are portrait (`aspect-[4/5]`) with the image bled edge to edge inside
the rounded clip and text overlaid on a bottom gradient scrim. Borders are always
hairline — either translucent white on photography or `ink-border` on solid
surfaces — never thick.

## Components

### Buttons
- **Shape:** Fully rounded pills (`rounded-full`); form-submit buttons occasionally
  soften to 12px (`rounded-xl`) to sit flush in a field stack.
- **Primary:** Solid **gold** background, **ink** text, `font-syne font-bold`,
  generous padding (`px-10 py-5` for hero, `py-4` full-width in forms). The single
  most important action on the view.
- **Hover / Focus:** Background deepens to Deep Brass (`hover:bg-yellow-dark`); on
  marketing CTAs, a slight `scale(1.04)` + gold glow. Disabled drops to `opacity-60`.
- **Ghost / Secondary:** Transparent gold wash (`bg-yellow/10`), gold text, hairline
  gold border (`border-yellow/30`), `hover:bg-yellow/15`. Used for install/secondary
  actions where a solid gold button would break the Gold-Is-Information Rule.

### Chips
- **Solid badge:** Gold background, ink text, Bebas uppercase tracked, fully round
  (`rounded-full px-3 py-1`) — "POPULAR", event dates, live status.
- **Outline chip:** `bg-yellow/10 text-yellow border border-yellow/30` — quieter
  tags and filters. Selected filters flip to solid gold.

### Cards / Containers
- **Corner Style:** 16px (`rounded-2xl`); feature panels 24px.
- **Background:** Photo cards bleed the image full; content cards use `ink-card` or a
  top-lit gradient (`from-white/[0.04] to-white/[0.01]`).
- **Shadow Strategy:** None at rest — see Elevation. Depth is the hairline border.
- **Border:** Hairline `border-white/10` (translucent on photos), warming to
  `border-yellow/40` on hover.
- **Hover:** Lifts `-translate-y-0.5` and the border warms toward gold; focus shows a
  `ring-2 ring-yellow/50`.
- **Internal Padding:** `md`–`lg` (1–1.5rem).

### Inputs / Fields
- **Style:** `ink-card` fill, solid `ink-border` hairline, 12px radius
  (`rounded-xl`), offwhite text, DM Sans, placeholder at `muted/50`. Leading icon in
  `muted/50` where helpful.
- **Focus:** Border shifts to **gold** (`focus:border-yellow`), no default outline —
  the stroke itself lights up. Global `:focus-visible` is a 2px gold outline.
- **Label:** Bebas, 10px, tracked `0.25em`, muted, with a **gold** required asterisk.
- **Error:** Border flips to `red-500/60`.

### Navigation
- **Bottom tab bar (signature):** A floating glass pill, `md:hidden`, centered above
  the safe area. `rounded-2xl border border-white/12 bg-dark/80 backdrop-blur-xl`
  with the one heavy drop shadow. Tabs are icon-over-Bebas-label; the **active** tab
  gets a solid gold pill behind it (ink icon/label) and its icon scales `1.1`. The
  center **Ti Roulé** button is always solid gold with a gold glow — the assistant is
  a permanent, elevated fixture.
- **Top app header:** Slim, transparent-over-content; animated logo, a location chip,
  the EN/FR/CR language toggle (a 36px round bordered button), and the wishlist heart
  with a gold count badge.

### Ti Roulé (signature)
The AI island guide is a first-class, always-present element: a gold-gradient launch
button in the tab bar, an animated mascot (gentle idle bob), and a site-wide chat.
It is mounted once globally and never duplicated per page.

## Do's and Don'ts

### Do:
- **Do** keep exactly one primary-gold action per view; everything else is offwhite,
  muted, or ghost. Gold marks the next step (the Gold-Is-Information Rule).
- **Do** separate surfaces with a hairline of light (`border-white/10`) and a top-lit
  gradient — not a drop shadow (the Light-Not-Shadow Rule).
- **Do** use warm near-black (#0a0a0a) and warm off-white (#F5F5F0), never pure black
  or white.
- **Do** assign type by voice: Syne for display/headings, DM Sans for body, Bebas for
  tracked labels — and keep each in its tier.
- **Do** lead with full-bleed island photography inside `rounded-2xl` hairline cards;
  overlay text on a bottom scrim.
- **Do** author motion with transform/opacity/filter only, and disable it under
  `prefers-reduced-motion`.
- **Do** warm borders toward gold on hover (`hover:border-yellow/40`) and lift cards
  `-translate-y-0.5`.
- **Do** reserve bottom padding (`pb-[116px]`) so content never hides under the
  floating tab bar.

### Don't:
- **Don't** use gold as decoration, large fills, or on more than the one primary
  action — its scarcity is what makes it read as premium.
- **Don't** introduce a second saturated accent. Ember (#f97316) is atmospheric glow
  only, never a fill, border, or text color.
- **Don't** add heavy drop shadows or hard elevation steps to cards; depth is light,
  not weight.
- **Don't** ship a bright/white surface or a clinical dashboard grid of equal-weight
  cards — that is the explicit anti-reference.
- **Don't** hyphenate or break headings across a word; keep whole words intact.
- **Don't** substitute typefaces across tiers (no body copy in Syne, no headings in
  Bebas).
- **Don't** duplicate the Ti Roulé chat per page — it is mounted once, globally.
