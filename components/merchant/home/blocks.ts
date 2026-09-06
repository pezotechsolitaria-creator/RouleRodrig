import type { MerchantKind } from "@/lib/merchant/kind";

// ── WHICH BLOCKS EACH KIND OF BUSINESS SEES ─────────────────────────────────
//
// The rule that makes this cheap, and the one worth defending in review:
//
//        A BLOCK NEVER RECEIVES KIND. KIND PICKS THE BLOCK.
//
// A block that takes a `kind` prop and branches inside is the fourteen-block
// home screen coming back one component at a time. If a block needs to say
// "dishes" for a kitchen and "products" for a shop, that is two blocks, and the
// registry chooses. The blocks that genuinely serve everyone — the payment
// blocker, the work queue, the trading status — take no kind because the
// question they answer is the same for a baker and a box office.
//
// ── THE SPINE IS NOT IN HERE ───────────────────────────────────────────────
// Six blocks render for every kind in the same order, so they are composed
// directly by the page rather than named here: a registry whose every entry is
// identical is a lookup table pretending to be a decision. Three of the six
// render null on a healthy business, which is why a working shop's home is
// short rather than padded.
//
// ── ADDING A KIND ──────────────────────────────────────────────────────────
// One line below. TypeScript then refuses to build until it exists, because the
// Record is exhaustive over MerchantKind — the guarantee a boolean could not
// give and the reason lib/merchant/kind.ts is a union rather than a flag.

/** Blocks that vary by what sort of business this is. */
export type BlockId = "Stock" | "Earnings";

export const HOME_BLOCKS: Record<MerchantKind, BlockId[]> = {
  // A shop counts units and runs out of them.
  shop: ["Stock", "Earnings"],

  // A kitchen counts portions, but "12 low stock items" is the wrong sentence
  // for a cook — the question is what is still servable today, which is a
  // different query and therefore a different block. Until that block exists a
  // kitchen sees only its money, which is true, rather than a shop's stock
  // report wearing a kitchen's noun.
  kitchen: ["Earnings"],

  // A box office sells against an allocation that cannot be restocked, so
  // "low stock" is not a warning, it is the point. Tickets sold against tickets
  // remaining is its own block and is not written yet.
  events: ["Earnings"],
};
