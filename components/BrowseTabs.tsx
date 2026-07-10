"use client";

import Link from "next/link";
import type { BrowseCategory } from "@/components/WhatLookingFor";

/**
 * Airbnb-style sticky category pills at the top of every /browse page — one tap
 * to switch between Scooters / Cars / Restaurants / … The current category is
 * highlighted. Sticks just under the fixed navbar and scrolls horizontally.
 */
export default function BrowseTabs({ categories, active }: { categories: BrowseCategory[]; active: string }) {
  if (categories.length < 2) return null;
  return (
    <div className="sticky top-[64px] z-40 bg-dark/85 backdrop-blur-xl border-b border-dark-border">
      <div className="max-w-7xl mx-auto px-6 py-3 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {categories.map((c) => {
          const isActive = c.slug === active;
          return (
            <Link
              key={c.slug}
              href={`/browse/${c.slug}`}
              aria-current={isActive ? "page" : undefined}
              className={`shrink-0 px-4 py-2 rounded-full text-sm font-syne font-bold transition-colors ${
                isActive
                  ? "bg-yellow text-dark"
                  : "bg-dark-card border border-dark-border text-muted hover:text-offwhite hover:border-yellow/40"
              }`}
            >
              {c.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
