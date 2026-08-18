// Client-safe: types only — no Node.js imports, no server-only code.
//
// ── WHY A SECOND CONTENT STORE EXISTS ───────────────────────────────────────
//
// The site's editorial content lives in ONE Supabase row: `site_content.data`,
// a single JSONB blob that /admin's "Save Changes" rewrites WHOLE. That design
// is fine for one owner editing one site, and it is the reason this file is
// here: it makes independent worlds impossible. Two editors on two worlds
// saving a minute apart means the second write silently reverts the first — not
// a merge conflict, not an error, just the other person's work gone. There is
// also nowhere to keep a draft: everything in that blob is live the instant it
// is saved.
//
// Worlds therefore get their OWN table, one row per world, each with a separate
// draft and published document (see supabase/migrations/…_m104_world_content).
// Editing Curated cannot touch Stays, a draft is never public, and a bad save
// is one click from a rollback.
//
// This is additive. `site_content` keeps owning everything it owns today; a
// world document only ever describes how a world's PAGE is composed, and points
// at the real catalogue through `CardSource` rather than copying it.

import type { Language } from "@/lib/i18n";
import { loc } from "@/lib/localize";

/** The worlds the admin can switch between. Order is the switcher's order. */
export const WORLD_IDS = [
  // The two EXPERIENCE worlds first: each owns a page composed from its own
  // document (see lib/worlds.ts for what "authentic" and "curated" mean to a
  // visitor, and WORLD_PAGE for where switching takes them). Everything after
  // them is a section of the site that is still edited elsewhere.
  "authentic",
  "curated",
  "explore",
  "stays",
  "experiences",
  "eat-drink",
  "shops",
  "transfers",
  "global",
] as const;

export type WorldId = (typeof WORLD_IDS)[number];

export function isWorldId(v: string): v is WorldId {
  return (WORLD_IDS as readonly string[]).includes(v);
}

/** How each world is named, and the public page it composes. */
export const WORLD_META: Record<WorldId, { label: string; href: string; blurb: string }> = {
  authentic: { label: "Authentic", href: "/authentic", blurb: "The island as it is — local life, land and water." },
  curated: { label: "Curated", href: "/curated", blurb: "Ti Roulé's own selection — stays, tables and arranged days." },
  explore: { label: "Explore", href: "/explore", blurb: "Search and browse everything on the island." },
  stays: { label: "Stays", href: "/browse/stays", blurb: "Places to sleep." },
  experiences: { label: "Experiences", href: "/browse/tours", blurb: "Things to do, book and remember." },
  "eat-drink": { label: "Eat & Drink", href: "/food", blurb: "Kitchens, tables and the food concierge." },
  shops: { label: "Shops", href: "/shop", blurb: "The marketplace." },
  transfers: { label: "Transfers", href: "/transfers", blurb: "Airport runs, taxis and private hire." },
  global: { label: "Global", href: "/", blurb: "Branding and settings shared by every world." },
};

// ── Localised text ──────────────────────────────────────────────────────────
//
// The rest of the codebase carries translations as sibling fields (`label`,
// `labelFr`, `labelCr`) because those shapes grew one field at a time. A world
// document is new, so its text is one object — which is what lets the admin
// render a three-language input from a field name alone instead of needing a
// hand-written form per field.
export interface Localized {
  en: string;
  fr?: string;
  cr?: string;
}

/** Resolve a Localized for the visitor's language, falling back to English. */
export function locT(language: Language, text?: Localized): string {
  if (!text) return "";
  return loc(language, text.en, text.fr, text.cr);
}

export const T = (en: string, fr?: string, cr?: string): Localized => ({ en, fr, cr });

