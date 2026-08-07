"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Minus, Plus, Trash2, ShoppingCart, ArrowLeft, ImageOff, AlertTriangle } from "lucide-react";
import { useCart } from "@/lib/cart/CartContext";
import { centsToDecimalString } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ResolvedCartItem } from "@/app/api/cart/resolve/route";

export default function CartPage() {
  const { cart, hydrated, updateQuantity, removeItem } = useCart();
  const router = useRouter();
  const [resolved, setResolved] = useState<ResolvedCartItem[] | null>(null);
  const [loading, setLoading] = useState(true);

  // Gated on `hydrated`, not just `cart` — see CheckoutForm for the live-
  // verified bug this avoids: cart is always null on the very first client
  // render (localStorage hasn't been read yet), so treating that as
  // "genuinely empty" flashes an incorrect empty cart before the real one
  // ever gets a chance to be fetched.
  useEffect(() => {
    if (!hydrated) return;
    if (!cart || cart.items.length === 0) {
      setResolved([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch("/api/cart/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: cart.items }),
    })
      .then((r) => r.json())
      .then((body) => {
        if (!cancelled) setResolved(body.items ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, cart?.items.map((i) => `${i.variantId}:${i.quantity}`).join(",")]);

  const subtotal = (resolved ?? []).reduce((sum, i) => sum + i.price * i.requestedQuantity, 0);
  const hasIssue = (resolved ?? []).some(
    (i) => !i.isActive || i.productStatus !== "active" || i.stockQuantity < i.requestedQuantity,
  );

  return (
    <main className="min-h-screen bg-dark px-4 pb-32 pt-10 text-offwhite">
      <div className="mx-auto max-w-2xl">
        {/* Back to the marketplace, not the homepage — leaving the cart should
            land you among the shops so browsing can continue in one tap. */}
        <Link href="/shop" className="inline-flex items-center gap-1.5 font-dm text-sm text-muted hover:text-yellow">
          <ArrowLeft size={14} /> Continue shopping
        </Link>

        <h1 className="mt-3 font-syne text-2xl font-extrabold text-offwhite">Your cart</h1>
        {cart && <p className="mt-1 font-dm text-sm text-muted">from {cart.storeName}</p>}

        {!hydrated || loading ? (
          <div className="mt-6 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl bg-white/[0.04]" />)}
          </div>
        ) : !resolved || resolved.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-10 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-yellow/10 text-yellow ring-1 ring-inset ring-yellow/20">
              <ShoppingCart size={22} />
            </span>
            <h2 className="mt-4 font-syne text-lg font-bold text-offwhite">Your cart is empty</h2>
            <p className="mx-auto mt-1 max-w-xs font-dm text-sm text-muted">Browse a shop and add something you like.</p>
          </div>
        ) : (
          <>
            <div className="mt-6 space-y-2">
              {resolved.map((item) => {
                const unavailable = !item.isActive || item.productStatus !== "active";
                const insufficientStock = !unavailable && item.stockQuantity < item.requestedQuantity;
                return (
                  <div key={item.variantId} className="flex items-center gap-3 rounded-xl border border-white/10 bg-dark-card p-3">
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-white/5 text-muted/40">
                        <ImageOff size={18} />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-dm text-sm font-medium text-offwhite">{item.productName}</p>
                      {item.variantName && <p className="font-dm text-xs text-muted">{item.variantName}</p>}
                      <p className="font-dm text-sm text-yellow">Rs {centsToDecimalString(item.price)}</p>
                      {unavailable && (
                        <p className="mt-1 flex items-center gap-1 font-dm text-xs text-red-400">
                          <AlertTriangle size={11} /> No longer available
                        </p>
                      )}
                      {insufficientStock && (
                        <p className="mt-1 flex items-center gap-1 font-dm text-xs text-red-400">
                          {/* "Only 0 left" is not a quantity, it's a sold-out
                              item — say so rather than asking the customer to
                              decode a number. */}
                          <AlertTriangle size={11} />
                          {item.stockQuantity === 0 ? "Out of stock" : `Only ${item.stockQuantity} left`}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {/* 44px targets throughout — these were 28px steppers and
                          a bare 15px icon, the smallest controls on the site at
                          the point where mistapping costs a sale (or silently
                          deletes an item). Padding does the work so the visual
                          weight is unchanged. */}
                      <button
                        type="button"
                        aria-label={`Remove ${item.productName} from cart`}
                        onClick={() => removeItem(item.variantId)}
                        className="-m-2 flex h-11 w-11 items-center justify-center rounded-lg text-muted transition-colors hover:text-red-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow"
                      >
                        <Trash2 size={16} />
                      </button>
                      <div className="flex items-center rounded-full border border-white/15">
                        <button
                          type="button"
                          aria-label="Decrease quantity"
                          onClick={() => updateQuantity(item.variantId, item.requestedQuantity - 1)}
                          className="flex h-11 w-10 items-center justify-center rounded-l-full text-offwhite transition-transform hover:text-yellow active:scale-90"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="w-6 text-center font-dm text-sm text-offwhite" aria-live="polite">
                          {item.requestedQuantity}
                        </span>
                        <button
                          type="button"
                          aria-label="Increase quantity"
                          onClick={() => updateQuantity(item.variantId, item.requestedQuantity + 1)}
                          disabled={item.requestedQuantity >= item.stockQuantity}
                          className="flex h-11 w-10 items-center justify-center rounded-r-full text-offwhite transition-transform hover:text-yellow active:scale-90 disabled:opacity-30"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 rounded-2xl border border-white/10 bg-dark-card p-4">
              <div className="flex justify-between font-dm text-sm text-muted">
                <span>Subtotal</span>
                <span className="text-offwhite">Rs {centsToDecimalString(subtotal)}</span>
              </div>
              <p className="mt-1 font-dm text-xs text-muted">Tax and delivery, if any, are calculated at checkout.</p>
            </div>

            {hasIssue && (
              <p className="mt-3 font-dm text-xs text-red-400">
                Remove or adjust the unavailable item(s) above before checking out.
              </p>
            )}

            <Button
              size="xl"
              className="mt-4 w-full"
              disabled={hasIssue}
              onClick={() => router.push("/checkout")}
            >
              Checkout
            </Button>
          </>
        )}
      </div>
    </main>
  );
}
