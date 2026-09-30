"use client";

import type { ReactNode } from "react";
import { useFoodCopy } from "@/components/food/FoodCopy";
import type { KitchenLine } from "@/lib/food/copy.i18n";

// ── "RESTAURANTS IN RODRIGUES" LANDED ON A PAGE THAT NEVER SAID IT ──────────
//
// SEO audit 2026-09-29 C21: /food ranks for "restaurants in rodrigues" and its
// only heading was "What are you hungry for?". This is the heading that query
// is looking for, and one sentence per kitchen built from the data the page
// already read — no restaurant is named that food_home() did not return.
//
// A client leaf for the language only, like every other word on /food: the
// provider starts on "en", so the server HTML carries the English sentence.
// `children` is the concierge card, which stays server-rendered by the page.

export default function RestaurantsIntro({
  kitchens,
  children,
}: {
  kitchens: KitchenLine[];
  children?: ReactNode;
}) {
  const r = useFoodCopy().restaurants;
  return (
    <section className="mt-12">
      <h2 className="font-syne text-lg font-extrabold text-offwhite">{r.title}</h2>
      {kitchens.length === 1 ? (
        <p className="mt-2 font-dm text-sm leading-relaxed text-muted">{r.one(kitchens[0])}</p>
      ) : (
        kitchens.length > 1 && (
          <ul className="mt-2 space-y-1 font-dm text-sm leading-relaxed text-muted">
            {kitchens.map((k) => (
              <li key={k.name}>{r.many(k)}</li>
            ))}
          </ul>
        )
      )}
      {children}
    </section>
  );
}
