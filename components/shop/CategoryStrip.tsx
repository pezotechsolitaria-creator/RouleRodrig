import Link from "next/link";
import {
  Fish, Carrot, Flame, Utensils, Palette, Gift, Wheat, Sparkles, Package,
  Home, Shirt, Hammer, LayoutGrid, type LucideIcon,
} from "lucide-react";
import type { CategoryFacet } from "@/lib/marketplace/types";

// ── Categories as a swipeable rail, directly under the search field ─────────
//
// The pattern Wayfair and Target both settled on for mobile, and the reason is
// the same one this page needed: a shopper can start shopping without opening a
// menu, and it costs one row instead of a four-tile grid that pushed the first
// product off the screen entirely.
//
// It is also this design system's own signature spatial move — the horizontal
// snap rail — so density here is not a foreign body. What changed is the
// contents: tight commerce chips, not photo cards.
//
// The COUNT stays. The RPC only returns categories that have products, so a tap
// can never land on an empty shelf, and the number is what tells a visitor
// whether this island sells four things or four hundred.

const ICONS: Record<string, LucideIcon> = {
  fish: Fish,
  carrot: Carrot,
  honey: Sparkles,
  flame: Flame,
  utensils: Utensils,
  palette: Palette,
  gift: Gift,
  wheat: Wheat,
  home: Home,
  shirt: Shirt,
  hammer: Hammer,
};

export default function CategoryStrip({
  categories, activeSlug, allHref = "/shop/search",
}: {
  categories: CategoryFacet[];
  activeSlug?: string;
  allHref?: string;
}) {
  if (categories.length === 0) return null;

  const item =
    "flex w-[72px] shrink-0 snap-start flex-col items-center gap-1.5 text-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow";
  const tile =
    "flex h-14 w-14 items-center justify-center rounded-2xl border transition-colors";

  return (
    <nav
      aria-label="Shop by category"
      className="-mx-4 flex snap-x snap-mandatory gap-1 overflow-x-auto px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <Link href={allHref} className={item} aria-current={!activeSlug ? "page" : undefined}>
        <span
          className={`${tile} ${
            !activeSlug
              ? "border-yellow/60 bg-yellow/15 text-yellow"
              : "border-white/10 bg-dark-card text-muted"
          }`}
        >
          <LayoutGrid size={20} />
        </span>
        <span className={`font-dm text-[11px] leading-tight ${!activeSlug ? "text-yellow" : "text-muted"}`}>
          All
        </span>
      </Link>

      {categories.map((c) => {
        const Icon = ICONS[c.icon ?? ""] ?? Package;
        const active = activeSlug === c.slug;
        return (
          <Link
            key={c.slug}
            href={`/shop/c/${c.slug}`}
            className={item}
            aria-current={active ? "page" : undefined}
          >
            <span
              className={`${tile} relative ${
                active
                  ? "border-yellow/60 bg-yellow/15 text-yellow"
                  : "border-white/10 bg-dark-card text-offwhite/70 hover:border-white/25"
              }`}
            >
              <Icon size={20} />
              <span className="absolute -right-1 -top-1 rounded-full bg-white/12 px-1.5 font-dm text-[10px] font-semibold leading-[15px] text-offwhite/80">
                {c.count}
              </span>
            </span>
            {/* Two lines maximum: "Handicraft & Art" must not push the rail
                taller than the tiles it is labelling. */}
            <span
              className={`line-clamp-2 font-dm text-[11px] leading-tight ${
                active ? "text-yellow" : "text-muted"
              }`}
            >
              {c.name}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
