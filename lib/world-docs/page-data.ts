import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getContent } from "@/lib/content";
import { listPublicEvents } from "@/lib/events/queries";
import {
  resolveWorldDoc,
  resolveMoods,
  type Catalogue,
  type ResolvedMood,
  type ResolvedSection,
} from "./resolve";
import type { WorldDoc } from "./types";
import type { World } from "@/lib/worlds";

/**
 * A cookie-free client for the public reads this page makes.
 *
 * `lib/supabase/server` attaches the request's cookies, and READING cookies is
 * what makes a Next route dynamic — so using it here would quietly turn an ISR
 * page into a database round-trip per visitor. Nothing on the Curated page is
 * per-user (favourites live in localStorage), so nothing here needs a session.
 */
function publicAnonClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export interface WorldView {
  heroImages: string[];
  sections: ResolvedSection[];
  moods: Record<string, ResolvedMood[]>;
  logo?: string;
  mascot?: string;
  /** For the page's own metadata and JSON-LD. */
  featuredTitles: { name: string; url?: string }[];
}

/**
 * Turn a Curated document into everything the page renders.
 *
 * Shared by the public page and the admin's live preview, which is the point:
 * a preview built from a second code path is a preview of something else. The
 * only difference between the two callers is WHICH document they pass in
 * (published vs draft) and WHEN they ask about (`now`).
 */
export async function buildWorldView(
  doc: WorldDoc,
  /** Ranks the auto top-up by this world's tagging. */
  world?: World,
  now: Date = new Date(),
): Promise<WorldView> {
  const content = await getContent();

  // Events are a nice-to-have on this page — a curated card can point at one,
  // but the page must not fail to render because the events table is slow.
  let events: Catalogue["events"] = [];
  try {
    const rows = await listPublicEvents(publicAnonClient());
    events = rows
      .filter((e) => e.phase === "upcoming" || e.phase === "in_progress")
      .map((e) => ({
        slug: e.slug,
        name: e.name,
        coverUrl: e.coverUrl,
        venueName: e.venueName,
        fromPrice: e.fromPrice,
      }));
  } catch {
    /* no events on the page is a smaller failure than no page */
  }

  const cat: Catalogue = {
    places: content.recommended.items,
    locations: content.mapLocations,
    routes: content.rideRoutes,
    // Only what is actually rentable today: a vehicle the owner has taken
    // off the road must not be recommended on the front of a world.
    fleet: content.fleet.filter((v) => v.available !== false),
    events,
    heroImage: content.hero.backgroundImage,
  };

  const { hero, sections } = resolveWorldDoc(doc, cat, now, world);

  const moods: Record<string, ResolvedMood[]> = {};
  for (const s of doc.sections) {
    if (s.type === "moods") moods[s.id] = resolveMoods(s.moods, cat);
  }

  const featured = sections.find((s) => s.type === "featured");
  const featuredTitles = (featured?.cards ?? []).map((c) => ({
    name: c.title.en,
    url: c.href.startsWith("/") ? c.href : undefined,
  }));

  return {
    heroImages: hero.images,
    sections,
    moods,
    logo: content.branding.logo,
    mascot: content.branding.mascotImage,
    featuredTitles,
  };
}
