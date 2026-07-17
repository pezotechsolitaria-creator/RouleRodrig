import Image from "next/image";
import Link from "next/link";
import { ArrowRight, MapPin, Navigation } from "lucide-react";
import type { MapLocation } from "@/lib/defaults";
import { loc } from "@/lib/localize";
import type { Language } from "@/lib/i18n";

// A themed island-guide page (beaches, viewpoints…) built from the real
// mapLocations the owner maintains in admin.
//
// Why one page per THEME and not one per place: each location's story is only
// ~25–70 words. Twenty-one pages that thin would compete with TripAdvisor on
// depth and lose, and thin pages drag the whole domain. Aggregated, the same
// content is ~1,300 words of genuinely local writing plus 60+ original photos —
// which is worth ranking. If Search Console later shows a single place pulling
// real impressions, split that one out into its own deep page.

export default function PlaceGuide({
  eyebrow,
  title,
  intro,
  places,
  related,
  lang = "en",
  labels,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  places: MapLocation[];
  related: { href: string; label: string }[];
  /** Picks description/story from the *Fr / *Cr siblings the owner maintains. */
  lang?: Language;
  /** Chrome strings. Server-rendered, so they can't come from the client
      language context — the whole point is that a crawler reads them. */
  labels?: { rent: string; guide: string; directions: string; keepExploring: string };
}) {
  const L = labels ?? {
    rent: "Rent a scooter to get there",
    guide: "Full island guide",
    directions: "Get directions",
    keepExploring: "Keep exploring",
  };
  return (
    // Scoped to the content, since the root layout owns <html lang>. Fixes
    // screen-reader pronunciation; Google reads the content itself.
    <main className="bg-dark min-h-screen" lang={lang === "cr" ? "mfe" : lang}>
      <header className="border-b border-dark-border bg-gradient-to-b from-yellow/[0.06] to-transparent px-5 py-16 md:py-24">
        <div className="mx-auto max-w-3xl">
          <p className="font-bebas text-yellow text-xs tracking-[0.3em]">{eyebrow}</p>
          <h1 className="mt-3 font-syne text-4xl md:text-5xl font-extrabold text-offwhite leading-tight">
            {title}
          </h1>
          <p className="mt-4 font-dm text-muted leading-relaxed max-w-2xl">{intro}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={lang === "fr" ? "/fr/location-scooter-rodrigues" : "/browse/scooter"}
              className="inline-flex items-center gap-2 rounded-full bg-yellow px-6 py-3 font-syne font-bold text-dark text-sm transition-transform hover:scale-[1.03]"
            >
              {L.rent} <ArrowRight size={16} />
            </Link>
            <Link
              href="/guide/rodrigues"
              className="inline-flex items-center gap-2 rounded-full border border-white/20 px-6 py-3 font-syne font-bold text-white text-sm transition-colors hover:bg-white/10"
            >
              {L.guide}
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-5 py-14">
        <div className="space-y-16">
          {places.map((p, i) => {
            const photos = (p.images?.length ? p.images : p.image ? [p.image] : []).slice(0, 4);
            const maps = `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
            // All 24 places carry FR/CR siblings, so a French page is real
            // translated writing — not English text under a French URL, which
            // is what Google penalises.
            const name = loc(lang, p.name, p.nameFr, p.nameCr).trim();
            const description = loc(lang, p.description, p.descriptionFr, p.descriptionCr).trim();
            const story = loc(lang, p.story, p.storyFr, p.storyCr).trim();
            return (
              <article key={p.id} className="scroll-mt-24">
                <h2 className="font-syne text-2xl md:text-3xl font-bold text-offwhite">{name}</h2>
                <p className="mt-2 flex items-center gap-1.5 font-dm text-xs text-muted">
                  <MapPin size={13} className="text-yellow/70 shrink-0" />
                  {p.lat.toFixed(4)}, {p.lng.toFixed(4)} · Rodrigues Island, Mauritius
                </p>

                {description && (
                  <p className="mt-4 font-dm text-muted leading-relaxed">{description}</p>
                )}
                {story && <p className="mt-3 font-dm text-muted leading-relaxed">{story}</p>}

                {photos.length > 0 && (
                  <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {photos.map((src, n) => (
                      <div
                        key={src}
                        className="relative aspect-square overflow-hidden rounded-xl border border-dark-border"
                      >
                        <Image
                          src={src}
                          // Descriptive, unique per image — never "image1.jpg".
                          alt={`${name} — Rodrigues, ${n + 1}/${photos.length}`}
                          fill
                          sizes="(max-width: 640px) 50vw, 25vw"
                          className="object-cover"
                          // The first card of the first place is the LCP element.
                          loading={i === 0 && n === 0 ? "eager" : "lazy"}
                        />
                      </div>
                    ))}
                  </div>
                )}

                <a
                  href={maps}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-1.5 font-dm text-sm text-yellow/80 hover:text-yellow transition-colors"
                >
                  <Navigation size={14} /> {L.directions}
                </a>
              </article>
            );
          })}
        </div>

        <nav className="mt-16 border-t border-dark-border pt-8">
          <p className="font-syne text-sm font-bold text-offwhite">{L.keepExploring}</p>
          <ul className="mt-3 space-y-2">
            {related.map((r) => (
              <li key={r.href}>
                <Link
                  href={r.href}
                  className="inline-flex items-center gap-1.5 font-dm text-sm text-yellow/80 hover:text-yellow transition-colors"
                >
                  {r.label} <ArrowRight size={14} />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </main>
  );
}
