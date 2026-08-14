import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Gauge, Clock, Route as RouteIcon, Footprints, MapPin } from "lucide-react";
import { getContent } from "@/lib/content";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd, itemListLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import AppPageHeader from "@/components/AppPageHeader";

export const revalidate = 3600;

// The rides and hiking trails were a homepage section — no URL, so nothing to
// index and nothing to request in Search Console. Every route already carries
// real specs (distance, elevation, duration, difficulty) that no competitor
// publishes; that's exactly what someone searching "Rodrigues hiking trails"
// wants, and it was invisible.
// 58 chars / 158 — measured. The first draft was 61 and would have been cut.
const TITLE = "Rodrigues Scooter Routes & Hiking Trails | Roule Rodrigues";
const DESCRIPTION =
  "The best scooter rides and hiking trails in Rodrigues Island, mapped by locals — real distances, elevation and timings. Open each one straight in Google Maps.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/guide/routes` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/guide/routes`,
    type: "article",
    images: [`${SITE_URL}/og-image.jpg`],
  },
};

const DIFFICULTY_STYLE: Record<string, string> = {
  Easy: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
  Moderate: "bg-amber-500/10 text-amber-400 border-amber-500/25",
  Advanced: "bg-rose-500/10 text-rose-400 border-rose-500/25",
};

