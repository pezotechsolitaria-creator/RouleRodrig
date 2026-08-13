// The cart domains, in a module with NO "use client" directive.
//
// ── WHY THIS IS NOT IN CartContext.tsx ─────────────────────────────────────
// CartContext.tsx is a client module. When a SERVER component imports a plain
// value from one, React hands it a client *reference* rather than the value —
// so `CART_DOMAINS.includes(...)` inside app/checkout/page.tsx threw at render
// time and the whole checkout returned a 500. It typechecked perfectly, built
// perfectly, and failed only in production, because the RSC boundary is not
// part of the type system.
//
// Constants shared across that boundary therefore live in a directive-free
// module that either side can import. CartContext re-exports them so client
// code can keep importing from one place.

export const CART_DOMAINS = ["food", "shop", "events"] as const;
export type CartDomain = (typeof CART_DOMAINS)[number];

/** Narrow an untrusted string (a query parameter) to a domain. */
export function toCartDomain(raw: string | null | undefined, fallback: CartDomain = "shop"): CartDomain {
  return (CART_DOMAINS as readonly string[]).includes(raw ?? "") ? (raw as CartDomain) : fallback;
}

/**
 * What to CALL each basket when talking to a customer.
 *
 * Not "domain", not "cart=events" — the words someone would use out loud. Lives
 * here rather than in the client context for the reason at the top of this file.
 */
export const CART_BASKET_NAME: Record<CartDomain, string> = {
  food: "Food",
  shop: "Shopping",
  events: "Tickets",
};

// ── HOW MANY SELLERS ONE DOMAIN MAY HOLD AT ONCE ────────────────────────────
//
// This used to be a single rule for the whole app — "one cart, one seller" —
// and it was right for the wrong reason. The reason it is right for FOOD is
// physical: two kitchens means two prep times, two collection points and two
// pickup codes, so asking someone to choose is asking them a real question. For
// TICKETS it is the same shape: one event, one gate.
//
// For the MARKETPLACE it was never true. Nothing about buying honey from one
// shop stops you buying a basket from another; the reason each order stays with
// one shop is that payment is a bank transfer INTO THAT SHOP'S OWN ACCOUNT
// (store_payment_settings is per store) and Roulé Rodrigues holds no money. So
// the constraint is real at CHECKOUT and completely artificial in the BASKET —
// and enforcing it in the basket meant a shopper who found a second thing they
// wanted was shown a dialog offering to throw away the first.
//
// So the marketplace holds one basket per shop, as many as you like, and each
// one checks out on its own. Nothing about the order engine changes: an order
// is still exactly one `orders` row against one `store_id`.
export const MULTI_SELLER: Record<CartDomain, boolean> = {
  food: false,
  shop: true,
  events: false,
};
