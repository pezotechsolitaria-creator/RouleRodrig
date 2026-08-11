import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Plane, Clock, ShieldCheck, Car } from "lucide-react";
import { getFleetView } from "@/lib/site-data";
import { SITE_URL } from "@/lib/site";
import Navbar from "@/components/Navbar";
import ScrollToTop from "@/components/ScrollToTop";
import TransferRequest from "./TransferRequest";

// /transfers — the "planning ahead" half of getting around.
//
// It exists because /taxi could not do this job. That page is a DIRECTORY of
// drivers to ring right now; this one is a journey you arrange before you
// arrive. Both quick actions used to point at /taxi, which is why the homepage
// looked like it had a duplicate tile.
export const revalidate = 600;

const DESCRIPTION =
  "Book an airport transfer in Rodrigues — Plaine Corail to Port Mathurin, your hotel or anywhere on the island. Tell us the flight, the passengers and the luggage, and we arrange the vehicle.";

export const metadata: Metadata = {
  title: "Airport transfers in Rodrigues | Roulé Rodrigues",
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/transfers` },
  openGraph: {
    title: "Airport transfers in Rodrigues | Roulé Rodrigues",
    description: DESCRIPTION,
    url: `${SITE_URL}/transfers`,
    type: "website",
    images: [`${SITE_URL}/og-image.jpg`],
  },
};

const POINTS = [
  { icon: Plane, en: "Met at arrivals", fr: "Accueil à l'arrivée" },
  { icon: Car, en: "Vehicle sized to your luggage", fr: "Véhicule adapté aux bagages" },
  { icon: Clock, en: "Fixed time, agreed ahead", fr: "Horaire fixé à l'avance" },
  { icon: ShieldCheck, en: "Local drivers we know", fr: "Chauffeurs locaux de confiance" },
];

export default async function TransfersPage() {
  const { content, businessWhatsApp } = await getFleetView();

  return (
    <>
      <Navbar
        branding={content.branding}
        announcementActive={false}
        showStayEatDo={content.recommended.enabled && content.recommended.items.length > 0}
        showRoutes={content.rideRoutes.length > 0}
        showEvents={content.events.some((e) => e.title)}
      />

      <main className="min-h-screen bg-dark px-4 pb-28 pt-24 text-offwhite md:pt-28">
        <div className="mx-auto max-w-lg">
          <Link href="/" className="inline-flex items-center gap-1.5 font-dm text-sm text-muted hover:text-yellow">
            <ArrowLeft size={14} /> Home
          </Link>

          <p className="mt-3 font-bebas text-[11px] tracking-[0.3em] text-yellow">TRANSFERS</p>
          <h1 className="mt-1 font-syne text-3xl font-extrabold leading-[1.05] sm:text-4xl">
            Plan your journey
            <br />
            <span className="text-yellow">before you land.</span>
          </h1>
          <p className="mt-2 font-dm text-sm text-muted">
            Airport pickups, hotel transfers and island trips arranged ahead of time.
          </p>

          <ul className="mt-5 grid grid-cols-2 gap-2">
            {POINTS.map((p) => {
              const Icon = p.icon;
              return (
                <li
                  key={p.en}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 font-dm text-xs text-offwhite/90"
                >
                  <Icon size={14} className="shrink-0 text-yellow" /> {p.en}
                </li>
              );
            })}
          </ul>

          <div className="mt-6">
            <TransferRequest whatsapp={businessWhatsApp} />
          </div>

          {/* The other intent, one tap away and clearly labelled as different —
              this is the distinction the two identical tiles used to hide. */}
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-dark-card px-5 py-4">
            <p className="font-dm text-sm text-muted">
              Need a ride <span className="text-offwhite">right now</span> instead?
            </p>
            <Link href="/taxi" className="font-dm text-sm font-bold text-yellow hover:underline">
              See taxi drivers →
            </Link>
          </div>
        </div>
      </main>
      <ScrollToTop />
    </>
  );
}
