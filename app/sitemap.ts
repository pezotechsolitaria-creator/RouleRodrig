import type { MetadataRoute } from "next";
import { EXPERIENCES, experiencesOfType } from "@/lib/experiences";
import {
  contentWasRead,
  eventsPageItemCount,
  knownPublicEventCount,
  recommendedCount,
} from "@/lib/listing-gates";
import { placeSlug, placesWithOwnPage } from "@/lib/place-slug";
import { locationPages, storedSlug } from "@/lib/guide/location-page-gate";
import { SITE_URL } from "@/lib/site";
import {
  getFleetView,
  buildBrowseCategories,
  isSellableFleetItem,
} from "@/lib/site-data";
import { vehicleHref } from "@/lib/vehicle-slug";
import { BLOG_POSTS } from "@/lib/blog";

// Built from live content, so a category the owner adds (or empties) in admin
// appears in / drops out of the sitemap on its own. Regenerated hourly.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // ── A DATE WE CAN DEFEND, OR NO DATE (M148) ──────────────────────────────
  //
  // Every one of the 67 URLs used to carry the same lastmod — the moment the
  // sitemap was generated — which re-stamped the whole site as "changed" once
  // an hour whether or not anything had. Google discounts a lastmod it cannot
  // trust, and it discounts it for the WHOLE FILE: the genuinely accurate
  // dates already on the shops, the products and the blog were being drowned
  // by 40-odd fabricated ones.
  //
  // So there are now exactly two cases. A page rendered from the site_content
  // row gets that row's updated_at, which is true by construction — edit a
  // listing in admin and the row moves. Everything else gets NO lastmod at
  // all, and Google falls back to its own crawl history, which is the correct
  // behaviour when we genuinely do not know.
  //
  // Not guessed at: /food and /events dishes would need listFoodSlugs() and
  // listPublicEvents() to carry updated_at through, and both are used
  // elsewhere. Their columns exist (food_items.updated_at, events.updated_at)
  // whenever that is worth doing.
  //
  // Read here rather than through getContent(), which selects only `data`.
  // Cookieless for the reason the dish block below spells out: the
  // session-carrying client turns this static route dynamic, and the failure
  // is silent.
  let contentAt: Date | undefined;
  try {
    const { createAnonClient } = await import("@/lib/supabase/anon");
    const { data } = await createAnonClient()
      .from("site_content")
      .select("updated_at")
      .eq("id", "main")
      .maybeSingle();
    if (data?.updated_at) contentAt = new Date(data.updated_at);
  } catch {
    // No date is the honest fallback, and the one this file now prefers.
  }

  // eSIM destinations (M224). Only destinations with a plan on sale: an empty
  // shelf is a 404 by design (app/esim/DestinationPage.tsx), and a sitemap
  // entry that 404s is worse than a missing one. Both languages, because each
  // pair names the other in hreflang. A failure costs these URLs only.
  let esimDestinations: MetadataRoute.Sitemap = [];
  try {
    const [{ getLiveDestinations }, { destinationByCode, HOME_CODE }] = await Promise.all([
      import("@/lib/esim/service"),
      import("@/lib/esim/destinations"),
    ]);
    const live = await getLiveDestinations();
    esimDestinations = live.flatMap((l) => {
      const d = destinationByCode(l.code);
      if (!d || d.code === HOME_CODE) return [];
      return [
        { url: `${SITE_URL}/esim/${d.slug}`, changeFrequency: "weekly" as const, priority: 0.6 },
        { url: `${SITE_URL}/fr/esim/${d.slug}`, changeFrequency: "weekly" as const, priority: 0.6 },
      ];
    });
  } catch {
    // The two home eSIM pages below are listed regardless.
  }

  // Browse pages are the commercial entry points — highest priority after home.
  let browse: MetadataRoute.Sitemap = [];
  // /guide/shops only exists once the owner has pinned a shop — including it
  // before that would list a 404, so it's data-gated like the browse pages.
  const extra: MetadataRoute.Sitemap = [];

  // Published dishes. Read through the same catalog RPC the customer sees, so
  // this can never list a draft, an archived dish, or one whose kitchen is
  // paused — a sitemap entry that 404s is worse than a missing one. A failure
  // here costs the dish URLs, never the whole sitemap.
  let dishes: MetadataRoute.Sitemap = [];
  try {
    // The COOKIELESS client, deliberately. lib/supabase/server.ts reads
    // cookies, which opts this statically generated route into dynamic
    // rendering — Next throws, the catch below swallows it, and the sitemap
    // ships with every dish URL silently missing. Verified by watching exactly
    // that happen in the build log.
    const { createAnonClient } = await import("@/lib/supabase/anon");
    const { listFoodSlugs } = await import("@/lib/food/queries");
    const slugs = await listFoodSlugs(createAnonClient());
    dishes = slugs.map((slug) => ({
      url: `${SITE_URL}/food/${slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));
  } catch (err) {
    console.error("sitemap: food slugs failed", err);
  }

  // Published events. Same shape as the dish block above, and for the same
  // reason: an event page is 200 and indexable the moment its store goes
  // active, and it was in no sitemap at all — so Google could only reach it by
  // crawling /events and following a link.
  //
  // listPublicEvents() filters on stores.status === "active", which is the
  // SAME rule that decides whether /events/[slug] renders or 404s. Verified
  // against production: the active event answered 200 with no robots tag, the
  // draft answered 404 with noindex. Reusing that function is what makes it
  // impossible for this block to list a 404, which the header of this file
  // calls worse than a missing entry.
  //
  // Past events are included deliberately: they are still 200, still
  // self-canonical and still carry Event JSON-LD, and the rule this file
  // follows is to list every page that is all three.
  let events: MetadataRoute.Sitemap = [];
  // How many public events exist, for the /events gate below (SEO audit
  // 2026-09-29 C16/T4). listPublicEvents() answers [] on a failed read as well
  // as on an empty table, so an empty answer is re-checked before it may drop
  // /events (knownPublicEventCount); null — unknown — keeps it listed.
  let publicEventCount: number | null = null;
  try {
    const { createAnonClient } = await import("@/lib/supabase/anon");
    const { listPublicEvents } = await import("@/lib/events/queries");
    const anon = createAnonClient();
    const published = await listPublicEvents(anon);
    publicEventCount = await knownPublicEventCount(anon, published.length);
    events = published.map((e) => ({
      url: `${SITE_URL}/events/${e.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));
  } catch (err) {
    // Costs the event URLs, never the whole sitemap.
    console.error("sitemap: events failed", err);
  }

  // ── EMPTY LISTINGS ARE NOT SUBMITTED (SEO audit 2026-09-29 C16/T4) ────────
  // /events, /shop, /marketplace/wash and /experiences/chauffeur were all
  // listed unconditionally while each rendered an empty state — what Google
  // classes as a soft 404. Each is now listed while it has something on it,
  // by the same counts its page uses to send `noindex, follow` while it does
  // not (lib/listing-gates.ts), so an entry and its robots tag cannot
  // disagree, and the page re-enters by itself when the first item goes live.
  //
  // Where a read FAILS the page keeps its old, listed behaviour: an unknown
  // count is not an empty shelf. The defaults below are that fallback — and
  // getContent() "fails" by answering its defaults, so the content-backed
  // gates only apply once contentWasRead() says the real row arrived.
  let eventNotices: { title?: string | null }[] | null = null;
  let experienceTypes = Object.keys(EXPERIENCES) as (keyof typeof EXPERIENCES)[];
  let washListed = true;

  try {
    const { createAnonClient } = await import("@/lib/supabase/anon");
    const { listVehicleProviders } = await import("@/lib/marketplace/vehicle-providers");
    const listed = await listVehicleProviders(createAnonClient());
    if (listed) washListed = listed.length > 0;
  } catch (err) {
    console.error("sitemap: vehicle providers failed", err);
  }

  try {
    const { content, fleet, recentBookings } = await getFleetView();
    if (contentWasRead(content)) eventNotices = content.events;
    // A service vertical is listed while it has a provider — the same
    // experiencesOfType() its page renders from. Today that drops chauffeur.
    experienceTypes = experienceTypes.filter(
      (type) =>
        recommendedCount(content, experiencesOfType(content.recommended.items, type)) !== 0,
    );
    browse = buildBrowseCategories(content, fleet, recentBookings).map((c) => ({
      url: `${SITE_URL}${c.href ?? `/browse/${c.slug}`}`,
      lastModified: contentAt,
      changeFrequency: "weekly" as const,
      priority: 0.9,
    }));

    // Every vehicle's own page. These carry the Product/Offer markup and the
    // price, so they are the pages a shopping result should land on — the
    // category grid above answers "what do you have", these answer "how much is
    // the Avenis". Data-gated like everything else here: a fleet that fails to
    // load lists nothing rather than a page of 404s.
    //
    // Deduped by URL: the fleet models physical UNITS (two AVENIS rows, two
    // Swifts) and slugs come from the name, so twin units share one page —
    // mapping rows 1:1 listed the same URL twice.
    browse.push(
      // Drafts are not submitted to Google. /browse/car/new-cars was live and
      // in this sitemap with the meta description "Add a description for this
      // car." and a price of "From Rs 0/day" — a thin page that drags the
      // whole car cluster down and is exactly what a soft-404 flag is for.
      ...[
        ...new Set(fleet.filter(isSellableFleetItem).map((v) => vehicleHref(v))),
      ].map((href) => ({
        url: `${SITE_URL}${href}`,
        lastModified: contentAt,
        changeFrequency: "weekly" as const,
        priority: 0.85,
      })),
    );
    // ── ONE EXPERIENCE, ONE URL (M191) ────────────────────────────────────
    // Every experience now has a page of its own. They are the transactional
    // half of this site's most-searched subject -- "Île aux Cocos" is the thing
    // most visitors to Rodrigues look up -- and until now each was a query
    // parameter on a listing, which canonicals to the listing and so could
    // never be ranked, shared or cited. Priority above the listing they sit
    // under: the listing is a shelf, these are the products.
    extra.push(
      ...placesWithOwnPage(content.recommended.items).map((pl) => ({
        url: `${SITE_URL}/experiences/${placeSlug(pl)}`,
        lastModified: contentAt,
        changeFrequency: "weekly" as const,
        priority: 0.85,
      })),
    );

    if (content.mapLocations.some((l) => l.category === "shop")) {
      extra.push({
        url: `${SITE_URL}/guide/shops`,
        lastModified: contentAt,
        changeFrequency: "monthly",
        priority: 0.7,
      });
    }

    // ── A PLACE'S OWN PAGE, ONCE IT HAS EARNED ONE (architecture review 2026-09-30) ──
    // /guide/<slug> renders only for places that pass the content gate
    // (lib/guide/location-page-gate.ts) and 404s for everything else, so this
    // lists exactly that set, from the same function the page resolves with.
    // Empty on the day it shipped: no place has the long read yet.
    extra.push(
      ...locationPages(content.mapLocations).map((p) => ({
        url: `${SITE_URL}/guide/${storedSlug(p)}`,
        lastModified: contentAt,
        changeFrequency: "monthly" as const,
        priority: 0.7,
      })),
    );
  } catch {
    // Never let a DB hiccup produce a broken sitemap — ship the static routes.
  }

  // ── Marketplace shops ──────────────────────────────────────────────────────
  // /shop was listed but every actual SHOP was invisible to a crawler, so the
  // pages carrying the real, unique, local content had no path in from search.
  // The directory alone cannot rank for "Rodrigues honey"; the shop page can.
  //
  // Read through the ordinary client so RLS (stores_public_read) decides what
  // is listable — a draft, paused or unapproved shop is absent here for the
  // same reason it 404s on the site. Listing a URL Google then cannot fetch is
  // worse than omitting it.
  let shops: MetadataRoute.Sitemap = [];
  // Whether sitemap_stores() actually answered. /shop is gated on it below,
  // and a failed call must not read as "no shops".
  let shopsKnown = false;
  try {
    // Cookieless, for the reason spelled out above the dish block and proved
    // again by the product block below: the session-carrying client turns this
    // static route dynamic, Next throws, and the bare catch below turns that
    // into a silently shorter sitemap. This block was reading cookies and
    // therefore losing every shop URL in the same way.
    const { createAnonClient } = await import("@/lib/supabase/anon");
    const supabase = createAnonClient();
    // sitemap_stores() rather than a query built here (M48/M49). The rules for
    // "may this shop be indexed" are genuinely subtle — RLS visibility, plus
    // M42's event stores are not shops, plus test fixtures that are
    // deliberately VISIBLE during the pre-launch testing window but must never
    // reach Google — and a hand-rolled filter in this file drifted from them
    // twice in one afternoon. Keeping the predicate in SQL means the sitemap
    // and the directory cannot disagree, and the migration's post-conditions
    // prove it rather than trusting this call site.
    const { data, error } = await supabase.rpc("sitemap_stores");
    shopsKnown = !error;
    shops = (data ?? []).map(
      (s: { slug: string; updated_at: string | null }) => ({
        url: `${SITE_URL}/shop/${s.slug}`,
        lastModified: s.updated_at ? new Date(s.updated_at) : undefined,
        changeFrequency: "weekly" as const,
        // Under the browse pages (0.9) that carry the core rental revenue, above
        // the guides: a shop is commercial, but the marketplace is not yet the
        // business.
        priority: 0.8,
      }),
    );
  } catch {
    // Same rule as above — a failure drops the shops, never the sitemap.
  }

  // ── Marketplace products and categories (M96) ─────────────────────────────
  // The shop pages were listed and every PRODUCT was invisible to a crawler,
  // which is backwards: "Rodrigues honey" is a product query, and the page that
  // can win it is the product page, not the directory.
  //
  // Both lists come from the SAME predicate as the storefront
  // (marketplace_stores), so a URL here can never 404 or point at a paused
  // shop. /shop/search is deliberately absent — an unbounded space of query
  // strings is a crawl trap, which is why that route sets robots:noindex.
  //
  // The COOKIELESS client, and the build proved why within a minute of the
  // first attempt: lib/supabase/server.ts reads cookies, that opts this
  // statically generated route into dynamic rendering, Next throws, the catch
  // below swallows it, and the sitemap ships with every product URL silently
  // missing. Exactly the failure lib/supabase/anon.ts was written for after it
  // happened to the dish URLs.
  let productPages: MetadataRoute.Sitemap = [];
  let categoryPages: MetadataRoute.Sitemap = [];
  try {
    const { createAnonClient } = await import("@/lib/supabase/anon");
    const supabase = createAnonClient();
    const [{ data: prods }, { data: home }] = await Promise.all([
      supabase.rpc("sitemap_products"),
      supabase.rpc("marketplace_home"),
    ]);
    productPages = (
      (prods ?? []) as {
        store_slug: string;
        product_slug: string;
        updated_at: string | null;
      }[]
    ).map((p) => ({
      url: `${SITE_URL}/shop/${p.store_slug}/${p.product_slug}`,
      lastModified: p.updated_at ? new Date(p.updated_at) : undefined,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));
    // Only categories that HAVE something in them. A category page with nothing
    // on it is a thin page, and thin pages drag a whole domain down.
    categoryPages = (
      (home as { categories?: { slug: string; count: number }[] } | null)
        ?.categories ?? []
    )
      .filter((c) => c.count > 0)
      .map((c) => ({
        url: `${SITE_URL}/shop/c/${c.slug}`,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      }));
  } catch (err) {
    console.error("sitemap: marketplace products failed", err);
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
    {
      url: SITE_URL,
      lastModified: contentAt,
      changeFrequency: "weekly",
      priority: 1,
    },
    ...browse,
    // Marketplace directory. It always EXISTS — its empty state recruits
    // merchants — but it is submitted only while sitemap_stores() lists a shop
    // (or could not be read), for the reason in the block above `eventNotices`.
    ...(!shopsKnown || shops.length > 0
      ? [
          {
            url: `${SITE_URL}/shop`,
            changeFrequency: "daily" as const,
            priority: 0.9,
          },
        ]
      : []),
    // ── THE THREE HUBS THAT WERE NEVER LISTED ─────────────────────────────
    //
    // All three are indexable, linked from the site's own navigation, and
    // carry real hand-written content and their own titles — and none of them
    // was in this file, so a crawler only ever reached them by following a
    // link rather than being told they exist.
    //
    // /marketplace answers "what can this site actually do for me" for
    // somebody who does not already know which of eight routes they wanted;
    // /marketplace/wash is a service vertical with its own booking flow —
    // submitted only while it lists a business (it rendered "No car washes
    // listed yet"); and /order is the hub the food, shop and ticket paths all
    // start from.
    {
      url: `${SITE_URL}/marketplace`,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...(washListed
      ? [
          {
            url: `${SITE_URL}/marketplace/wash`,
            changeFrequency: "weekly" as const,
            priority: 0.7,
          },
        ]
      : []),
    {
      url: `${SITE_URL}/order`,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    // Categories above shops: a category page is the one that can rank for
    // "Rodrigues honey", and it links to both the products and their sellers.
    ...categoryPages,
    // Every shop, directly under the marketplace that links them.
    ...shops,
    // Then every product. These carry the unique local content.
    ...productPages,
    // Food ordering. Always listed (its empty state is the concierge hand-off,
    // not a 404), and every published dish is listed beneath it — a dish page
    // is a real commercial landing page for "ourite rodrigues" and the like.
    {
      url: `${SITE_URL}/food`,
      changeFrequency: "daily",
      priority: 0.9,
    },
    ...dishes,
    ...events,
    {
      url: `${SITE_URL}/food/concierge`,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    // The service marketplaces. These WERE listed unconditionally, on the
    // argument that an empty state recruits providers. The audit measured
    // what Google saw instead: /experiences/chauffeur, "No chauffeurs listed
    // yet", submitted as a page. So a vertical is listed while it has a
    // provider (`experienceTypes` above). Still driven off EXPERIENCES, so
    // adding a vertical there lists it here too — hiking arrived this way.
    ...experienceTypes.map(
      (type) => ({
        url: `${SITE_URL}/experiences/${type}`,
        lastModified: contentAt,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      }),
    ),
    {
      url: `${SITE_URL}/guide/rodrigues`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/guide/beaches`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/guide/viewpoints`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/guide/routes`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/guide/hiking`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    ...extra,
    // French landing page — the market searches in French ("location scooter
    // Rodrigues"), so this is a commercial page, not a translation afterthought.
    {
      url: `${SITE_URL}/fr/location-scooter-rodrigues`,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/fr/plages-rodrigues`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/fr/guide-rodrigues`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/blog`,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    ...BLOG_POSTS.map((p) => ({
      url: `${SITE_URL}/blog/${p.slug}`,
      lastModified: new Date(p.updated),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    {
      url: `${SITE_URL}/taxi`,
      lastModified: contentAt,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/list-your-scooter`,
      changeFrequency: "monthly",
      priority: 0.5,
    },

    // ── PAGES THAT WERE INDEXABLE AND UNLISTED ────────────────────────
    // Every one of these returns 200 with a self-referencing canonical and no
    // robots noindex — checked against the live site — and none of them was in
    // the sitemap. The exclusions elsewhere are deliberate and correct
    // (/shop/search and /shop/saved send noindex, follow; /d sends
    // noindex, nofollow), so these were simply never added.
    //
    // /faq is the one that stings: it already ships a valid FAQPage block with
    // eleven Question/Answer pairs — the single most quotable thing on the site
    // for an AI answer — and it was invisible to the crawl that would find it.
    {
      url: `${SITE_URL}/faq`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    // Who runs this. Small traffic, large trust: it is the page a nervous
    // visitor opens before paying a stranger on a small island, and the one
    // Google reads for the E-E-A-T signals a product page cannot carry.
    {
      url: `${SITE_URL}/about`,
      changeFrequency: "yearly",
      priority: 0.5,
    },
    // The two hubs. Both parents were 404s while nineteen pages sat beneath
    // them — a sitemap entry is how the crawl reaches the hub that reaches the
    // rest, which is the whole reason the French cluster went uncrawled.
    {
      url: `${SITE_URL}/guide`,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/fr`,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    // The island's best-known excursion, and the thing people search before
    // they search anything else about Rodrigues.
    {
      url: `${SITE_URL}/guide/ile-aux-cocos`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    // The site sells ten dishes and had no page explaining any of them.
    {
      url: `${SITE_URL}/guide/rodriguan-food`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    // French counterpart. The audit's finding was three French pages for a
    // market that searches almost entirely in French.
    {
      url: `${SITE_URL}/fr/ile-aux-cocos`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    // The French half of /browse/car. "location voiture Rodrigues" is a
    // commercial head term the site had no French page for.
    {
      url: `${SITE_URL}/fr/location-voiture-rodrigues`,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    // The French half of /taxi. "taxi Rodrigues" and "transfert aeroport
    // Rodrigues" are the first thing a French-speaking arrival types, and the
    // site answered them only in English.
    {
      url: `${SITE_URL}/fr/taxi-rodrigues`,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    // The French half of /food. "manger a Rodrigues" and "cuisine rodriguaise"
    // had no French page, on the richest English page the site has.
    {
      url: `${SITE_URL}/fr/manger-a-rodrigues`,
      changeFrequency: "weekly",
      priority: 0.85,
    },
    // The French half of /browse/stays. "hébergement Rodrigues" and "où dormir
    // à Rodrigues" are commercial head terms the site answered only in English.
    {
      url: `${SITE_URL}/fr/hebergement-rodrigues`,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    // "Que faire à Rodrigues" — the French half of /experiences.
    {
      url: `${SITE_URL}/fr/que-faire-a-rodrigues`,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    // "Se déplacer à Rodrigues". The English query already returns this site;
    // the French one returned nothing of ours.
    {
      url: `${SITE_URL}/fr/se-deplacer-a-rodrigues`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    // "Itinéraire Rodrigues" — the French twin of /blog/rodrigues-itinerary,
    // for the majority-French audience that plans day by day.
    {
      url: `${SITE_URL}/fr/itineraire-rodrigues`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    // Real search targets: "what's on in Rodrigues", "airport transfer Rodrigues".
    // /events only while it has an event or a notice on it — it rendered
    // "Nothing on sale right now" at priority 0.8. Unknown (null) stays listed.
    ...(eventsPageItemCount(publicEventCount, eventNotices) !== 0
      ? [
          {
            url: `${SITE_URL}/events`,
            changeFrequency: "daily" as const,
            priority: 0.8,
          },
        ]
      : []),
    {
      url: `${SITE_URL}/transfers`,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    // /browse/getting-around was in NO sitemap entry -- verified 0 of 76 -- and
    // it is the only page on the whole site whose visible text says "rent a
    // car". It is also the natural landing page for "how to get around
    // Rodrigues", which is the question a visitor asks before they decide
    // between a scooter, a car and a taxi. Listed at the same priority as the
    // other getting-around surfaces it sits beside.
    {
      url: `${SITE_URL}/browse/getting-around`,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/deliver`,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    // The eSIM store (M223) and its French twin. "Rodrigues eSIM", "eSIM
    // Maurice", "carte SIM Rodrigues": a pre-arrival need every visitor has,
    // answered by nobody else with the one fact that matters here — which
    // network actually reaches the island. Prices change with the catalogue.
    {
      url: `${SITE_URL}/esim`,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/fr/esim-maurice-rodrigues`,
      changeFrequency: "weekly",
      priority: 0.85,
    },
    ...esimDestinations,
    // The hub whose five children were already listed without it.
    {
      url: `${SITE_URL}/experiences`,
      lastModified: contentAt,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    // Planning tools — the reason somebody bookmarks a destination site.
    {
      url: `${SITE_URL}/trip-planner`,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/map`,
      lastModified: contentAt,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/explore`,
      changeFrequency: "weekly",
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/emergency`,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/curated`,
      changeFrequency: "weekly",
      priority: 0.4,
    },
    {
      url: `${SITE_URL}/more`,
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: `${SITE_URL}/legal/owner-agreement`,
      changeFrequency: "yearly",
      priority: 0.2,
    },

    ...["notice", "terms", "privacy", "refunds", "disclaimer"].map((slug) => ({
      url: `${SITE_URL}/legal/${slug}`,
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
