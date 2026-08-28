import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, ChevronRight } from "lucide-react";
import { SITE_URL } from "@/lib/site";
import { getFleetView, priceNumber } from "@/lib/site-data";
import { breadcrumbLd, productLd } from "@/lib/schema";
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
