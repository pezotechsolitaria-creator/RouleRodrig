import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, ChevronRight } from "lucide-react";
import { SITE_URL } from "@/lib/site";
import { getFleetView, priceNumber } from "@/lib/site-data";
import { priceBreakdown } from "@/lib/booking-pricing";
import { breadcrumbLd, productLd, sellerLd } from "@/lib/schema";
import { pickConditions } from "@/lib/rental-conditions";
import { findVehicle, vehicleSlug } from "@/lib/vehicle-slug";
import JsonLd from "@/components/JsonLd";
import RentalConditions from "@/components/RentalConditions";
import AppPageHeader from "@/components/AppPageHeader";
import WhatsAppButton from "@/components/WhatsAppButton";
import ScrollToTop from "@/components/ScrollToTop";

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

type Props = { params: Promise<{ category: string; vehicle: string }> };

async function resolve(category: string, vehicle: string) {
  const { content, fleet, businessWhatsApp } = await getFleetView();
  const item = findVehicle(fleet, category, vehicle);
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
    const from = priceNumber(item.price);
    const title = from
      ? `${item.name} — Rs ${from}/day in Rodrigues`
      : `${item.name} — rent in Rodrigues`;
    const description =
      (item.description || item.tagline || "").slice(0, 155) ||
      `Rent the ${item.name} on Rodrigues Island, direct from local owners.`;
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
  const conditions = pickConditions(content.faq?.items);
  const from = priceNumber(item.price);
  const out = item.available === false || item.soldOutToday === true;

  return (
    <>
      <JsonLd
        data={[
          breadcrumbLd([
            { name: "Home", url: SITE_URL },
            { name: category === "car" ? "Cars" : "Scooters", url: `${SITE_URL}/browse/${category}` },
            { name: item.name, url },
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
              name: item.name,
              description: item.description || item.tagline || undefined,
              image: photos[0],
              price: from ?? null,
              category,
              url,
            }),
          },
        ]}
      />

      <AppPageHeader title={item.name} backHref={`/browse/${category}`} />

      <main className="bg-dark min-h-screen pb-24">
        <div className="mx-auto max-w-3xl px-4 pt-4">
          <Link
            href={`/browse/${category}`}
            className="inline-flex items-center gap-1.5 font-dm text-xs text-muted hover:text-yellow"
          >
            <ArrowLeft size={13} /> {category === "car" ? "All cars" : "All scooters"}
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
                    alt={`${item.name} — photo ${i + 1}`}
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
              {item.tagline && (
                <p className="font-bebas text-[11px] uppercase tracking-[0.2em] text-muted">{item.tagline}</p>
              )}
              <h1 className="font-syne text-3xl font-extrabold uppercase leading-none text-offwhite">
                {item.name}
              </h1>
            </div>
            <p className="font-syne text-2xl font-extrabold text-yellow">
              {item.price}
              <span className="ml-1 font-dm text-sm text-muted">{item.unit}</span>
            </p>
          </div>

          {out && (
            <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 font-dm text-sm text-red-200">
              Fully booked today — pick your dates and we will tell you the moment it is free.
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
              checkout will not honour is worse than no table. */}
          {(() => {
            const tiers = [1, 3, 7]
              .map((d) => ({ d, b: priceBreakdown(item, d, content.vehicleCategories) }))
              .filter((t): t is { d: number; b: NonNullable<typeof t.b> } => Boolean(t.b));
            if (tiers.length < 2) return null;
            const base = Math.round(tiers[0].b.rental / tiers[0].d);
            return (
              <div className="mt-6 rounded-2xl border border-dark-border bg-dark-card p-6">
                <p className="mb-4 font-bebas text-[10px] tracking-[0.3em] text-yellow">RATES</p>
                <ul className="divide-y divide-white/5">
                  {tiers.map(({ d, b }) => {
                    const perDay = Math.round(b.rental / d);
                    const off = base > 0 ? Math.round(100 - (perDay / base) * 100) : 0;
                    return (
                      <li key={d} className="flex items-baseline justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                        <span className="font-dm text-sm text-offwhite/85">
                          {d === 1 ? "1 day" : d === 7 ? "1 week" : `${d} days`}
                          {off > 0 && (
                            <span className="ml-2 rounded-full bg-yellow/15 px-2 py-0.5 font-bebas text-[10px] tracking-[0.12em] text-yellow">
                              {off}% OFF
                            </span>
                          )}
                        </span>
                        <span className="text-right">
                          <span className="font-syne text-base font-extrabold text-offwhite">
                            Rs {b.rental.toLocaleString()}
                          </span>
                          <span className="block font-dm text-[11px] text-muted">
                            Rs {perDay.toLocaleString()} / day
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 font-dm text-[11px] text-muted">
                  Rental only — delivery and the deposit are shown before you confirm.
                </p>
              </div>
            );
          })()}

          {item.included?.length ? (
            <div className="mt-6 rounded-2xl border border-dark-border bg-dark-card p-6">
              <p className="mb-4 font-bebas text-[10px] tracking-[0.3em] text-yellow">INCLUDED</p>
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
            <p className="mb-3 font-bebas text-[10px] tracking-[0.3em] text-muted">
              WHERE PEOPLE TAKE IT
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {(category === "car"
                ? [
                    { href: "/guide/routes", label: "Island routes" },
                    { href: "/guide/beaches", label: "Best beaches" },
                    { href: "/blog/how-many-days-in-rodrigues", label: "How many days you need" },
                  ]
                : [
                    { href: "/guide/routes", label: "Scooter routes" },
                    { href: "/guide/beaches", label: "Best beaches" },
                    { href: "/guide/viewpoints", label: "Hidden viewpoints" },
                  ]
              ).map((l) => (
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

          {/* The booking form lives on the category page and pre-fills from the
              hash, so this hands the customer straight to it with the vehicle
              already chosen rather than duplicating a second form here. */}
          <Link
            href={`/browse/${category}#booking`}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-yellow px-5 py-4 font-syne text-base font-bold text-dark transition hover:brightness-110"
          >
            Book the {item.name} <ChevronRight size={17} />
          </Link>
        </div>
      </main>

      <WhatsAppButton
        phone={businessWhatsApp}
        message={`Hi Roule Rodrigues! I'd like to rent the ${item.name}.`}
      />
      <ScrollToTop />
    </>
  );
}
