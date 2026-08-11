"use client";

import { useRouter } from "next/navigation";
import { Plus, Minus, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/lib/cart/CartContext";
import type { FoodCard as FoodCardType } from "@/lib/food/types";

// One tap to add — the single most important interaction on the food surface.
//
// ── WHY THE CONFLICT PROMPT IS THE PRODUCT, NOT AN ERROR ───────────────────
// The customer sees ONE island-wide menu, so nothing on screen tells them that
// ourite comes from Port Mathurin and the burger from Rivière Cocos. Internally
// those are two stores, and orders.store_id is singular — which is not a
// limitation to work around but the thing that makes the order fulfillable at
// all. One order, one kitchen, one prep time, one collection point, one code.
//
// So the boundary is invisible until the exact moment it matters, and then it
// is explained in the customer's terms ("cooked at another kitchen"), with the
// action they actually want ready to press. Silently merging the carts would
// produce an order nobody can cook; refusing without an escape route would
// simply lose the sale.
//
// ── WHY A DISH WITH SIZES NEVER ADDS FROM HERE ─────────────────────────────
// variantId is non-null only when the dish has exactly one sellable variant
// (M51). When it has more, this renders an arrow to the dish page instead of a
// plus — because "Small or Large?" is a question the customer has to answer,
// and picking one for them is how the wrong food gets cooked.

export default function FoodQuickAdd({
  item, size = "md",
}: {
  item: FoodCardType;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const { cart, addItem, updateQuantity, clear } = useCart();

  const dimensions = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const icon = size === "sm" ? 15 : 17;

  // A dish that cannot be ordered shows WHY on the card itself; the control is
  // simply absent rather than present-and-dead, because a disabled button
  // invites tapping and explains nothing.
  if (!item.orderable) return null;

  if (!item.variantId) {
    return (
      <button
        type="button"
        aria-label={`Choose a size for ${item.name}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          router.push(`/food/${item.slug}`);
        }}
        className={`flex ${dimensions} items-center justify-center rounded-full border border-yellow/50 text-yellow transition-transform hover:scale-110 active:scale-95`}
      >
        <ChevronRight size={icon} strokeWidth={2.5} />
      </button>
    );
  }

  const variantId = item.variantId;
  const inCart =
    cart?.storeId === item.kitchenId
      ? (cart.items.find((i) => i.variantId === variantId)?.quantity ?? 0)
      : 0;

  function add(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    // Never let the cart hold more than the kitchen has left. The database
    // refuses it too (create_order locks the row), but being told at checkout
    // that the last portion went is a worse moment to find out.
    if (inCart >= item.stock) {
      toast.error(`Only ${item.stock} left today.`);
      return;
    }

    const result = addItem({
      storeId: item.kitchenId,
      storeName: item.kitchenName,
      variantId,
      quantity: 1,
    });

    if (result === "conflict") {
      toast.error(`${item.name} is cooked at another kitchen.`, {
        description: `Your order so far is from ${cart?.storeName ?? "a different kitchen"}. One order comes from one kitchen so it can be cooked and collected together.`,
        action: {
          label: "Start a new order",
          onClick: () => {
            clear();
            addItem({
              storeId: item.kitchenId,
              storeName: item.kitchenName,
              variantId,
              quantity: 1,
            });
            toast.success(`${item.name} added.`);
          },
        },
        duration: 8000,
      });
    }
  }

  if (inCart === 0) {
    return (
      <button
        type="button"
        aria-label={`Add ${item.name}`}
        onClick={add}
        className={`flex ${dimensions} items-center justify-center rounded-full bg-yellow text-dark shadow-[0_6px_18px_-4px_rgba(245,200,66,0.55)] transition-transform hover:scale-110 active:scale-95`}
      >
        <Plus size={icon} strokeWidth={2.5} />
      </button>
    );
  }

  return (
    <div
      className="flex items-center gap-1 rounded-full bg-yellow px-1 text-dark"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      <button
        type="button"
        aria-label={`Remove one ${item.name}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          updateQuantity(variantId, inCart - 1);
        }}
        className={`flex ${dimensions} items-center justify-center rounded-full active:scale-90`}
      >
        <Minus size={icon} strokeWidth={2.5} />
      </button>
      <span className="min-w-4 text-center font-syne text-sm font-extrabold tabular-nums">{inCart}</span>
      <button
        type="button"
        aria-label={`Add another ${item.name}`}
        onClick={add}
        className={`flex ${dimensions} items-center justify-center rounded-full active:scale-90`}
      >
        <Plus size={icon} strokeWidth={2.5} />
      </button>
    </div>
  );
}
