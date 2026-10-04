import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ChevronRight, Map as MapIcon, MapPin, Navigation } from "lucide-react";
import { getContent } from "@/lib/content";
import type { MapLocation, SiteContent } from "@/lib/defaults";
import { contentWasRead } from "@/lib/listing-gates";
import { fitTitleWithTails } from "@/lib/fit-title";
import { metaDescription } from "@/lib/meta-description";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd, placeLd } from "@/lib/schema";
import {
  findLocationPage,
  locationPages,
  longReadParagraphs,
  photosOf,
  placeAnchors,
  storedSlug,
} from "@/lib/guide/location-page-gate";
import { THEME_GUIDES, guideTrail, mapEntryHref, themeGuideOf } from "@/lib/guide/places";
import { bookNearHere } from "@/lib/guide/near-here";
import JsonLd from "@/components/JsonLd";
import AppPageHeader from "@/components/AppPageHeader";
import HubBacklink from "@/components/nav/HubBacklink";

// ── A PLACE'S OWN PAGE, ONLY WHEN IT HAS EARNED ONE (architecture review 2026-09-30, item 2) ──
//
// /guide/<slug> for a map location that passes lib/guide/location-page-gate.ts:
// the owner asked for it, gave it a slug, and wrote a long read in English and
// French, with photos and a pin on the island. Everything below comes from
// that place's own fields — name, long read, story, photos, coordinates, the
// listings the owner linked to it — and nothing is added that he did not write.
//
// On the day this shipped no place passed, so the route serves only 404s. That
// is correct: the rule in components/PlaceGuide.tsx is one page per theme until
// a place has the depth for its own, and lowering the gate to make one appear
// would publish the thin page the rule exists to prevent.
//
// ── A REAL 404, NOT A SOFT ONE ──────────────────────────────────────────────
// notFound() before anything renders, and no loading.tsx in this segment or
// above it: a loading boundary would start streaming a 200 before the page
// could say it does not exist. Static routes (/guide/beaches…) win over this
// segment, and the gate refuses their slugs as well.

export const revalidate = 3600;

/** The pages to build ahead of time: every place that passes today. A place
 *  that passes later renders on first request (dynamicParams stays true). */
export async function generateStaticParams(): Promise<{ place: string }[]> {
  try {
    const content = await getContent();
    return locationPages(content.mapLocations).map((p) => ({ place: storedSlug(p)! }));
  } catch {
    return [];
  }
}

type Resolved = { content: SiteContent; place: MapLocation; slug: string };

/**
 * The place this slug names, or null when it has no page.
 *
 * getContent() answers its seed on a failed read, and the seed has no location
 * pages — so an unreadable database would look exactly like "no such place"
 * and, on an ISR revalidation, replace a live page with a 404. That is thrown
 * instead: Next keeps serving the last good copy, and a first visit gets an
 * honest 500 that a crawler retries rather than a 404 it believes.
 */
async function resolve(slug: string): Promise<Resolved | null> {
  const content = await getContent();
  if (!contentWasRead(content)) throw new Error("site content unavailable: location page not resolved");
  const place = findLocationPage(content.mapLocations, slug);
  return place ? { content, place, slug } : null;
}

/** The long read as the page renders it, English only: this is the English page. */
const bodyOf = (p: MapLocation) => longReadParagraphs(p.longRead, p.story);

const absolute = (src: string) => (/^https?:\/\//.test(src) ? src : `${SITE_URL}${src}`);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ place: string }>;
}): Promise<Metadata> {
  const { place: slug } = await params;
  const r = await resolve(slug);
  if (!r) return { title: "Not found", robots: { index: false, follow: true } };
  const name = r.place.name.trim();
  const url = `${SITE_URL}/guide/${r.slug}`;
  // The place's name first, "Rodrigues" kept unless the name already says it,
  // and the brand the first thing to go past 60 characters (lib/fit-title.ts).
  // Unique by construction: locationPages() gives one page per name.
  const title = fitTitleWithTails(
    name,
    /rodrigues/i.test(name) ? "" : ", Rodrigues",
    " | Roule Rodrigues",
    60,
  );
  // The owner's own opening, cut on a sentence (lib/meta-description.ts).
  const description = metaDescription(bodyOf(r.place).join(" "));
  const images = photosOf(r.place).slice(0, 4).map(absolute);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "article", images },
  };
}

