import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getContent } from "@/lib/content";
import { listPublicEvents } from "@/lib/events/queries";
import { foodCardImages } from "@/lib/food/queries";
import { DEFAULT_HOME_CARDS, DEFAULT_QUICK_ACCESS } from "@/lib/defaults";
import type { HomeCard, QuickAccessItem } from "@/lib/defaults";
import type { PromoEvent } from "@/components/EventsPromo";
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
 * page into a database round-trip per visitor. Nothing on a world page is
 * per-user (favourites live in localStorage), so nothing here needs a session.
 *
 * This is also why the homepage's own data helpers are not reused: they take a
 * cookie-bearing client, which is fine for "/" and would cost /curated its
 * cache.
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

export interface WorldReview {
  id: string;
  name: string;
  origin: string | null;
  rating: number;
  text: string;
}

export interface WorldView {
  heroImages: string[];
  sections: ResolvedSection[];
  moods: Record<string, ResolvedMood[]>;
  logo?: string;
  mascot?: string;
  /** The six photo cards, and the real photos each one cycles through. */
  homeCards: HomeCard[];
  cardImages: Record<string, string[]>;
  /** The "what are you looking for" grid. */
  quickAccess: QuickAccessItem[];
  events: PromoEvent[];
  reviews: WorldReview[];
  /** For the page's own metadata and JSON-LD. */
  featuredTitles: { name: string; url?: string }[];
}

/**
 * Turn a world document into everything the page renders.
 *
 * Shared by the public page and the admin's live preview, which is the point:
 * a preview built from a second code path is a preview of something else. The
 * only difference between the two callers is WHICH document they pass in
 * (published vs draft) and WHEN they ask about (`now`).
 *
 * Every read below fails soft. A world page that cannot render because the
 * events table is slow is a worse outcome than a world page with no events on
 * it — and the sections themselves render nothing when handed nothing.
 */
export async function buildWorldView(
  doc: WorldDoc,
  /** Ranks the auto top-up by this world's tagging. */
  world?: World,
  now: Date = new Date(),
): Promise<WorldView> {
  const content = await getContent();
  const supabase = publicAnonClient();

  let events: PromoEvent[] = [];
  try {
    events = (await listPublicEvents(supabase))
      .filter((e) => e.phase === "upcoming" || e.phase === "in_progress")
      .slice(0, 6)
      .map((e) => ({
        slug: e.slug,
        name: e.name,
        coverUrl: e.coverUrl,
        startsAt: e.startsAt,
        venueName: e.venueName,
        fromPrice: e.fromPrice,
        soldOut: e.remaining <= 0,
      }));
  } catch {
    /* no events on the page is a smaller failure than no page */
  }

  // Real, approved reviews only. There is no fallback and no seed copy: a
  // testimonial nobody wrote is the one thing on this page that would be a lie.
  let reviews: WorldReview[] = [];
  try {
    const { data } = await supabase
      .from("product_reviews")
      .select("id, name, origin, rating, text")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(12);
    reviews = ((data ?? []) as WorldReview[]).filter(
      (r) => (r.text ?? "").trim() && (r.name ?? "").trim(),
    );
  } catch {
    /* the section simply does not render */
  }

  let food: string[] = [];
  try {
    food = await foodCardImages(supabase);
  } catch {
    /* the Restaurant card falls back to its gradient */
  }

  // The same galleries the homepage builds, from the same content, so a card
  // shows the same photographs whichever world a visitor is standing in.
  const galleryOf = (items: { image?: string; images?: string[] }[]) =>
    items
      .flatMap((it) => (it.images?.length ? it.images : it.image ? [it.image] : []))
      .filter((s): s is string => !!s)
      .slice(0, 6);

  const cardImages: Record<string, string[]> = {
    scooter: galleryOf(content.fleet.filter((f) => (f.category ?? "scooter") === "scooter")),
    car: galleryOf(content.fleet.filter((f) => f.category === "car")),
    stays: galleryOf(content.recommended.items.filter((p) => p.category === "hotel")),
    exp: galleryOf(content.recommended.items.filter((p) => p.category === "activity")),
    stores: galleryOf(content.mapLocations.filter((l) => l.category === "shop")),
    food,
    none: [],
  };

  const cat: Catalogue = {
    places: content.recommended.items,
    locations: content.mapLocations,
    routes: content.rideRoutes,
    // Only what is actually rentable today: a vehicle the owner has taken
    // off the road must not be recommended on the front of a world.
    fleet: content.fleet.filter((v) => v.available !== false),
    events: events.map((e) => ({
      slug: e.slug,
      name: e.name,
      coverUrl: e.coverUrl,
      venueName: e.venueName,
      fromPrice: e.fromPrice,
    })),
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
    homeCards: (content.homeCards?.length ? content.homeCards : DEFAULT_HOME_CARDS).filter(
      (c) => c.enabled !== false,
    ),
    cardImages,
    quickAccess: (content.quickAccess?.length
      ? content.quickAccess
      : DEFAULT_QUICK_ACCESS
    ).filter((q) => q.enabled !== false),
    events,
    reviews,
    featuredTitles,
  };
}
