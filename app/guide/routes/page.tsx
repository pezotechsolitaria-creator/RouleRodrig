import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Gauge, Clock, Route as RouteIcon, Footprints, MapPin } from "lucide-react";
import { getContent } from "@/lib/content";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd, itemListLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import Navbar from "@/components/Navbar";

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
          itemListLd(
            "Scooter routes & hiking trails in Rodrigues",
            routes.map((r) => ({ name: r.name.trim() })),
          ),
        ]}
      />
      <Navbar
        branding={content.branding}
        announcementActive={false}
        showStayEatDo={content.recommended.enabled && content.recommended.items.length > 0}
        showRoutes={content.rideRoutes.length > 0}
        showEvents={content.events.some((e) => e.title)}
      />

      <main className="bg-dark min-h-screen">
        <header className="border-b border-dark-border bg-gradient-to-b from-yellow/[0.06] to-transparent px-5 py-16 md:py-24">
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
          <Section
            list={hikes}
            heading={`Hiking trails${hikes.length ? ` (${hikes.length})` : ""}`}
          />

          {hikes.length > 0 && (
            <p className="mt-10 flex items-start gap-2.5 rounded-2xl border border-dark-border bg-white/[0.02] p-5 font-dm text-sm text-muted">
              <Footprints size={16} className="mt-0.5 shrink-0 text-yellow/70" />
              Rodrigues trails are unshaded and there are no shops on the way. Carry more water than
              you think you need, start early, and tell someone where you&apos;re going.
            </p>
          )}

          <nav className="mt-14 border-t border-dark-border pt-8">
            <p className="font-syne text-sm font-bold text-offwhite">Keep exploring</p>
            <ul className="mt-3 space-y-2">
              {[
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
