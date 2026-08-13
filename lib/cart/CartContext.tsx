"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

// ── THREE DOMAINS, AND THE MARKETPLACE HOLDS SEVERAL SHOPS ──────────────────
//
// A cart is a pure client-side intent list — {variantId, quantity} in
// localStorage. It is NEVER trusted for price or availability: every price
// shown comes from a live re-fetch (/api/cart/resolve), and checkout
// (/api/checkout → create_order()) only reads variantId + quantity, re-deriving
// everything else from the database.
//
// There is one cart PER DOMAIN, and they are completely independent:
//
//     food   — dishes, from one kitchen
//     shop   — marketplace products, from any number of shops
//     events — tickets, for one event
//
// ── WHY SHOP IS DIFFERENT NOW (M96) ────────────────────────────────────────
// Every domain used to hold exactly one seller. For food and tickets that is a
// physical fact (see MULTI_SELLER in ./domains). For the marketplace it was an
// accident: the reason an ORDER stays with one shop is that the customer pays
// that shop's own bank account directly, which is a checkout constraint, not a
// basket constraint. Enforcing it in the basket produced the worst dialog on
// the site — "your cart has items from another shop, clear it?" — which asks a
// shopper to abandon one purchase to make another.
//
// So every domain now stores a LIST of baskets, and the domain's policy decides
// whether a second one is allowed. Food and tickets still prompt. The
// marketplace simply opens another basket, and /cart shows them side by side
// with a Checkout button each.
//
// ── WHAT DID NOT CHANGE ────────────────────────────────────────────────────
// orders.store_id is still singular and create_order() is untouched. A basket
// is still a client-side intent list. `useCart(domain).cart` still returns the
// single basket for single-seller domains, so food and ticketing call sites did
// not have to move.

// Defined in a directive-free module so SERVER components can read them too —
// importing a plain value from a "use client" module gives them a client
// reference, not the value. See lib/cart/domains.ts.
export { CART_DOMAINS, toCartDomain, MULTI_SELLER, type CartDomain } from "./domains";
import { CART_DOMAINS, MULTI_SELLER, type CartDomain } from "./domains";
// The decisions themselves live in a plain module so they can be tested without
// a DOM. This file is the context and the localStorage adapter, nothing more.
import {
  addToBaskets, clearBaskets, countItems, migrateStored, prune, setQuantity,
  type Basket, type CartLine,
} from "./baskets";

export type { Basket, CartLine };
/** Kept for the single-seller call sites that still think in one basket. */
export type CartState = Basket | null;

const STORAGE_PREFIX = "rr-cart-v3-";
/** The one-basket-per-domain layout this replaced. Read once, then rewritten. */
const V2_PREFIX = "rr-cart-v2-";
/**
 * The single-cart key that preceded even that.
 *
 * Migrated into `shop` rather than guessed at: the key was named for the
 * marketplace and served only it for most of its life, and deciding a cart's
 * domain properly needs a network round trip that this synchronous read cannot
 * make.
 */
const LEGACY_KEY = "rr-marketplace-cart";

const keyFor = (domain: CartDomain) => `${STORAGE_PREFIX}${domain}`;

