import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { ArrowRight, CalendarCheck, Car, MapPin, Phone, Store } from "lucide-react";
import BackLink from "@/components/BackLink";
import Navbar from "@/components/Navbar";
import JsonLd from "@/components/JsonLd";
import { getContent } from "@/lib/content";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd } from "@/lib/schema";
import { listVehicleProviders } from "@/lib/marketplace/vehicle-providers";
import { robotsWhileEmpty } from "@/lib/listing-gates";

// ── WASH MY VEHICLE ─────────────────────────────────────────────────────────
//
// The door, not the machinery. Everything behind this page already existed
// before it did:
//
//   trade_providers          a car wash is a STORE whose kind is derived from
//                            this table (M177) — so it already has a storefront,
//                            opening hours, staff and commission through
//                            resolve_commission_rate. Nothing new was invented.
//   service_durations        a product with a duration is booked time rather
//                            than stock (M179), which is why create_order
//                            refuses to SELL one: "booked, not bought".
//   book_service_slot_public the customer's own booking, with the visibility
//                            rule, the online-bookings toggle, a three-per-phone
//                            cap, opening hours and capacity under a row lock.
//
// What was missing was any way to FIND one. A customer could book a car wash
// only by already knowing its URL, which meant the whole vertical was invisible.
// This page is that list, and it deliberately adds no rules of its own.
//
// ── WHY THE QUERY LOOKS TOO SIMPLE ──────────────────────────────────────────
// (It lives in lib/marketplace/vehicle-providers.ts now, shared with the
// sitemap.) There is no status filter and that is not an oversight. RLS on
// trade_providers is `store_is_visible(store_id) OR is_store_staff OR
// is_platform_admin`, so a draft or paused business is already absent for a
// visitor — the same rule the storefront and marketplace_stores use. Repeating
// it here would create a second opinion about who is open, and the two would
// disagree the first time either changed.

export const revalidate = 300;

const DESCRIPTION =
  "Book a car wash, a valet or a full detail with a local business on Rodrigues. See who is open, what they charge, and book a time online.";

// ── NOT A REDIRECT, WHILE THERE IS SOMETHING BEHIND THE DOOR ────────────────
// SEO audit 2026-09-29 C16/T4 asked for a 308 to /marketplace, on the grounds
// that the car-wash vertical was cancelled on 29 Aug and its tables dropped.
// That was the FIRST attempt. This page was rebuilt on 7 Sept on M177
// trade_providers, which is live (it answers, empty, to the public key), and
// /marketplace links it. So it is gated on its own data instead, by the rule
// every empty listing now follows (lib/listing-gates.ts): `noindex, follow`
// and out of the sitemap while nobody is listed. If the owner has cancelled it
// again, the 308 is a one-line change — that call is his.
const loadListed = cache(async () => listVehicleProviders(await createClient()));

export async function generateMetadata(): Promise<Metadata> {
  const listed = await loadListed();
  return {
    title: "Car wash & valeting on Rodrigues — book online | Roule Rodrigues",
    description: DESCRIPTION,
    alternates: { canonical: `${SITE_URL}/marketplace/wash` },
    ...robotsWhileEmpty(listed ? listed.length : null),
    openGraph: {
      title: "Car wash & valeting on Rodrigues | Roule Rodrigues",
      description: DESCRIPTION,
      url: `${SITE_URL}/marketplace/wash`,
      type: "website",
      images: [`${SITE_URL}/og-image.jpg`],
    },
  };
}

