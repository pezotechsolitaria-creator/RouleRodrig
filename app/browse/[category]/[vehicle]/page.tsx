import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, ChevronRight, MessageCircle } from "lucide-react";
import { SITE_URL } from "@/lib/site";
import {
  getFleetView,
  priceNumber,
  isSellableFleetItem,
} from "@/lib/site-data";
import { realCopy } from "@/lib/placeholder-copy";
import { costTiers } from "@/lib/vehicle-cost";
import { vehicleMetaTitle } from "@/lib/browse-copy";
import { breadcrumbLd, productLd, sellerLd } from "@/lib/schema";
import { pickConditions, rentalKindOf } from "@/lib/rental-conditions";
import { findVehicleUnits, unitToBook, vehicleName, vehicleSlug } from "@/lib/vehicle-slug";
import JsonLd from "@/components/JsonLd";
import RentalConditions from "@/components/RentalConditions";
import AppPageHeader from "@/components/AppPageHeader";
import VehicleActionBar from "@/components/VehicleActionBar";
import { whatsappHref } from "@/lib/whatsapp-link";
import ScrollToTop from "@/components/ScrollToTop";
import { metaDescription } from "@/lib/meta-description";
import { vehicleMetaDescription } from "@/lib/vehicle-meta";

// ── ONE VEHICLE, ONE URL ────────────────────────────────────────────────────
//
// Until now a vehicle's detail view was a modal: no route, no history entry,
// nothing to send. This business closes on WhatsApp — five of its ten reviews
// describe being met at a guest house — and the owner could not paste "here is
// the Avenis, Rs 699 a day, free delivery" into the conversation where the deal
// actually happens. Every thread dropped the customer on a category grid and
// asked them to find the bike again.
//
// This page is that link. Server-rendered, so WhatsApp, Google and an AI
// assistant all see the name, the price and the photo without running any
// JavaScript. It does NOT replace the modal — browsing the grid is still the
// faster way to compare — it gives the modal an address.

export const revalidate = 60;

// "Where people take it" (the block's own comment, below, says why these are
// hand-picked). Scooter and car are the two lists that shipped, unchanged.
// Every other category used to get the scooter list — "Scooter routes" under a
// motorbike or a kayak (architecture review 2026-09-30).
const TAKE_IT: Record<string, { href: string; label: string }[]> = {
  car: [
    { href: "/guide/routes", label: "Island routes" },
    { href: "/guide/beaches", label: "Best beaches" },
    { href: "/blog/how-many-days-in-rodrigues", label: "How many days you need" },
  ],
  scooter: [
    { href: "/guide/routes", label: "Scooter routes" },
    { href: "/guide/beaches", label: "Best beaches" },
    { href: "/guide/viewpoints", label: "Hidden viewpoints" },
  ],
};
/** Another motor category (motorbike, e-bike): the scooter's three places,
 *  without calling the vehicle a scooter. */
const TAKE_IT_MOTOR = [
  { href: "/guide/routes", label: "Island routes" },
  { href: "/guide/beaches", label: "Best beaches" },
  { href: "/guide/viewpoints", label: "Hidden viewpoints" },
];
/** Equipment is not driven anywhere, so no road routes: the beaches it is
 *  taken to, the island guide, and how long to stay. */
const TAKE_IT_EQUIPMENT = [
  { href: "/guide/beaches", label: "Best beaches" },
  { href: "/guide/rodrigues", label: "Island travel guide" },
  { href: "/blog/how-many-days-in-rodrigues", label: "How many days you need" },
];

type Props = { params: Promise<{ category: string; vehicle: string }> };

