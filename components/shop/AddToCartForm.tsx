"use client";

import { useState } from "react";
import Link from "next/link";
import { Minus, Plus, ShoppingCart, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/lib/cart/CartContext";
import { centsToDecimalString } from "@/lib/money";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type CartableVariant = { id: string; name: string | null; price: number; stockQuantity: number; isActive: boolean };

export default function AddToCartForm({
  storeId, storeName, productName, variants,
}: {
  storeId: string; storeName: string; productName: string; variants: CartableVariant[];
}) {
  const { addItem, clear } = useCart();
  const purchasable = variants.filter((v) => v.isActive);
  const [variantId, setVariantId] = useState(purchasable[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [conflict, setConflict] = useState(false);

  const variant = purchasable.find((v) => v.id === variantId) ?? purchasable[0];
  const outOfStock = !variant || variant.stockQuantity <= 0;
  const maxQty = variant ? Math.min(variant.stockQuantity, 100) : 0;

  function commitAdd() {
    if (!variant) return;
    const result = addItem({ storeId, storeName, variantId: variant.id, quantity });
    if (result === "conflict") {
      setConflict(true);
      return;
    }
    toast.success(`Added ${quantity} × ${productName} to cart.`);
  }

  if (purchasable.length === 0) {
    return <p className="font-dm text-sm text-muted">This product isn&apos;t available right now.</p>;
  }

  return (
    <div>
      {variants.length > 1 && (
        <div className="mb-4">
          <label htmlFor="variant" className="mb-1.5 block font-dm text-xs font-medium text-muted">Option</label>
          <select
            id="variant"
            value={variantId}
            onChange={(e) => { setVariantId(e.target.value); setQuantity(1); }}
            className="w-full rounded-xl border border-dark-border bg-dark-card px-4 py-3 font-dm text-sm text-offwhite focus:border-yellow focus:outline-none"
          >
            {purchasable.map((v) => (
              <option key={v.id} value={v.id} disabled={v.stockQuantity <= 0}>
                {v.name ?? "Option"} — Rs {centsToDecimalString(v.price)}{v.stockQuantity <= 0 ? " (out of stock)" : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {variant && (
        <p className="mb-4 font-syne text-2xl font-extrabold text-yellow">Rs {centsToDecimalString(variant.price)}</p>
      )}

      {outOfStock ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.04] px-4 py-3">
          <AlertTriangle size={16} className="shrink-0 text-red-400" />
          <span className="font-dm text-sm text-red-400">Out of stock</span>
        </div>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-3">
            <span className="font-dm text-xs font-medium text-muted">Quantity</span>
            <div className="flex items-center rounded-full border border-white/15">
              <button
                type="button"
                aria-label="Decrease quantity"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
                className="flex h-9 w-9 items-center justify-center text-offwhite transition-colors hover:text-yellow disabled:opacity-30"
              >
                <Minus size={14} />
              </button>
              <span className="w-8 text-center font-dm text-sm text-offwhite" aria-live="polite">{quantity}</span>
              <button
                type="button"
                aria-label="Increase quantity"
                onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
                disabled={quantity >= maxQty}
                className="flex h-9 w-9 items-center justify-center text-offwhite transition-colors hover:text-yellow disabled:opacity-30"
              >
                <Plus size={14} />
              </button>
            </div>
            <span className="font-dm text-xs text-muted">{variant?.stockQuantity} in stock</span>
          </div>

          <Button onClick={commitAdd} className="w-full">
            <ShoppingCart size={15} className="mr-1.5" /> Add to cart
          </Button>
        </>
      )}

      <AlertDialog open={conflict} onOpenChange={setConflict}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start a new cart?</AlertDialogTitle>
            <AlertDialogDescription>
              Your cart has items from another shop. Each order is placed with one shop at a time — clear your
              current cart to add items from {storeName} instead?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep current cart</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConflict(false);
                if (!variant) return;
                clear();
                addItem({ storeId, storeName, variantId: variant.id, quantity });
                toast.success(`Added ${quantity} × ${productName} to cart.`);
              }}
            >
              Clear cart &amp; add
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Link href="/cart" className="mt-3 block text-center font-dm text-xs text-muted hover:text-yellow">
        View cart
      </Link>
    </div>
  );
}