export default async function WashPage() {
  const content = await getContent();
  const listed = (await loadListed()) ?? [];

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      breadcrumbLd([
        { name: "Roule Rodrigues", url: SITE_URL },
        { name: "Marketplace", url: `${SITE_URL}/marketplace` },
        { name: "Wash my vehicle", url: `${SITE_URL}/marketplace/wash` },
      ]),
    ],
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <Navbar
        branding={content.branding}
        announcementActive={false}
        showStayEatDo={
          content.recommended.enabled && content.recommended.items.length > 0
        }
        showRoutes={content.rideRoutes.length > 0}
        showEvents={content.events.some((e) => e.title)}
      />
      <main className="min-h-screen bg-dark">
        <div className="mx-auto max-w-3xl px-5 pt-28 pb-16 md:pt-32">
          {/* One level up is the hub, not the homepage. */}
          <BackLink
            fallback="/marketplace"
            iconSize={15}
            className="inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-yellow"
          >
            {" "}Marketplace
          </BackLink>

          <p className="mt-5 font-bebas text-[11px] tracking-[0.3em] text-yellow">
            WASH MY VEHICLE
          </p>
          <h1 className="mt-2 font-syne text-[26px] font-extrabold leading-tight text-offwhite sm:text-3xl">
            Car wash &amp; valeting
          </h1>
          <p className="mt-2 max-w-xl font-dm text-sm leading-relaxed text-muted">
            {DESCRIPTION}
          </p>

          {listed.length === 0 ? (
            // Says which of the two it is. "No results" over a working page and
            // "nobody has signed up yet" are different problems, and only one of
            // them is worth coming back for.
            <div className="mt-8 rounded-2xl border border-white/10 bg-dark-card p-6 text-center">
              <Car size={26} className="mx-auto text-muted" aria-hidden />
              <p className="mt-3 font-syne text-base font-extrabold text-offwhite">
                No car washes listed yet
              </p>
              <p className="mx-auto mt-1 max-w-sm font-dm text-[13px] leading-relaxed text-muted">
                We are signing up the island&apos;s valeting businesses now. If
                you run one, this is where your customers will find you.
              </p>
              <Link
                href="/list-your-scooter"
                className="mt-4 inline-flex min-h-11 items-center rounded-full bg-yellow px-5 font-dm text-sm font-bold text-dark"
              >
                List your business
              </Link>
            </div>
          ) : (
            <ul className="mt-8 space-y-3">
              {listed.map(({ p, s }) => (
                <li key={s.id}>
                  <Link
                    href={`/shop/${s.slug}`}
                    className="flex min-h-[92px] items-start gap-3 rounded-2xl border border-white/10 bg-dark-card p-4 transition-colors hover:border-yellow/45"
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white/[0.06]">
                      {s.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={s.logo_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Store size={20} className="text-yellow" aria-hidden />
                      )}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block font-syne text-[17px] font-extrabold text-offwhite">
                        {s.name}
                      </span>
                      {/* Their own words for the work, straight from
                          trade_providers.trade — never a category we guessed. */}
                      <span className="mt-0.5 block font-dm text-[13px] text-muted">
                        {s.tagline?.trim() || p.trade}
                      </span>

                      <span className="mt-2 flex flex-wrap items-center gap-1.5">
                        {p.mobile && (
                          // The one fact a fulfilment setting cannot express:
                          // a service is not "delivered", somebody drives to you.
                          <Badge icon={Car}>They come to you</Badge>
                        )}
                        {p.takes_online_bookings ? (
                          <Badge icon={CalendarCheck}>Book online</Badge>
                        ) : (
                          <Badge icon={Phone}>Book by phone</Badge>
                        )}
                        {s.address?.trim() && (
                          <Badge icon={MapPin}>{s.address.trim()}</Badge>
                        )}
                      </span>
                    </span>

                    <ArrowRight
                      size={17}
                      className="mt-1 shrink-0 text-yellow"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </>
  );
}

/** A small fact about a business. Never a link — the whole card is one. */
function Badge({
  icon: Icon,
  children,
}: {
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-white/12 px-2 py-0.5 font-dm text-[11.5px] text-muted">
      <Icon size={11} className="shrink-0 text-yellow" aria-hidden />
      <span className="truncate">{children}</span>
    </span>
  );
}
