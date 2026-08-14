import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight, ArrowUpRight, Clock, Droplets, Footprints, MapPin, Mountain,
  Repeat, Sun, TriangleAlert, UserCheck,
} from "lucide-react";
import type { RideRoute } from "@/lib/defaults";
import { loc } from "@/lib/localize";
import type { Language } from "@/lib/i18n";

// ── The hiking guide ────────────────────────────────────────────────────────
//
// Hiking used to be the second half of /guide/routes — a page called "Scooter
// routes & hiking trails" whose H1, hero paragraph and first button are all
// about renting a scooter. The trails sat under every ride on it, and the
// homepage tile that said "Hiking" opened there. Walking was a subsection of
// riding, which is not what it is.
//
// So it gets its own surface, built from the same admin-maintained rideRoutes
// the owner already edits (kind === "hike"). No second content store, no data
// to re-enter, one editor: the discriminator that already existed now selects
// a PAGE rather than a heading.
//
// Server-rendered on purpose, like PlaceGuide: `lang` is a prop rather than the
// client language context, so a crawler reads the trails instead of an empty
// shell. Everything factual here comes from the owner's content — this file
// invents no distance, elevation or timing.

export const isHike = (r: RideRoute) => r.kind === "hike";

const DIFFICULTY_STYLE: Record<string, string> = {
  Easy: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
  Moderate: "bg-amber-500/10 text-amber-400 border-amber-500/25",
  Advanced: "bg-rose-500/10 text-rose-400 border-rose-500/25",
};

/** A spec chip. Renders nothing at all when the owner hasn't filled the field. */
function Spec({ icon: Icon, children }: { icon: React.ElementType; children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <span className="inline-flex items-center gap-1.5 font-dm text-xs text-muted">
      <Icon size={13} className="shrink-0 text-yellow/70" /> {children}
    </span>
  );
}

