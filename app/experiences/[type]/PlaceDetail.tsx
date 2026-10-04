import Image from "next/image";
import Link from "next/link";
import { Clock, CheckCircle, ChevronRight } from "lucide-react";
import type { RecommendedPlace } from "@/lib/defaults";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd, experienceLd, sellerLd } from "@/lib/schema";
import { placeListingHref } from "@/lib/place-href";
import { placeSlug } from "@/lib/place-slug";
import { placePrice, placeDeposit, GUIDE_FOR_PLACE } from "@/lib/place-detail";
import {
  gettingThere,
  howBookingWorks,
  placeFacts,
  providerOf,
  type Wheels,
} from "@/lib/experiences";
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
  wheels = [],
}: {
  place: RecommendedPlace;
  businessWhatsApp?: string;
  /** The rental categories bookable today (the route reads the fleet). None
   *  given, none offered: this component never guesses what is for hire. */
  wheels?: Wheels[];
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
  const provider = providerOf(place);
  const facts = placeFacts(place);
  const there = gettingThere(place, wheels);
  const included = (place.included ?? []).map((i) => i.trim()).filter(Boolean);
  // "Paying" exists only when the listing has an amount to charge — the same
  // test the booking form uses before it offers online or cash.
  const steps = howBookingWorks(
    provider ?? (place.serviceType === "massage" ? "the therapist" : "the operator"),
    Number(place.depositAmount) > 0,
  );

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
              // The same two fields the category page passes, so the one trip
              // is not "Skipper Arnaud, 90 minutes" there and an anonymous
              // #business Service here (SEO audit 2026-09-29 T1, C6).
              providerName: provider,
              durationMinutes:
                typeof place.durationMinutes === "number" ? place.durationMinutes : null,
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

          {/* Price and departure — the first things somebody asks, both
              already in the listing. Group size moved into the facts below,
              which read maxGuests first and fall back to this capacity. */}
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
          </div>

          {/* Who, where, how long, how many, which languages — one line per
              field the owner filled in, and no line for one he did not (SEO
              audit 2026-09-29 C6). Server-rendered, so a crawler reads it. */}
          {facts.length ? (
            <ul className="mt-4 grid gap-x-6 gap-y-1.5 font-dm text-sm text-offwhite/85 sm:grid-cols-2">
              {facts.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-yellow/80" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          ) : null}

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

          {/* What the price covers, from `included`. The highlights below were
              headed "What it includes" and hold what to BRING — so the sunrise
              hike "included" a hat and a water bottle while its real inclusions
              (the transfer, the food) were never shown (SEO audit 2026-09-29
              C6). */}
          {included.length ? (
            <>
              <h2 className="mt-7 font-syne text-lg font-bold">What&apos;s included</h2>
              <ul className="mt-3 space-y-1.5 font-dm text-sm text-offwhite/90">
                {included.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <CheckCircle size={15} className="mt-0.5 shrink-0 text-green-400" aria-hidden />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {place.highlights?.length ? (
            <>
              <h2 className="mt-7 font-syne text-lg font-bold">Good to know</h2>
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

          {/* The same request-first flow the FAQ describes, in the order it
              happens, including asking to pay in cash (M220) — worded as the
              request it is. Only where the booking button exists; a
              WhatsApp-only listing has no flow to explain. */}
          {place.bookable ? (
            <section className="mt-8 rounded-2xl border border-dark-border bg-dark-card/60 px-4 py-4">
              <h2 className="font-syne text-lg font-bold">How booking works</h2>
              <ol className="mt-3 space-y-2 font-dm text-sm leading-relaxed text-offwhite/85">
                {steps.map((s, i) => (
                  <li key={s} className="flex gap-2.5">
                    <span className="font-bebas text-yellow">{i + 1}</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
              <Link
                href="/legal/refunds"
                className="mt-3 inline-flex items-center gap-1 font-dm text-sm text-muted hover:text-yellow"
              >
                Cancellations and refunds <ChevronRight size={14} />
              </Link>
            </section>
          ) : null}

          {/* ── GETTING THERE (architecture review 2026-09-30, item 3) ──────
              The meeting point was a fact on the page and a dead end: the
              site rents what gets you there and books the airport run, and
              linked neither. gettingThere() decides whether the line is true
              for this listing (a real meeting point, the operator not already
              bringing you, not a chauffeur); the rentals are the categories
              the route found bookable today. Separate targets, not words in a
              sentence, so each one is 44px on a phone. */}
          {there ? (
            <section className="mt-8">
              <h2 className="font-syne text-lg font-bold">Getting there</h2>
              <p className="mt-2 font-dm text-sm leading-relaxed text-offwhite/85">
                You meet at {there.meet}.{" "}
                {there.wheels.length
                  ? "Need wheels to get there, or coming straight from the airport?"
                  : "Coming straight from the airport?"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {there.wheels.map((w) => (
                  <Link
                    key={w.href}
                    href={w.href}
                    className="inline-flex min-h-11 items-center gap-1 rounded-full border border-dark-control bg-dark-card px-4 font-dm text-sm text-offwhite transition-colors hover:border-yellow/50 hover:text-yellow"
                  >
                    Rent a {w.noun} <ChevronRight size={14} className="text-yellow" />
                  </Link>
                ))}
                <Link
                  href="/transfers"
                  className="inline-flex min-h-11 items-center gap-1 rounded-full border border-dark-control bg-dark-card px-4 font-dm text-sm text-offwhite transition-colors hover:border-yellow/50 hover:text-yellow"
                >
                  Airport transfer <ChevronRight size={14} className="text-yellow" />
                </Link>
              </div>
            </section>
          ) : null}

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
                {/* The guide's own line: "what you will see" under a hike
                    would describe the wrong page (architecture review
                    2026-09-30, item 3). */}
                <span className="mt-0.5 block font-dm text-xs text-muted">{guide.blurb}</span>
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