export default async function RoutesPage() {
  const content = await getContent();
  const routes = content.rideRoutes.filter((r) => r.name && r.description);
  const rides = routes.filter((r) => (r.kind ?? "ride") === "ride");
  const hikes = routes.filter((r) => r.kind === "hike");

  const Section = ({ list, heading }: { list: typeof routes; heading: string }) =>
    list.length === 0 ? null : (
      <section className="mt-12 first:mt-0">
        <h2 className="font-syne text-2xl md:text-3xl font-bold text-offwhite">{heading}</h2>
        <div className="mt-6 space-y-8">
          {list.map((r) => (
            <article key={r.id} id={r.id} className="scroll-mt-24 rounded-2xl border border-dark-border bg-white/[0.02] p-6">
              <h3 className="font-syne text-lg md:text-xl font-bold text-offwhite">{r.name.trim()}</h3>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full border px-2.5 py-1 font-dm text-xs font-semibold ${
                    DIFFICULTY_STYLE[r.difficulty] ?? "border-white/15 text-muted"
                  }`}
                >
                  {r.difficulty}
                </span>
                {r.distance && (
                  <span className="inline-flex items-center gap-1.5 font-dm text-xs text-muted">
                    <Gauge size={13} className="text-yellow/70" /> {r.distance}
                  </span>
                )}
                {r.duration && (
                  <span className="inline-flex items-center gap-1.5 font-dm text-xs text-muted">
                    <Clock size={13} className="text-yellow/70" /> {r.duration}
                  </span>
                )}
              </div>

              <p className="mt-4 font-dm text-muted leading-relaxed">{r.description.trim()}</p>

              {r.stops && (
                <div className="mt-4">
                  <p className="font-dm text-xs font-semibold uppercase tracking-wide text-white/50">
                    Stops along the way
                  </p>
                  <ul className="mt-2 space-y-1">
                    {r.stops
                      .split("\n")
                      .map((s) => s.trim())
                      .filter(Boolean)
                      .map((s) => (
                        <li key={s} className="flex items-start gap-2 font-dm text-sm text-muted">
                          <MapPin size={13} className="mt-1 shrink-0 text-yellow/70" />
                          {s}
                        </li>
                      ))}
                  </ul>
                </div>
              )}

              {r.mapsUrl && (
                <a
                  href={r.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-5 inline-flex items-center gap-1.5 font-dm text-sm text-yellow/80 hover:text-yellow transition-colors"
                >
                  {r.linkLabel?.trim() || "Open the route in Google Maps"} <ArrowRight size={14} />
                </a>
              )}
            </article>
          ))}
        </div>
      </section>
    );

  return (
    <>
      <JsonLd
        data={[
          breadcrumbLd([
            { name: "Home", url: SITE_URL },
            { name: "Island guide", url: `${SITE_URL}/guide/rodrigues` },
            { name: "Routes & trails", url: `${SITE_URL}/guide/routes` },
          ]),
          // Rides only. The trails are described in full on /guide/hiking and
          // that page lists them — two pages claiming the same ItemList is how
          // you end up competing with yourself for your own trail names.
          itemListLd(
            "Scooter routes in Rodrigues",
            rides.map((r) => ({ name: r.name.trim() })),
          ),
        ]}
      />
      <AppPageHeader logo={content.branding.logo} />

      <main className="bg-dark min-h-screen">
        <header className="border-b border-white/10 bg-gradient-to-b from-yellow/[0.06] to-transparent px-5 py-10 md:py-14">
          <div className="mx-auto max-w-3xl">
            <p className="font-bebas text-yellow text-xs tracking-[0.3em]">ISLAND GUIDE</p>
            <h1 className="mt-3 font-syne text-4xl md:text-5xl font-extrabold text-offwhite leading-tight">
              Scooter routes &amp; hiking trails in Rodrigues
            </h1>
            <p className="mt-4 font-dm text-muted leading-relaxed max-w-2xl">
              Rodrigues is 18 km long and almost entirely coast and ridge — which makes it perfect
              for a half-day ride or a serious hike. These are the routes we actually send people
              on, with real distances and timings, not guesses.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/browse/scooter"
                className="inline-flex items-center gap-2 rounded-full bg-yellow px-6 py-3 font-syne font-bold text-dark text-sm transition-transform hover:scale-[1.03]"
              >
                Rent a scooter <ArrowRight size={16} />
              </Link>
              <Link
                href="/guide/beaches"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 px-6 py-3 font-syne font-bold text-white text-sm transition-colors hover:bg-white/10"
              >
                Where the beaches are
              </Link>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-3xl px-5 py-14">
          <Section
            list={rides}
            heading={`Scooter rides${rides.length ? ` (${rides.length})` : ""}`}
          />

          {/* Hiking has its own guide now, and the full trail write-ups live
              there. This is a hand-off, not a second copy: the same trail
              described in full on two URLs makes the two pages compete with
              each other, and the one that wins is the one Google picks, not
              the one we meant. So the names and difficulties stay here as an
              index — enough to see what exists and click through — and the
              climb, terrain, shade and safety detail live on one page. */}
          {hikes.length > 0 && (
            <section className="mt-12">
              <h2 className="font-syne text-2xl font-bold text-offwhite md:text-3xl">
                Hiking trails ({hikes.length})
              </h2>
              <p className="mt-3 font-dm leading-relaxed text-muted">
                Rodrigues walks are short, steep and almost entirely unshaded. Each
                trail is written up with its climb, the ground underfoot and how much
                water to carry in the hiking guide.
              </p>
              <ul className="mt-5 divide-y divide-dark-border overflow-hidden rounded-2xl border border-dark-border bg-white/[0.02]">
                {hikes.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/guide/hiking#${r.id}`}
                      className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-white/[0.03]"
                    >
                      <span className="min-w-0">
                        <span className="block font-syne text-sm font-bold text-offwhite">
                          {r.name.trim()}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-dm text-xs text-muted">
                          <span>{r.difficulty}</span>
                          {r.distance && <span>{r.distance}</span>}
                          {r.elevation && <span>{r.elevation} climb</span>}
                          {r.duration && <span>{r.duration}</span>}
                        </span>
                      </span>
                      <ArrowRight size={15} className="shrink-0 text-yellow/70" />
                    </Link>
                  </li>
                ))}
              </ul>
              <Link
                href="/guide/hiking"
                className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/20 px-5 py-2.5 font-syne text-sm font-bold text-white transition-colors hover:bg-white/10"
              >
                <Footprints size={15} className="text-yellow" />
                Open the full hiking guide
              </Link>
            </section>
          )}

          <nav className="mt-14 border-t border-dark-border pt-8">
            <p className="font-syne text-sm font-bold text-offwhite">Keep exploring</p>
            <ul className="mt-3 space-y-2">
              {[
                { href: "/guide/hiking", label: "Hiking trails in Rodrigues" },
                { href: "/guide/beaches", label: "The best beaches in Rodrigues" },
                { href: "/guide/viewpoints", label: "Viewpoints & landmarks in Rodrigues" },
                { href: "/guide/rodrigues", label: "The full local's guide to Rodrigues" },
                { href: "/browse/getting-around", label: "How to get around Rodrigues" },
              ].map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="inline-flex items-center gap-1.5 font-dm text-sm text-yellow/80 hover:text-yellow transition-colors"
                  >
                    {l.label} <ArrowRight size={14} />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </main>
    </>
  );
}
