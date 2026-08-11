import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Bike, UtensilsCrossed, Store, Ticket, MapPin, User } from "lucide-react";
import { SITE_URL } from "@/lib/site";
import TrackLookup from "./TrackLookup";

// /track — the universal activity centre.
//
// "Suivi" used to point at /manage-booking, which is the VEHICLE lookup. A
// customer tracking a food order, a shop order, an event ticket or a place
// booking had to know that the tab lied to them and find another page — and
// place bookings had no customer-facing tracking at all.
//
// noindex: this is an account-free lookup for a specific transaction, not a
// page anyone should arrive at from a search engine.
export const metadata: Metadata = {
  title: "Track your booking or order | Roulé Rodrigues",
  description:
    "Track anything you have booked or ordered on Roulé Rodrigues — scooter and car rentals, boat trips, massages, shop orders, food and event tickets.",
  alternates: { canonical: `${SITE_URL}/track` },
  robots: { index: false, follow: false },
};

const COVERS = [
  { icon: Bike, label: "Scooter & car rentals" },
  { icon: MapPin, label: "Boat trips, fishing & massage" },
  { icon: UtensilsCrossed, label: "Food orders" },
  { icon: Store, label: "Shop orders" },
  { icon: Ticket, label: "Event tickets" },
];

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
        <Link href="/" className="inline-flex items-center gap-1.5 font-dm text-sm text-muted hover:text-yellow">
          <ArrowLeft size={14} /> Home
        </Link>

        <p className="mt-3 font-bebas text-[11px] tracking-[0.3em] text-yellow">TRACK</p>
        <h1 className="mt-1 font-syne text-3xl font-extrabold leading-[1.05] sm:text-4xl">
          Where is it?
        </h1>
        <p className="mt-2 font-dm text-sm text-muted">
          One reference, one email — whatever you booked or ordered.
        </p>

        <div className="mt-5">
          <TrackLookup initialRef={(raw ?? "").slice(0, 40)} />
        </div>

        {/* Naming everything this covers is the point: the old tab implied it
            was only for rentals, so nobody tried it for anything else. */}
        <ul className="mt-6 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {COVERS.map((c) => {
            const Icon = c.icon;
            return (
              <li key={c.label} className="flex items-center gap-2 font-dm text-xs text-muted">
                <Icon size={13} className="shrink-0 text-yellow/70" /> {c.label}
              </li>
            );
          })}
        </ul>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-dark-card px-5 py-4">
          <p className="inline-flex items-center gap-2 font-dm text-sm text-muted">
            <User size={15} className="text-yellow" />
            Have an account? Everything is already listed.
          </p>
          <Link href="/orders" className="font-dm text-sm font-bold text-yellow hover:underline">
            My orders →
          </Link>
        </div>
      </div>
    </main>
  );
}
