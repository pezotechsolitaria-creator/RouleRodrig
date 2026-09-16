/**
 * Trim a name so a generated <title> still fits a search result.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * A crawl of all 87 sitemap URLs on 16 Sep 2026 found 29 titles over 60
 * characters, the worst at 83. Most were hand-written and were simply
 * rewritten. Three were not: the experience pages build their title from the
 * operator's own name, and "Île aux Cocos Excursion with Les Inséparables" is
 * 45 characters before any template is added.
 *
 * Google truncates around 60 and does it mid-word, so the choice is not
 * "trimmed or whole" — it is "trimmed where we choose, or cut where Google
 * chooses". This cuts at a word boundary, and the caller keeps the parts worth
 * keeping: the price, which pre-qualifies the tap, and "in Rodrigues", which is
 * the geography somebody searched for.
 *
 * Returns the name UNCHANGED when it already fits, so the common case — a short
 * name — is untouched and no ellipsis appears where none is needed.
 */
export function fitTitle(name: string, max: number): string {
  const clean = (name ?? "").trim();
  if (max <= 0) return "";
  if (clean.length <= max) return clean;

  // One character of headroom for the ellipsis. Cut at the last space before
  // the limit so a word is never sliced; if there is no space — a single very
  // long word — fall back to a hard cut, which is still better than letting
  // the whole title overflow.
  const room = max - 1;
  const hard = clean.slice(0, room);
  const lastSpace = hard.lastIndexOf(" ");
  const body = lastSpace > Math.floor(room * 0.5) ? hard.slice(0, lastSpace) : hard;
  return `${body.replace(/[\s,–—-]+$/, "")}…`;
}
