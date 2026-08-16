// ── THE DUAL EXPERIENCE WORLD SYSTEM ────────────────────────────────────────
//
// A visitor does not choose a theme. They choose how they want to experience
// Rodrigues:
//
//   AUTHENTIC — "Live the island as it truly is."   Local life, culture,
//               nature, villages, hiking, fishing, craft, community.
//   CURATED   — "Experience the island, elevated."  Premium stays, refined
//               dining, private experiences, wellness, concierge.
//
// ── THE ONE STRUCTURAL CHANGE TO THE BRIEF ──────────────────────────────────
// The brief specified World as a NEW layer on top of the existing Light/Dark
// theme and the Experiences Day/Night switch. That would give a visitor three
// independent switches producing eight combinations — and the brief itself
// warns, correctly, to "avoid four confusing tabs".
//
// So World SUBSUMES the theme rather than sitting beside it. Choosing a world
// chooses the light. Two systems become one, and the theme layer already built
// stays as the foundation rather than becoming a competing control.
//
// AUTHENTIC is the DARK world and CURATED the light one — the owner's call, and
// it reads better than the arrangement it replaced. Dark is this site's
// existing near-black identity, and Authentic is the Rodrigues most visitors
// come for, so the familiar world stays where it has always been. Curated then
// earns its difference by being the one that changes: a bright, quiet, gallery
// ground is a stronger signal of "elevated" than another dark screen, because
// every premium app on the visitor's phone is already dark.
//
// Day/Night survives untouched as the SECONDARY lens it already is: it filters
// what is on offer, and World decides how the island is presented.

export const WORLDS = ["authentic", "curated"] as const;
export type World = (typeof WORLDS)[number];

/** What a piece of content declares about where it belongs. */
export type WorldTarget = World | "both";

export const WORLD_KEY = "rr-experience-world";

/** Copy lives here so the gateway, the switcher and the homepages agree. */
export const WORLD_COPY: Record<
  World,
  {
    /** Two lines, always stacked — the brief's typographic hierarchy. */
    eyebrow: string;
    name: string;
    promise: [string, string, string];
    cta: [string, string, string];
    /** The homepage headline direction. */
    headline: [string, string, string];
    /** Which theme this world wears. See the note above. */
    theme: "light" | "dark";
  }
> = {
  authentic: {
    eyebrow: "AUTHENTIC",
    name: "RODRIGUES",
    promise: [
      "Live the island as it truly is.",
      "Vivez l'île telle qu'elle est.",
      "Viv lil kouma li ete.",
    ],
    cta: [
      "Enter Authentic Rodrigues",
      "Entrer — Rodrigues Authentique",
      "Rant dan Rodrigues Otantik",
    ],
    headline: ["LIVE RODRIGUES", "VIVEZ RODRIGUES", "VIV RODRIGUES"],
    theme: "dark",
  },
  curated: {
    eyebrow: "CURATED",
    name: "RODRIGUES",
    promise: [
      "Experience the island, elevated.",
      "L'île, sublimée.",
      "Lil la, pli élégan.",
    ],
    cta: [
      "Enter Curated Rodrigues",
      "Entrer — Rodrigues Curated",
      "Rant dan Rodrigues Curated",
    ],
    headline: ["EXPERIENCE RODRIGUES", "DÉCOUVREZ RODRIGUES", "DEKOUVER RODRIGUES"],
    // ── CURATED IS DARK AGAIN (owner, 2026-08-16) ─────────────────────────
    // It was light: a bright gallery ground, on the argument that the world
    // which CHANGES reads as the elevated one. The owner has since seen the
    // curated page built dark — near-black with copper and champagne — and
    // chosen that. So the light experiment is retired rather than kept as a
    // second thing to maintain.
    //
    // The two worlds still differ, and by more than a hue: Authentic is warm
    // sand on earth-black with soft, generous corners; Curated is champagne on
    // a colder near-black with tight ones. See app/globals.css.
    theme: "dark",
  },
};

