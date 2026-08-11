"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

// ── THREE CARTS, NOT ONE ────────────────────────────────────────────────────
//
// A cart is a pure client-side intent list — {variantId, quantity} in
// localStorage. It is NEVER trusted for price or availability: every price
// shown comes from a live re-fetch (/api/cart/resolve), and checkout
// (/api/checkout → create_order()) only reads variantId + quantity, re-deriving
// everything else from the database.
//
// It used to be ONE cart for the whole site. That was defensible while the
// marketplace was the only thing selling, and it became wrong the moment food
// and event ticketing arrived: buying a concert ticket and then adding dinner
// made the two fight over the same slot, and the customer was asked to throw
// one away to keep the other. Nobody thinks of a table booking, a bag of chilli
// and two festival tickets as the same basket, and the platform should not
// force them to.
//
// So there is one cart PER DOMAIN, and they are completely independent:
//
//     food   — dishes, from one kitchen
//     shop   — marketplace products, from one shop
//     events — tickets, for one event
//
// ── WHY EACH CART IS STILL SINGLE-SELLER ───────────────────────────────────
// The one-store rule inside a domain is NOT the same limitation and it stays.
// orders.store_id is singular, and for food that is what makes an order
// fulfillable at all: two kitchens means two prep times, two collection points
// and two pickup codes. So adding a dish from another kitchen still prompts —
// but it can no longer be triggered by something that is not even food.
//
// ── THE PAYOFF ─────────────────────────────────────────────────────────────
// A customer can hold dinner, a bag of coffee and two tickets at once and check
// them out one at a time, which is three orders the platform would otherwise
// have talked them out of.

export const CART_DOMAINS = ["food", "shop", "events"] as const;
export type CartDomain = (typeof CART_DOMAINS)[number];

export type CartLine = { variantId: string; quantity: number };
export type CartState = { storeId: string; storeName: string; items: CartLine[] } | null;

const STORAGE_PREFIX = "rr-cart-v2-";
/**
 * The single-cart key this replaced.
 *
 * Migrated into `shop` rather than guessed at: the key was named for the
 * marketplace and served only it for most of its life, and deciding a cart's
 * domain properly needs a network round trip that this synchronous read cannot
 * make. Food had existed for hours when this shipped, so the realistic blast
 * radius is a shop basket landing in the shop cart, which is where it belongs.
 */
const LEGACY_KEY = "rr-marketplace-cart";

function keyFor(domain: CartDomain): string {
  return `${STORAGE_PREFIX}${domain}`;
}