async function resolve(category: string, vehicle: string) {
  const { content, fleet, businessWhatsApp } = await getFleetView();
  // ── A DRAFT HAS NO PAGE ─────────────────────────────────────────────────
  // /browse/car/new-cars was live, indexable and IN THE SITEMAP, with the
  // meta description "Add a description for this car." and a price of
  // "From Rs 0/day". The listing already filtered these out; this route did
  // not, so the page stayed reachable and Google kept being invited to it.
  //
  // Treated as missing rather than rendered empty: there is no such vehicle to
  // rent, and a thin page in the index drags the whole car cluster with it.
  //
  // ── AND TWIN UNITS ARE ONE PAGE (architecture review 2026-09-30) ─────────
  // Two AVENIS rows share this URL. `item` is the unit a visitor can actually
  // book today (lib/vehicle-slug.ts unitToBook), not whichever row came first
  // — so "Fully booked" needs EVERY twin out, and ?v= names a free one.
  const units = findVehicleUnits(fleet, category, vehicle).filter(isSellableFleetItem);
  const item = unitToBook(units);
  return { content, fleet, businessWhatsApp, item };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category, vehicle } = await params;
  try {
    const { item } = await resolve(category, vehicle);
    if (!item) return {};
    const url = `${SITE_URL}/browse/${category}/${vehicleSlug(item)}`;
    // The price belongs in the title: it pre-qualifies the tap, and a link
    // pasted into a chat is read as a price quote whether or not we intended it.
    // SEO audit 2026-09-29 T5: "Toyota Hilux — Rs 2899/day in Rodrigues" had
    // no "rental" and an ungrouped price beside category titles that say
    // "Rs 1,899". vehicleMetaTitle keeps it inside 60 characters.
    const from = priceNumber(item.price);
    const title = vehicleMetaTitle(vehicleName(item), category, from);
    const description =
      // Specs, inclusions and the price, when there is a price — see
      // lib/vehicle-meta.ts. The owner's copy below is the fallback.
      vehicleMetaDescription({
        name: vehicleName(item),
        from,
        specs: item.specs,
        included: item.included,
      }) ||
      // realCopy: without it "Add a description for this car." became the
      // META DESCRIPTION — the sentence Google prints under the result.
      // metaDescription, not .slice(155): the owner's copy carries a
      // zero-width space and real newlines, and a hard slice cut one of these
      // mid-sentence on "…the perfect companion for". Same string feeds
      // og:description, which is the WhatsApp preview.
      metaDescription(realCopy(item.description) || realCopy(item.tagline)) ||
      `Rent the ${vehicleName(item)} on Rodrigues Island, direct from local owners.`;
    const image = item.images?.[0] || item.image;
    const images = [image?.startsWith("http") ? image : `${SITE_URL}${image ?? "/og-image.jpg"}`];
    return {
      title,
      description,
      alternates: { canonical: url },
      openGraph: { title, description, url, siteName: "Roule Rodrigues", type: "website", images },
      twitter: { card: "summary_large_image", title, description, images },
    };
  } catch {
    return {};
  }
}

