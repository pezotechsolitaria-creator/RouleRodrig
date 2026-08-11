"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Minus, Plus, Trash2, ShoppingCart, ArrowLeft, ImageOff, AlertTriangle,
  UtensilsCrossed, Store, Ticket,
} from "lucide-react";
import { useCarts, useCart, CART_DOMAINS, type CartDomain } from "@/lib/cart/CartContext";
import { centsToDecimalString } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ResolvedCartItem } from "@/app/api/cart/resolve/route";

// ── ONE PAGE, THREE BASKETS ────────────────────────────────────────────────
//
// There is a separate cart for food, for the marketplace and for tickets (see
// lib/cart/CartContext.tsx for why). This page shows every one that has
// something in it, each with its own total and its own Checkout button, because
// each becomes its OWN order — orders.store_id is singular, and a dish and a
// concert ticket can never be one row.
//
// The alternative — one basket per page, chosen by a query parameter — hides
// from the customer that they have something waiting elsewhere. Showing all of
// them is the whole point of splitting them up: you can hold dinner AND tickets
// and pay for them one at a time, instead of being asked to throw one away.
//
// The per-domain nouns live here rather than in lib/food/vocabulary.ts because
// that module answers a different question — "is this seller a kitchen or a
// shop" for pages that serve ONE order. This page knows its domain outright.

const SECTION: Record<CartDomain, {
  title: string; icon: React.ElementType; browseHref: string; browseLabel: string;
}> = {
  food: {
    title: "Your food order",
    icon: UtensilsCrossed,
    browseHref: "/food",
    browseLabel: "Add more dishes",
  },
  shop: {
    title: "Your shop basket",
    icon: Store,
    browseHref: "/shop",
    browseLabel: "Continue shopping",
  },
  events: {
    title: "Your tickets",
    icon: Ticket,
    browseHref: "/events",
    browseLabel: "See what's on",
  },
};

