"use client";

import Link from "next/link";
import { iconFor, type BrowseCategory } from "@/components/WhatLookingFor";

/**
 * Airbnb-style sticky category pills at the top of every /browse page — one tap
 * to switch between Scooters / Cars / Restaurants / … Each pill carries its
 * category icon; the current one is highlighted in gold. Sticks under the fixed
 * navbar and scrolls horizontally.
 */
export default function BrowseTabs({ categories, active }: { categories: BrowseCategory[]; active: string }) {
  if (categories.length < 2) return null;
  return (
    <div className="sticky top-[72px] z-40 bg-dark/80 backdrop-blur-xl border-b border-white/5">
      <div className="max-w-7xl mx-auto px-6 py-3 flex gap-2.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {categories.map((c) => {
          const Icon = iconFor(c.slug, c.label);
          const isActive = c.slug === active;
          return (
            <Link
              key={c.slug}
              href={`/browse/${c.slug}`}
              aria-current={isActive ? "page" : undefined}
              className={`group shrink-0 inline-flex items-center gap-2 pl-3 pr-4 py-2.5 rounded-full text-sm font-syne font-bold transition-all duration-200 ${
                isActive
                  ? "bg-yellow text-dark shadow-[0_8px_22px_-8px_rgba(245,200,66,0.7)]"
                  : "bg-white/[0.04] border border-white/10 text-muted hover:text-offwhite hover:border-white/25 hover:bg-white/[0.07]"
              }`}
            >
              <span className={`flex items-center justify-center w-6 h-6 rounded-full ${isActive ? "bg-dark/10" : "bg-white/5"}`}>
                <Icon size={14} className={isActive ? "text-dark" : "text-yellow"} />
              </span>
              {c.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
