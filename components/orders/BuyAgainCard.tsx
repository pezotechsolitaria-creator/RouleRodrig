"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import Link from "next/link";
import { RotateCcw, Loader2, PackageX } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/lib/cart/CartContext";
import { centsToDecimalString } from "@/lib/money";
import type { MarketProduct } from "@/lib/marketplace/types";
import { trackReorderClicked, trackAddToCart } from "@/lib/marketplace/analytics";
import ProductThumb from "@/components/shop/ProductThumb";

// ── Buy it again ────────────────────────────────────────────────────────────
//
// The cheapest sale a marketplace ever makes, and the one this platform was
// leaving on the table completely: a tourist who liked the honey has no way to
// find it again except retracing the whole search.
//
// ── IT RECONCILES BEFORE IT OFFERS ─────────────────────────────────────────
// It never re-adds the old order blindly. The product ids go back through the
// live catalogue, so a product that sold out, was archived, or belongs to a shop
// that has since paused simply is not offered — and the count of what is missing
// is SHOWN rather than swallowed. "3 available · 1 no longer sold" is a fact the
// customer can act on; a silently shorter list is one they will only notice at
// the checkout.
//
// Prices come back live too, so someone re-ordering at a price that has moved
// sees the new one here rather than at the payment step (which create_order
// would refuse anyway, with RR012).
export default function BuyAgainCard({
  orderId, productIds, storeName,
}: {
  orderId: string;
  productIds: string[];
  /** Only for the toast — every add uses the SHOP each product resolves to. */
  storeName: string;
}) {
  const { t } = useLanguage();
  const { addItem } = useCart("shop");
  const [products, setProducts] = useState<MarketProduct[] | null>(null);
  const [missing, setMissing] = useState(0);
  const [added, setAdded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (productIds.length === 0) {
      setProducts([]);
      return;
    }
    let cancelled = false;
    fetch("/api/marketplace/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: productIds }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (cancelled || !body) return;
        setProducts(body.products ?? []);
        setMissing((body.missing ?? []).length);
      })
      // Silence is right here: this is a bonus offer on an order page, and a
      // failed fetch should leave the page exactly as it was, not shout.
      .catch(() => { if (!cancelled) setProducts([]); });
    return () => { cancelled = true; };
  }, [productIds]);

  if (products === null) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-dark-card p-5 font-dm text-sm text-muted">
        <Loader2 size={15} className="animate-spin" /> {t.buyAgain.checking}
      </div>
    );
  }
  // Nothing available and nothing missing means this order held nothing the
  // marketplace sells (a dish, a ticket) — say nothing at all.
  if (products.length === 0 && missing === 0) return null;

  const buyable = products.filter((p) => p.inStock && p.acceptingOrders && p.quickAdd);

  return (
    <section className="rounded-2xl border border-white/10 bg-dark-card p-5">
      <h2 className="inline-flex items-center gap-2 font-syne text-base font-bold text-offwhite">
        <RotateCcw size={15} className="text-yellow" /> {t.buyAgain.buyItAgain}
      </h2>
      <p className="mt-1 font-dm text-xs text-muted">
        {products.length > 0 && (
          <>
            {products.length} item{products.length === 1 ? "" : "s"} still on sale
            {missing > 0 && <> · {missing} no longer available</>}
          </>
        )}
        {products.length === 0 && missing > 0 && (
          <>{t.buyAgain.nothingOnSale}</>
        )}
      </p>

      {products.length > 0 && (
        <ul className="mt-3 space-y-2">
          {products.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-xl border border-white/10 p-3">
              <ProductThumb
                imageUrl={p.imageUrl}
                name={p.name}
                slug={p.slug}
                categoryName={p.categoryName}
                className="h-11 w-11 shrink-0 rounded-lg"
              />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/shop/${p.storeSlug}/${p.slug}`}
                  className="block truncate font-dm text-sm font-medium text-offwhite hover:text-yellow"
                >
                  {p.name}
                </Link>
                <p className="font-dm text-xs text-yellow">Rs {centsToDecimalString(p.minPrice)}</p>
              </div>
              {p.inStock && p.acceptingOrders && p.quickAdd ? (
                <button
                  type="button"
                  disabled={added[p.id]}
                  onClick={() => {
                    addItem({
                      storeId: p.storeId,
                      storeName: p.storeName,
                      variantId: p.quickAdd!.id,
                      quantity: 1,
                    });
                    trackAddToCart({
                      storeId: p.storeId, storeName: p.storeName, variantId: p.quickAdd!.id,
                      productName: p.name, price: p.quickAdd!.price, quantity: 1, surface: "buy_again",
                    });
                    setAdded((a) => ({ ...a, [p.id]: true }));
                    toast.success(`${p.name} added`, { description: `In your basket from ${p.storeName}.` });
                  }}
                  className="shrink-0 rounded-lg bg-yellow px-3 py-2 font-dm text-xs font-bold text-dark disabled:opacity-50"
                >
                  {added[p.id] ? "Added" : "Add"}
                </button>
              ) : (
                // A product with options cannot be re-added blindly — the size
                // or colour has to be chosen again, so the tap opens the page.
                <Link
                  href={`/shop/${p.storeSlug}/${p.slug}`}
                  className="shrink-0 rounded-lg border border-white/15 px-3 py-2 font-dm text-xs font-semibold text-offwhite"
                >
                  {!p.inStock ? "Sold out" : !p.acceptingOrders ? "View" : "Choose"}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}

      {missing > 0 && (
        <p className="mt-3 flex items-center gap-1.5 font-dm text-xs text-muted">
          <PackageX size={12} />
          {missing} item{missing === 1 ? "" : "s"} from this order {missing === 1 ? "is" : "are"} no longer
          sold on the marketplace.
        </p>
      )}

      {buyable.length > 1 && (
        <button
          type="button"
          onClick={() => {
            let n = 0;
            for (const p of buyable) {
              if (added[p.id]) continue;
              addItem({ storeId: p.storeId, storeName: p.storeName, variantId: p.quickAdd!.id, quantity: 1 });
              trackAddToCart({
                storeId: p.storeId, storeName: p.storeName, variantId: p.quickAdd!.id,
                productName: p.name, price: p.quickAdd!.price, quantity: 1, surface: "buy_again",
              });
              n++;
            }
            setAdded(Object.fromEntries(buyable.map((p) => [p.id, true])));
            trackReorderClicked({ orderId, available: buyable.length, unavailable: missing });
            toast.success(`${n} item${n === 1 ? "" : "s"} added`, { description: `In your basket from ${storeName}.` });
          }}
          className="mt-3 w-full rounded-xl border border-yellow/50 px-4 py-2.5 font-dm text-sm font-bold text-yellow transition-colors hover:bg-yellow/10"
        >
          {t.buyAgain.addEverything}
        </button>
      )}
    </section>
  );
}
