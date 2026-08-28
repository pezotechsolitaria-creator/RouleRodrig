import Link from "next/link";
import {
  Fish, Carrot, Flame, Utensils, Palette, Gift, Wheat, Sparkles, Package,
  Home, Shirt, Hammer, type LucideIcon,
} from "lucide-react";
import type { CategoryFacet } from "@/lib/marketplace/types";
import { productArt } from "@/lib/marketplace/product-art";
import { TCount } from "./ShopCopy";

// A category tile: an icon, the name, and how many things are actually in it.
//
// The COUNT is the point. A category grid without counts is a set of promises,
// and on a young marketplace half of them are empty — tapping one and finding
// nothing is the fastest way to teach someone the site has no stock. The RPC
// only returns categories with products, and this shows the number, so a tap
// can never land on an empty shelf.
//
// The icon comes from `categories.icon`, a short name the owner sets in admin.
// An unknown one falls back to a neutral package rather than to nothing, and the
// tint reuses the product-art palette so a category tile and the products
// inside it belong to the same colour family.
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

export default function CategoryTile({ category }: { category: CategoryFacet }) {
  const Icon = ICONS[category.icon ?? ""] ?? Package;
  const art = productArt(category.slug, category.name, category.name);

  return (
    <Link
      href={`/shop/c/${category.slug}`}
      className="group relative flex items-center gap-3 overflow-hidden rounded-2xl border border-white/10 p-4 transition-all hover:border-yellow/30 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow"
      style={{ background: `linear-gradient(135deg, ${art.from} 0%, ${art.to} 100%)` }}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-yellow ring-1 ring-inset ring-white/10">
        <Icon size={18} />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-dm text-sm font-semibold text-offwhite group-hover:text-yellow">
          {category.name}
        </span>
        <span className="block font-dm text-xs text-muted">
          <TCount k="counts.items" n={category.count} />
        </span>
      </span>
    </Link>
  );
}
