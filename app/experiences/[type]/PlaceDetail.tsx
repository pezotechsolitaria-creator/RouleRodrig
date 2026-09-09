import Image from "next/image";
import Link from "next/link";
import { Clock, Users, ChevronRight } from "lucide-react";
import type { RecommendedPlace } from "@/lib/defaults";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd, experienceLd, sellerLd } from "@/lib/schema";
import { placeListingHref } from "@/lib/place-href";
import { placeSlug } from "@/lib/place-slug";
import { placePrice, placeDeposit, GUIDE_FOR_PLACE } from "@/lib/place-detail";
import JsonLd from "@/components/JsonLd";
import AppPageHeader from "@/components/AppPageHeader";
import PlaceBookingButton from "@/components/experiences/PlaceBookingButton";
import WhatsAppButton from "@/components/WhatsAppButton";
import ScrollToTop from "@/components/ScrollToTop";

// ── ONE EXPERIENCE, ONE PAGE ────────────────────────────────────────────────
//
// Île aux Cocos is the thing most visitors to Rodrigues search for, and until
// now it had no address. It lived at `/browse/tours?place=rec-1784585562167` —
// a query parameter on a listing, which canonicals to the listing. Nothing to
// rank, nothing to paste into WhatsApp, nothing an assistant could cite.
//
// ── WHAT THIS PAGE IS BUILT FROM ────────────────────────────────────────────
// Only what the owner has actually entered. The listing carries a price, a
// deposit, a departure time, a capacity, seventeen highlights, nine photographs
// and a WhatsApp number — a substantial page without a word being invented.
// `description` is empty on this listing and the page does not paper over it:
// there is no filler paragraph here, and no generated prose about a boat trip
// nobody on this side has been on.

export default function PlaceDetail({
  place,
  businessWhatsApp,
}: {
  place: RecommendedPlace;
  businessWhatsApp?: string;
}) {
  const url = `${SITE_URL}/experiences/${placeSlug(place)}`;
  const price = placePrice(place);
  const deposit = placeDeposit(place);
  const images = (place.images ?? []).filter(Boolean);
  const hero = place.image || images[0];
  const guide = GUIDE_FOR_PLACE(place);
  const listing = placeListingHref(place);
  // The listing's own WhatsApp beats the business one: this excursion is run by
  // an operator with their own number, and sending a question about it to the
  // rental desk is how an enquiry dies.
  const whatsapp = place.whatsapp || businessWhatsApp;
  const desc = (place.description ?? "").trim();

  return (
    <>
      <JsonLd
        data={[
          breadcrumbLd([
            { name: "Home", url: SITE_URL },
            { name: "Experiences", url: `${SITE_URL}/experiences` },
            { name: place.name, url },
          ]),
          sellerLd(),
          {
            "@context": "https://schema.org",
            ...experienceLd({
              name: place.name,
              // THE PRICE, NOT THE DEPOSIT. experienceLd is normally fed
              // depositAmount, and on this listing that is Rs 1,000 against a
              // priceNote of "Rs 2000/Person" — so the site published half the
              // real figure as the Offer for its most-searched product. What a
              // customer pays is the price; the deposit is how they hold it.
              price,
              description: desc || undefined,
              image: hero,
              url,
            }),
          },
        ]}
      />

      <AppPageHeader title={place.name} titleAs="span" backHref={listing} />

      <main className="min-h-screen bg-dark px-4 pb-28 pt-4 text-offwhite">
        <div className="mx-auto max-w-3xl">
          <h1 className="font-syne text-2xl font-extrabold leading-tight md:text-4xl">
            {place.name}
          </h1>

          {/* Price, deposit, departure and capacity — the four things somebody
              asks before they ask anything else, and all four are already in
              the listing. */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            {place.priceNote ? (
              <span className="font-mono text-lg font-semibold tabular-nums text-yellow">
                {place.priceNote.trim()}
              </span>
            ) : null}
            {place.timeSlots?.length ? (
              <span className="inline-flex items-center gap-1.5 font-dm text-sm text-muted">
                <Clock size={14} /> Departs {place.timeSlots.join(", ")}
              </span>
            ) : null}
            {place.capacity ? (
              <span className="inline-flex items-center gap-1.5 font-dm text-sm text-muted">
                <Users size={14} /> Up to {place.capacity} people
              </span>
            ) : null}
          </div>

          {deposit && price && deposit < price ? (
            <p className="mt-2 font-dm text-sm text-muted">
              Rs {deposit.toLocaleString("en-US")} deposit confirms your place;
              the rest is settled with the operator.
            </p>
          ) : null}

          {hero ? (
            <div className="relative mt-5 aspect-[4/3] w-full overflow-hidden rounded-2xl bg-dark-card">
              <Image
                src={hero}
                alt={place.name}
                fill
                priority
                sizes="(max-width: 768px) 100vw, 768px"
                className="object-cover"
              />
            </div>
          ) : null}

          {desc ? (
            <p className="mt-5 max-w-prose font-dm text-base leading-relaxed text-offwhite/90">
              {desc}
            </p>
          ) : null}

          {place.highlights?.length ? (
            <>
              <h2 className="mt-7 font-syne text-lg font-bold">What it includes</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {place.highlights.filter(Boolean).map((h) => (
                  <li
                    key={h}
                    className="rounded-full border border-dark-control bg-dark-card px-3 py-1.5 font-dm text-sm text-offwhite"
                  >
                    {h}
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          <div className="mt-7 flex flex-wrap items-center gap-3">
            {place.bookable ? (
              <PlaceBookingButton
                place={place}
                whatsapp={whatsapp}
                label="Check dates & book"
              />
            ) : null}
            {whatsapp ? (
              <WhatsAppButton
                phone={whatsapp}
                message={`Hello, I would like to ask about ${place.name}.`}
              />
            ) : null}
          </div>

          {/* The guide page, where one exists. Île aux Cocos already has 4,000
              characters of real writing at /guide/ile-aux-cocos, and the answer
              to a thin booking page is to POINT at that rather than to restate
              it badly: two pages saying the same thing compete with each other,
              and only one of them can win. */}
          {guide ? (
            <Link
              href={guide.href}
              className="mt-7 flex items-center justify-between gap-3 rounded-2xl border border-dark-border bg-dark-card px-4 py-3.5 transition-colors hover:border-yellow/50"
            >
              <span className="min-w-0">
                <span className="block font-syne text-sm font-bold text-offwhite">
                  {guide.label}
                </span>
                <span className="mt-0.5 block font-dm text-xs text-muted">
                  What it is, when to go and what you will see.
                </span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-yellow" />
            </Link>
          ) : null}

          {images.length > 1 ? (
            <>
              <h2 className="mt-8 font-syne text-lg font-bold">Photos</h2>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {images.slice(1).map((src, i) => (
                  <div
                    key={src}
                    className="relative aspect-square overflow-hidden rounded-xl bg-dark-card"
                  >
                    <Image
                      src={src}
                      alt={`${place.name} — photo ${i + 2}`}
                      fill
                      loading="lazy"
                      sizes="(max-width: 640px) 50vw, 33vw"
                      className="object-cover"
                    />
                  </div>
                ))}
              </div>
            </>
          ) : null}

          <Link
            href={listing}
            className="mt-8 inline-flex items-center gap-1.5 font-dm text-sm text-muted hover:text-yellow"
          >
            See everything else like this <ChevronRight size={14} />
          </Link>
        </div>
      </main>

      <ScrollToTop />
    </>
  );
}
