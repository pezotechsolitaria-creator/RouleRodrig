import type { Metadata } from "next";
import Link from "next/link";
import {
  Bike, ChevronRight, Compass, Mail, MapPin, Phone, ShoppingBag,
  Store, UtensilsCrossed,
} from "lucide-react";
import BackLink from "@/components/BackLink";
import Navbar from "@/components/Navbar";
import JsonLd from "@/components/JsonLd";
import { breadcrumbLd } from "@/lib/schema";
import { SITE_URL } from "@/lib/site";
import { getContent } from "@/lib/content";

export const revalidate = 3600;

// ── /about ──────────────────────────────────────────────────────────────────
//
// The last of the common guessed URLs with nowhere to point, and the only one
// that needed a page rather than a redirect: there was genuinely nothing on
// this site that said who runs it.
//
// ── EVERY CLAIM HERE IS ALREADY TRUE SOMEWHERE ELSE ────────────────────────
// The address, phone, email and hours come from the site_content row the owner
// edits — so they cannot drift from the footer and the contact block, and they
// are not repeated as literals here. What the business DOES is described by
// linking the sections that do it, which is checkable by clicking.
//
// Deliberately NOT stated: a founding year, a team size, a founder's name, or
// any "since 2015" flourish. None of those is written down anywhere I could
// verify, and an About page is the exact page where an invented fact does the
// most damage — it is the page a nervous customer reads before paying a
// stranger on a small island. lib/legal.ts already refuses to guess a BRN for
// the same reason.

const DESCRIPTION =
  "Who runs Roulé Rodrigues: a Rodrigues-based team in Baie aux Huîtres renting scooters and cars, and running the island's marketplace, food ordering, taxis and travel guides.";

