import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";
import TrackLookup, { TrackIntro, TrackCovers, TrackAccountCard } from "./TrackLookup";

// /track — the universal activity centre.
//
// "Suivi" used to point at /manage-booking, which is the VEHICLE lookup. A
// customer tracking a food order, a shop order, an event ticket or a place
// booking had to know that the tab lied to them and find another page — and
// place bookings had no customer-facing tracking at all.
//
// noindex: this is an account-free lookup for a specific transaction, not a
// page anyone should arrive at from a search engine.
//
// ── WHY THE WORDS ARE NOT IN THIS FILE ─────────────────────────────────────
// This page stayed English in a trilingual product, which is worst exactly
// here: a customer reaches /track when something has gone quiet, and English is
// the last thing they need at that moment. The chosen language lives in
// localStorage, so a server component cannot read it — the three pieces below
// are client components that read it after mount and take their words from
// lib/track/copy.i18n.ts. The layout, the metadata and the ?ref= read stay
// here, on the server, where they belong.
//
// The metadata is the one thing still English on purpose: it is resolved per
// request on the server, there is nothing to read the language from, and this
// page is noindex — a browser tab is its only reader.
export const metadata: Metadata = {
  title: "Track your booking or order | Roulé Rodrigues",
  description:
    "Track anything you have booked or ordered on Roulé Rodrigues — scooter and car rentals, boat trips, massages, shop orders, food and event tickets.",
  alternates: { canonical: `${SITE_URL}/track` },
  robots: { index: false, follow: false },
};

export default async function TrackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.ref) ? sp.ref[0] : sp.ref;

  return (
    <main className="min-h-screen bg-dark px-4 pb-28 pt-10 text-offwhite">
      <div className="mx-auto max-w-lg">
        <TrackIntro />

        <div className="mt-5">
          <TrackLookup initialRef={(raw ?? "").slice(0, 40)} />
        </div>

        <TrackCovers />

        <TrackAccountCard />
      </div>
    </main>
  );
}