function readRaw(key: string): unknown {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** A domain's baskets, lifting the older storage layouts on first read. */
function readDomain(domain: CartDomain): Basket[] {
  const current = readRaw(keyFor(domain));
  // v2 held one object per domain; the pre-v2 key held one for the whole app.
  const legacy = readRaw(`${V2_PREFIX}${domain}`) ?? (domain === "shop" ? readRaw(LEGACY_KEY) : null);
  const migrated = migrateStored(current, legacy);
  if (migrated === null) return [];

  // Rewrite in the current layout only when something older was found, so a
  // normal read stays a read.
  if (!Array.isArray(current)) {
    writeDomain(domain, migrated);
    try {
      window.localStorage.removeItem(`${V2_PREFIX}${domain}`);
      if (domain === "shop") window.localStorage.removeItem(LEGACY_KEY);
    } catch {
      /* a full or blocked localStorage must not break the page */
    }
  }
  return migrated;
}

function readAll(): Record<CartDomain, Basket[]> {
  const out = { food: [], shop: [], events: [] } as Record<CartDomain, Basket[]>;
  if (typeof window === "undefined") return out;
  for (const d of CART_DOMAINS) out[d] = readDomain(d);
  return out;
}

function writeDomain(domain: CartDomain, baskets: Basket[]) {
  if (typeof window === "undefined") return;
  // An empty basket is not a basket. Dropping them here means every consumer
  // can treat "present" as "has something in it".
  const kept = prune(baskets);
  try {
    if (kept.length === 0) window.localStorage.removeItem(keyFor(domain));
    else window.localStorage.setItem(keyFor(domain), JSON.stringify(kept));
  } catch {
    /* quota or private mode — the in-memory cart still works for this session */
  }
}

export type CartApi = {
  /**
   * THE basket, for single-seller domains. For the marketplace this is the
   * first one and is deliberately of limited use — anything that renders the
   * marketplace basket should read `baskets`.
   */
  cart: CartState;
  /** Every basket in this domain, in the order they were started. */
  baskets: Basket[];
  /** False until the first client render has read localStorage. Consumers must
   * not treat an empty list as "genuinely empty" before this is true — SSR and
   * the first paint always see none, and deciding "empty" too early flashes an
   * empty state that races with the real data. */
  hydrated: boolean;
  /** Across every basket in this domain. */
  itemCount: number;
  basketFor: (storeId: string) => Basket | null;
  /** "conflict" only ever comes back from a SINGLE-SELLER domain. */
  addItem: (opts: { storeId: string; storeName: string; variantId: string; quantity: number }) => "ok" | "conflict";
  /** The variant identifies its basket — a variant belongs to exactly one shop. */
  updateQuantity: (variantId: string, quantity: number) => void;
  removeItem: (variantId: string) => void;
  /** One shop's basket, or the whole domain when called with no argument. */
  clear: (storeId?: string) => void;
};

type CartsContextValue = {
  baskets: Record<CartDomain, Basket[]>;
  hydrated: boolean;
  /** Total across every domain — for a global badge. */
  totalItemCount: number;
  countFor: (domain: CartDomain) => number;
  setDomain: (domain: CartDomain, next: (prev: Basket[]) => Basket[]) => void;
};

const CartsContext = createContext<CartsContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [baskets, setBaskets] = useState<Record<CartDomain, Basket[]>>({ food: [], shop: [], events: [] });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setBaskets(readAll());
    setHydrated(true);
  }, []);

  const setDomain = useCallback<CartsContextValue["setDomain"]>((domain, next) => {
    setBaskets((prev) => {
      const updated = prune(next(prev[domain]));
      writeDomain(domain, updated);
      return { ...prev, [domain]: updated };
    });
  }, []);

  // Keep multiple tabs in sync across every key this module owns.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key && (e.key.startsWith(STORAGE_PREFIX) || e.key.startsWith(V2_PREFIX) || e.key === LEGACY_KEY)) {
        setBaskets(readAll());
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const countFor = useCallback((domain: CartDomain) => countItems(baskets[domain] ?? []), [baskets]);

  const totalItemCount = useMemo(
    () => CART_DOMAINS.reduce((sum, d) => sum + countItems(baskets[d] ?? []), 0),
    [baskets],
  );

  const value = useMemo(
    () => ({ baskets, hydrated, totalItemCount, countFor, setDomain }),
    [baskets, hydrated, totalItemCount, countFor, setDomain],
  );

  return <CartsContext.Provider value={value}>{children}</CartsContext.Provider>;
}

/** Every basket at once — for /cart, and for any badge that counts the lot. */
export function useCarts(): CartsContextValue {
  const ctx = useContext(CartsContext);
  if (!ctx) throw new Error("useCarts must be used within CartProvider");
  return ctx;
}

/**
 * One domain's baskets.
 *
 * The domain is passed explicitly at every call site rather than inferred from
 * the URL: a component knows what it is selling, and a route does not — the
 * same /cart page serves all three.
 */
export function useCart(domain: CartDomain): CartApi {
  const { baskets: all, hydrated, setDomain } = useCarts();
  const baskets = useMemo(() => all[domain] ?? [], [all, domain]);
  const multi = MULTI_SELLER[domain];

  const addItem = useCallback<CartApi["addItem"]>(
    (opts) => {
      let result: "ok" | "conflict" = "ok";
      setDomain(domain, (prev) => {
        const next = addToBaskets(prev, opts, multi);
        result = next.result;
        return next.baskets;
      });
      return result;
    },
    [domain, multi, setDomain],
  );

  const updateQuantity = useCallback<CartApi["updateQuantity"]>(
    (variantId, quantity) => setDomain(domain, (prev) => setQuantity(prev, variantId, quantity)),
    [domain, setDomain],
  );

  const removeItem = useCallback<CartApi["removeItem"]>(
    (variantId) => updateQuantity(variantId, 0),
    [updateQuantity],
  );

  const clear = useCallback<CartApi["clear"]>(
    (storeId) => setDomain(domain, (prev) => clearBaskets(prev, storeId)),
    [domain, setDomain],
  );

  const basketFor = useCallback(
    (storeId: string) => baskets.find((b) => b.storeId === storeId) ?? null,
    [baskets],
  );

  const itemCount = useMemo(() => countItems(baskets), [baskets]);

  return useMemo(
    () => ({
      cart: baskets[0] ?? null,
      baskets,
      hydrated,
      itemCount,
      basketFor,
      addItem,
      updateQuantity,
      removeItem,
      clear,
    }),
    [baskets, hydrated, itemCount, basketFor, addItem, updateQuantity, removeItem, clear],
  );
}