export const metadata: Metadata = {
  title: "About Roulé Rodrigues — the local team behind the island's booking site",
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/about` },
  openGraph: {
    title: "About Roulé Rodrigues",
    description: DESCRIPTION,
    url: `${SITE_URL}/about`,
    type: "website",
  },
};

const WHAT_WE_DO = [
  { icon: Bike, href: "/browse/scooter", label: "Scooter & car rental", note: "Delivered where you are, helmets and support included." },
  { icon: Compass, href: "/taxi", label: "Taxis & airport transfers", note: "The fare shown before you book, no account needed." },
  { icon: UtensilsCrossed, href: "/food", label: "Home-cooked Rodriguan food", note: "Ordered from kitchens on the island, not a chain." },
  { icon: Store, href: "/shop", label: "The island marketplace", note: "Honey, piment, crafts — sold by the people who make them." },
  { icon: ShoppingBag, href: "/deliver", label: "Deliveries and errands", note: "Anything moved across the island by local drivers." },
  { icon: Compass, href: "/guide", label: "Island guides", note: "Beaches, hikes, food and viewpoints, written here." },
];

export default async function AboutPage() {
  const content = await getContent();
  const c = content.contact;

  return (
    <>
      <JsonLd
        data={[
          breadcrumbLd([
            { name: "Roule Rodrigues", url: SITE_URL },
            { name: "About", url: `${SITE_URL}/about` },
          ]),
          {
            "@context": "https://schema.org",
            "@type": "AboutPage",
            "@id": `${SITE_URL}/about#page`,
            url: `${SITE_URL}/about`,
            name: "About Roulé Rodrigues",
            description: DESCRIPTION,
            // REFERENCED, NOT REDEFINED. #organization is declared once, on the
            // homepage. Defining a second Organization here would give the same
            // company two nodes for a crawler to reconcile, and the richer one
            // would not necessarily win. An @id pointer is how JSON-LD says
            // "the thing you already know about".
            mainEntity: { "@id": `${SITE_URL}/#organization` },
            isPartOf: { "@id": `${SITE_URL}/#website` },
          },
        ]}
      />
      <Navbar
        branding={content.branding}
        announcementActive={false}
        showStayEatDo={content.recommended.enabled && content.recommended.items.length > 0}
        showRoutes={content.rideRoutes.length > 0}
        showEvents={content.events.some((e) => e.title)}
      />
      <main className="min-h-screen bg-dark text-offwhite">
        <div className="mx-auto max-w-3xl px-6 pb-24 pt-28 md:pt-32">
          <BackLink
            fallback="/more"
            iconSize={15}
            className="inline-flex items-center gap-2 font-dm text-sm text-muted transition-colors hover:text-yellow"
          >
            {" "}Back
          </BackLink>

          <p className="mt-6 font-bebas text-[11px] tracking-[0.3em] text-yellow">ABOUT US</p>
          <h1 className="mt-1 font-syne text-3xl font-extrabold uppercase leading-[0.95] sm:text-4xl">
            We are on the island
          </h1>

          <div className="mt-5 max-w-xl space-y-4 font-dm text-sm leading-relaxed text-muted">
            <p>
              Roulé Rodrigues started with scooters. Rent one, get it delivered wherever you are
              staying, and go and see the island properly — which on Rodrigues means the roads that
              do not appear on a hotel map.
            </p>
            <p>
              It grew into the rest of it because visitors kept asking the same questions after
              they had the keys. Where do I eat something actually Rodriguan? Who sells the real
              honey? How do I get to Trou d&apos;Argent without a car? So the site now also carries
              the island&apos;s marketplace, food from home kitchens, taxis, deliveries and a set of
              guides written by people who live here.
            </p>
            <p>
              <strong className="text-offwhite">Everything here is from Rodrigues.</strong> The
              shops are shops you can walk into, the cooks are cooking in their own kitchens, and
              the beach descriptions were written by somebody who had been to that beach. Prices are
              in rupees because that is the currency the island uses.
            </p>
          </div>

          <h2 className="mt-10 font-syne text-lg font-extrabold text-offwhite">What we do</h2>
          <ul className="mt-3 space-y-2.5">
            {WHAT_WE_DO.map((w) => (
              <li key={w.href}>
                <Link
                  href={w.href}
                  className="flex items-start gap-3 rounded-2xl border border-white/10 bg-dark-card p-4 transition-colors hover:border-yellow/40"
                >
                  <w.icon size={17} className="mt-0.5 shrink-0 text-yellow" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-syne text-sm font-bold text-offwhite">{w.label}</span>
                    <span className="mt-0.5 block font-dm text-xs leading-relaxed text-muted">
                      {w.note}
                    </span>
                  </span>
                  <ChevronRight size={16} className="mt-0.5 shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ul>

          {/* ── Where to find us ────────────────────────────────────────
              Read from the same content row as the footer and the contact
              block, so there is one address on this site rather than three
              that can disagree. */}
          <h2 className="mt-10 font-syne text-lg font-extrabold text-offwhite">Where to find us</h2>
          <div className="mt-3 space-y-2.5 rounded-2xl border border-white/10 bg-dark-card p-4 font-dm text-sm">
            {c.location && (
              <p className="flex items-start gap-2.5 text-muted">
                <MapPin size={15} className="mt-0.5 shrink-0 text-yellow" />
                <span className="text-offwhite/90">{c.location}</span>
              </p>
            )}
            {c.phone && (
              <p className="flex items-start gap-2.5">
                <Phone size={15} className="mt-0.5 shrink-0 text-yellow" />
                <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="text-offwhite/90 hover:text-yellow">
                  {c.phone}
                </a>
              </p>
            )}
            {c.email && (
              <p className="flex items-start gap-2.5">
                <Mail size={15} className="mt-0.5 shrink-0 text-yellow" />
                <a href={`mailto:${c.email}`} className="text-offwhite/90 hover:text-yellow">
                  {c.email}
                </a>
              </p>
            )}
            {c.hours && <p className="pl-[26px] text-muted">{c.hours}</p>}
          </div>

          <p className="mt-6 font-dm text-sm text-muted">
            Questions before you book?{" "}
            <Link href="/faq" className="font-bold text-yellow hover:underline">
              The FAQ
            </Link>{" "}
            answers the eleven we are asked most, and{" "}
            <Link href="/#contact" className="font-bold text-yellow hover:underline">
              our contact details
            </Link>{" "}
            reach a person on the island.
          </p>
        </div>
      </main>
    </>
  );
}