/**
 * The page each world calls home. TWO pages, and only two.
 *
 * ── AUTHENTIC IS THE HOMEPAGE ──────────────────────────────────────────────
 * There was briefly a third: a separate /authentic built from the same
 * components as /curated, which meant the site had two near-identical main
 * pages plus the homepage — and the owner said so plainly ("I did not want 4
 * different main pages").
 *
 * He is right, and the reason is that the homepage ALREADY IS Authentic. Six
 * photo cards of the real island, a grid of things people actually do, the
 * travel tools — dense, generous, unpolished. That is the Authentic argument
 * made in a layout that has been earning its keep for months. Building a
 * second one was duplicating it, not designing it.
 *
 * So Authentic points at "/", Curated at "/curated", and every back link on
 * the site that goes home lands a visitor in the world they were in — see
 * components/world/WorldHomeGate.tsx for the half of that which "/" owns.
 */
export const WORLD_PAGE: Record<World, string> = {
  authentic: "/",
  curated: "/curated",
};

/** Narrow an unknown stored value. Anything unrecognised means "not chosen". */
export function parseWorld(value: unknown): World | null {
  return value === "authentic" || value === "curated" ? value : null;
}

/**
 * BACKWARD COMPATIBILITY IS THE DEFAULT.
 *
 * Every existing record predates this system and has no `world` field. The
 * brief is explicit that nothing may require a migration before it keeps
 * working, so an absent, empty or unrecognised value means "both" — the
 * content shows up in either world until somebody deliberately narrows it.
 */
export function targetOf(item: { world?: string | null }): WorldTarget {
  const w = item.world;
  return w === "authentic" || w === "curated" || w === "both" ? w : "both";
}

/** Does this content belong in the world currently being shown? */
export function inWorld(item: { world?: string | null }, world: World): boolean {
  const t = targetOf(item);
  return t === "both" || t === world;
}

type Rankable = {
  world?: string | null;
  /** Shared fallback, kept so nothing saved before the split stops working. */
  worldPriority?: number | null;
  /**
   * INDEPENDENT priority per world. The point of the whole system: one record
   * set to "both" must be able to lead Curated and sit mid-list in Authentic.
   * A single shared number cannot express that, which would force an editor to
   * duplicate the record — the exact thing this design exists to avoid.
   */
  priorityAuthentic?: number | null;
  priorityCurated?: number | null;
  featuredAuthentic?: boolean | null;
  featuredCurated?: boolean | null;
  heroAuthentic?: boolean | null;
  heroCurated?: boolean | null;
};

/** This world's priority, then the shared one, then unranked. */
export function priorityIn(item: Rankable, world: World): number {
  const own = world === "authentic" ? item.priorityAuthentic : item.priorityCurated;
  // ?? not ||, so a deliberate 0 — the strongest rank — is not read as absent.
  return own ?? item.worldPriority ?? Number.MAX_SAFE_INTEGER;
}

export function isFeatured(item: Rankable, world: World): boolean {
  return Boolean(world === "authentic" ? item.featuredAuthentic : item.featuredCurated);
}

export function isHeroEligible(item: Rankable, world: World): boolean {
  return Boolean(world === "authentic" ? item.heroAuthentic : item.heroCurated);
}

/**
 * Order content for a world: featured first, then the editor's explicit
 * priority, then the original order.
 *
 * Stability matters more than it looks. Without the index tiebreak, everything
 * unranked — which is ALL existing content — would reorder itself on every
 * render, so a homepage would visibly reshuffle between navigations.
 */
