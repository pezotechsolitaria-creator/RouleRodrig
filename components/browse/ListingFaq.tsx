"use client";

import { useLanguage } from "@/context/LanguageContext";
import type { FaqItem } from "@/lib/experiences-faq";

// ── THE QUESTIONS UNDER /browse/tours AND /browse/activities ────────────────
// Architecture review 2026-09-30, item 2. The rental FAQ was taken off these
// pages because it answered driving-licence questions on a page of boat trips;
// what they get instead is lib/experiences-faq.ts listingFaq(), the hub's own
// answers kept only where they are true of the listings shown, with the price
// range read off those cards.
//
// The page builds both languages on the server and hands them here, because
// the English is also what its FAQPage markup says: the server HTML (language
// "en") and the structured data are one list. A visitor who switches to French
// reads the French. Kreol reads the French too — the module's rule for these
// answers, until the owner supplies Kreol wording.
//
// Always open, not <details>: four short answers, and nothing a visitor has to
// find a toggle for.

export type ListingFaqCopy = { heading: string; items: FaqItem[] };

export default function ListingFaq({ en, fr }: { en: ListingFaqCopy; fr: ListingFaqCopy }) {
  const { language } = useLanguage();
  const copy = language === "en" ? en : fr;
  if (copy.items.length === 0) return null;

  return (
    <div className="mx-auto max-w-5xl px-4 pt-2 md:px-6">
      <section className="mt-7 border-t border-white/10 pt-8">
        <h2 className="font-syne text-lg font-extrabold leading-tight text-offwhite md:text-xl">
          {copy.heading}
        </h2>
        <dl className="mt-4 max-w-2xl space-y-5">
          {copy.items.map((f) => (
            <div key={f.question}>
              <dt className="font-dm text-[15px] font-bold text-offwhite">{f.question}</dt>
              <dd className="mt-1.5 font-dm text-[15px] leading-relaxed text-muted">{f.answer}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
