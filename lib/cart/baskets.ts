// ── The basket rules, as plain functions ────────────────────────────────────
//
// CartContext is a React context and a localStorage adapter; these are the
// decisions it makes. They live here because a cart is the one piece of client
// state where a quiet bug costs real money — an item that silently doubles, a
// quantity that lands in the wrong shop's basket, a migration that drops
// someone's shopping — and none of that is testable through a provider without
// a DOM renderer this project does not carry.

export type CartLine = { variantId: string; quantity: number };
export type Basket = { storeId: string; storeName: string; items: CartLine[] };

export function isBasket(v: unknown): v is Basket {
  const b = v as Basket | null;
  return Boolean(
    b &&
      typeof b.storeId === "string" &&
      b.storeId.length > 0 &&
      Array.isArray(b.items) &&
      b.items.every((i) => i && typeof i.variantId === "string" && typeof i.quantity === "number"),
  );
}

export function countItems(baskets: Basket[]): number {
  return baskets.reduce((sum, b) => sum + b.items.reduce((n, i) => n + i.quantity, 0), 0);
}

/** An empty basket is not a basket — consumers may treat "present" as "has items". */
export function prune(baskets: Basket[]): Basket[] {
  return baskets.filter((b) => b.items.length > 0);
}

export type AddResult = { baskets: Basket[]; result: "ok" | "conflict" };

/**
 * Add a line, opening a basket for the shop if there is not one yet.
 *
 * `multiSeller` decides what happens when the domain already holds a DIFFERENT
 * seller: the marketplace opens a second basket, food and ticketing refuse and
 * let the caller offer a swap.
 */
export function addToBaskets(
  baskets: Basket[],
  opts: { storeId: string; storeName: string; variantId: string; quantity: number },
  multiSeller: boolean,
): AddResult {
  const { storeId, storeName, variantId, quantity } = opts;
  if (quantity <= 0) return { baskets, result: "ok" };

  const existing = baskets.find((b) => b.storeId === storeId);
  if (!multiSeller && !existing && baskets.some((b) => b.items.length > 0)) {
    return { baskets, result: "conflict" };
  }

  const base: Basket = existing ?? { storeId, storeName, items: [] };
  const line = base.items.find((i) => i.variantId === variantId);
  const items = line
    ? base.items.map((i) => (i.variantId === variantId ? { ...i, quantity: i.quantity + quantity } : i))
    : [...base.items, { variantId, quantity }];
  // The name is refreshed on every add: a shop that renames itself should not
  // leave a stale label sitting in someone's basket for weeks.
  const next: Basket = { storeId, storeName, items };

  return {
    baskets: existing ? baskets.map((b) => (b.storeId === storeId ? next : b)) : [...baskets, next],
    result: "ok",
  };
}

/**
 * Set one line's quantity, finding its basket by the VARIANT.
 *
 * A variant belongs to exactly one product, which belongs to exactly one shop,
 * so the caller never has to say which basket it meant — and cannot say the
 * wrong one. Zero or less removes the line; the last line removed takes the
 * basket with it.
 */
export function setQuantity(baskets: Basket[], variantId: string, quantity: number): Basket[] {
  return prune(
    baskets.map((b) =>
      b.items.some((i) => i.variantId === variantId)
        ? {
            ...b,
            items:
              quantity <= 0
                ? b.items.filter((i) => i.variantId !== variantId)
                : b.items.map((i) => (i.variantId === variantId ? { ...i, quantity } : i)),
          }
        : b,
    ),
  );
}

/** One shop's basket, or the whole domain when no shop is named. */
export function clearBaskets(baskets: Basket[], storeId?: string): Basket[] {
  return storeId ? baskets.filter((b) => b.storeId !== storeId) : [];
}

/**
 * Whatever was in localStorage, as a basket list.
 *
 * Three layouts have existed: a single object under one app-wide key, a single
 * object per domain (v2), and this list per domain (v3). Someone mid-purchase
 * when a deploy lands must not lose their shopping, so every older shape is
 * read and lifted rather than discarded.
 */
export function migrateStored(current: unknown, legacy: unknown): Basket[] | null {
  if (Array.isArray(current)) return prune(current.filter(isBasket));
  if (isBasket(legacy)) return prune([legacy]);
  return null;
}
