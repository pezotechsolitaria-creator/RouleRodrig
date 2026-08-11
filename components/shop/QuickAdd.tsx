"use client";

import { Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/lib/cart/CartContext";

export type QuickAddVariant = { id: string; price: number; stockQuantity: number };

// The Uber Eats / Wolt tile affordance: a single-variant product is addable
// straight from its card — no page navigation for the common case. Once in the
// cart, the "+" morphs into a stepper showing the quantity, so the tile itself
// answers "how many do I have?". Multi-variant products never render this
// (the card link opens the product page, where the variant is chosen).
//
// This lives INSIDE a Link card, so every handler kills the navigation first.
export default function QuickAdd({
  storeId, storeName, productName, variant,
}: {
  storeId: string; storeName: string; productName: string; variant: QuickAddVariant;
}) {
  const { cart, addItem, updateQuantity, clear } = useCart("shop");
  const inCart = cart?.storeId === storeId ? (cart.items.find((i) => i.variantId === variant.id)?.quantity ?? 0) : 0;

  function add(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const result = addItem({ storeId, storeName, variantId: variant.id, quantity: 1 });
    if (result === "conflict") {
      toast.error(`Your cart has items from ${cart?.storeName ?? "another shop"}.`, {
        description: "Each order is placed with one shop at a time.",
        action: {
          label: "Clear & add",
          onClick: () => {
            clear();
            addItem({ storeId, storeName, variantId: variant.id, quantity: 1 });
          },
        },
      });
    }
  }

  function remove(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    updateQuantity(variant.id, inCart - 1);
  }

  if (inCart === 0) {
    return (
      <button
        type="button"
        aria-label={`Add ${productName} to cart`}
        onClick={add}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-yellow text-dark shadow-[0_6px_18px_-4px_rgba(245,200,66,0.55)] transition-transform hover:scale-110 active:scale-95"
      >
        <Plus size={16} strokeWidth={2.5} />
      </button>
    );
  }

  return (
    <div className="flex h-9 items-center rounded-full bg-yellow text-dark shadow-[0_6px_18px_-4px_rgba(245,200,66,0.55)]">
      <button
        type="button"
        aria-label={`Remove one ${productName} from cart`}
        onClick={remove}
        className="flex h-9 w-8 items-center justify-center rounded-l-full transition-transform active:scale-90"
      >
        <Minus size={14} strokeWidth={2.5} />
      </button>
      <span aria-live="polite" className="min-w-4 text-center font-dm text-xs font-bold">
        {inCart}
      </span>
      <button
        type="button"
        aria-label={`Add one more ${productName} to cart`}
        onClick={add}
        disabled={inCart >= variant.stockQuantity}
        className="flex h-9 w-8 items-center justify-center rounded-r-full transition-transform active:scale-90 disabled:opacity-40"
      >
        <Plus size={14} strokeWidth={2.5} />
      </button>
    </div>
  );
}