function readOne(key: string): CartState {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CartState;
    if (!parsed || !parsed.storeId || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function readAll(): Record<CartDomain, CartState> {
  const carts = { food: null, shop: null, events: null } as Record<CartDomain, CartState>;
  if (typeof window === "undefined") return carts;

  for (const d of CART_DOMAINS) carts[d] = readOne(keyFor(d));

  // One-time migration off the single-cart key.
  const legacy = readOne(LEGACY_KEY);
  if (legacy && !carts.shop) {
    carts.shop = legacy;
    try {
      window.localStorage.setItem(keyFor("shop"), JSON.stringify(legacy));
      window.localStorage.removeItem(LEGACY_KEY);
    } catch {
      /* a full or blocked localStorage must not break the page */
    }
  }
  return carts;
}

function writeOne(domain: CartDomain, state: CartState) {
  if (typeof window === "undefined") return;
  const key = keyFor(domain);
  if (!state || state.items.length === 0) window.localStorage.removeItem(key);
  else window.localStorage.setItem(key, JSON.stringify(state));
}

export type CartApi = {
  cart: CartState;
  /** False until the first client render has read localStorage. Consumers must
   * not treat `cart === null` as "genuinely empty" before this is true — SSR
   * and the first paint always see null, and deciding "empty" too early flashes
   * an empty state that races with the real data. */
  hydrated: boolean;
  itemCount: number;
  /** "conflict" when this domain's cart already holds a DIFFERENT seller's
   * items. It can no longer be triggered across domains. */
  addItem: (opts: { storeId: string; storeName: string; variantId: string; quantity: number }) => "ok" | "conflict";
  updateQuantity: (variantId: string, quantity: number) => void;
  removeItem: (variantId: string) => void;
  clear: () => void;
};

type CartsContextValue = {
  carts: Record<CartDomain, CartState>;
  hydrated: boolean;
  /** Total across every domain — for a global badge. */
  totalItemCount: number;
  countFor: (domain: CartDomain) => number;
  setCart: (domain: CartDomain, next: (prev: CartState) => CartState) => void;
};

const CartsContext = createContext<CartsContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [carts, setCarts] = useState<Record<CartDomain, CartState>>({ food: null, shop: null, events: null });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setCarts(readAll());
    setHydrated(true);
  }, []);

  const setCart = useCallback<CartsContextValue["setCart"]>((domain, next) => {
    setCarts((prev) => {
      const updated = next(prev[domain]);
      writeOne(domain, updated);
      return { ...prev, [domain]: updated };
    });
  }, []);

  // Keep multiple tabs in sync — now across all three keys.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key && (e.key.startsWith(STORAGE_PREFIX) || e.key === LEGACY_KEY)) setCarts(readAll());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const countFor = useCallback(
    (domain: CartDomain) => carts[domain]?.items.reduce((sum, i) => sum + i.quantity, 0) ?? 0,
    [carts],
  );

  const totalItemCount = useMemo(
    () =>
      CART_DOMAINS.reduce(
        (sum, d) => sum + (carts[d]?.items.reduce((n, i) => n + i.quantity, 0) ?? 0),
        0,
      ),
    [carts],
  );

  const value = useMemo(
    () => ({ carts, hydrated, totalItemCount, countFor, setCart }),
    [carts, hydrated, totalItemCount, countFor, setCart],
  );

  return <CartsContext.Provider value={value}>{children}</CartsContext.Provider>;
}

/** Every cart at once — for /cart, and for any badge that counts the lot. */
export function useCarts(): CartsContextValue {
  const ctx = useContext(CartsContext);
  if (!ctx) throw new Error("useCarts must be used within CartProvider");
  return ctx;
}

/**
 * One domain's cart, with the same API the single cart used to expose.
 *
 * The domain is passed explicitly at every call site rather than inferred from
 * the URL: a component knows what it is selling, and a route does not — the
 * same /cart page serves all three.
 */
export function useCart(domain: CartDomain): CartApi {
  const { carts, hydrated, setCart } = useCarts();
  const cart = carts[domain];

  const addItem = useCallback<CartApi["addItem"]>(
    ({ storeId, storeName, variantId, quantity }) => {
      let result: "ok" | "conflict" = "ok";
      setCart(domain, (prev) => {
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
    },
    [domain, setCart],
  );

  const updateQuantity = useCallback(
    (variantId: string, quantity: number) => {
      setCart(domain, (prev) => {
        if (!prev) return prev;
        if (quantity <= 0) return { ...prev, items: prev.items.filter((i) => i.variantId !== variantId) };
        return { ...prev, items: prev.items.map((i) => (i.variantId === variantId ? { ...i, quantity } : i)) };
      });
    },
    [domain, setCart],
  );

  const removeItem = useCallback(
    (variantId: string) => {
      setCart(domain, (prev) => (prev ? { ...prev, items: prev.items.filter((i) => i.variantId !== variantId) } : prev));
    },
    [domain, setCart],
  );

  const clear = useCallback(() => setCart(domain, () => null), [domain, setCart]);

  const itemCount = useMemo(() => cart?.items.reduce((sum, i) => sum + i.quantity, 0) ?? 0, [cart]);

  return useMemo(
    () => ({ cart, hydrated, itemCount, addItem, updateQuantity, removeItem, clear }),
    [cart, hydrated, itemCount, addItem, updateQuantity, removeItem, clear],
  );
}
