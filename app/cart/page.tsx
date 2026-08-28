"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Minus, Plus, Trash2, ShoppingBag, ArrowLeft, AlertTriangle,
  UtensilsCrossed, Store, Ticket, ChevronRight,
} from "lucide-react";
import { useCarts, useCart, CART_DOMAINS, type CartDomain, type Basket } from "@/lib/cart/CartContext";
import { useLanguage } from "@/context/LanguageContext";
import { CHECKOUT_COPY } from "@/lib/checkout/copy.i18n";
import { centsToDecimalString } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import ProductThumb from "@/components/shop/ProductThumb";
import type { ResolvedCartItem } from "@/app/api/cart/resolve/route";

// ── ONE BAG, ONE SECTION PER SELLER ─────────────────────────────────────────
//
// There is a separate cart for food, for the marketplace and for tickets, and
// the marketplace holds one basket PER SHOP (see lib/cart/domains.ts for why:
// the customer pays each shop's own bank account, so the split is real at
// checkout and was never real in the basket).
//
// This page shows every basket that has something in it, each with its own
// total and its own Checkout button, because each becomes its OWN order —
// orders.store_id is singular, and honey from one shop and a basket from
// another can never be one row.
//
// ── WHY THERE IS NO GRAND TOTAL ────────────────────────────────────────────
// Adding the sections up would produce a number nobody is ever asked to pay.
// Each shop is paid separately, by separate bank transfer, so a single figure
// at the bottom would be the one piece of information on this page that is not
// true. The header counts baskets and items instead.

// The two things about a section that are NOT words: which icon it wears and
// where its browse link goes. The title and the browse label are words, so they
// live with every other word on this screen in lib/checkout/copy.i18n.ts and
// are read there in the reader's language.
const SECTION: Record<CartDomain, {
  icon: React.ElementType; browseHref: string;
}> = {
  food: {
    icon: UtensilsCrossed,
    browseHref: "/food",
  },
  shop: {
    icon: Store,
    browseHref: "/shop",
  },
  events: {
    icon: Ticket,
    browseHref: "/events",
  },
};

type Section = { domain: CartDomain; basket: Basket };

