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
// So World SUBSUMES the theme rather than sitting beside it. Authentic is the
// warm editorial light world; Curated is the near-black cinematic one. Choosing
// a world chooses the light, which is what the brief's own visual systems
// describe anyway — "warm sand, off-white" against "near-black #0B0B0B". Two
// systems become one, and the theme layer already built stays as the
// foundation rather than becoming a competing control.
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
    theme: "light",
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
    theme: "dark",
  },
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
  worldPriority?: number | null;
  featuredAuthentic?: boolean | null;
  featuredCurated?: boolean | null;
  heroAuthentic?: boolean | null;
  heroCurated?: boolean | null;
};

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
      const pa = a.item.worldPriority ?? Number.MAX_SAFE_INTEGER;
      const pb = b.item.worldPriority ?? Number.MAX_SAFE_INTEGER;
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
