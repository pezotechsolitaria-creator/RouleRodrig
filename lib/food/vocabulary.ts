import type { CartDomain } from "@/lib/cart/domains";

// The words the order path uses for whoever is selling.
//
// ── WHY THIS EXISTS ────────────────────────────────────────────────────────
// /cart, /checkout and /orders are shared by the marketplace, by food and by
// ticketing, because they wrap ONE order model and forking them would mean
// maintaining three checkouts with three sets of payment rules and three sets
// of bugs. But every noun in them was written when the marketplace was the only
// customer, so a customer who had just chosen octopus curry was told to
// "Continue shopping", that "this shop is closed", and that their basket would
// be ready to "browse shops" again — and the back link dropped them into a
// directory of honey and baskets.
//
// That is not cosmetic: it makes food and events feel like departments of the
// marketplace rather than their own products, and it sends a customer to the
// wrong page at the exact moment they are most likely to leave.
//
// So the pages keep ONE implementation and take their NOUNS from here. A fourth
// kind of seller later is a new entry in this file, not a fourth checkout.
//
// ── THE DOMAIN IS DATA, NEVER A ROUTE ──────────────────────────────────────
// The same /cart and /orders/track URLs serve all three, so the domain is
// resolved server-side from the STORE — whether it has a food_kitchens row or
// an events row (/api/cart/resolve, and lookup_order via M55/M56). A customer
// cannot flip it by editing a URL.

export type SellerVocab = {
  /** "shop" / "kitchen" / "organiser" — the seller, lower case, mid-sentence. */
  seller: string;
  /** Plural of the above. */
  sellers: string;
  /** Where "keep browsing" should go. */
  browseHref: string;
  /** The label on that link. */
  browseLabel: string;
  /** Label for the same link when the basket is empty. */
  browseEmptyLabel: string;
  /** Empty-cart heading. */
  emptyTitle: string;
  /** Empty-cart body. */
  emptyBody: string;
  /** The word for what is in the cart. */
  items: string;
  /** Cart page heading. */
  cartTitle: string;
  /** What the customer is told collection means. */
  pickupHint: string;
  /** Placeholder for the free-text note at checkout. */
  notesPlaceholder: string;
  /** What the phone number is for. */
  phoneReason: string;
};

export const SHOP_VOCAB: SellerVocab = {
  seller: "shop",
  sellers: "shops",
  browseHref: "/shop",
  browseLabel: "Continue shopping",
  browseEmptyLabel: "Browse shops",
  emptyTitle: "Your cart is empty",
  emptyBody: "Browse a shop and add something you like.",
  items: "items",
  cartTitle: "Your cart",
  pickupHint: "Collect from the shop. No delivery fee.",
  notesPlaceholder: "Anything the shop should know? (optional)",
  phoneReason: "Enter your phone number so the shop can reach you.",
};

export const FOOD_VOCAB: SellerVocab = {
  seller: "kitchen",
  sellers: "kitchens",
  browseHref: "/food",
  // Not "Continue shopping". Nobody shops for dinner.
  browseLabel: "Add more dishes",
  browseEmptyLabel: "See the menu",
  emptyTitle: "Your order is empty",
  emptyBody: "Pick something from the menu and it lands here.",
  items: "dishes",
  cartTitle: "Your order",
  pickupHint: "Collect from the kitchen. No delivery fee.",
  notesPlaceholder: "Anything the kitchen should know? (optional)",
  phoneReason: "Enter your phone number so the kitchen can reach you.",
};

export const EVENT_VOCAB: SellerVocab = {
  seller: "organiser",
  sellers: "organisers",
  browseHref: "/events",
  browseLabel: "See what's on",
  browseEmptyLabel: "See what's on",
  emptyTitle: "You have no tickets held",
  emptyBody: "Reserve a ticket and it lands here.",
  items: "tickets",
  cartTitle: "Your tickets",
  // A ticket is not collected from a counter — it is scanned at the door, and
  // saying "collect from the shop" here would be actively misleading.
  pickupHint: "Show your QR code at the gate. Nothing to collect beforehand.",
  notesPlaceholder: "Anything the organiser should know? (optional)",
  phoneReason: "Enter your phone number so the organiser can reach you.",
};

const BY_DOMAIN: Record<CartDomain, SellerVocab> = {
  shop: SHOP_VOCAB,
  food: FOOD_VOCAB,
  events: EVENT_VOCAB,
};

/** The vocabulary for a resolved domain. Unknown input falls back to shop. */
export function vocabFor(domain: CartDomain | null | undefined): SellerVocab {
  return (domain && BY_DOMAIN[domain]) || SHOP_VOCAB;
}

/**
 * Turn the two server-resolved booleans into a domain.
 *
 * Kept as booleans on the wire rather than a single string because that is what
 * the underlying question actually is — "does this store have a food_kitchens
 * row / an events row" — and a store can only ever be one of them.
 */
export function domainFromFlags(flags: { isFood?: boolean | null; isEvent?: boolean | null }): CartDomain {
  if (flags.isFood) return "food";
  if (flags.isEvent) return "events";
  return "shop";
}
