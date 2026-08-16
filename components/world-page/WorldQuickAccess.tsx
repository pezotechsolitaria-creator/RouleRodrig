"use client";

import Link from "next/link";
import {
  Utensils, Umbrella, Footprints, Fish, Sailboat, Plane, CarTaxiFront, Mountain,
  ShoppingBag, PartyPopper, Map as MapIcon, CalendarRange, BookOpen, Bike, Car,
  BedDouble, Compass, HeartHandshake, Truck,
} from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { loc } from "@/lib/localize";
import type { QuickAccessItem } from "@/lib/defaults";
import SectionHeading from "./SectionHeading";
import Reveal from "./Reveal";

// The same icon keys the homepage uses, so a tile the owner adds in the content
// studio arrives here wearing the icon they picked.
const LOOKING_ICON: Record<string, React.ElementType> = {
  restaurant: Utensils, beach: Umbrella, hiking: Footprints, fishing: Fish,
  boat: Sailboat, plane: Plane, taxi: CarTaxiFront, viewpoint: Mountain,
  store: ShoppingBag, event: PartyPopper, map: MapIcon, planner: CalendarRange,
  guide: BookOpen, scooter: Bike, car: Car, stay: BedDouble, compass: Compass,
  massage: HeartHandshake, delivery: Truck,
};

/**
 * "What are you looking for?" — the homepage's grid, on a world page.
 *
 * ── A GRID, NOT A RAIL ────────────────────────────────────────────────────
 * Ten-ish tiles. As a horizontal rail this showed four and a half and hid the
 * rest behind a swipe that does not look like a swipe — a mistake this project
 * already made once on the homepage and fixed. A four-column grid shows every
 * one of them for about the same vertical space.
 *
 * Reads `content.quickAccess`, so it is the SAME list as the homepage: one
 * place to edit, and it can never say something different here.
 */
export default function WorldQuickAccess({
  id,
  title,
  subtitle,
  seeAll,
  items,
}: {
  id: string;
  title?: string;
  subtitle?: string;
  seeAll?: string;
  items: QuickAccessItem[];
}) {
  const { language } = useLanguage();
  if (!items.length) return null;

  return (
    <section id={id} className="mx-auto w-full max-w-6xl scroll-mt-20 px-5 lg:px-8">
      <SectionHeading title={title ?? ""} subtitle={subtitle} seeAll={seeAll} />

      <div className="mt-4 grid auto-rows-fr grid-cols-4 gap-2 sm:grid-cols-5 lg:mt-6 lg:grid-cols-8 lg:gap-3">
        {items.map((item, i) => {
          const Icon = LOOKING_ICON[item.icon] ?? Compass;
          return (
            <Reveal key={item.id} delay={Math.min(i, 7) * 35} className="h-full">
              <Link
                href={item.href}
                className="rr-cur-card flex h-full min-h-[74px] flex-col items-center justify-center gap-1.5 rounded-2xl px-1.5 py-3 text-center focus:outline-none focus-visible:ring-2"
                style={{ backgroundColor: "var(--cur-bg-card)" }}
              >
                <Icon size={17} strokeWidth={1.4} style={{ color: "var(--cur-copper)" }} />
                <span
                  className="font-dm text-[10px] font-medium leading-tight"
                  style={{ color: "rgba(242,235,225,0.86)" }}
                >
                  {loc(language, item.label, item.labelFr, item.labelCr)}
                </span>
              </Link>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
