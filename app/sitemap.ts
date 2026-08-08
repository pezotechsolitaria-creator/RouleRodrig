import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { getFleetView, buildBrowseCategories } from "@/lib/site-data";
import { BLOG_POSTS } from "@/lib/blog";

// Built from live content, so a category the owner adds (or empties) in admin
// appears in / drops out of the sitemap on its own. Regenerated hourly.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // Browse pages are the commercial entry points — highest priority after home.
  let browse: MetadataRoute.Sitemap = [];
  // /guide/shops only exists once the owner has pinned a shop — including it
  // before that would list a 404, so it's data-gated like the browse pages.
  const extra: MetadataRoute.Sitemap = [];
  try {
    const { content, fleet, recentBookings } = await getFleetView();
    browse = buildBrowseCategories(content, fleet, recentBookings).map((c) => ({
      url: `${SITE_URL}${c.href ?? `/browse/${c.slug}`}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.9,
    }));
    if (content.mapLocations.some((l) => l.category === "shop")) {
      extra.push({ url: `${SITE_URL}/guide/shops`, lastModified: now, changeFrequency: "monthly", priority: 0.7 });
    }
  } catch {
    // Never let a DB hiccup produce a broken sitemap — ship the static routes.
  }

  // Deduplicate by URL, keeping the FIRST occurrence so the deliberate priority
  // set here wins over whatever a data-driven source happened to emit.
  //
  // /guide/shops was appearing TWICE in the live sitemap: lib/site-data.ts
  // pushes it as a browse category (href "/guide/shops") and the `extra` array
  // below adds it under the identical condition — both fire when the owner has
  // pinned a shop. Deleting one source would fix today and silently regress the
  // next time either list grows, so dedupe where the two streams meet.
  //
  // A duplicate <loc> is not fatal, but it wastes crawl budget and Search
  // Console reports it, which makes real problems harder to spot.
  const entries: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: now, changeFrequency: "weekly", priority: 1 },
    ...browse,
    // Marketplace directory — always exists (its empty state recruits
    // merchants), so it is not data-gated like /guide/shops below.
    { url: `${SITE_URL}/shop`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/guide/rodrigues`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/guide/beaches`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/guide/viewpoints`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/guide/routes`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    ...extra,
    // French landing page — the market searches in French ("location scooter
    // Rodrigues"), so this is a commercial page, not a translation afterthought.
    { url: `${SITE_URL}/fr/location-scooter-rodrigues`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/fr/plages-rodrigues`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/fr/guide-rodrigues`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/blog`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    ...BLOG_POSTS.map((p) => ({
      url: `${SITE_URL}/blog/${p.slug}`,
      lastModified: new Date(p.updated),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    { url: `${SITE_URL}/taxi`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/list-your-scooter`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    ...["terms", "privacy", "refunds", "disclaimer"].map((slug) => ({
      url: `${SITE_URL}/legal/${slug}`,
      lastModified: now,
      changeFrequency: "yearly" as const,
      priority: 0.2,
    })),
  ];

  const seen = new Set<string>();
  return entries.filter((e) => {
    // Trailing slashes would make /x and /x/ read as two pages to a crawler.
    const key = e.url.replace(/\/+$/, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
