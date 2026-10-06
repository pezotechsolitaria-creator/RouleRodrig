"use client";

import { MessageCircle, Route, ShieldCheck, Truck } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import type { RentalKind } from "@/lib/rental-conditions";
import { RENT_COPY, rentLang } from "@/lib/rentals/copy";

// ── The trust row under the fleet: four plain lines ─────────────────────────
//
// Owner brief, 6 Oct 2026: "Insured · Delivered to your stay · No mileage cap ·
// WhatsApp if you need us", one line each — not a second booking form, not a
// slogan. It replaced "Free scooter delivery" (delivery is in the price, which
// the card says) and "Easy booking · Request in a minute" (there is no request
// any more: the sheet reserves).
//
// ── AND THEY HAVE TO BE IN THE READER'S LANGUAGE ───────────────────────────
// Client-rendered words, server-rendered markup, like the header and footer.
//
// ── THESE ARE PROMISES, SO THEY HAVE TO BE TRUE OF THE PAGE THEY ARE ON ────
// Each line is the owner's own FAQ answer in four words, and true of a car and
// a scooter alike: basic third-party insurance with every rental ("insurance"),
// delivery to the hotel or guest house ("delivery"), no mileage limit
// ("mileage"), WhatsApp any time ("breakdown").
//
// ── EQUIPMENT GETS ONLY THE PROMISES THAT HOLD FOR ANY RENTAL ──────────────
// A kayak is not insured third-party and has no mileage. It keeps delivery and
// WhatsApp, the two lines its own FAQ supports, and no invented third.

const ICONS = [ShieldCheck, Truck, Route, MessageCircle] as const;

export function trustLines(kind?: RentalKind): number[] {
  return kind === "equipment" ? [1, 3] : [0, 1, 2, 3];
}

export default function TrustBar({
  kind,
}: { category?: string; kind?: RentalKind } = {}) {
  const { language } = useLanguage();
  const lines = RENT_COPY[rentLang(language)].trust;
  const shown = trustLines(kind);
  return (
    <section aria-label="Why book with us" className="mx-auto max-w-5xl px-4 md:px-6">
      {/* Four columns only when there are four lines: equipment's two would
          sit stranded in the left half of a four-column row. */}
      <ul
        className={`grid grid-cols-1 gap-x-6 gap-y-3 border-y border-white/[0.08] py-5 sm:grid-cols-2 ${
          shown.length === 4 ? "lg:grid-cols-4" : ""
        }`}
      >
        {shown.map((i) => {
          const Icon = ICONS[i];
          return (
            <li key={i} className="flex items-center gap-2.5 font-dm text-sm text-offwhite/85">
              <Icon size={16} className="shrink-0 text-muted" aria-hidden />
              {lines[i]}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
