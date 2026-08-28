"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Minus, Plus, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/lib/cart/CartContext";
import { centsToDecimalString } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { trackAddToCart } from "@/lib/marketplace/analytics";
import { useShopCopy } from "./ShopCopy";

export type CartableVariant = {
  id: string;
  name: string | null;
  price: number;
  compareAt?: number | null;
  stockQuantity: number;
  isActive: boolean;
};

// ── The buy box ─────────────────────────────────────────────────────────────
//
// Options as TAPPABLE CHIPS rather than a <select>. A dropdown hides the price
// of every option but the chosen one, which is the single fact a shopper is
// comparing when a product comes in two sizes — and on a phone it costs a modal,
// a scroll and a confirm to answer "how much is the big one?".
//
// The old "your cart has items from another shop — clear it?" dialog is gone
// with it: the marketplace holds a basket per shop now (lib/cart/domains.ts),
// so there is nothing to refuse and nothing to throw away.
export default function AddToCartForm({
  storeId, storeName, productName, variants,
}: {
  storeId: string; storeName: string; productName: string; variants: CartableVariant[];
}) {
  const { addItem, basketFor } = useCart("shop");
  const copy = useShopCopy();
  const purchasable = variants.filter((v) => v.isActive);
  // The first variant with stock, so a product whose small size sold out opens
  // on the size you can actually buy.
  const [variantId, setVariantId] = useState(
    (purchasable.find((v) => v.stockQuantity > 0) ?? purchasable[0])?.id ?? "",
  );
  const [quantity, setQuantity] = useState(1);
  // A brief "Added ✓" on the button itself — the confirmation belongs where the
  // tap happened, on top of the toast and the basket badge moving.
  const [justAdded, setJustAdded] = useState(false);
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (addedTimer.current) clearTimeout(addedTimer.current);
  }, []);

  const variant = purchasable.find((v) => v.id === variantId) ?? purchasable[0];
  const outOfStock = !variant || variant.stockQuantity <= 0;
  const maxQty = variant ? Math.min(variant.stockQuantity, 100) : 0;
  const alreadyInBasket = variant
    ? (basketFor(storeId)?.items.find((i) => i.variantId === variant.id)?.quantity ?? 0)
    : 0;

  function commitAdd() {
    if (!variant) return;
    addItem({ storeId, storeName, variantId: variant.id, quantity });
    trackAddToCart({
      storeId, storeName, variantId: variant.id, productName,
      price: variant.price, quantity, surface: "product_page",
    });
    toast.success(copy.buy.addedToast(quantity, productName), {
      description: copy.buy.inBasketFrom(storeName),
      action: { label: copy.header.viewBag, onClick: () => { window.location.href = "/cart"; } },
    });
    setJustAdded(true);
    if (addedTimer.current) clearTimeout(addedTimer.current);
    addedTimer.current = setTimeout(() => setJustAdded(false), 1600);
  }

  if (purchasable.length === 0) {
    return (
      <p className="font-dm text-sm text-muted">
        {copy.buy.unavailable}
      </p>
    );
  }

  return (
    <div>
      {purchasable.length > 1 && (
        <fieldset className="mb-4">
          <legend className="mb-2 font-dm text-xs font-medium text-muted">{copy.buy.chooseOption}</legend>
          <div className="flex flex-wrap gap-2">
            {purchasable.map((v) => {
              const selected = v.id === variant?.id;
              const gone = v.stockQuantity <= 0;
              return (
                <button
                  key={v.id}
                  type="button"
                  aria-pressed={selected}
                  disabled={gone}
                  onClick={() => { setVariantId(v.id); setQuantity(1); }}
                  className={`rounded-xl border px-3.5 py-2.5 text-left font-dm text-sm transition-colors ${
                    selected
                      ? "border-yellow bg-yellow/10 text-offwhite"
                      : "border-white/15 text-muted hover:border-white/30 hover:text-offwhite"
                  } ${gone ? "cursor-not-allowed opacity-40" : ""}`}
                >
                  {/* v.name is the merchant's own word for the size or the
                      colour — data. Only the fallback is ours. */}
                  <span className="block font-medium">{v.name ?? copy.buy.option}</span>
                  <span className={`block text-xs ${selected ? "text-yellow" : "text-muted"}`}>
                    {gone ? copy.card.soldOut : `Rs ${centsToDecimalString(v.price)}`}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {variant && (
        <div className="mb-4 flex flex-wrap items-baseline gap-2">
          <p className="font-syne text-3xl font-extrabold text-yellow">
            Rs {centsToDecimalString(variant.price)}
          </p>
          {variant.compareAt && variant.compareAt > variant.price && (
            <>
              <p className="font-dm text-sm text-muted line-through">
                Rs {centsToDecimalString(variant.compareAt)}
              </p>
              <span className="rounded-full bg-yellow px-2 py-0.5 font-dm text-[11px] font-bold text-dark">
                {copy.buy.save(centsToDecimalString(variant.compareAt - variant.price))}
              </span>
            </>
          )}
        </div>
      )}

      {outOfStock ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <p className="font-dm text-sm font-medium text-offwhite">{copy.buy.soldOutTitle}</p>
          <p className="mt-0.5 font-dm text-xs text-muted">
            {purchasable.length > 1 ? copy.buy.anotherOption : copy.buy.restock}
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <span className="font-dm text-xs font-medium text-muted">{copy.buy.quantity}</span>
            <div className="flex items-center rounded-full border border-white/15">
              <button
                type="button"
                aria-label={copy.buy.decrease}
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
                className="flex h-10 w-10 items-center justify-center text-offwhite transition-colors hover:text-yellow disabled:opacity-30"
              >
                <Minus size={14} />
              </button>
              <span className="w-8 text-center font-dm text-sm text-offwhite" aria-live="polite">{quantity}</span>
              <button
                type="button"
                aria-label={copy.buy.increase}
                onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
                disabled={quantity >= maxQty}
                className="flex h-10 w-10 items-center justify-center text-offwhite transition-colors hover:text-yellow disabled:opacity-30"
              >
                <Plus size={14} />
              </button>
            </div>
            {/* The real number, or nothing. "Only a few left!" on a shelf of 40
                is the cheapest trick in ecommerce and it is not on this site. */}
            {variant && variant.stockQuantity <= 5 && (
              <span className="font-dm text-xs text-orange-300">
                {copy.buy.onlyLeft(variant.stockQuantity)}
              </span>
            )}
          </div>

          <Button onClick={commitAdd} size="xl" className="w-full" aria-live="polite">
            {justAdded ? (
              <>
                <Check size={15} className="mr-1.5" /> {copy.buy.added}
              </>
            ) : (
              <>
                <ShoppingCart size={15} className="mr-1.5" /> {copy.buy.addToBag}
              </>
            )}
          </Button>

          {alreadyInBasket > 0 && (
            <p className="mt-2 text-center font-dm text-xs text-muted">
              {copy.buy.alreadyInBasket(alreadyInBasket, storeName)}
            </p>
          )}
        </>
      )}
    </div>
  );
}
