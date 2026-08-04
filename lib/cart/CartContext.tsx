"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

// The cart is a pure client-side intent list — {storeId, items:[{variantId,
// quantity}]} in localStorage. It is NEVER trusted for price or
// availability: every price shown for it comes from a live re-fetch
// (/api/cart/resolve), and checkout (/api/checkout -> create_order()) only
// ever reads variantId + quantity from it, re-deriving everything else from
// the DB. One store per cart — matches orders.store_id being singular, and
// this site's single-shop browsing flow; adding an item from a different
// store prompts to clear the cart first rather than silently merging carts
// that would need to become two separate orders anyway.

export type CartLine = { variantId: string; quantity: number };
type CartState = { storeId: string; storeName: string; items: CartLine[] } | null;

const STORAGE_KEY = "rr-marketplace-cart";

function readStorage(): CartState {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CartState;
    if (!parsed || !parsed.storeId || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStorage(state: CartState) {
  if (typeof window === "undefined") return;
  if (!state || state.items.length === 0) window.localStorage.removeItem(STORAGE_KEY);
  else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

type CartContextValue = {
  cart: CartState;
  /** False until the first client render has read localStorage. Consumers
   * must not treat `cart === null` as "genuinely empty" before this is
   * true — SSR and the very first paint always see null, since
   * localStorage isn't available yet; deciding "empty cart" too early
   * causes a flash of an empty state that can race with the real data. */
  hydrated: boolean;
  itemCount: number;
  /** Returns "conflict" if the cart already holds a different store's items without clearing first. */
  addItem: (opts: { storeId: string; storeName: string; variantId: string; quantity: number }) => "ok" | "conflict";
  updateQuantity: (variantId: string, quantity: number) => void;
  removeItem: (variantId: string) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartState>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setCart(readStorage());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) writeStorage(cart);
  }, [cart, hydrated]);

  // Keep multiple tabs in sync.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) setCart(readStorage());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const addItem = useCallback<CartContextValue["addItem"]>(({ storeId, storeName, variantId, quantity }) => {
    let result: "ok" | "conflict" = "ok";
    setCart((prev) => {
      if (prev && prev.storeId !== storeId && prev.items.length > 0) {
        result = "conflict";
        return prev;
      }
      const base = prev && prev.storeId === storeId ? prev : { storeId, storeName, items: [] };
      const existing = base.items.find((i) => i.variantId === variantId);
      const items = existing
        ? base.items.map((i) => (i.variantId === variantId ? { ...i, quantity: i.quantity + quantity } : i))
        : [...base.items, { variantId, quantity }];
      return { storeId, storeName, items };
    });
    return result;
  }, []);

  const updateQuantity = useCallback((variantId: string, quantity: number) => {
    setCart((prev) => {
      if (!prev) return prev;
      if (quantity <= 0) return { ...prev, items: prev.items.filter((i) => i.variantId !== variantId) };
      return { ...prev, items: prev.items.map((i) => (i.variantId === variantId ? { ...i, quantity } : i)) };
    });
  }, []);

  const removeItem = useCallback((variantId: string) => {
    setCart((prev) => (prev ? { ...prev, items: prev.items.filter((i) => i.variantId !== variantId) } : prev));
  }, []);

  const clear = useCallback(() => setCart(null), []);

  const itemCount = useMemo(() => cart?.items.reduce((sum, i) => sum + i.quantity, 0) ?? 0, [cart]);

  const value = useMemo(
    () => ({ cart, hydrated, itemCount, addItem, updateQuantity, removeItem, clear }),
    [cart, hydrated, itemCount, addItem, updateQuantity, removeItem, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
