// The words the order path uses for whoever is selling.
//
// ── WHY THIS EXISTS ────────────────────────────────────────────────────────
// /cart, /checkout and /orders are shared by the marketplace and by food,
// because they wrap ONE order model and forking them would mean maintaining two
// checkouts with two sets of payment rules and two sets of bugs. But they were
// written when the marketplace was the only customer, so every noun in them is
// "shop": a customer who has just chosen octopus curry is told to "Continue
// shopping", that "this shop is closed", and that their basket will be ready to
// "browse shops" again — and the back link drops them into a directory of honey
// and baskets.
//
// That is the mixing the owner objected to, and it is not cosmetic: it makes
// food feel like a department of the marketplace rather than its own product,
// and it sends a hungry customer to the wrong page at the exact moment they are
// most likely to leave.
//
// So the pages keep ONE implementation and take their NOUNS from here. Adding a
// third kind of seller later is a new entry in this file, not a third checkout.
//
// The decision is made from data, never from a route: the same /cart URL serves
// both, and `isFood` comes from whether the cart's store has a food_kitchens row
// (resolved server-side in /api/cart/resolve). A customer cannot flip it.

export type SellerVocab = {
  /** "shop" / "kitchen" — the seller, lower case, mid-sentence. */
  seller: string;
  /** "shops" / "kitchens" */
  sellers: string;
  /** Where "keep browsing" should go. */
  browseHref: string;
  /** The label on that link. */
  browseLabel: string;
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
  emptyTitle: "Your order is empty",
  emptyBody: "Pick something from the menu and it lands here.",
  items: "dishes",
  cartTitle: "Your order",
  pickupHint: "Collect from the kitchen. No delivery fee.",
  notesPlaceholder: "Anything the kitchen should know? (optional)",
  phoneReason: "Enter your phone number so the kitchen can reach you.",
};

export function vocabFor(isFood: boolean | null | undefined): SellerVocab {
  return isFood ? FOOD_VOCAB : SHOP_VOCAB;
}
