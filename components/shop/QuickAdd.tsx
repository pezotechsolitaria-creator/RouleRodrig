"use client";

import { Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/lib/cart/CartContext";
import { trackAddToCart, trackRemoveFromCart } from "@/lib/marketplace/analytics";

export type QuickAddVariant = { id: string; price: number; stockQuantity: number };

// The tile affordance every serious commerce grid ships: a product whose choice
// is already made — exactly one purchasable variant — is addable straight from
// its card, with no page navigation for the common case. Once in the basket the
// "+" morphs into a stepper showing the quantity, so the tile itself answers
// "how many do I have?". Multi-variant products never render this; their card
// opens the product page, where the picker lives.
//
// ── NO MORE "CLEAR YOUR CART?" ─────────────────────────────────────────────
// This used to catch a "conflict" from the cart and offer to throw away the
// shopper's existing basket, because the whole app held one seller at a time.
// The marketplace now opens a basket per shop (lib/cart/domains.ts), so adding
// honey from one shop and a basket from another is just two adds. The toast
// says which shop it went to, because that is the thing that is no longer
// obvious once several baskets exist.
//
// This lives INSIDE a Link card, so every handler kills the navigation first.
export default function QuickAdd({
  storeId, storeName, productName, variant,
}: {
  storeId: string; storeName: string; productName: string; variant: QuickAddVariant;
}) {
  const { basketFor, addItem, updateQuantity } = useCart("shop");
  const inCart = basketFor(storeId)?.items.find((i) => i.variantId === variant.id)?.quantity ?? 0;

  function add(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (inCart >= variant.stockQuantity) return;
    addItem({ storeId, storeName, variantId: variant.id, quantity: 1 });
    trackAddToCart({
      storeId, storeName, variantId: variant.id, productName,
      price: variant.price, quantity: 1, surface: "quick_add",
    });
    if (inCart === 0) {
      toast.success(`${productName} added`, { description: `In your basket from ${storeName}.` });
    }
  }

  function remove(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    updateQuantity(variant.id, inCart - 1);
    trackRemoveFromCart({ storeId, variantId: variant.id, productName, quantity: 1 });
  }

  if (inCart === 0) {
    return (
      <button
        type="button"
        aria-label={`Add ${productName} to your basket`}
        onClick={add}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-yellow text-dark shadow-[0_6px_18px_-4px_rgba(47,128,237,0.55)] transition-transform hover:scale-110 active:scale-95"
      >
        <Plus size={16} strokeWidth={2.5} />
      </button>
    );
  }

  return (
    <div className="flex h-9 items-center rounded-full bg-yellow text-dark shadow-[0_6px_18px_-4px_rgba(47,128,237,0.55)]">
      <button
        type="button"
        aria-label={`One fewer ${productName}`}
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
        aria-label={`One more ${productName}`}
        onClick={add}
        disabled={inCart >= variant.stockQuantity}
        className="flex h-9 w-8 items-center justify-center rounded-r-full transition-transform active:scale-90 disabled:opacity-40"
      >
        <Plus size={14} strokeWidth={2.5} />
      </button>
    </div>
  );
}
