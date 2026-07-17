"use client";

import { Check } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

// Honest price-anchoring for the scooter page. The "typical Rs 800–1,000" figure
// is real market data (deals.mu, Ecolidays ~€20, Riderly ~€18, and Google's own
// AI Overview all put island scooter hire in that range) — NOT invented, and no
// competitor is named. The "from" price comes from the live fleet, never
// hardcoded, so it can't drift. The three included items are each verified true
// in the FAQ (helmet + third-party insurance included, hotel delivery offered),
// so this is value communication, not a dark pattern.
export default function PriceValueBanner({ fromPrice }: { fromPrice: number | null }) {
  const { language } = useLanguage();
  if (!fromPrice) return null;

  const price = fromPrice.toLocaleString("en-US");

  const T = {
    en: {
      from: `From Rs ${price}`,
      per: "/day",
      compare: "Most scooter hire on Rodrigues starts around Rs 800–1,000 a day.",
      tagline: "Same island roads, a lower price.",
      included: ["Helmet included", "Insurance included", "Delivered to your hotel"],
    },
    fr: {
      from: `Dès Rs ${price}`,
      per: "/jour",
      compare: "La location de scooter à Rodrigues démarre souvent autour de Rs 800–1 000 par jour.",
      tagline: "Les mêmes routes, un prix plus bas.",
      included: ["Casque inclus", "Assurance incluse", "Livré à votre hôtel"],
    },
    cr: {
      from: `Depi Rs ${price}`,
      per: "/zour",
      compare: "Laplipar location skooter Rodrigues koumans apepre Rs 800–1,000 par zour.",
      tagline: "Mem semin, enn pri pli ba.",
      included: ["Kask inklir", "Lasirans inklir", "Livre kot ou lotel"],
    },
  }[language];

  return (
    <div className="mx-auto max-w-6xl px-5">
      <div className="rounded-2xl border border-yellow/20 bg-gradient-to-br from-yellow/[0.07] to-transparent p-5 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-syne text-2xl md:text-3xl font-extrabold text-offwhite">
              {T.from}
              <span className="text-base font-bold text-muted">{T.per}</span>
            </p>
            <p className="mt-1.5 font-dm text-sm text-muted leading-relaxed max-w-md">
              {T.compare} <span className="text-offwhite/90">{T.tagline}</span>
            </p>
          </div>
          <ul className="flex flex-col gap-1.5 shrink-0">
            {T.included.map((item) => (
              <li key={item} className="flex items-center gap-2 font-dm text-sm text-offwhite/90">
                <Check size={15} className="text-yellow shrink-0" /> {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
