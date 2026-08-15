// ── What a PRODUCT looks like when nobody has photographed it ───────────────
//
// The marketplace has, at the time of writing, two product photographs in the
// entire database. A product-first grid built on that renders as a wall of grey
// icon boxes — a page that says "unfinished", which is the opposite of what a
// shopper needs to feel before handing over money.
//
// /food solved the same problem with a warm gradient and a big food emoji
// (lib/food/dish-art.ts). This deliberately does NOT do that. A marketplace
// tile has to read as CATALOGUE, not as dinner: an emoji jar of honey next to a
// woven basket next to a bar of soap is a chat window, not a shop. So a product
// with no photograph gets a printed-plate treatment instead — the product's own
// name set large in the display face, on a surface tinted by its category, with
// the category named in small tracked capitals like a catalogue caption.
//
// THREE RULES, the first two shared with the food version:
//
// 1. DETERMINISTIC. Everything derives from the slug, so a product looks
//    identical on the server, in the browser, and on every later render.
//    Math.random() here is both a hydration mismatch and a grid that reshuffles
//    its own colours as you scroll.
// 2. IT DISAPPEARS. The moment a real photo exists this code stops running for
//    that product. It is scaffolding for a missing asset, never a house style,
//    and it must never compete with a photograph.
// 3. IT IS NEVER MISTAKEN FOR A PHOTO. No fake product silhouettes, no stock
//    imagery, no AI-generated jar of honey. Inventing a picture of goods
//    somebody is about to pay for is a lie with a price tag on it.

/** Deep pairs that all sit correctly on `bg-dark` (#0a0a0a). */
const PALETTE: readonly (readonly [string, string])[] = [
  ["#2A2415", "#12100A"], // amber / honey / preserves
  ["#2C1A16", "#140C0A"], // chilli, spice, piment
  ["#16281F", "#0B1410"], // farm, produce, greens
  ["#1B2430", "#0C1118"], // sea, fish, salt
  ["#241B2C", "#110C15"], // craft, textile, art
  ["#2B2620", "#141210"], // wood, fibre, basketry
] as const;

/**
 * Category slug → palette index. Categories are the owner's own taxonomy, so
 * this maps by MEANING rather than by exact slug: a category renamed in admin
 * keeps its colour, and an unmapped one still gets a stable hashed tint.
 */
const CATEGORY_TINT: readonly (readonly [RegExp, number])[] = [
  [/honey|miel|jam|confiture|sweet|sugar/i, 0],
  [/spice|piment|chilli|chili|epice|pepper|sauce/i, 1],
  [/farm|produce|fruit|veg|legume|agri|plant/i, 2],
  [/fish|seafood|sea|salt|ocean|poisson/i, 3],
  [/craft|art|handmade|artisan|souvenir|gift|beauty|soap/i, 4],
  [/home|living|basket|vannerie|wood|fibre|furniture|textile/i, 5],
] as const;

/** Stable, tiny, never negative — the only property this hash needs. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export type ProductArt = {
  from: string;
  to: string;
  /** The word set large on the plate. Never the whole product name. */
  wordmark: string;
  /** Small tracked caption under it, or "" when the product has no category. */
  caption: string;
};

/** "Large", "500g", "XL" — a size, not a product. */
const SIZE_WORD =
  /^(x{0,2}[sml]|small|medium|large|petit|moyen|grand|\d+\s*(g|kg|mg|ml|cl|l|pcs?|pieces?|pack))$/i;

/**
 * The most identifying part of a product name, short enough to set large.
 *
 * Real catalogues here are full of names like "Miel de Rodrigues — Large" and
 * "Chez Marlène — Piment & Épices — Small": the shop's own name in front, a
 * size on the end, and the actual product in the middle. Printing the first two
 * words would print the seller — which every card already shows, one line down.
 *
 * The rule that survives all of them is that the NOUN COMES LAST, in English
 * and in French alike ("Rodrigues honey", "piment confit"). So: drop the size
 * segments, drop connectives, keep the last two words. That lands on
 * "Miel Rodrigues", "Piment Épices" and "Rodrigues Honey".
 */
export function wordmarkFor(name: string): string {
  const STOP = new Set([
    "de", "du", "des", "la", "le", "les", "el", "and", "the", "of", "a", "an",
    "et", "en", "with", "for", "chez", "aux", "au", "pour", "sans", "&",
  ]);
  const kept = name
    .split(/\s*[—–]\s*|\s+-\s+/)
    .map((seg) => seg.trim())
    .filter((seg) => seg.length > 0 && !SIZE_WORD.test(seg));

  const words = (kept.length ? kept.join(" ") : name)
    .split(/[\s,/]+/)
    .map((w) => w.replace(/[^\p{L}\p{N}'’]/gu, ""))
    .filter((w) => w.length > 0 && !STOP.has(w.toLowerCase()) && !SIZE_WORD.test(w));

  if (words.length === 0) return name.replace(/[^\p{L}\p{N} ]/gu, "").trim().slice(0, 14) || "Product";
  const keep = words.slice(-2);
  const out = keep.join(" ");
  return out.length > 22 ? (keep[keep.length - 1] ?? out).slice(0, 22) : out;
}

/**
 * The look for a product with no photograph.
 *
 * `categoryName` is used for both the tint and the caption; a product with no
 * category still gets a stable colour so a mixed grid is varied rather than
 * uniformly grey.
 */
export function productArt(slug: string, name: string, categoryName?: string | null): ProductArt {
  let idx: number | null = null;
  if (categoryName) {
    for (const [re, i] of CATEGORY_TINT) {
      if (re.test(categoryName)) {
        idx = i;
        break;
      }
    }
  }
  const [from, to] = PALETTE[idx ?? hash(slug) % PALETTE.length];
  return { from, to, wordmark: wordmarkFor(name), caption: categoryName ?? "" };
}
