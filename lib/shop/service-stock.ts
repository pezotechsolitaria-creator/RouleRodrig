// ── A SERVICE HAS NO STOCK ──────────────────────────────────────────────────
//
// `product_variants.stock_quantity` is `not null default 0`, so there is no
// "not tracked" state to put an hour of a plumber's time in. The merchant form
// asks "Stock quantity *" and a service has no answer to give it — and 0, the
// only honest-looking answer, is the exact value the shop floor reads as SOLD
// OUT (MarketProductCard renders on `!p.inStock`).
//
// That is not hypothetical. Four services shipped struck through on the new
// shelves — party setup, a call-out hour, a full valet, a quick wash — because
// half the seeds passed a number and half did not. M192 corrected those rows;
// this is what stops the next one happening.
//
// ── WHY A NUMBER, AND NOT NULL ──────────────────────────────────────────────
// Making the column nullable would be the textbook model, and it would change
// the meaning of `stock_quantity <= 0` in every RPC, cart check and card in the
// product path at once — in TypeScript `null <= 0` is true, so a service would
// read as sold out in exactly the places this exists to fix.
//
// A number is also not the lie it looks like, because nothing decrements this
// column on a sale: apply_inventory_movement() is its only writer in the whole
// database and no function calls it — it is reached from the merchant's own
// stock screen. The column is an availability switch a merchant sets by hand,
// not a ledger. For something sold by the hour, "a number it will never reach"
// is precisely what that switch means.

/** What the merchant form writes for something sold by the hour, not the unit. */
export const ALWAYS_AVAILABLE = 9999;

/**
 * Whether a stored quantity means "always available" rather than a real count.
 *
 * A threshold, not equality: a merchant who typed 10000 into the box by hand
 * means the same thing, and re-opening their listing must not present it as a
 * countable product and quietly offer to sell 10000 haircuts.
 */
export function isAlwaysAvailable(stock: number | null | undefined): boolean {
  return typeof stock === "number" && stock >= ALWAYS_AVAILABLE;
}
