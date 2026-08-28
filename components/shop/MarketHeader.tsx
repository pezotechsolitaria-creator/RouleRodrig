"use client";

import Link from "next/link";
import { ChevronLeft, Search, ShoppingBag, Heart } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCarts } from "@/lib/cart/CartContext";
import { useSaved } from "@/lib/marketplace/saved";
import { useShopCopy } from "./ShopCopy";

// ── The commerce header: search IS the navigation ───────────────────────────
//
// Every marketplace a shopper already uses puts the search field in the top bar
// and leaves it there — Baymard's benchmark work names an exposed search field
// as a consistent trait of the highest-converting storefronts, and hiding it
// behind an icon as a measurable loss. The previous version of this page had a
// title, a sentence, a search box and three lines of reassurance stacked above
// the first product, which is roughly 400px of prose before anything could be
// bought.
//
// So: one row, sticky, and the field is the widest thing in it. Nothing here
// says what the page is — the products do that, one scroll-free glance below.
//
// The BACK CHEVRON is omitted on the marketplace root. It costs 44px of the
// field's width to repeat what the bottom tab bar already offers, and the root
// is not a place anyone needs rescuing from. Sub-pages keep it.
export default function MarketHeader({
  back, defaultQuery = "", action = "/shop/search",
}: {
  /**
   * `label` is a PLACE, and on the product page it is the shop's own name —
   * data, which never translates. `labelKey` is the additive opt-in for the
   * places that are ours to word ("Home", "the marketplace"); when it is set it
   * wins, and when it is absent the English `label` is used exactly as before.
   */
  back?: { href: string; label: string; labelKey?: "home" | "marketplace" };
  defaultQuery?: string;
  /** Category pages search within themselves; everything else hits /shop/search. */
  action?: string;
}) {
  const { totalItemCount, hydrated } = useCarts();
  const { count: savedCount, hydrated: savedHydrated } = useSaved();
  const reduce = useReducedMotion();
  const copy = useShopCopy();

  return (
    <div className="sticky top-0 z-30 -mx-4 mb-3 border-b border-white/10 bg-dark/90 px-4 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2">
        {back && (
          <Link
            href={back.href}
            aria-label={copy.header.backTo(
              back.labelKey ? copy.nav[back.labelKey] : back.label,
            )}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 text-offwhite transition-colors hover:border-white/30"
          >
            <ChevronLeft size={18} />
          </Link>
        )}

        {/* Capped on desktop. Stretched across a 1440px header the field was
            1232px wide, which is wider than any marketplace ships and reads as
            a layout accident rather than a search box. On a phone it still
            takes every pixel that is not a button. */}
        <form action={action} method="get" role="search" className="mr-auto min-w-0 flex-1 lg:max-w-xl">
          <div className="relative">
            <Search
              size={16}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              type="search"
              name="q"
              defaultValue={defaultQuery}
              enterKeyHint="search"
              placeholder={copy.header.searchPlaceholder}
              aria-label={copy.header.searchLabel}
              className="h-10 w-full rounded-full border border-white/15 bg-dark-card pl-9 pr-3 font-dm text-sm text-offwhite placeholder:text-muted focus:border-yellow/60 focus:outline-none"
            />
          </div>
        </form>

        {savedHydrated && savedCount > 0 && (
          <Link
            href="/shop/saved"
            aria-label={copy.header.savedLabel(savedCount)}
            className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 text-offwhite transition-colors hover:border-yellow/50 hover:text-yellow"
          >
            <Heart size={17} />
            <span className="absolute -right-1 -top-1 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-white/15 px-1 font-dm text-[10px] font-bold leading-none text-offwhite">
              {savedCount > 99 ? "99+" : savedCount}
            </span>
          </Link>
        )}

        <Link
          href="/cart"
          aria-label={hydrated && totalItemCount > 0 ? copy.header.bagLabel(totalItemCount) : copy.header.bagEmpty}
          className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 text-offwhite transition-colors hover:border-yellow/50 hover:text-yellow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow"
        >
          <ShoppingBag size={17} />
          <AnimatePresence>
            {hydrated && totalItemCount > 0 && (
              <motion.span
                key={totalItemCount}
                initial={reduce ? false : { scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.4, opacity: 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 24 }}
                className="absolute -right-1 -top-1 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-yellow px-1 font-dm text-[10px] font-bold leading-none text-dark"
              >
                {totalItemCount > 99 ? "99+" : totalItemCount}
              </motion.span>
            )}
          </AnimatePresence>
        </Link>
      </div>
    </div>
  );
}
