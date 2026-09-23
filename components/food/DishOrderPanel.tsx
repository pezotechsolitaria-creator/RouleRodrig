"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Minus, ShoppingBag, Clock, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/lib/cart/CartContext";
import { centsToDecimalString, centsToShortString } from "@/lib/money";
import type { FoodDetail } from "@/lib/food/types";
import { useFoodCopy } from "./FoodCopy";

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
//
// ── A KITCHEN THAT NEEDS NOTICE (M216) ─────────────────────────────────────
// `dish.orderable` means "can go in the basket", so a notice kitchen's dish
// gets this panel while the kitchen is closed — the order is for a later slot.
// What it must NOT get is "Usually ready in 15–30 minutes": that is the
// cooking once it starts, and for Chez Banane the customer cannot have it for
// at least a day. The panel says how far ahead instead, and that the day and
// time are chosen at checkout, where WhenPicker offers only bookable slots.
//
// Every word here comes from FOOD_COPY. It used to be English literals in all
// three languages while FoodCopy.tsx said otherwise.

export default function DishOrderPanel({
  dish,
  readyNowExists = false,
}: {
  dish: FoodDetail;
  /**
   * Whether /food?open=1 can list anything (M216): some walk-up kitchen is
   * open. The dish page asks only when this panel will show that exit.
   * Defaults to false — a missing answer must not produce a dead-end link.
   */
  readyNowExists?: boolean;
}) {
  const copy = useFoodCopy();
  const { cart, addItem, clear } = useCart("food");
  const sellable = useMemo(() => dish.variants.filter((v) => v.stock > 0), [dish.variants]);
  const [variantId, setVariantId] = useState<string>(
    () => sellable[0]?.id ?? dish.variants[0]?.id ?? "",
  );
  const [qty, setQty] = useState(1);

  const variant = dish.variants.find((v) => v.id === variantId) ?? dish.variants[0];
  const max = Math.min(variant?.stock ?? 0, 20);
  const lineTotal = (variant?.price ?? dish.price) * qty;
  const notice = dish.minNoticeHours > 0 ? dish.minNoticeHours : 0;

  function add() {
    if (!variant) return;
    const result = addItem({
      storeId: dish.kitchenId,
      storeName: dish.kitchenName,
      variantId: variant.id,
      quantity: qty,
    });

    if (result === "conflict") {
      toast.error(copy.toast.conflictTitle(dish.name), {
        description: copy.toast.conflictBody(cart?.storeName ?? copy.toast.otherKitchen),
        action: {
          label: copy.toast.startNew,
          onClick: () => {
            clear();
            addItem({
              storeId: dish.kitchenId,
              storeName: dish.kitchenName,
              variantId: variant.id,
              quantity: qty,
            });
            toast.success(copy.toast.added(dish.name));
          },
        },
        duration: 8000,
      });
      return;
    }
    toast.success(copy.toast.addedQty(qty, dish.name));
  }

  if (!dish.orderable) {
    const reason = dish.reason;
    return (
      <div className="rounded-2xl border border-orange-400/30 bg-orange-400/5 px-5 py-4">
        <p className="font-syne text-base font-bold text-orange-200">
          {reason ? copy.unavailable[reason] : copy.panel.notAvailable}
        </p>
        <p className="mt-1.5 font-dm text-sm text-orange-100/80">
          {reason === "sold_out" || reason === "wrong_time" || reason === "wrong_day" || reason === "kitchen_closed"
            ? copy.panel.reason[reason]
            : copy.panel.reason.other}
        </p>
        {/* Where to go next. "See what's ready now" is the right exit from a
            walk-up kitchen; from a kitchen that needs notice it points at a
            list that can never contain this kitchen's food, so the exit is
            the rest of ITS menu, which can still be booked. And from a
            walk-up kitchen it is right only while some walk-up kitchen is
            open (readyNowExists, lib/food/ready-now.ts) — otherwise that list
            is empty, and the whole menu, where dishes can still be booked
            ahead, is the exit that leads somewhere. */}
        {notice ? (
          <Link
            href={`/food/k/${dish.kitchenSlug}`}
            className="mt-3.5 inline-block rounded-xl border border-yellow/50 px-4 py-2.5 font-dm text-sm font-bold text-yellow transition-colors hover:bg-yellow/10"
          >
            {copy.chrome.openKitchen(dish.kitchenName)}
          </Link>
        ) : readyNowExists ? (
          <Link
            href="/food?open=1"
            className="mt-3.5 inline-block rounded-xl border border-yellow/50 px-4 py-2.5 font-dm text-sm font-bold text-yellow transition-colors hover:bg-yellow/10"
          >
            {copy.panel.seeReady}
          </Link>
        ) : (
          <Link
            href="/food"
            className="mt-3.5 inline-block rounded-xl border border-yellow/50 px-4 py-2.5 font-dm text-sm font-bold text-yellow transition-colors hover:bg-yellow/10"
          >
            {copy.chrome.kitchenBack}
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-dark-card p-5">
      {/* First, before a size or a quantity: this is not food for tonight.
          Said here rather than discovered at checkout, where the time picker
          would otherwise be the first place the customer meets it. */}
      {notice > 0 && (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-yellow/20 bg-yellow/5 px-3.5 py-2.5 font-dm text-sm leading-snug text-offwhite/90">
          <CalendarClock size={15} className="mt-0.5 shrink-0 text-yellow" aria-hidden />
          <span>{copy.panel.noticeLead(dish.kitchenName, notice)}</span>
        </p>
      )}

      {dish.variants.length > 1 && (
        <fieldset>
          <legend className="font-bebas text-[11px] tracking-[0.25em] text-muted">{copy.panel.chooseSize}</legend>
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
                      {v.name ?? copy.panel.standard}
                      {/* Sold-out sizes stay VISIBLE. A dish that silently
                          loses a size reads as a bug, not as a sold-out size. */}
                      {out && <span className="ml-1.5 text-muted">· {copy.panel.soldOut}</span>}
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
            aria-label={copy.panel.oneFewer}
            onClick={() => setQty((n) => Math.max(1, n - 1))}
            disabled={qty <= 1}
            className="flex h-9 w-9 items-center justify-center rounded-full text-offwhite disabled:opacity-30"
          >
            <Minus size={16} />
          </button>
          <span className="min-w-8 text-center font-syne text-base font-extrabold tabular-nums">{qty}</span>
          <button
            type="button"
            aria-label={copy.panel.oneMore}
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
          {copy.panel.portionsLeft(max)}
        </p>
      )}

      <button
        type="button"
        onClick={add}
        disabled={!variant || max === 0}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-yellow px-5 py-4 font-dm text-base font-bold text-dark transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        <ShoppingBag size={17} /> {copy.panel.addToOrder}
      </button>

      {/* The cooking time, only where it is also when you get the food. */}
      {!notice && dish.prepMin != null && dish.prepMax != null && (
        <p className="mt-3 flex items-center justify-center gap-1.5 font-dm text-xs text-muted">
          <Clock size={12} />
          {copy.panel.readyIn(dish.prepMin, dish.prepMax)}
        </p>
      )}
    </div>
  );
}
