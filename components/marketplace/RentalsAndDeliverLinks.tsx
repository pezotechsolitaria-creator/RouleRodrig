"use client";

import Link from "next/link";
import { ArrowRight, Bike, Car, KeyRound, Truck } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { RENTAL_COPY, categoryName, fromPerDay, type RentalLinkData } from "./rentals-copy";

// ── RENTALS AND /deliver FROM /explore ──────────────────────────────────────
//
// Architecture review 2026-09-30, item 4. /explore linked stays and tours but
// not one rental page and not /deliver, so a visitor who opened the "show me
// what there is" page could not reach the things the site mostly sells. Each
// row is a direct link to the page that sells it — the category's own /browse
// page with its live "from" price, and /deliver.
//
// Rendered by app/explore/page.tsx straight after ExploreClient, which is
// another file's territory. That <main> ends in pb-24 of empty space, so this
// pulls up into half of it (-mt-12) rather than opening a 96px hole above its
// heading; the site footer follows. A client leaf only because the words
// follow the chosen language.

function iconFor(id: string) {
  if (/scooter|moto|bike/.test(id)) return Bike;
  if (/car/.test(id)) return Car;
  return KeyRound;
}

export default function RentalsAndDeliverLinks({
  categories,
}: {
  categories: RentalLinkData[];
}) {
  const { language } = useLanguage();
  const copy = RENTAL_COPY[language];

  const rows = [
    ...categories.map((c) => ({
      key: c.id,
      href: c.href,
      icon: iconFor(c.id),
      title: categoryName(c, language),
      note: c.fromPerDay != null ? fromPerDay(c.fromPerDay, language) : null,
    })),
    { key: "deliver", href: "/deliver", icon: Truck, title: copy.deliver, note: copy.deliverNote },
  ];

  return (
    <section aria-labelledby="explore-rentals-title" className="relative -mt-12 bg-dark pb-16">
      <div className="mx-auto max-w-3xl px-5">
        <h2 id="explore-rentals-title" className="mb-3 font-syne text-lg font-bold text-offwhite">
          {copy.heading}
        </h2>
        <div className="space-y-2.5">
          {rows.map((r) => (
            <Link
              key={r.key}
              href={r.href}
              className="group flex min-h-14 items-center gap-3 rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-white/[0.01] px-3.5 py-3 transition-colors hover:border-yellow/40"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-yellow/10 text-yellow ring-1 ring-inset ring-yellow/15">
                <r.icon size={17} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-syne text-[14px] font-bold leading-tight text-offwhite">
                  {r.title}
                </span>
                {r.note && (
                  <span className="mt-0.5 block font-dm text-[11.5px] leading-snug text-muted">
                    {r.note}
                  </span>
                )}
              </span>
              <ArrowRight size={16} className="shrink-0 text-yellow" aria-hidden />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
