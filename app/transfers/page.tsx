import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";
import AppPageHeader from "@/components/AppPageHeader";
import BookRide from "@/app/taxi/book/BookRide";
import BookingHeading from "@/app/taxi/book/BookingHeading";

// /transfers — the "planning ahead" half of getting around.
//
// It exists because /taxi could not do this job. That page is a DIRECTORY of
// drivers to ring right now; this one is a journey you arrange before you
// arrive.
//
// ── WHAT THIS PAGE USED TO BE, AND WHY NONE OF IT IS LEFT ───────────────────
//
// It was a WhatsApp form that touched none of the ride engine. It collected
// from/to as FREE TEXT with no coordinates, so it could never be priced —
// quote_ride() refuses with `need_locations` unless both ends carry lat/lng. It
// captured no phone number, produced no reference, could not be dispatched and
// could not be tracked. Its only real output was a wa.me link.
//
// It also recorded nothing at all: it POSTed `target` where /api/leads reads
// `target_name`, so every enquiry since June was refused with a 400 that
// nothing ever looked at. On production the day it was found — taxi 11 leads,
// food_concierge 8, stay_eat_do 6, tiroule_miss 2, transfer ZERO.
//
// Meanwhile `ride_requests` already modelled every field a transfer needs:
// service, scheduled_at, both ends with coordinates, passengers, luggage,
// flight_ref, meet_greet, name, phone, email — and ride_pricing already carried
// a seeded flat fare for `airport`. There was a working engine, and a parallel
// form beside it that ignored the whole thing.
//
// So this page keeps its URL and its metadata, which it earns on search, and
// everything between the header and the form is gone: a 126px h1 that wrapped
// to four lines, a 29px eyebrow, a 48px subtitle restating the h1, a 136px
// reassurance grid sitting between the visitor and the first field, and a 118px
// cross-sell offering a way out of a form already started. 457px of chrome
// around a form that could not work.
//
// One of those reassurances was also untrue: "Vehicle sized to your luggage".
// taxi_drivers.luggage_capacity is stored and never gates anything — only seats
// and the handles_* booleans do. It is not a promise the data can keep.
//
// ── AND THE DIRECTION ───────────────────────────────────────────────────────
// The old page said "Plan your journey before you land" and "Met at arrivals"
// above a form that could not express an arrival. BookRide hardcoded the
// airport as the DROP-OFF, so the only journey either surface could describe
// was one LEAVING the island. `initialDirection="from"` starts this page where
// its own visitors start: at Plaine Corail, needing to get somewhere.

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

export default function TransfersPage() {
  return (
    <>
      {/* Was the marketing <Navbar>: fixed, 78px, and on a phone it carried no
          back control at all — only a saved-hearts icon and a burger. The 96px
          of pt-24 underneath existed solely to clear it. */}
      <AppPageHeader showBack backHref="/" />

      <main className="min-h-[calc(100vh-3.5rem)] bg-dark px-4 pb-10 pt-3 text-offwhite">
        <div className="mx-auto max-w-lg">
          <BookingHeading variant="transfer" />

          <div className="mt-3">
            <BookRide initialService="airport" initialDirection="from" />
          </div>
        </div>
      </main>
    </>
  );
}