export default function CartPage() {
  const { baskets, hydrated } = useCarts();
  const { language } = useLanguage();
  const c = CHECKOUT_COPY[language].cart;
  const sections: Section[] = CART_DOMAINS.flatMap((domain) =>
    (baskets[domain] ?? []).map((basket) => ({ domain, basket })),
  );
  const itemCount = sections.reduce(
    (n, s) => n + s.basket.items.reduce((q, i) => q + i.quantity, 0),
    0,
  );

  return (
    <main className="min-h-screen bg-dark px-4 pb-32 pt-10 text-offwhite">
      <div className="mx-auto max-w-2xl">
        <Link href="/" className="inline-flex items-center gap-1.5 font-dm text-sm text-muted hover:text-yellow">
          <ArrowLeft size={14} /> {c.home}
        </Link>

        <h1 className="mt-3 font-syne text-2xl font-extrabold text-offwhite">{c.heading}</h1>
        {hydrated && sections.length > 0 && (
          <p className="mt-1 font-dm text-sm text-muted">
            {/* One function, not two strings glued together: English adds an
                "s", French adds one to a different word, and Kreol adds none. */}
            {c.count(itemCount, sections.length)}
            {sections.length > 1 && <>{c.separately}</>}
          </p>
        )}

        {!hydrated ? (
          <div className="mt-6 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl bg-white/[0.04]" />
            ))}
          </div>
        ) : sections.length === 0 ? (
          <EmptyEverything />
        ) : (
          <div className="mt-6 space-y-8">
            {sections.map((s) => (
              <CartSection key={`${s.domain}:${s.basket.storeId}`} domain={s.domain} basket={s.basket} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function EmptyEverything() {
  const { language } = useLanguage();
  const c = CHECKOUT_COPY[language].cart;
  return (
    <div className="mt-8 rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-10 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-yellow/10 text-yellow ring-1 ring-inset ring-yellow/20">
        <ShoppingBag size={22} />
      </span>
      <h2 className="mt-4 font-syne text-lg font-bold text-offwhite">{c.empty.title}</h2>
      <p className="mx-auto mt-1 max-w-xs font-dm text-sm text-muted">
        {c.empty.body}
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
              {/* The shop tile says something different from its own section
                  link — a third English wording for one action. Frozen as
                  found rather than tidied: this change is words moving, not
                  words changing. */}
              <Icon size={15} /> {d === "shop" ? c.empty.browseProducts : c.section[d].browseLabel}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function CartSection({ domain, basket }: { domain: CartDomain; basket: Basket }) {
  const { updateQuantity, removeItem } = useCart(domain);
  const { language } = useLanguage();
  const c = CHECKOUT_COPY[language].cart;
  const router = useRouter();
  const [resolved, setResolved] = useState<ResolvedCartItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  /** Set when the resolve call FAILED — distinct from "this basket is empty". */
  const [cartError, setCartError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const itemKey = basket.items.map((i) => `${i.variantId}:${i.quantity}`).join(",");

  useEffect(() => {
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
      body: JSON.stringify({ items: basket.items }),
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
        setCartError(c.error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey, itemKey]);

  const meta = SECTION[domain];
  const Icon = meta.icon;
  const items = resolved ?? [];
  const subtotal = items.reduce((sum, i) => sum + i.price * i.requestedQuantity, 0);
  const hasIssue = items.some(
    (i) => !i.isActive || i.productStatus !== "active" || i.stockQuantity < i.requestedQuantity,
  );
  // Where "keep shopping" should go: back to THIS shop, not to the directory —
  // the shopper is mid-basket with one seller.
  const backHref = domain === "shop" ? meta.browseHref : meta.browseHref;

  return (
    <section>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="inline-flex min-w-0 items-baseline gap-2 font-syne text-base font-extrabold text-offwhite">
          <Icon size={16} className="translate-y-0.5 text-yellow" />
          <span className="truncate">
            {domain === "shop" ? basket.storeName : c.section[domain].title}
          </span>
        </h2>
        <Link href={backHref} className="shrink-0 font-dm text-xs text-yellow hover:underline">
          {c.section[domain].browseLabel}
        </Link>
      </div>
      {domain !== "shop" && <p className="mt-0.5 font-dm text-sm text-muted">{c.from}{basket.storeName}</p>}

      {loading ? (
        <div className="mt-3 space-y-2">
          {Array.from({ length: basket.items.length }).map((_, i) => (
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
            {c.tryAgain}
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
                  <ProductThumb
                    imageUrl={item.imageUrl}
                    name={item.productName}
                    slug={item.variantId}
                    className="h-14 w-14 shrink-0 rounded-lg"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-dm text-sm font-medium text-offwhite">{item.productName}</p>
                    {item.variantName && <p className="truncate font-dm text-xs text-muted">{item.variantName}</p>}
                    <p className="mt-0.5 font-dm text-sm font-semibold text-yellow">
                      Rs {centsToDecimalString(item.price)}
                    </p>
                    {unavailable && (
                      <p className="mt-0.5 font-dm text-xs text-red-300">{c.unavailable}</p>
                    )}
                    {insufficientStock && (
                      <p className="mt-0.5 font-dm text-xs text-orange-300">
                        {c.lowStock(item.stockQuantity)}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      aria-label={c.fewer(item.productName)}
                      onClick={() => updateQuantity(item.variantId, item.requestedQuantity - 1)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 text-offwhite"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="min-w-6 text-center font-dm text-sm tabular-nums">{item.requestedQuantity}</span>
                    <button
                      aria-label={c.more(item.productName)}
                      onClick={() => updateQuantity(item.variantId, item.requestedQuantity + 1)}
                      disabled={item.requestedQuantity >= item.stockQuantity}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 text-offwhite disabled:opacity-30"
                    >
                      <Plus size={14} />
                    </button>
                    <button
                      aria-label={c.remove(item.productName)}
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
              <span className="text-muted">{c.subtotal}</span>
              <span className="font-semibold text-offwhite">Rs {centsToDecimalString(subtotal)}</span>
            </div>
            <p className="mt-1 font-dm text-xs text-muted">
              {c.deliveryNote}
            </p>
            <Button
              size="xl"
              className="mt-3 w-full"
              disabled={hasIssue || items.length === 0}
              // BOTH the domain and the shop travel in the URL: /checkout places
              // ONE order, so it has to be told which basket it is looking at —
              // and the marketplace now has more than one.
              onClick={() => router.push(`/checkout?cart=${domain}&store=${basket.storeId}`)}
            >
              {hasIssue ? (
                c.fixItems
              ) : (
                <>
                  {c.checkout}{domain === "shop" ? c.checkoutShopSuffix : ""} <ChevronRight size={16} className="ml-1" />
                </>
              )}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
