# SEO — keyword plan & progress

Working rules live in the owner's brief: intent first, one primary keyword per
page, no forced exact-match, verify before calling anything done.

**Honesty constraint that governs this whole file:** there is no Ahrefs, GSC,
GA4 or Screaming Frog data connected to this project. So this plan contains **no
search volumes, no difficulty scores and no competition ratings** — inventing
those numbers would make every decision below untraceable. Intent and page
mapping are judgement calls that don't need a tool; volume and difficulty do.
Once Search Console is connected and has ~2–4 weeks of data, revisit every
"primary keyword" here against real impressions.

---

## Wave 1 — technical foundation (DONE, deployed)

- [x] Unique title/description/canonical per `/browse/[category]` — they all
      inherited the homepage title and read as duplicates
- [x] BreadcrumbList + ItemList on every browse page
- [x] Organization + TouristDestination on `/`; +breadcrumb on `/guide/rodrigues`
- [x] Product markup moved off `/` (fleet isn't rendered there) onto
      `/browse/[category]`, with real aggregateRating only where reviews exist
- [x] Sitemap built from live content: 6 → 13 URLs
- [x] Unknown `/browse` slugs → noindex, no self-canonical
- [x] Title 50–60 / description 140–160 verified on all 7 browse pages

## Page → intent map (current)

| Page | Intent | Primary keyword (unvalidated) |
|---|---|---|
| `/` | brand / navigational | roule rodrigues |
| `/browse/scooter` | transactional | scooter rental rodrigues |
| `/browse/car` | transactional | car rental rodrigues |
| `/browse/stays` | commercial | where to stay in rodrigues |
| `/browse/activities` | commercial | things to do in rodrigues |
| `/browse/tours` | commercial | rodrigues island tours |
| `/browse/getting-around` | informational | how to get around rodrigues |
| `/guide/rodrigues` | informational | rodrigues island travel guide |
| `/food` | commercial | where to eat in rodrigues |

### Cannibalisation watch
- `/guide/rodrigues` covers "getting around" as an FAQ answer AND
  `/browse/getting-around` targets it as a page. The guide should keep the
  short answer and link out; the browse page owns the intent.
- Wave 2 place pages must not restate the guide's beach section wholesale —
  the guide summarises and links, each place page goes deep on one place.

---

## Wave 2 — content pages from the island guide (IN PROGRESS)

Goal: the 21 island-guide stories are locked inside a client-side map component.
They're real, original, local content that no competitor has — and Google can
barely read them. Give each its own indexable URL.

- [ ] Audit live `mapLocations`: how many have a `story`, images, coordinates
- [ ] Slug strategy + a stable slug field (names change; URLs must not)
- [ ] `/guide/[slug]` page: story, photos w/ descriptive alt, map, related
      places, CTA to book a scooter
- [ ] Place JSON-LD (Beach / TouristAttraction / Restaurant …) + breadcrumb
- [ ] Internal links: map popup → page, guide hub → pages, page → /browse/scooter
- [ ] Add to sitemap
- [ ] Verify each page: title 50–60, desc 140–160, one H1, alt text, ≥2 internal links

### Blocked on real data (do NOT fake)
- Volume/difficulty per place keyword → needs GSC or Ahrefs
- Which stories actually earn impressions → needs GSC, ~2–4 weeks

## Later waves
- [ ] Premium redesign, section by section (owner approval per section)
- [ ] Shop feature in island guide (scope undefined — what is sold?)
- [ ] Listings rework: List your vehicle / restaurant / stay
- [ ] Domain `roulerodrig.com` → set `NEXT_PUBLIC_SITE_URL` in Vercel, or every
      canonical keeps pointing at the vercel.app domain
