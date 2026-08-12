"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ShoppingCart } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCart, useCarts } from "@/lib/cart/CartContext";
import { centsToDecimalString } from "@/lib/money";
import type { ResolvedCartItem } from "@/app/api/cart/resolve/route";

// ── Shop chrome: the two navigation fixtures every marketplace leader ships ──
// (Wolt / Uber Eats / Deliveroo all share this exact anatomy):
//
//  1. ShopHeader — a sticky glass top bar with a BACK arrow (you can always
//     retreat one level without the browser chrome) and a cart icon whose
//     count badge is the always-visible answer to "did that add work?".
//  2. CartBar — the floating "View cart" pill above the tab bar. It appears
//     the moment the cart has items and follows the shopper across the
//     directory, storefront and product pages, carrying count + live total.
//
// Both read the same client cart context, so feedback is instant — no fetch
// stands between tapping "Add" and seeing the number move.

// The badge counts EVERY basket, not the shop's.
//
// This header is rendered on event pages too, and it hardcoded useCart("shop").
// So a concert-goer who had just reserved two tickets saw no badge, while
// someone with three jars of honey in the marketplace basket saw "3" on a
// concert page. Both are wrong in the same way: the number has to answer "did
// that add work?", and the shopper does not know which of three carts the
// platform filed their thing under. Total is the only honest answer, and /cart
// (where it leads) already separates them.
export function ShopHeader({ backHref, backLabel }: { backHref: string; backLabel: string }) {
  const { totalItemCount: itemCount, hydrated } = useCarts();
  const reduce = useReducedMotion();

  return (
    <div className="sticky top-0 z-30 -mx-4 mb-4 border-b border-white/10 bg-dark/85 px-4 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-4xl items-center justify-between">
        <Link
          href={backHref}
          className="group inline-flex items-center gap-2 font-dm text-sm font-medium text-muted transition-colors hover:text-offwhite"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 transition-colors group-hover:border-white/30">
            <ChevronLeft size={17} className="-ml-0.5" />
          </span>
          {backLabel}
        </Link>

        <Link
          href="/cart"
          aria-label={hydrated && itemCount > 0 ? `Cart, ${itemCount} item${itemCount === 1 ? "" : "s"}` : "Cart, empty"}
          className="relative flex h-11 w-11 items-center justify-center rounded-full border border-white/15 text-offwhite transition-colors hover:border-yellow/50 hover:text-yellow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow"
        >
          <ShoppingCart size={16} />
          <AnimatePresence>
            {hydrated && itemCount > 0 && (
              <motion.span
                key={itemCount}
                initial={reduce ? false : { scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.4, opacity: 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 24 }}
                className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-yellow px-1 font-dm text-[10px] font-bold leading-none text-dark"
              >
                {itemCount > 99 ? "99+" : itemCount}
              </motion.span>
            )}
          </AnimatePresence>
        </Link>
      </div>
    </div>
  );
}

export function CartBar() {
  const { cart, itemCount, hydrated } = useCart("shop");
  const pathname = usePathname() || "/";
  const reduce = useReducedMotion();
  const [subtotal, setSubtotal] = useState<number | null>(null);

  // The count comes straight from context (instant); the money figure needs a
  // live price lookup — same resolve endpoint the cart page trusts, debounced
  // so a quick +1+1+1 burst costs one request. The bar never waits for it.
  const itemsKey = cart?.items.map((i) => `${i.variantId}:${i.quantity}`).join(",") ?? "";
  useEffect(() => {
    if (!hydrated || !cart || cart.items.length === 0) {
      setSubtotal(null);
      return;
    }
    const items = cart.items;
    let cancelled = false;
    const t = setTimeout(() => {
      fetch("/api/cart/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((body: { items?: ResolvedCartItem[] } | null) => {
          if (cancelled || !body?.items) return;
          setSubtotal(body.items.reduce((sum, i) => sum + i.price * i.requestedQuantity, 0));
        })
        .catch(() => {});
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, itemsKey]);

  // The cart and checkout pages ARE the cart — the bar would be noise there.
  if (pathname.startsWith("/cart") || pathname.startsWith("/checkout")) return null;

  const visible = hydrated && itemCount > 0 && cart;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={reduce ? false : { y: 72, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { y: 72, opacity: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
          className="pointer-events-none fixed inset-x-0 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 md:bottom-6"
        >
          <Link
            href="/cart"
            className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-full bg-yellow py-3 pl-4 pr-5 font-dm text-sm font-bold text-dark shadow-[0_10px_36px_rgba(245,200,66,0.4)] transition-transform hover:scale-[1.02]"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-dark font-dm text-[11px] font-bold text-yellow">
              {itemCount > 99 ? "99+" : itemCount}
            </span>
            <span className="min-w-0 flex-1 truncate">
              View cart <span className="font-medium opacity-70">· {cart!.storeName}</span>
            </span>
            {subtotal !== null && <span className="shrink-0">Rs {centsToDecimalString(subtotal)}</span>}
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
