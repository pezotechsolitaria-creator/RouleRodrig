"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ShoppingBag, ArrowRight } from "lucide-react";
import { useCart } from "@/lib/cart/CartContext";
import { centsToDecimalString } from "@/lib/money";
import type { ResolvedCartItem } from "@/app/api/cart/resolve/route";

// The sticky "N items · Rs X · View order" bar.
//
// ── WHY IT RE-FETCHES INSTEAD OF ADDING UP THE CARD PRICES ─────────────────
// The cart in localStorage is {variantId, quantity} and NOTHING else — no
// price, ever. Trusting a price the client stored is how a customer sees Rs 420
// on this bar and is charged Rs 480 at checkout, because a dish was repriced
// while they browsed. So the total shown here comes from the same live
// /api/cart/resolve read the cart page uses, and create_order() still re-derives
// it a third time server-side (with the RR012 guard refusing any charge that
// does not match what was displayed).
//
// The cost is one small request per cart change, debounced. The alternative is
// a number that is occasionally a lie.

export default function FoodCartBar() {
  const { cart, hydrated, itemCount } = useCart("food");
  const [total, setTotal] = useState<number | null>(null);
  const [kitchen, setKitchen] = useState<string | null>(null);

  const key = cart ? JSON.stringify(cart.items) : "";

  useEffect(() => {
    if (!cart || cart.items.length === 0) {
      setTotal(null);
      return;
    }
    let cancelled = false;
    // Debounced: tapping + four times in a row is one request, not four.
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/cart/resolve", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ items: cart.items }),
        });
        if (!res.ok) return;
        const body = (await res.json()) as { items: ResolvedCartItem[] };
        if (cancelled) return;
        setTotal(body.items.reduce((sum, i) => sum + i.price * i.requestedQuantity, 0));
        setKitchen(body.items[0]?.storeName ?? null);
      } catch {
        // A failed resolve leaves the previous figure rather than showing a
        // wrong one: the bar's job is to be trustworthy, not always populated.
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [cart, key]);

  if (!hydrated || itemCount === 0) return null;

  // Lifted clear of BottomNav on mobile. Both were `fixed bottom-0 z-40`, so
  // they occupied exactly the same strip and stacked on top of each other: the
  // cart bar ended up buried under the nav and the last row of dishes was
  // chopped in half. The gradient stays anchored to bottom-0, so content still
  // fades out behind BOTH bars. md: drops the offset, since BottomNav is
  // md:hidden there.
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[calc(env(safe-area-inset-bottom)+5.25rem)] pt-3 md:pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
      {/* A gradient rather than a hard edge, so the content scrolls out from
          underneath it instead of being chopped off. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-32 bg-gradient-to-t from-dark via-dark/90 to-transparent" />
      <Link
        href="/cart"
        className="mx-auto flex max-w-2xl items-center gap-3 rounded-2xl bg-yellow px-4 py-3.5 text-dark shadow-[0_10px_30px_-8px_rgba(47,128,237,0.6)] transition-transform active:scale-[0.99]"
      >
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-dark/10">
          <ShoppingBag size={17} />
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-dark px-1 font-syne text-[11px] font-extrabold text-yellow">
            {itemCount}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-syne text-sm font-extrabold leading-tight">View your order</span>
          {kitchen && <span className="block truncate font-dm text-xs opacity-70">from {kitchen}</span>}
        </span>
        {total !== null && (
          <span className="font-syne text-base font-extrabold tabular-nums">
            Rs {centsToDecimalString(total)}
          </span>
        )}
        <ArrowRight size={17} className="shrink-0" />
      </Link>
    </div>
  );
}
