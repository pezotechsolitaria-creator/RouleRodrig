import { NextResponse } from "next/server";
import { getContent } from "@/lib/content";
import { createAnonClient } from "@/lib/supabase/anon";
import { listPublicEvents } from "@/lib/events/queries";
import { browseFood } from "@/lib/food/queries";
import { buildIndex, type SearchExtras } from "@/lib/search/build";
import { SEARCH_LANGS, type SearchLang } from "@/lib/search/types";

// GET /api/search-index/en | fr | cr — the whole-site search index, as JSON.
//
// STATIC, one file per language, rebuilt at most hourly. site_content comes
// through getContent()'s own cache (tag "site-content"), so an admin save —
// which revalidates that tag — refreshes the search with it, and a rebuild
// costs no extra read of the 1 MB content row (see the egress note in
// lib/content.ts). Events and dishes are small reads, once an hour.
//
// The browser fetches this only when somebody opens search, keeps it for the
// visit, and caches it for offline use (components/search/useSearchIndex.ts).
// Each part fails soft: an outage in events must not take the whole search
// with it.

export const revalidate = 3600;
export const dynamicParams = false;

export function generateStaticParams() {
  return SEARCH_LANGS.map((lang) => ({ lang }));
}

async function extras(): Promise<SearchExtras> {
  const supabase = createAnonClient();
  const [events, dishes, synonyms] = await Promise.all([
    listPublicEvents(supabase).catch(() => []),
    // The same call the sitemap makes (listFoodSlugs): a larger limit returned
    // nothing, silently — browse_food caps it.
    browseFood(supabase, { limit: 60, sort: "newest" })
      .then((r) => r.items)
      .catch(() => []),
    Promise.resolve(supabase.from("search_synonyms").select("term, alias").limit(1000))
      .then(({ data }) => (data ?? []) as { term: string; alias: string }[])
      .catch(() => []),
  ]);
  return {
    events: events.map((e) => ({ slug: e.slug, name: e.name, tagline: e.tagline, venueName: e.venueName, startsAt: e.startsAt })),
    dishes: dishes.map((d) => ({
      slug: d.slug,
      name: d.name,
      descriptor: d.descriptor,
      descriptorFr: d.descriptorFr,
      descriptorCr: d.descriptorCr,
      kitchenName: d.kitchenName,
      price: d.price,
    })),
    synonyms,
  };
}

export async function GET(_req: Request, { params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!(SEARCH_LANGS as readonly string[]).includes(lang)) {
    return NextResponse.json({ error: "Unknown language." }, { status: 404 });
  }
  const [content, more] = await Promise.all([getContent(), extras()]);
  const index = buildIndex(content, more, lang as SearchLang);
  return NextResponse.json(index, {
    headers: { "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