export default async function VehiclePage({ params }: Props) {
  const { category, vehicle } = await params;
  const { content, businessWhatsApp, item } = await resolve(category, vehicle);
  if (!item) notFound();

  const slug = vehicleSlug(item);
  const url = `${SITE_URL}/browse/${category}/${slug}`;
  const photos = item.images?.length ? item.images : item.image ? [item.image] : [];
  // ── THE CATEGORY, NOT "SCOOTER OR CAR" (architecture review 2026-09-30) ──
  // The breadcrumb, the back link, the withdrawn notice and the guide links
  // were a car/scooter binary, so a kayak page said "All scooters". The label
  // is the owner's own ("Scooters", "Cars"), which reads exactly as before on
  // the two live categories. `kind` drops the licence/fuel/deposit terms and
  // the Car/Motorcycle schema on equipment; undefined is "motor", as today.
  const vcat = content.vehicleCategories.find((c) => c.id === category);
  const kind = rentalKindOf(content.vehicleCategories, category);
  const label =
    vcat?.label?.trim() ||
    (category === "car" ? "Cars" : category === "scooter" ? "Scooters" : "Rentals");
  const conditions = pickConditions(content.faq?.items, category, kind);
  const takeIt =
    TAKE_IT[category] ?? (kind === "equipment" ? TAKE_IT_EQUIPMENT : TAKE_IT_MOTOR);
  const from = priceNumber(item.price);
  // ── TWO DIFFERENT STATES, NOT ONE ─────────────────────────────────────────
  //
  // These were a single `out` flag, and they are opposite situations:
  //
  //   withdrawn   the owner has switched this vehicle off. It is not coming
  //               back this week, the booking form filters it out entirely,
  //               and nothing the visitor does can reserve it.
  //   busyToday   it exists and is rented right now. Picking dates is exactly
  //               the right next move.
  //
  // Conflated, a withdrawn vehicle told the visitor "Fully booked TODAY — pick
  // your dates", kept a live "Book the {vehicle}" button, and sent them to a
  // form built from `fleet.filter(s => s.available !== false)` — so the ?v=
  // prefill matched nothing and they landed on an empty "Choose a vehicle…"
  // with no explanation of why.
  //
  // Nothing is withdrawn in the fleet today, so this has never fired. It would
  // have fired on the owner's first use of the switch.
  //
  // ── A PAUSED CATEGORY WITHDRAWS EVERYTHING IN IT (review 2026-09-30) ─────
  // The owner pauses a whole category in /admin (he did it to Cars on
  // 2026-09-09). The category page then says "not available" (M190), but this
  // page ignored the switch: InStock in the schema, a live "Book the {vehicle}"
  // button, and that button landed on the paused page with no form on it. A
  // vehicle in a switched-off category cannot be reserved, which is exactly
  // what `withdrawn` means here, so it joins that branch. A category missing
  // from the list is left as it was — that is not a pause.
  const paused = vcat !== undefined && !vcat.enabled;
  const withdrawn = item.available === false || paused;
  const busyToday = item.soldOutToday === true;
  const out = withdrawn || busyToday;
  // "This car", "this scooter" — and for anything else the model's own name,
  // rather than calling a kayak a scooter.
  const noun =
    category === "car" ? "car" : category === "scooter" ? "scooter" : vehicleName(item);
  const askOnWhatsApp = whatsappHref(
    businessWhatsApp,
    `Hi Roule Rodrigues! I'd like to rent the ${vehicleName(item)}.`,
  );

  return (
    <>
      <JsonLd
        data={[
          breadcrumbLd([
            { name: "Home", url: SITE_URL },
            { name: label, url: `${SITE_URL}/browse/${category}` },
            { name: vehicleName(item), url },
          ]),
          // The Offer below names this seller; without the node the reference
          // resolves to nothing on the page carrying the price.
          { "@context": "https://schema.org", ...sellerLd() },
          {
            "@context": "https://schema.org",
            // The offer finally advertises the vehicle's OWN url. Every vehicle
            // used to point its Offer at the category page, so a shopping result
            // for the Avenis landed on a grid of everything.
            ...productLd({
              name: vehicleName(item),
              description:
                realCopy(item.description) ?? realCopy(item.tagline) ?? undefined,
              image: photos[0],
              price: from ?? null,
              category,
              rentalKind: kind,
              url,
              // Without this, schema.ts defaults to InStock — so a vehicle
              // the owner had switched off told Google it was available, on a
              // page that is in the sitemap. A paused category is switched
              // off too (see `paused` above).
              available: item.available !== false && !paused,
            }),
          },
          // ── FAQPage, and it is honest here ────────────────────────────
          // Google requires the questions to be VISIBLE on the page carrying
          // the markup. They are: <RentalConditions items={conditions} />
          // below renders this exact array, from the same pickConditions()
          // call, so the structured data and the readable panel cannot drift.
          //
          // This is the opposite of the fault the category page fixed: there,
          // FAQPage was published on /browse/stays and /browse/tours for eight
          // driving-licence questions that appeared nowhere in the text. Here
          // the panel was already on the page and the markup was missing.
          ...(conditions.length
            ? [
                {
                  "@context": "https://schema.org",
                  "@type": "FAQPage",
                  "@id": `${url}#faq`,
                  mainEntity: conditions.map((f) => ({
                    "@type": "Question",
                    name: f.question,
                    acceptedAnswer: { "@type": "Answer", text: f.answer },
                  })),
                },
              ]
            : []),
        ]}
      />

      <AppPageHeader title={vehicleName(item)} backHref={`/browse/${category}`} />

      <main className="bg-dark min-h-screen pb-24">
        <div className="mx-auto max-w-3xl px-4 pt-4">
          <Link
            href={`/browse/${category}`}
            className="inline-flex items-center gap-1.5 font-dm text-xs text-muted hover:text-yellow"
          >
            <ArrowLeft size={13} /> All {label.toLowerCase()}
          </Link>

          {/* Photos. Server-rendered so a pasted link previews the bike. */}
          {photos.length > 0 && (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {photos.slice(0, 4).map((src, i) => (
                <div
                  key={src + i}
                  className={`relative overflow-hidden rounded-2xl border border-white/10 ${i === 0 ? "sm:col-span-2 aspect-[16/10]" : "aspect-[4/3]"}`}
                >
                  <Image
                    src={src}
                    alt={`${vehicleName(item)} — photo ${i + 1}`}
                    fill
                    sizes="(max-width: 640px) 100vw, 640px"
                    className="object-cover"
                    priority={i === 0}
                  />
                </div>
              ))}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              {realCopy(item.tagline) && (
                <p className="font-bebas text-[11px] uppercase tracking-[0.2em] text-muted">{item.tagline}</p>
              )}
              <h1 className="font-syne text-3xl font-extrabold uppercase leading-none text-offwhite">
                {vehicleName(item)}
              </h1>
            </div>
            <p className="font-syne text-2xl font-extrabold text-yellow">
              {item.price}
              <span className="ml-1 font-dm text-sm text-muted">{item.unit}</span>
            </p>
          </div>

          {out && (
            <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 font-dm text-sm text-red-200">
              {withdrawn
                ? `This ${noun} is not available to rent at the moment. Message us and we will tell you what else is free for your dates.`
                : "Fully booked today — pick your dates and we will tell you the moment it is free."}
            </p>
          )}

          {item.description && (
            <p className="mt-4 font-dm text-sm leading-relaxed text-muted/90">{item.description}</p>
          )}

          {item.specs?.length ? (
            <ul className="mt-5 flex flex-wrap gap-2">
              {item.specs.map((s) => (
                <li
                  key={s}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 font-dm text-xs text-offwhite/80"
                >
                  {s}
                </li>
              ))}
            </ul>
          ) : null}

          {/* ── THE MULTI-DAY RATES, BEFORE THE CALENDAR ────────────────────
              The 10% (3+ days) and 15% (7+ days) discounts have always been
              real and were discoverable only AFTER picking dates — so a visitor
              comparing prices saw the day rate, multiplied it by seven in their
              head, and left. A week is where the margin is and it was the one
              number nobody could find.

              Computed with priceBreakdown(), the same function /api/bookings
              prices with, rather than from content.pricing — which renders on
              no public page, shows the car at Rs 0, and disagrees with the
              fleet about the scooter. A rate table that quotes a figure the
              checkout will not honour is worse than no table.

              Via costTiers() since SEO audit 2026-09-29 C18: /browse/car now
              prints the same table for every model, from the same helper. */}
          {(() => {
            const tiers = costTiers(item, content.vehicleCategories);
            if (tiers.length < 2) return null;
            return (
              <div className="mt-6 rounded-2xl border border-dark-border bg-dark-card p-6">
                {/* An h2, not a styled <p>. These four sections have always
                    existed on this page and none of them was a heading, so a
                    crawl saw 264-305 words of prose with ZERO structure on the
                    seven pages where somebody actually decides to rent. The
                    look is unchanged; the outline is not. */}
                <h2 className="mb-4 font-bebas text-[10px] tracking-[0.3em] text-yellow">
                  What it costs to hire
                </h2>
                <ul className="divide-y divide-white/5">
                  {tiers.map(({ days, label, rental, perDay, off }) => (
                    <li key={days} className="flex items-baseline justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                      <span className="font-dm text-sm text-offwhite/85">
                        {label}
                        {off > 0 && (
                          <span className="ml-2 rounded-full bg-yellow/15 px-2 py-0.5 font-bebas text-[10px] tracking-[0.12em] text-yellow">
                            {off}% OFF
                          </span>
                        )}
                      </span>
                      <span className="text-right">
                        <span className="font-syne text-base font-extrabold text-offwhite">
                          Rs {rental.toLocaleString("en-US")}
                        </span>
                        <span className="block font-dm text-[11px] text-muted">
                          Rs {perDay.toLocaleString("en-US")} / day
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 font-dm text-[11px] text-muted">
                  Rental only — delivery and the deposit are shown before you confirm.
                </p>
              </div>
            );
          })()}

          {item.included?.length ? (
            <div className="mt-6 rounded-2xl border border-dark-border bg-dark-card p-6">
              <h2 className="mb-4 font-bebas text-[10px] tracking-[0.3em] text-yellow">
                What is included
              </h2>
              <ul className="space-y-2">
                {item.included.map((inc) => (
                  <li key={inc} className="flex items-center gap-2.5 font-dm text-xs text-offwhite/75">
                    <Check size={13} className="shrink-0 text-yellow" />
                    {inc}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-4">
            <RentalConditions items={conditions} />
          </div>

          {/* ── WHERE PEOPLE TAKE IT ────────────────────────────────────────
              The money pages linked to no editorial content at all: ~4,000
              words of guides, four blog posts and eight French pages sat
              orphaned from the pages that sell, and a git grep found exactly
              ONE inbound link to the blog site-wide. That costs twice — a
              visitor who is not ready to book has nowhere to go but away, and
              the guides never inherit any authority from the commercial pages.

              Hand-picked per category rather than generated: three real
              destinations a person renting this vehicle would actually want,
              each verified 200 before being linked. A "related content" widget
              that guesses is how sites end up linking a car to a hiking trail. */}
          <div className="mt-8">
            <h2 className="mb-3 font-bebas text-[10px] tracking-[0.3em] text-muted">
              Where people take it
            </h2>
            <div className="grid gap-2 sm:grid-cols-3">
              {takeIt.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-dark-card px-4 py-3 font-dm text-xs text-offwhite/80 transition hover:border-yellow/40 hover:text-yellow"
                >
                  {l.label}
                  <ChevronRight size={14} className="shrink-0 opacity-60" />
                </Link>
              ))}
            </div>
          </div>

          {/* The booking form lives on the category page rather than being
              duplicated here. It pre-fills from ?v= — NOT from the hash, which
              is what this comment used to claim and what nothing ever read.
              Without the parameter this button delivered a customer who had
              already chosen a vehicle to an empty "Choose a vehicle…" form.
              The fragment stays last so the native scroll to #booking fires. */}
          {/* A WITHDRAWN vehicle gets the way out instead of the way in: the
              booking form cannot accept it, so "Book the {vehicle}" is a
              button that leads to an empty form. Busy-today keeps its Book
              link, because picking dates is genuinely the next step. */}
          {withdrawn ? (
            <>
              <Link
                href={`/browse/${category}`}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 px-5 py-4 font-syne text-base font-bold text-offwhite transition hover:border-yellow/40 hover:text-yellow"
              >
                See what else is available <ChevronRight size={17} />
              </Link>
              {/* The notice above says "Message us", and the sticky bar that
                  carried WhatsApp is not rendered for a vehicle that cannot be
                  booked (see below) — so the way to message is here. */}
              {askOnWhatsApp && (
                <a
                  href={askOnWhatsApp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-[#25D366]/40 bg-[#25D366]/12 px-5 py-4 font-syne text-base font-bold text-[#25D366] transition hover:brightness-110"
                >
                  <MessageCircle size={17} aria-hidden /> Ask us on WhatsApp
                </a>
              )}
            </>
          ) : (
            <Link
              href={`/browse/${category}?v=${item.id}#booking`}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-yellow px-5 py-4 font-syne text-base font-bold text-dark transition hover:brightness-110"
            >
              Book the {vehicleName(item)} <ChevronRight size={17} />
            </Link>
          )}
        </div>
      </main>

      {/* ── PRICE AND BOOK, WITHOUT SCROLLING ────────────────────────────
          Measured here at 393x852 before this: the first price sat at
          y=1,180 (1.4 screens down, under a full-bleed gallery) and the only
          booking control was at the bottom of a 3,816px page. Both questions
          a renter opens this page with needed scrolling to answer.

          The floating WhatsApp button is deliberately NOT rendered alongside
          it — the bar carries WhatsApp, and two entry points 40px apart is a
          worse screen, not a better one.

          Not rendered at all for a withdrawn vehicle (architecture review
          2026-09-30). Its button is always a booking link — "Check dates" to
          the ?v= form — and a withdrawn vehicle, or one in a paused category,
          is not in any form: the button led to an empty "Choose a vehicle…"
          or to a paused page with no form. The page keeps its price at the
          top and offers WhatsApp above instead. */}
      {!withdrawn && (
        <VehicleActionBar
          price={item.price}
          unit={item.unit}
          bookHref={`/browse/${category}?v=${item.id}#booking`}
          whatsappHref={askOnWhatsApp}
          vehicleName={vehicleName(item)}
          soldOut={out}
        />
      )}
      <ScrollToTop />
    </>
  );
}