// ── Cards point at real things ──────────────────────────────────────────────
//
// A curated card is a POINTER plus an editor's overrides, never a copy. The
// image, name and destination come from the live catalogue, so a stay that is
// renamed or re-photographed in /admin updates its curated card too, and a card
// can never advertise something that no longer exists.
//
// `link` is the one free-form kind, for an editorial card that leads to a guide
// page or an in-app hub rather than to a catalogue row.
export type CardSource =
  | { kind: "place"; id: string }        // site_content.recommended.items
  | { kind: "location"; id: string }     // site_content.mapLocations
  | { kind: "route"; id: string }        // site_content.rideRoutes
  // Scooters and cars. This is the ORIGINAL business, and the first cut of the
  // curated page left it out entirely — a page selling "the island, elevated"
  // with no way to get around it. A world page must be able to recommend a
  // vehicle the same way it recommends a table.
  | { kind: "fleet"; id: string }        // site_content.fleet
  | { kind: "event"; slug: string }      // ticketed events
  | { kind: "link"; href: string };      // anywhere in the app

/** Publishing state of a single card inside an otherwise published world. */
export type CardStatus = "published" | "draft" | "scheduled";

export interface WorldCard {
  id: string;
  source: CardSource;
  /** Editorial overrides. Empty means "use whatever the catalogue says". */
  title?: Localized;
  blurb?: Localized;
  /** Override photo. Empty falls back to the source's own cover. */
  image?: string;
  /** Category pill — PRIVATE · GASTRONOMY · ADVENTURE. Free text, upper-cased. */
  category?: Localized;
  /** Ids from the world's editorial-label library. */
  labels?: string[];
  /** Overrides the source's destination. */
  href?: string;
  status?: CardStatus;
  /** ISO date. Only meaningful when status === "scheduled". */
  publishAt?: string;
}

/** One entry in the world's label library (TI ROULÉ PICK, HIDDEN GEM…). */
export interface EditorialLabel {
  id: string;
  text: Localized;
  /** Visual weight. `pick` is the strongest and should stay rare. */
  tone: "pick" | "quiet" | "warm";
}

export interface QuickActionItem {
  id: string;
  label: Localized;
  /** Icon key → a lucide icon in components/curated/icons.ts. */
  icon: string;
  href: string;
  enabled?: boolean;
}

export interface MoodCard {
  id: string;
  /** SLOW DAYS · WILD RODRIGUES · AFTER DARK … */
  title: Localized;
  blurb: Localized;
  image?: string;
  /** Falls back to the first source image when empty. */
  href: string;
  enabled?: boolean;
}

export interface EditorNote {
  id: string;
  /** "3 places we'd take a first-time visitor" */
  title: Localized;
  body: Localized;
  href: string;
  ctaLabel?: Localized;
  /** Who signed it. Shown small — this is what makes it a recommendation. */
  byline?: Localized;
  image?: string;
  enabled?: boolean;
}

// ── Sections ────────────────────────────────────────────────────────────────
//
// The page is an ORDERED LIST of these. Reordering in the admin reorders the
// page; there is no hard-coded section order on the frontend, which is the
// whole point of the exercise.
//
// The hero is deliberately NOT in here — see WorldDoc.

export type WorldSectionType =
  // ── THE HOMEPAGE'S OWN NAVIGATION, AVAILABLE TO ANY WORLD ────────────────
  // The owner's instruction: the six photo cards and the grid of things people
  // do belong on every world page, not only on "/". A world that cannot reach
  // scooters, cars, stays, food and shops is a magazine, not a front door — and
  // these two read the SAME admin content (content.homeCards,
  // content.quickAccess) the homepage does, so there is one place to edit them
  // and they can never disagree.
  | "cards"
  | "quickAccess"
  | "featured"
  | "onlyInRodrigues"
  | "moods"
  | "editors"
  // What is on, and what people said. Both were missing.
  | "events"
  | "reviews"
  | "concierge";

interface SectionBase {
  id: string;
  enabled?: boolean;
  title?: Localized;
  subtitle?: Localized;
  /**
   * "See all →" beside the heading.
   *
   * A curated section shows a handful on purpose, which leaves the reader who
   * wanted the tenth one with nowhere to go. This is that door. Empty means no
   * link — correct for the sections that are complete in themselves.
   */
  seeAll?: string;
}

export interface FeaturedSection extends SectionBase {
  type: "featured";
  cards: WorldCard[];
  /** How many cards a phone shows before the rail scrolls. Editorial restraint. */
  limit?: number;
}

export interface OnlyInRodriguesSection extends SectionBase {
  type: "onlyInRodrigues";
  cards: WorldCard[];
}

