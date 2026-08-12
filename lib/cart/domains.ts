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
