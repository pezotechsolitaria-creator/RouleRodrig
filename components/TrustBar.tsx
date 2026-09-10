"use client";

import { ShieldCheck, BadgePercent, MessageCircle, CalendarCheck } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

// ── AND THEY HAVE TO BE IN THE READER'S LANGUAGE ───────────────────────────
//
// This was a server component with twelve hardcoded English strings, sitting
// directly under a French h1 for anyone reading the site in French. "use
// client" costs nothing here — it renders no data and fetches nothing — and
// the bar still server-renders, exactly like the header and footer do.

// ── THESE ARE PROMISES, SO THEY HAVE TO BE TRUE OF THE PAGE THEY ARE ON ────
//
// This bar renders on /browse/[category] — which is the CAR page as well as the
// scooter one — and both of the first two items were false there. A helmet is
// not included with a car, and car delivery is not free: car delivery was
// priced separately at the time. (Both figures in this note are now stale —
// the owner set car delivery to Rs 0 and the cheapest car to Rs 1,899.)
// The page was telling a car customer, in a bar headed "Why book with us", two
// things the checkout would then contradict.
//
// The last two are true of any rental and do not vary.
type Item = {
  icon: typeof ShieldCheck;
  title: { en: string; fr: string; cr: string };
  desc: { en: string; fr: string; cr: string };
};

const SHARED: Item[] = [
  {
    icon: MessageCircle,
    title: { en: "WhatsApp support", fr: "Assistance WhatsApp", cr: "Sipor WhatsApp" },
    desc: {
      en: "Real people, fast replies",
      fr: "De vraies personnes, des réponses rapides",
      cr: "Vre dimoun, repons rapid",
    },
  },
  {
    icon: CalendarCheck,
    title: { en: "Easy booking", fr: "Réservation facile", cr: "Rezervasion fasil" },
    desc: {
      en: "Request in a minute",
      fr: "Une demande en une minute",
      cr: "Enn demann dan enn minit",
    },
  },
];

const SCOOTER: Item[] = [
  {
    icon: ShieldCheck,
    title: { en: "Helmet included", fr: "Casque inclus", cr: "Kask inklir" },
    desc: {
      en: "Every rental, no extra charge",
      fr: "Sur chaque location, sans supplément",
      cr: "Lor sak lokasion, san peye plis",
    },
  },
  // WAS "Multi-day discounts", which stopped being true when the automatic
  // 10%/15% tiers came out of lib/booking-pricing.ts (M159). Free scooter
  // delivery is the offer that IS real, and is now priced that way.
  {
    icon: BadgePercent,
    title: {
      en: "Free scooter delivery",
      fr: "Livraison de scooter gratuite",
      cr: "Livrezon skooter gratis",
    },
    desc: {
      en: "Brought to where you are staying",
      fr: "Apporté là où vous logez",
      cr: "Amene kot ou reste",
    },
  },
];

// What a car actually offers, in the same shape. Delivered rather than free,
// and the thing a family choosing a car over a scooter is really buying.
const CAR: Item[] = [
  {
    icon: ShieldCheck,
    title: { en: "Air conditioning", fr: "Climatisation", cr: "Erkondisyone" },
    desc: {
      en: "Automatic, insured, ready to drive",
      fr: "Automatique, assurée, prête à conduire",
      cr: "Otomatik, asire, pare pou roule",
    },
  },
  {
    icon: BadgePercent,
    title: { en: "Delivered to you", fr: "Livrée chez vous", cr: "Livre kot ou" },
    desc: {
      en: "To your guest house or the airport",
      fr: "À votre pension ou à l'aéroport",
      cr: "Kot ou pansion ou bien laeroport",
    },
  },
];

export default function TrustBar({ category }: { category?: string } = {}) {
  const { language } = useLanguage();
  const ITEMS = [...(category === "car" ? CAR : SCOOTER), ...SHARED];
  return (
    <section className="bg-dark border-y border-dark-border" aria-label="Why book with us">
      <div className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-5">
        {ITEMS.map(({ icon: Icon, title, desc }) => (
          <div key={title.en} className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-yellow/10 flex items-center justify-center shrink-0">
              <Icon size={18} className="text-yellow" />
            </div>
            <div className="min-w-0">
              <p className="font-syne font-bold text-offwhite text-sm leading-tight">
                {title[language] ?? title.en}
              </p>
              <p className="font-dm text-muted text-xs leading-tight mt-0.5">
                {desc[language] ?? desc.en}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