export interface MoodsSection extends SectionBase {
  type: "moods";
  moods: MoodCard[];
}

export interface EditorsSection extends SectionBase {
  type: "editors";
  notes: EditorNote[];
}

/** One of the large photo cards at the top of a world. */
export interface WorldPhotoCard {
  id: string;
  label: Localized;
  /** Icon key — see components/world-page/WorldPhotoCards.tsx. */
  icon: string;
  href?: string;
  /** "tiroule" opens the chat instead of navigating. */
  action?: "link" | "tiroule";
  /**
   * Which catalogue category supplies the photograph:
   * scooter · car · stays · exp · stores · food · none.
   */
  imageSource: string;
  /** A pinned photo, overriding the catalogue's. */
  image?: string;
  popular?: boolean;
  enabled?: boolean;
}

/**
 * The large photo cards — THIS WORLD'S OWN.
 *
 * ── WHY THEY ARE NOT SHARED WITH THE HOMEPAGE ───────────────────────────────
 * They were, for one commit: the section read `content.homeCards` so a card was
 * written once and appeared everywhere. That is the right instinct for a
 * navigation bar and the wrong one here, and the owner said so plainly — adding
 * something to Curated must not change Authentic.
 *
 * He is right, and the reason is what these cards ARE. On the homepage they are
 * the site's index: every category, in a fixed order, because a visitor has to
 * be able to reach all of it. On a curated page they are an argument — six
 * things chosen, in a chosen order, possibly not six, possibly not the same
 * six. Sharing one list would have meant the argument could never differ from
 * the index without changing the index.
 *
 * The cost is that a new category has to be added twice. That is the correct
 * cost: the second time is a decision about whether it belongs in this world.
 */
export interface CardsSection extends SectionBase {
  type: "cards";
  items: WorldPhotoCard[];
}

/** One tile in the "what are you looking for" grid. */
export interface WorldQuickItem {
  id: string;
  label: Localized;
  icon: string;
  href: string;
  enabled?: boolean;
}

/** The grid — likewise this world's own, for the same reason as the cards. */
export interface QuickAccessSection extends SectionBase {
  type: "quickAccess";
  items: WorldQuickItem[];
}

/** Upcoming ticketed events. Renders nothing when the island has nothing on. */
export interface EventsSection extends SectionBase {
  type: "events";
}

/** What visitors said. Real approved reviews only — never invented. */
export interface ReviewsSection extends SectionBase {
  type: "reviews";
}

export interface ConciergeSection extends SectionBase {
  type: "concierge";
  eyebrow?: Localized;
  body?: Localized;
  ctaLabel?: Localized;
  /** "tiroule" opens the site-wide chat; anything else is a destination. */
  ctaAction?: "tiroule" | "link";
  ctaHref?: string;
  reassurance?: Localized;
  avatar?: string;
}

export type WorldSection =
  | CardsSection
  | QuickAccessSection
  | FeaturedSection
  | OnlyInRodriguesSection
  | MoodsSection
  | EditorsSection
  | EventsSection
  | ReviewsSection
  | ConciergeSection;

/** The layer under the hero. See WorldHero.background. */
export interface WorldHeroBackground {
  /**
   * `photo` keeps the stills. `colour` drops them entirely and opens on the
   * painted backdrop — no photograph, no LCP image, nothing to download.
   * Absent means photo, so nothing saved before this changes.
   */
  mode?: "photo" | "colour";
  /** The base the whole hero sits on. Any CSS colour. */
  colour?: string;
  /** The glow the animated backdrop is drawn in. Champagne by default. */
  accent?: string;
  /**
   * Run the drifting glow at all.
   *
   * Off leaves a flat, completely still colour — which is the right answer for
   * an editor who wants the hero quiet, and is what reduced motion gets anyway.
   */
  animated?: boolean;
}

