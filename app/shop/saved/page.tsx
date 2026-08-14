"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Heart, PackageX } from "lucide-react";
import { useSaved } from "@/lib/marketplace/saved";
import type { MarketProduct } from "@/lib/marketplace/types";
import MarketProductCard from "@/components/shop/MarketProductCard";
import { ShopHeader } from "@/components/shop/ShopChrome";
import { Skeleton } from "@/components/ui/skeleton";

// Saved products.
//
// A client page, because the list lives in the browser (lib/marketplace/saved.ts
// explains why there is no login wall on saving something). The ids are then
// re-resolved against the live catalogue on every visit, so what is shown is
// today's price and today's stock — not a snapshot from whenever it was saved.
//
// noindex is set in layout.tsx: this page is different for every visitor and
// empty for a crawler, which is the definition of a page not worth indexing.
export default function SavedPage() {
  const { ids, hydrated, count } = useSaved();
  const [products, setProducts] = useState<MarketProduct[] | null>(null);
  const [missing, setMissing] = useState(0);
  const [failed, setFailed] = useState(false);

  const key = ids.join(",");
  useEffect(() => {
    if (!hydrated) return;
    if (ids.length === 0) {
      setProducts([]);
      return;
    }
    let cancelled = false;
    setFailed(false);
    fetch("/api/marketplace/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`resolve failed (${r.status})`);
        return r.json();
      })
      .then((body) => {
        if (cancelled) return;
        setProducts(body.products ?? []);
        setMissing((body.missing ?? []).length);
      })
      .catch(() => {
        // A failed load must not read as "your saved items are gone" — that is
        // the same mistake the cart page had, and nobody re-saves either.
        if (!cancelled) setFailed(true);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, key]);

  return (
    <main className="min-h-screen bg-dark px-4 pb-44 pt-0 text-offwhite md:pb-28">
      <ShopHeader backHref="/shop" backLabel="Marketplace" />

      <div className="mx-auto max-w-5xl">
        <h1 className="font-syne text-2xl font-extrabold text-offwhite sm:text-3xl">Saved</h1>
        <p className="mt-1.5 font-dm text-sm text-muted">
          {count > 0
            ? `${count} product${count === 1 ? "" : "s"} you kept for later. Prices and stock are live.`
            : "Products you keep for later live here."}
        </p>

        {!hydrated || (products === null && !failed) ? (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[3/4] w-full rounded-2xl bg-white/[0.04]" />
            ))}
          </div>
        ) : failed ? (
          <div className="mt-8 rounded-2xl border border-white/10 bg-dark-card px-6 py-10 text-center">
            <p className="font-syne text-lg font-bold text-offwhite">We couldn&apos;t load your saved items</p>
            <p className="mx-auto mt-1.5 max-w-sm font-dm text-sm text-muted">
              Nothing has been lost — they are still saved on this device. Try again in a moment.
            </p>
          </div>
        ) : products && products.length > 0 ? (
          <>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {products.map((p, i) => (
                <MarketProductCard key={p.id} product={p} priority={i < 4} index={i} />
              ))}
            </div>
            {missing > 0 && (
              <p className="mt-5 flex items-center justify-center gap-2 font-dm text-xs text-muted">
                <PackageX size={13} />
                {missing} saved item{missing === 1 ? " is" : "s are"} no longer on sale.
              </p>
            )}
          </>
        ) : (
          <div className="mt-8 rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] px-6 py-12 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-yellow/10 text-yellow ring-1 ring-inset ring-yellow/20">
              <Heart size={22} />
            </span>
            <h2 className="mt-4 font-syne text-lg font-bold text-offwhite">Nothing saved yet</h2>
            <p className="mx-auto mt-1.5 max-w-sm font-dm text-sm text-muted">
              Tap the heart on any product to keep it here while you think about it.
            </p>
            <Link
              href="/shop"
              className="mt-5 inline-block rounded-xl bg-yellow px-5 py-3 font-dm text-sm font-bold text-dark transition-opacity hover:opacity-90"
            >
              Browse the marketplace
            </Link>
          </div>
        )}

        {count > 0 && (
          <p className="mt-8 text-center font-dm text-xs text-muted/70">
            Saved on this device only — clearing your browser data clears this list.
          </p>
        )}
      </div>
    </main>
  );
}