export default function CartPage() {
  const { carts, hydrated } = useCarts();
  const active = CART_DOMAINS.filter((d) => (carts[d]?.items.length ?? 0) > 0);

  return (
    <main className="min-h-screen bg-dark px-4 pb-32 pt-10 text-offwhite">
      <div className="mx-auto max-w-2xl">
        <Link href="/" className="inline-flex items-center gap-1.5 font-dm text-sm text-muted hover:text-yellow">
          <ArrowLeft size={14} /> Home
        </Link>

        <h1 className="mt-3 font-syne text-2xl font-extrabold text-offwhite">
          {active.length > 1 ? "Your orders" : "Your order"}
        </h1>
        {active.length > 1 && (
          <p className="mt-1 font-dm text-sm text-muted">
            These are paid for separately — a kitchen, a shop and an event are three different orders.
          </p>
        )}

        {!hydrated ? (
          <div className="mt-6 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl bg-white/[0.04]" />
            ))}
          </div>
        ) : active.length === 0 ? (
          <EmptyEverything />
        ) : (
          <div className="mt-6 space-y-9">
            {active.map((d) => (
              <CartSection key={d} domain={d} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function EmptyEverything() {
  return (
    <div className="mt-8 rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-10 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-yellow/10 text-yellow ring-1 ring-inset ring-yellow/20">
        <ShoppingCart size={22} />
      </span>
      <h2 className="mt-4 font-syne text-lg font-bold text-offwhite">Nothing here yet</h2>
      <p className="mx-auto mt-1 max-w-xs font-dm text-sm text-muted">
        Food, shops and tickets each keep their own basket.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {CART_DOMAINS.map((d) => {
          const s = SECTION[d];
          const Icon = s.icon;
          return (
            <Link
              key={d}
              href={s.browseHref}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-4 py-2.5 font-dm text-sm font-semibold text-offwhite transition-colors hover:border-yellow/40 hover:text-yellow"
            >
              <Icon size={15} /> {s.browseLabel}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function CartSection({ domain }: { domain: CartDomain }) {
  const { cart, updateQuantity, removeItem } = useCart(domain);
  const router = useRouter();
  const [resolved, setResolved] = useState<ResolvedCartItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  /** Set when the resolve call FAILED — distinct from "this basket is empty". */
  const [cartError, setCartError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const itemKey = cart?.items.map((i) => `${i.variantId}:${i.quantity}`).join(",") ?? "";

  useEffect(() => {
    if (!cart || cart.items.length === 0) {
      setResolved([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setCartError(null);
    // A FAILED load must never look like an empty basket. Without the r.ok
    // check, a 500, a 429 or a dropped connection rendered "empty" while the
    // items were still sitting in localStorage — to the customer their basket
    // had silently vanished, and almost nobody re-adds.
    fetch("/api/cart/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: cart.items }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`resolve failed (${r.status})`);
        return r.json();
      })
      .then((body) => {
        if (!cancelled) setResolved(body.items ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("cart resolve failed", err);
        setCartError("We couldn't load this basket just now. Your items are safe — please try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey, itemKey]);

  if (!cart || cart.items.length === 0) return null;

  const meta = SECTION[domain];
  const Icon = meta.icon;
  const items = resolved ?? [];
  const subtotal = items.reduce((sum, i) => sum + i.price * i.requestedQuantity, 0);
  const hasIssue = items.some(
    (i) => !i.isActive || i.productStatus !== "active" || i.stockQuantity < i.requestedQuantity,
  );

  return (
    <section>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 font-syne text-base font-extrabold text-offwhite">
          <Icon size={16} className="text-yellow" /> {meta.title}
        </h2>
        <Link href={meta.browseHref} className="shrink-0 font-dm text-xs text-yellow hover:underline">
          {meta.browseLabel}
        </Link>
      </div>
      <p className="mt-0.5 font-dm text-sm text-muted">from {cart.storeName}</p>

      {loading ? (
        <div className="mt-3 space-y-2">
          {Array.from({ length: cart.items.length }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl bg-white/[0.04]" />
          ))}
        </div>
      ) : cartError ? (
        <div className="mt-3 rounded-2xl border border-red-500/25 bg-red-500/[0.05] p-6 text-center">
          <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl bg-red-500/10 text-red-400 ring-1 ring-inset ring-red-500/20">
            <AlertTriangle size={19} />
          </span>
          <p className="mx-auto mt-3 max-w-xs font-dm text-sm text-muted">{cartError}</p>
          <Button size="lg" className="mt-4" onClick={() => setReloadKey((k) => k + 1)}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-3 space-y-2">
            {items.map((item) => {
              const unavailable = !item.isActive || item.productStatus !== "active";
              const insufficientStock = !unavailable && item.stockQuantity < item.requestedQuantity;
              return (
                <div
                  key={item.variantId}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-dark-card p-3"
                >
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-muted">
                      <ImageOff size={18} />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-dm text-sm font-medium text-offwhite">{item.productName}</p>
                    {item.variantName && <p className="truncate font-dm text-xs text-muted">{item.variantName}</p>}
                    <p className="mt-0.5 font-dm text-sm font-semibold text-yellow">
                      Rs {centsToDecimalString(item.price)}
                    </p>
                    {unavailable && (
                      <p className="mt-0.5 font-dm text-xs text-red-300">No longer available — remove it to continue.</p>
                    )}
                    {insufficientStock && (
                      <p className="mt-0.5 font-dm text-xs text-orange-300">
                        Only {item.stockQuantity} left — reduce the quantity to continue.
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      aria-label="One fewer"
                      onClick={() => updateQuantity(item.variantId, item.requestedQuantity - 1)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 text-offwhite"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="min-w-6 text-center font-dm text-sm tabular-nums">{item.requestedQuantity}</span>
                    <button
                      aria-label="One more"
                      onClick={() => updateQuantity(item.variantId, item.requestedQuantity + 1)}
                      disabled={item.requestedQuantity >= item.stockQuantity}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 text-offwhite disabled:opacity-30"
                    >
                      <Plus size={14} />
                    </button>
                    <button
                      aria-label={`Remove ${item.productName}`}
                      onClick={() => removeItem(item.variantId)}
                      className="ml-1 flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 text-muted hover:text-red-300"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 rounded-2xl border border-white/10 bg-dark-card p-4">
            <div className="flex items-center justify-between font-dm text-sm">
              <span className="text-muted">Subtotal</span>
              <span className="font-semibold text-offwhite">Rs {centsToDecimalString(subtotal)}</span>
            </div>
            <p className="mt-1 font-dm text-xs text-muted">
              Tax and delivery, if any, are calculated at checkout.
            </p>
            <Button
              size="xl"
              className="mt-3 w-full"
              disabled={hasIssue || items.length === 0}
              // The domain travels in the URL: /checkout places ONE order, so it
              // has to be told which basket it is looking at.
              onClick={() => router.push(`/checkout?cart=${domain}`)}
            >
              {hasIssue ? "Fix the items above to continue" : "Checkout"}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