export default function HikingGuide({
  trails,
  lang = "en",
  related,
}: {
  trails: RideRoute[];
  lang?: Language;
  related: { href: string; label: string }[];
}) {
  return (
    // Scoped lang, not <html lang> — the root layout owns that. Kreol Rodrig
    // has no ISO code of its own; mfe (Morisyen) is its closest real tag, which
    // is what every other guide page here already uses.
    <main className="bg-dark min-h-screen" lang={lang === "cr" ? "mfe" : lang}>
      <header className="border-b border-white/10 bg-gradient-to-b from-yellow/[0.06] to-transparent px-5 py-10 md:py-14">
        <div className="mx-auto max-w-3xl">
          <p className="font-bebas text-yellow text-xs tracking-[0.3em]">ISLAND GUIDE</p>
          <h1 className="mt-3 font-syne text-4xl md:text-5xl font-extrabold leading-tight text-offwhite">
            {trails.length > 0
              ? `The ${trails.length} best hikes in Rodrigues`
              : "Hiking in Rodrigues"}
          </h1>
          <p className="mt-4 max-w-2xl font-dm leading-relaxed text-muted">
            Rodrigues is 18 km end to end and almost all of it is ridge, coast or
            lagoon — so the walking here is short, steep and almost always in the
            open. These are the trails we actually send people on, with the climb,
            the ground underfoot and the shade written down rather than guessed.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/trip-planner"
              className="inline-flex items-center gap-2 rounded-full bg-yellow px-6 py-3 font-syne text-sm font-bold text-dark transition-transform hover:scale-[1.03]"
            >
              Plan your days <ArrowRight size={16} />
            </Link>
            <Link
              href="/guide/routes"
              className="inline-flex items-center gap-2 rounded-full border border-white/20 px-6 py-3 font-syne text-sm font-bold text-white transition-colors hover:bg-white/10"
            >
              Scooter routes
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-5 py-14">
        {/* An island with no trails written up yet says so, rather than
            rendering a headline over an empty page. The owner adds one in
            Admin → Content → Routes & Trails and it appears here. */}
        {trails.length === 0 ? (
          <p className="rounded-2xl border border-dark-border bg-white/[0.02] p-6 font-dm leading-relaxed text-muted">
            The trail guide is being written. In the meantime, the{" "}
            <Link href="/map" className="text-yellow/80 hover:text-yellow">
              island map
            </Link>{" "}
            marks every viewpoint and beach worth walking to.
          </p>
        ) : (
          <div className="space-y-8">
            {trails.map((r) => {
              const name = loc(lang, r.name, r.nameFr, r.nameCr).trim();
              const description = loc(lang, r.description, r.descriptionFr, r.descriptionCr).trim();
              const cover = r.image || r.images?.[0];
              const stops = (r.stops ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
              // "No water" is the Rodrigues default and the dangerous one, so it
              // is stated outright. `undefined` (never set) reads the same as
              // false here on purpose — silence must not imply a tap.
              const noWater = !r.waterOnRoute;

              return (
                <article
                  key={r.id}
                  id={r.id}
                  className={`scroll-mt-24 overflow-hidden rounded-2xl border bg-white/[0.02] ${
                    r.featured ? "border-yellow/40" : "border-dark-border"
                  }`}
                >
                  {cover && (
                    <div className="relative aspect-[16/9] w-full bg-dark-card">
                      <Image
                        src={cover}
                        alt={name}
                        fill
                        sizes="(max-width: 768px) 100vw, 768px"
                        className="object-cover"
                      />
                    </div>
                  )}

                  <div className="p-6">
                    <h2 className="font-syne text-lg font-bold text-offwhite md:text-xl">{name}</h2>

                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                      <span
                        className={`rounded-full border px-2.5 py-1 font-dm text-xs font-semibold ${
                          DIFFICULTY_STYLE[r.difficulty] ?? "border-white/15 text-muted"
                        }`}
                      >
                        {r.difficulty}
                      </span>
                      <Spec icon={Footprints}>{r.distance}</Spec>
                      <Spec icon={Mountain}>{r.elevation}</Spec>
                      <Spec icon={Clock}>{r.duration}</Spec>
                      <Spec icon={Repeat}>{r.routeShape}</Spec>
                    </div>

                    {description && (
                      <p className="mt-4 font-dm leading-relaxed text-muted">{description}</p>
                    )}

                    {r.trailhead && (
                      <p className="mt-4 flex items-start gap-2 font-dm text-sm text-muted">
                        <MapPin size={14} className="mt-0.5 shrink-0 text-yellow/70" />
                        <span>
                          <span className="text-offwhite/80">Starts at</span> {r.trailhead}
                        </span>
                      </p>
                    )}

                    {/* Conditions. Only rendered when the owner has said
                        something — an empty grid of "unknown" is worse than no
                        grid, because a walker reads a blank as "fine". */}
                    {(r.terrain || r.shade || r.bestTime || noWater) && (
                      <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-3 rounded-xl border border-dark-border bg-dark/40 p-4 sm:grid-cols-2">
                        {r.terrain && (
                          <div>
                            <dt className="font-bebas text-[10px] tracking-[0.2em] text-yellow/80">
                              UNDERFOOT
                            </dt>
                            <dd className="mt-1 font-dm text-sm text-muted">{r.terrain}</dd>
                          </div>
                        )}
                        {r.shade && (
                          <div>
                            <dt className="font-bebas text-[10px] tracking-[0.2em] text-yellow/80">
                              SHADE
                            </dt>
                            <dd className="mt-1 inline-flex items-center gap-1.5 font-dm text-sm text-muted">
                              <Sun size={13} className="text-yellow/70" /> {r.shade}
                            </dd>
                          </div>
                        )}
                        <div>
                          <dt className="font-bebas text-[10px] tracking-[0.2em] text-yellow/80">
                            WATER
                          </dt>
                          <dd className="mt-1 inline-flex items-center gap-1.5 font-dm text-sm text-muted">
                            <Droplets size={13} className="text-yellow/70" />
                            {noWater ? "None on the trail — carry your own" : "Available on the trail"}
                          </dd>
                        </div>
                        {r.bestTime && (
                          <div>
                            <dt className="font-bebas text-[10px] tracking-[0.2em] text-yellow/80">
                              BEST TIME
                            </dt>
                            <dd className="mt-1 font-dm text-sm text-muted">{r.bestTime}</dd>
                          </div>
                        )}
                      </dl>
                    )}

                    {r.guideRequired && (
                      <p className="mt-4 flex items-start gap-2.5 rounded-xl border border-yellow/25 bg-yellow/[0.06] p-4 font-dm text-sm text-offwhite/85">
                        <UserCheck size={15} className="mt-0.5 shrink-0 text-yellow" />
                        <span>
                          <span className="font-semibold">Guide required.</span>{" "}
                          {r.permitNote?.trim() || "This trail is not walked unaccompanied — arrange a guide before you go."}
                        </span>
                      </p>
                    )}
                    {!r.guideRequired && r.permitNote?.trim() && (
                      <p className="mt-4 font-dm text-sm text-muted">{r.permitNote.trim()}</p>
                    )}

                    {stops.length > 0 && (
                      <div className="mt-5">
                        <p className="font-dm text-xs font-semibold uppercase tracking-wide text-white/50">
                          Along the way
                        </p>
                        <ul className="mt-2 space-y-1">
                          {stops.map((s) => (
                            <li key={s} className="flex items-start gap-2 font-dm text-sm text-muted">
                              <MapPin size={13} className="mt-1 shrink-0 text-yellow/70" />
                              {s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* The one thing a walker does on this card, so it is a
                        control rather than a line of text. The sibling guides
                        render this as a 20px inline link — fine for a "keep
                        exploring" list, thin for the primary action on a page
                        read one-handed at a trailhead. Same gold language, a
                        44px target. */}
                    {r.mapsUrl && (
                      <a
                        href={r.mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-full border border-yellow/30 bg-yellow/[0.08] px-5 py-3 font-syne text-sm font-bold text-yellow transition-colors hover:border-yellow/60 hover:bg-yellow/15"
                      >
                        {r.linkLabel?.trim() || "Open the trail in Google Maps"}
                        <ArrowUpRight size={15} className="shrink-0" />
                      </a>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Island-specific safety. Not boilerplate: no shade, no shops and no
            phone signal on the ridges are the three things that actually catch
            visitors out here, and the same warning already runs on
            /guide/routes — this is where it belongs. */}
        <aside className="mt-12 rounded-2xl border border-dark-border bg-white/[0.02] p-6">
          <p className="flex items-center gap-2 font-syne text-sm font-bold text-offwhite">
            <TriangleAlert size={15} className="text-yellow" />
            Before you set off
          </p>
          <ul className="mt-3 space-y-2 font-dm text-sm leading-relaxed text-muted">
            <li>
              Carry more water than you think you need. There are no shops or taps on
              any of these trails.
            </li>
            <li>
              Start early. The ridges have almost no cover and the middle of the day
              is the hardest part of any of these walks.
            </li>
            <li>
              Tell someone where you are going. Phone signal drops in the valleys.
            </li>
            <li>
              Shoes with grip, not sandals — the basalt is sharp and loose gravel is
              common on the descents.
            </li>
            <li>
              In an emergency, the numbers are on the{" "}
              <Link href="/emergency" className="text-yellow/80 hover:text-yellow">
                emergency page
              </Link>
              .
            </li>
          </ul>
        </aside>

        <nav className="mt-14 border-t border-dark-border pt-8">
          <p className="font-syne text-sm font-bold text-offwhite">Keep exploring</p>
          <ul className="mt-3 space-y-2">
            {related.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="inline-flex items-center gap-1.5 font-dm text-sm text-yellow/80 transition-colors hover:text-yellow"
                >
                  {l.label} <ArrowRight size={14} />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </main>
  );
}
