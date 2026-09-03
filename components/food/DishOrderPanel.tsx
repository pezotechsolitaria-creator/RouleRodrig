"use client";

import { useMemo, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import Link from "next/link";
import { Plus, Minus, ShoppingBag, Clock } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/lib/cart/CartContext";
import { centsToDecimalString, centsToShortString } from "@/lib/money";
import { UNAVAILABLE_LABEL, type FoodDetail } from "@/lib/food/types";

// The order panel on a dish page: choose a size, choose how many, add.
//
// ── WHY SIZES ARE THE WHOLE OPTION MODEL ───────────────────────────────────
// A priced choice is a product_variant, which already reaches the kitchen
// ticket as order_items.variant_name and is already priced server-side. A paid
// extra ("extra sauce, Rs 20") is its own cheap dish on the menu. Anything else
// — "no onions", "very spicy please" — is the per-order note that the checkout
// already carries. A modifier schema would have needed a new column on
// order_items that nothing downstream reads, and would have multiplied the
// admin work for a two-person operation. See M50's header.
//
// ── THE STOCK CEILING IS A COURTESY, NOT THE GUARANTEE ─────────────────────
// The stepper stops at the portions left, but that is only so the customer
// finds out here rather than at the payment button. The real guarantee is the
// row lock inside create_order(), which is what makes two people racing for the
// last plate produce exactly one order.

export default function DishOrderPanel({ dish }: { dish: FoodDetail }) {
  const { t } = useLanguage();
  const { cart, addItem, clear } = useCart("food");
  const sellable = useMemo(() => dish.variants.filter((v) => v.stock > 0), [dish.variants]);
  const [variantId, setVariantId] = useState<string>(
    () => sellable[0]?.id ?? dish.variants[0]?.id ?? "",
  );
  const [qty, setQty] = useState(1);

  const variant = dish.variants.find((v) => v.id === variantId) ?? dish.variants[0];
  const max = Math.min(variant?.stock ?? 0, 20);
  const lineTotal = (variant?.price ?? dish.price) * qty;

  function add() {
    if (!variant) return;
    const result = addItem({
      storeId: dish.kitchenId,
      storeName: dish.kitchenName,
      variantId: variant.id,
      quantity: qty,
    });

    if (result === "conflict") {
      toast.error(`${dish.name} is cooked at another kitchen.`, {
        description: `Your order so far is from ${cart?.storeName ?? "a different kitchen"}. One order comes from one kitchen so it can be cooked and collected together.`,
        action: {
          label: "Start a new order",
          onClick: () => {
            clear();
            addItem({
              storeId: dish.kitchenId,
              storeName: dish.kitchenName,
              variantId: variant.id,
              quantity: qty,
            });
            toast.success(`${dish.name} added.`);
          },
        },
        duration: 8000,
      });
      return;
    }
    toast.success(`${qty}× ${dish.name} added.`);
  }

  if (!dish.orderable) {
    return (
      <div className="rounded-2xl border border-orange-400/30 bg-orange-400/5 px-5 py-4">
        <p className="font-syne text-base font-bold text-orange-200">
          {dish.reason ? UNAVAILABLE_LABEL[dish.reason] : "Not available"}
        </p>
        <p className="mt-1.5 font-dm text-sm text-orange-100/80">
          {dish.reason === "sold_out"
            ? "Today's batch has gone. It is usually back tomorrow."
            : dish.reason === "wrong_time"
              ? "This dish is only cooked at certain hours. Check back later today."
              : dish.reason === "wrong_day"
                ? "It is not on the stove today."
                : dish.reason === "kitchen_closed"
                  ? "The kitchen is closed right now."
                  : "It is off the menu for the moment."}
        </p>
        <Link
          href="/food?open=1"
          className="mt-3.5 inline-block rounded-xl border border-yellow/50 px-4 py-2.5 font-dm text-sm font-bold text-yellow transition-colors hover:bg-yellow/10"
        >
          {t.dish.seeReady}
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-dark-card p-5">
      {dish.variants.length > 1 && (
        <fieldset>
          <legend className="font-bebas text-[11px] tracking-[0.25em] text-muted">{t.dish.chooseSize}</legend>
          <div className="mt-2.5 space-y-2">
            {dish.variants.map((v) => {
              const out = v.stock <= 0;
              return (
                <label
                  key={v.id}
                  className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-colors ${
                    variantId === v.id
                      ? "border-yellow bg-yellow/10"
                      : "border-white/15 hover:bg-white/[0.04]"
                  } ${out ? "cursor-not-allowed opacity-45" : ""}`}
                >
                  <span className="flex items-center gap-2.5">
                    <input
                      type="radio"
                      name="size"
                      value={v.id}
                      checked={variantId === v.id}
                      disabled={out}
                      onChange={() => { setVariantId(v.id); setQty(1); }}
                      className="h-4 w-4 accent-[#F5C842]"
                    />
                    <span className={`font-dm text-sm ${variantId === v.id ? "text-yellow" : "text-offwhite"}`}>
                      {v.name ?? "Standard"}
                      {/* Sold-out sizes stay VISIBLE. A dish that silently
                          loses a size reads as a bug, not as a sold-out size. */}
                      {out && <span className="ml-1.5 text-muted">· sold out</span>}
                    </span>
                  </span>
                  <span className="shrink-0 font-syne text-sm font-extrabold text-offwhite">
                    Rs {centsToShortString(v.price)}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-full border border-white/15 p-1">
          <button
            type="button"
            aria-label={t.dish.oneFewer}
            onClick={() => setQty((n) => Math.max(1, n - 1))}
            disabled={qty <= 1}
            className="flex h-9 w-9 items-center justify-center rounded-full text-offwhite disabled:opacity-30"
          >
            <Minus size={16} />
          </button>
          <span className="min-w-8 text-center font-syne text-base font-extrabold tabular-nums">{qty}</span>
          <button
            type="button"
            aria-label={t.dish.oneMore}
            onClick={() => setQty((n) => Math.min(max, n + 1))}
            disabled={qty >= max}
            className="flex h-9 w-9 items-center justify-center rounded-full text-offwhite disabled:opacity-30"
          >
            <Plus size={16} />
          </button>
        </div>
        <p className="font-syne text-xl font-extrabold text-yellow tabular-nums">
          Rs {centsToDecimalString(lineTotal)}
        </p>
      </div>

      {max <= 5 && max > 0 && (
        <p className="mt-2 font-dm text-xs text-orange-300">
          Only {max} portion{max === 1 ? "" : "s"} left today.
        </p>
      )}

      <button
        type="button"
        onClick={add}
        disabled={!variant || max === 0}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-yellow px-5 py-4 font-dm text-base font-bold text-dark transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        <ShoppingBag size={17} /> {t.dish.addToOrder}
      </button>

      {dish.prepMin != null && dish.prepMax != null && (
        <p className="mt-3 flex items-center justify-center gap-1.5 font-dm text-xs text-muted">
          <Clock size={12} />
          Usually ready in {dish.prepMin}–{dish.prepMax} minutes once the kitchen starts
        </p>
      )}
    </div>
  );
}