export interface WorldHero {
  eyebrow: Localized;
  /** Split so the last word can carry the italic. ["Experience Rodrigues,", "elevated."] */
  headline: Localized;
  headlineAccent?: Localized;
  subheadline: Localized;
  ctaLabel: Localized;
  ctaHref: string;
  /**
   * Show the hero button at all.
   *
   * Absent means shown, so nothing saved before this changes. Off is for a hero
   * that is carrying a video, or one whose whole job is the photograph and the
   * sentence — a button on top of a film is the thing people click to make the
   * film stop.
   */
  ctaEnabled?: boolean;
  /**
   * What sits BEHIND everything else in the hero.
   *
   * The hero used to be photograph-or-nothing: with no stills pinned it
   * borrowed the site's hero photo and the island's best-photographed places,
   * which is a good default and a poor ceiling — there was no way to say "this
   * world opens on colour, not on a picture".
   *
   * `colour` is that option. It paints the base and runs the animated copper
   * backdrop instead of photography, which is also what shows through while a
   * heavy still is still decoding and on any path where the video never plays.
   * So it is a real background rather than a fallback: something is always
   * painted, even on the first frame.
   */
  background?: WorldHeroBackground;
  /** Stills, shown in order. The first is the LCP image. */
  images: string[];
  /** Optional muted loop over the still. The still stays the poster. */
  video?: string;
  /** Seconds between stills. 0 disables the cross-fade entirely. */
  intervalSeconds?: number;
}

/**
 * What the hero actually paints, given what the editor set.
 *
 * Pure, and separate from the component, because it decides three things that
 * are easy to get subtly wrong and impossible to see in a screenshot:
 *
 *  · `colour` mode returns NO stills. Not "stills that are hidden" — none, so
 *    nothing is fetched and there is no LCP image to pay for.
 *  · the stills are KEPT in the document either way, so switching back to
 *    Photograph restores exactly what was there.
 *  · something is always painted. An empty colour falls back to the world's own
 *    token rather than to transparent, which would show the page behind it.
 */
export function resolveHeroBackground(
  hero: Pick<WorldHero, "background">,
  images: string[],
  fallback: { canvas: string; glow: string },
): { painted: boolean; canvas: string; glow: string; animated: boolean; stills: string[] } {
  const bg = hero.background ?? {};
  const painted = bg.mode === "colour";
  return {
    painted,
    canvas: bg.colour?.trim() || fallback.canvas,
    glow: bg.accent?.trim() || fallback.glow,
    animated: bg.animated !== false,
    stills: painted ? [] : images,
  };
}

export interface WorldDoc {
  /** Bumped only when a migration of stored documents is needed. */
  version: 1;
  /**
   * Always first, always visible. A Curated page with no hero is a bug, not an
   * editorial choice, so this is a field rather than a toggleable section.
   */
  hero: WorldHero;
  quickActions: {
    enabled?: boolean;
    items: QuickActionItem[];
  };
  /** The label library the cards draw from. */
  labels: EditorialLabel[];
  sections: WorldSection[];
  seo?: {
    title?: string;
    description?: string;
  };
}

/** What a world row looks like once read. `draft` is never public. */
export interface WorldDocRecord<T = WorldDoc> {
  world: WorldId;
  published: T | null;
  draft: T | null;
  publishedAt: string | null;
  updatedAt: string | null;
  scheduledAt: string | null;
  /**
   * Why the store could not be read, or null when it was.
   *
   * The studio must be able to say "I cannot save" rather than crash. Two
   * situations produce this and both are real: a local machine with no
   * SUPABASE_SERVICE_ROLE_KEY (the tables are locked to service_role by
   * design — see the M104 migration), and Supabase being unreachable. In both
   * the editor is shown the current document read-only, with the reason,
   * instead of a stack trace or — far worse — an empty form that looks
   * saveable.
   */
  storageError: string | null;
}

export interface WorldRevision {
  id: string;
  world: WorldId;
  label: string | null;
  createdAt: string;
  createdBy: string | null;
}

/**
 * Is this card visible to the public right now?
 *
 * `now` is passed in rather than read from the clock so the same function can
 * be unit-tested and can run identically on the server and in the admin's live
 * preview — a scheduled card must look scheduled in the preview, not published.
 */
export function cardIsLive(card: WorldCard, now: Date): boolean {
  const status = card.status ?? "published";
  if (status === "published") return true;
  if (status === "draft") return false;
  if (!card.publishAt) return false;
  const at = Date.parse(card.publishAt);
  return Number.isFinite(at) && at <= now.getTime();
}