export default async function LocationPage({ params }: { params: Promise<{ place: string }> }) {
  const { place: slug } = await params;
  const r = await resolve(slug);
  if (!r) notFound();
  const { content, place } = r;

  const name = place.name.trim();
  const url = `${SITE_URL}/guide/${slug}`;
  const body = bodyOf(place);
  const photos = photosOf(place).slice(0, 12);
  const anchors = placeAnchors(content.mapLocations);
  // The gate only passes places that are already on their theme guide.
  const theme = themeGuideOf(place)!;
  const themeLabel =
    theme === THEME_GUIDES.beaches ? "Every beach in Rodrigues" : "Viewpoints & landmarks in Rodrigues";
  const near = bookNearHere(place, content);
  const maps = `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`;
  const area = place.area?.trim();

  return (
    <>
      <JsonLd
        data={[
          breadcrumbLd(guideTrail(SITE_URL, { name, path: `/guide/${slug}` })),
          placeLd({
            // Beach for a beach; everything else the gate lets through is a
            // place people go to look at.
            type: place.category === "beach" ? "Beach" : "TouristAttraction",
            id: `${url}#place`,
            url,
            name,
            description: metaDescription(body.join(" ")) || undefined,
            lat: place.lat,
            lng: place.lng,
            image: photos.map(absolute),
          }),
        ]}
      />

      <AppPageHeader showBack backHref={theme} />

      <main className="min-h-[calc(100vh-3.5rem)] bg-dark px-4 pb-16 pt-4 text-offwhite" lang="en">
        <article className="mx-auto max-w-2xl">
          {/* The same trail the BreadcrumbList above describes, on the page. */}
          <nav aria-label="Breadcrumb" className="font-dm text-xs text-muted">
            <ol className="flex flex-wrap items-center gap-1">
              <li>
                <Link href="/" className="inline-flex min-h-11 items-center hover:text-yellow">
                  Home
                </Link>
              </li>
              <li aria-hidden="true">
                <ChevronRight size={12} />
              </li>
              <li>
                <Link href="/guide" className="inline-flex min-h-11 items-center hover:text-yellow">
                  Island guide
                </Link>
              </li>
              <li aria-hidden="true">
                <ChevronRight size={12} />
              </li>
              <li aria-current="page" className="text-offwhite/80">
                {name}
              </li>
            </ol>
          </nav>

          <p className="mt-2 font-bebas text-[11px] tracking-[0.3em] text-yellow">ISLAND GUIDE</p>
          <h1 className="mt-1 font-syne text-3xl font-extrabold leading-tight sm:text-4xl">{name}</h1>
          <p className="mt-2 flex items-center gap-1.5 font-dm text-xs text-muted">
            <MapPin size={13} className="shrink-0 text-yellow/70" />
            {area ? `${area} · ` : ""}
            {place.lat.toFixed(4)}, {place.lng.toFixed(4)} · Rodrigues Island, Mauritius
          </p>

          <div className="mt-6 space-y-4">
            {body.map((p) => (
              <p key={p} className="font-dm leading-relaxed text-offwhite/90">
                {p}
              </p>
            ))}
          </div>

          {photos.length > 0 && (
            <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {photos.map((src, n) => (
                <div
                  key={src}
                  className="relative aspect-square overflow-hidden rounded-xl border border-white/10"
                >
                  <Image
                    src={src}
                    alt={`${name} — Rodrigues, ${n + 1}/${photos.length}`}
                    fill
                    sizes="(max-width: 640px) 50vw, 33vw"
                    className="object-cover"
                    loading={n === 0 ? "eager" : "lazy"}
                  />
                </div>
              ))}
            </div>
          )}

          <section className="mt-10">
            <h2 className="font-syne text-xl font-extrabold">Getting there</h2>
            <div className="mt-2 flex flex-wrap gap-x-5">
              {/* Its row on the island map, where it sits among everything
                  around it, and the directions an app can follow. */}
              <Link
                href={mapEntryHref(place, anchors)}
                className="inline-flex min-h-11 items-center gap-1.5 font-dm text-sm text-yellow/80 transition-colors hover:text-yellow"
              >
                <MapIcon size={14} /> See it on the island map
              </Link>
              <a
                href={maps}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-1.5 font-dm text-sm text-yellow/80 transition-colors hover:text-yellow"
              >
                <Navigation size={14} /> Get directions
              </a>
            </div>
          </section>

          {/* Only listings the owner linked to this place, and only those that
              still resolve to something bookable (lib/guide/near-here.ts). No
              heading at all when there are none: "nothing near here" is not
              something this page knows. */}
          {near.length > 0 && (
            <section className="mt-10 rounded-2xl border border-white/10 bg-dark-card p-5">
              <h2 className="font-syne text-lg font-extrabold">Book near here</h2>
              <ul className="mt-2">
                {near.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="inline-flex min-h-11 items-center gap-1.5 font-dm text-sm font-bold text-yellow hover:underline"
                    >
                      {l.name} <ArrowRight size={14} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-10 border-t border-white/10 pt-6">
            <h2 className="font-syne text-lg font-extrabold">More in the island guide</h2>
            <ul className="mt-2">
              <li>
                {/* Its entry on the theme guide this page deepens. */}
                <Link
                  href={`${theme}#${anchors[place.id]}`}
                  className="inline-flex min-h-11 items-center gap-1.5 font-dm text-sm text-yellow/80 transition-colors hover:text-yellow"
                >
                  {themeLabel} <ArrowRight size={14} />
                </Link>
              </li>
              <li>
                <Link
                  href="/guide/rodrigues"
                  className="inline-flex min-h-11 items-center gap-1.5 font-dm text-sm text-yellow/80 transition-colors hover:text-yellow"
                >
                  The full local&apos;s guide to Rodrigues <ArrowRight size={14} />
                </Link>
              </li>
            </ul>
            <p className="mt-4 font-dm text-xs text-muted/70">
              If you find something here out of date, tell us
              {content.contact.email ? ` — ${content.contact.email}` : ""}.
            </p>
          </section>
        </article>
      </main>
      <HubBacklink href="/guide" label="All island guides" />
    </>
  );
}