export function rankForWorld<T extends Rankable>(items: T[], world: World): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const fa = isFeatured(a.item, world) ? 0 : 1;
      const fb = isFeatured(b.item, world) ? 0 : 1;
      if (fa !== fb) return fa - fb;

      // Absent priority sorts last, not as zero — otherwise unranked content
      // would outrank anything the editor deliberately numbered.
      const pa = priorityIn(a.item, world);
      const pb = priorityIn(b.item, world);
      if (pa !== pb) return pa - pb;

      return a.index - b.index;
    })
    .map((x) => x.item);
}

/**
 * Everything a world shows, in the order it shows it.
 *
 * Filtering and ranking are one call because doing them separately is how a
 * caller ends up ranking items it then filters away, or filtering after taking
 * the top N and quietly rendering fewer than it meant to.
 */
export function forWorld<T extends Rankable>(items: T[], world: World): T[] {
  return rankForWorld(items.filter((i) => inWorld(i, world)), world);
}

/** Hero candidates for a world, best first. */
export function heroesForWorld<T extends Rankable>(items: T[], world: World): T[] {
  return forWorld(items, world).filter((i) => isHeroEligible(i, world));
}

/** The other one. The switcher is a toggle, not a menu. */
export function otherWorld(world: World): World {
  return world === "authentic" ? "curated" : "authentic";
}

// ── THE WORLDS MUST DIFFER IN STRUCTURE, NOT ONLY IN PALETTE ────────────────
//
// Ranking content was not enough, and the owner was right to say so. Two pages
// with the same sections in the same order, at the same density, reading the
// same way, are ONE page wearing two skins — no amount of recolouring fixes
// that, and no amount of tagging does either, because tagging reorders items
// within a section rather than reordering the page.
//
// So each world gets its own architecture. What a world puts FIRST is its
// argument about what the island is for:
//
//   AUTHENTIC leads with places and everyday life — discovery, then the things
//   that let you live it. Dense, editorial, more per screen, the way a
//   guidebook is generous with what it shows you.
//
//   CURATED leads with where you stay and what has been arranged for you.
//   Sparse, cinematic, fewer things per screen, because restraint is the
//   product: a page that shows you six things is telling you it chose them.

export type SectionKey = "cards" | "quick" | "discover" | "experiences" | "stays" | "events";

// ── NOT CURRENTLY APPLIED TO THE HOMEPAGE ──────────────────────────────────
// The owner's instruction, sent with a screenshot: the page looks the SAME in
// both worlds and the switcher at the top is the only thing that changes. So
// AppHome renders one design, and the worlds differ in what they show and in
// what order — content ranking via forWorld — rather than in how the page is
// built.
//
// This table is kept, tested and documented rather than deleted, because it is
// the considered answer to "how would these two worlds differ structurally"
// and that question is likely to come back. Nothing reads it today; wiring it
// up is a deliberate act, not an accident waiting to happen.
export const WORLD_LAYOUT: Record<
  World,
  {
    /** Section order down the homepage. The world's argument, made in sequence. */
    order: SectionKey[];
    /** Cards per row on a phone. Authentic is generous; Curated withholds. */
    gridCols: 2 | 3;
    /** How many items a rail shows before "see all". */
    railLimit: number;
    /** Vertical rhythm between sections — Curated buys space with it. */
    sectionGap: string;
    /** Section headings: editorial sentence case vs. spaced-out cinematic caps. */
    headingClass: string;
  }
> = {
  authentic: {
    // Places first: Authentic is about the island itself, so discovery leads
    // and the transactional rails follow.
    order: ["cards", "quick", "discover", "experiences", "stays", "events"],
    gridCols: 3,
    railLimit: 8,
    sectionGap: "mt-3",
    headingClass: "font-syne text-[15px] font-bold tracking-tight",
  },
  curated: {
    // Stays first: Curated is about where you will be and what has been
    // arranged. Discovery drops below the arranged things.
    order: ["cards", "stays", "experiences", "quick", "discover", "events"],
    gridCols: 2,
    railLimit: 4,
    sectionGap: "mt-8",
    headingClass: "font-bebas text-[13px] tracking-[0.34em]",
  },
};
