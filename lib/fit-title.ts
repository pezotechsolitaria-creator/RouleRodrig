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
 * keeping: the price, which pre-qualifies the tap. ("in Rodrigues" used to be
 * kept too; it now yields before the name does — see fitTitleWithTails.)
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

/**
 * A name plus two tails, where the second tail gives way before the name does.
 *
 * SEO audit 2026-09-29 T6: "Île aux Cocos Excursion with Les… — Rs 1,999 in
 * Rodrigues". The name was clipped to keep " in Rodrigues", so the one title
 * that sells the island's most-searched trip no longer said whose trip it was.
 * The name is what somebody matches the result against; "in Rodrigues" is
 * already implied by every other word on a Rodrigues site. So the order of
 * sacrifice is: the optional tail first, then the name, never `keep`.
 */
export function fitTitleWithTails(
  name: string,
  keep: string,
  optional: string,
  max = 60,
): string {
  const clean = (name ?? "").trim();
  if (`${clean}${keep}${optional}`.length <= max) return `${clean}${keep}${optional}`;
  if (`${clean}${keep}`.length <= max) return `${clean}${keep}`;
  return `${fitTitle(clean, max - keep.length)}${keep}`;
}
