"use client";

import Link from "next/link";
import { ChevronRight, KeyRound } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import {
  RENTAL_COPY,
  categoryName,
  fromPerDay,
  rentalQuestion,
  type RentalLinkData,
} from "./rentals-copy";

// ── "RENTING A SCOOTER OR A CAR?" ON /shop ──────────────────────────────────
//
// Architecture review 2026-09-30, item 3. /shop is the URL most of the site
// calls "Marketplace", and a visitor who came to it for a scooter found only
// honey and baskets: rentals are their own engine at /browse, and /shop linked
// none of it. One compact card, AFTER the shelf so it never pushes a product
// down (the page's own measured rule), and deliberately outside the product
// facets and the product ItemList — a scooter is not a shop product and the
// markup must not say it is.
//
// A client leaf only for the words: the language lives in localStorage, and
// the server-rendered HTML is English, as for every /shop string (ShopCopy).

export default function RentalsLinkOut({ categories }: { categories: RentalLinkData[] }) {
  const { language } = useLanguage();
  if (categories.length === 0) return null;
  const copy = RENTAL_COPY[language];

  return (
    <section
      aria-labelledby="shop-rentals-title"
      className="mt-8 rounded-xl border border-white/10 bg-dark-card px-4 py-3"
    >
      <h2
        id="shop-rentals-title"
        className="flex items-center gap-2 font-syne text-sm font-extrabold text-offwhite"
      >
        <KeyRound size={15} className="shrink-0 text-yellow" aria-hidden />
        {rentalQuestion(
          categories.map((c) => c.id),
          language,
        )}
      </h2>
      <ul className="mt-1 flex flex-wrap gap-x-4">
        {categories.map((c) => (
          <li key={c.id}>
            <Link
              href={c.href}
              className="inline-flex min-h-11 items-center gap-1.5 font-dm text-xs text-offwhite hover:text-yellow"
            >
              <span className="font-semibold">{categoryName(c, language)}</span>
              {c.fromPerDay != null && (
                <span className="text-muted">· {fromPerDay(c.fromPerDay, language)}</span>
              )}
              <ChevronRight size={13} className="shrink-0 text-yellow" aria-hidden />
            </Link>
          </li>
        ))}
        <li>
          <Link
            href="/marketplace#rentals"
            className="inline-flex min-h-11 items-center font-dm text-xs font-semibold text-yellow hover:underline"
          >
            {copy.allRentals}
          </Link>
        </li>
      </ul>
    </section>
  );
}
