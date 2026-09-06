// ── WHAT KIND OF BUSINESS IS THIS? ──────────────────────────────────────────
//
// "Merchant" is not one thing on this platform. The owner's own login reaches a
// marketplace shop, a food kitchen and three event box offices — five stores,
// three different businesses, one console.
//
// Kind used to be computed once in the merchant layout, flattened immediately
// to a boolean named `isKitchen`, and thrown away. It never entered the store
// resolver's return type, so twenty API routes and a dozen pages were
// kind-blind by construction, and a boolean has no room for a third answer.
//
// ── EVERY CONSUMER IS AN EXHAUSTIVE RECORD ─────────────────────────────────
// Not a switch with a default, and not a chain of ternaries. `Record<MerchantKind, T>`
// means adding a fourth kind FAILS THE BUILD at every place that has to decide
// something, which is the guarantee a boolean cannot give. The codebase already
// uses this shape three times — lib/cart/domains.ts, lib/food/vocabulary.ts and
// lib/admin/order-desk.ts — and the merchant console was the one place that did
// not.
//
// ── ADDING 'service' LATER ─────────────────────────────────────────────────
// A car wash or a plumber sells a booked slot rather than stock. When
// trade_providers exists it is: one member on this union, one KIND_VOCAB entry,
// one extra probe in getAccessibleStores, and one entry in the home block list.
// It is deliberately NOT here yet — an unreachable case in a Record is the same
// lie as a stat card showing a zero, and this file exists to stop exactly that.

export type MerchantKind = "shop" | "kitchen" | "events";

export type KindVocab = {
  /** The word in the header chip. */
  badge: string;
  /** What this business calls the thing it sells, singular. */
  noun: string;
  /** Nav slot three: the catalogue, named for this kind. */
  catalogue: { label: string; href: string };
  /**
   * Does this business hold stock that can run out? A kitchen counts portions
   * and a shop counts units; a box office sells against an allocation and a
   * future service provider sells time, which cannot be "low".
   */
  hasStock: boolean;
  /**
   * Does the customer choose how they receive it? A box office does not
   * deliver a ticket — and a merchant with all three fulfilment options off is
   * currently told in red that they have "no fulfilment method", an error
   * describing a business operating perfectly normally.
   */
  hasFulfilmentChoice: boolean;
};

export const KIND_VOCAB: Record<MerchantKind, KindVocab> = {
  shop: {
    badge: "MERCHANT",
    noun: "product",
    catalogue: { label: "Products", href: "/merchant/products" },
    hasStock: true,
    hasFulfilmentChoice: true,
  },
  kitchen: {
    badge: "KITCHEN",
    noun: "dish",
    catalogue: { label: "Menu", href: "/merchant/menu" },
    hasStock: true,
    hasFulfilmentChoice: true,
  },
  events: {
    badge: "BOX OFFICE",
    noun: "ticket",
    // Tickets ARE products underneath — ticket_types hangs off a variant — so
    // this points at the same screen under the word the seller uses.
    catalogue: { label: "Tickets", href: "/merchant/products" },
    hasStock: true,
    hasFulfilmentChoice: false,
  },
};

/** Every kind, in the order a switcher should list them. */
export const MERCHANT_KINDS: MerchantKind[] = ["shop", "kitchen", "events"];

export function vocabFor(kind: MerchantKind): KindVocab {
  return KIND_VOCAB[kind];
}
