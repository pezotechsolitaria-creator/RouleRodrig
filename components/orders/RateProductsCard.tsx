"use client";

import { useState } from "react";
import { Star, Check, Loader2 } from "lucide-react";
import ProductThumb from "@/components/shop/ProductThumb";

export type ReviewableProduct = {
  productId: string;
  name: string;
  slug: string;
  storeSlug: string;
  imageUrl: string | null;
  myRating: number | null;
  reviewed: boolean;
};

// ── Rate what you actually bought ───────────────────────────────────────────
//
// Beside RateShopCard, not instead of it, because they answer two different
// questions: the shop card is "how was the seller", this is "was the thing any
// good". Mixing them would mean a shop losing its service rating over one
// disappointing jar, which is why sync_store_rating() ignores product reviews
// (M97).
//
// ── ONE PRODUCT AT A TIME, RATING AND WORDS IN ONE POST ────────────────────
// Tapping a star selects it; the sentence box opens under it; one button sends
// both. The obvious alternative — post on the star tap, then let people add
// words after — reads better on paper and cannot be built honestly here: a
// review row is written once (reviews_one_per_order_product), so the second
// call would be refused and the button would be lying about what it did.
// Two taps that work beat one tap that pretends.
//
// Serves both credentials, because guests are the majority of buyers on this
// platform (M20): a signed-in customer posts with `orderId`, a guest with the
// order number and email they already typed to reach this page.
export default function RateProductsCard({
  products, orderId, orderNumber, email,
}: {
  products: ReviewableProduct[];
  orderId?: string;
  orderNumber?: string;
  email?: string;
}) {
  const pending = products.filter((p) => !p.reviewed);
  /** productId → the rating that was successfully saved. */
  const [saved, setSaved] = useState<Record<string, number>>({});
  /** productId → the star currently selected but not yet sent. */
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (pending.length === 0) return null;
  const left = pending.filter((p) => !saved[p.productId]);
  if (left.length === 0) {
    return (
      <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-5">
        <p className="inline-flex items-center gap-2 font-dm text-sm font-medium text-emerald-300">
          <Check size={16} /> Thank you — your ratings are live
        </p>
        <p className="mt-1 font-dm text-xs text-muted">
          They show on each product&apos;s page and help the next buyer choose.
        </p>
      </section>
    );
  }

  async function post(productId: string) {
    const rating = picked[productId];
    if (!rating) return;
    setBusy(productId);
    setError(null);
    try {
      const res = await fetch("/api/shop/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          rating,
          body: notes[productId]?.trim() || undefined,
          orderId,
          orderNumber,
          email,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "We couldn't save your rating.");
      setSaved((s) => ({ ...s, [productId]: rating }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't save your rating.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-dark-card p-5">
      <h2 className="font-syne text-base font-bold text-offwhite">Rate what you bought</h2>
      <p className="mt-1 font-dm text-xs text-muted">
        Only someone who collected an order can rate its products — so your rating counts.
      </p>

      <ul className="mt-4 space-y-3">
        {pending.map((p) => {
          const done = saved[p.productId];
          const stars = picked[p.productId] ?? 0;
          return (
            <li key={p.productId} className="rounded-xl border border-white/10 p-3">
              <div className="flex items-center gap-3">
                <ProductThumb
                  imageUrl={p.imageUrl}
                  name={p.name}
                  slug={p.slug}
                  className="h-11 w-11 shrink-0 rounded-lg"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-dm text-sm font-medium text-offwhite">{p.name}</p>
                  {done ? (
                    <p className="mt-0.5 inline-flex items-center gap-1 font-dm text-xs text-emerald-400">
                      <Check size={12} /> Rated {done}/5 — thank you
                    </p>
                  ) : (
                    <div className="mt-1 flex items-center gap-0.5" role="radiogroup" aria-label={`Rate ${p.name}`}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          role="radio"
                          aria-checked={stars === n}
                          aria-label={`${n} out of 5`}
                          onClick={() => setPicked((s) => ({ ...s, [p.productId]: n }))}
                          className={`p-1 transition-colors ${
                            n <= stars ? "text-yellow" : "text-muted hover:text-yellow/70"
                          }`}
                        >
                          <Star size={19} className={n <= stars ? "fill-yellow" : ""} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {!done && stars > 0 && (
                <div className="mt-3 border-t border-white/[0.06] pt-3">
                  <label htmlFor={`note-${p.productId}`} className="block font-dm text-xs text-muted">
                    Say why, if you like (optional)
                  </label>
                  <textarea
                    id={`note-${p.productId}`}
                    value={notes[p.productId] ?? ""}
                    onChange={(e) => setNotes((s) => ({ ...s, [p.productId]: e.target.value }))}
                    rows={2}
                    maxLength={1000}
                    placeholder="What was it like?"
                    className="mt-1.5 w-full rounded-xl border border-white/10 bg-dark px-3 py-2 font-dm text-sm text-offwhite placeholder:text-muted focus:border-yellow/50 focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={busy === p.productId}
                    onClick={() => post(p.productId)}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-yellow px-4 py-2.5 font-dm text-xs font-bold text-dark transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {busy === p.productId ? <Loader2 size={13} className="animate-spin" /> : null}
                    Post rating
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {error && <p className="mt-3 font-dm text-xs text-red-300">{error}</p>}

      <p className="mt-3 font-dm text-[11px] text-muted/70">
        Published straight away under your first name. Each product can be rated once per order.
      </p>
    </section>
  );
}
