// "Add a description." is the admin panel's default placeholder text for a new
// map location (AdminDashboard's location template). Twelve live locations
// still carry it — or a truncated keystroke of it ("Add ", "Add a "), sometimes
// with coordinates pasted after it. The guide pages were rendering that
// placeholder as if it were prose: a quarter of the entries on the two
// most-seen guide pages read "Add a description." to every visitor, every
// crawler, and every AI answer that considered citing them.
//
// The fix is a reading, not a rewrite: these are real micro-places only the
// owner can describe truthfully, so their data stays untouched for the admin
// panel to fill in — the pages simply stop treating placeholder text as
// content. Pair this with the pages' existing "requires prose" filters.
const STUB_PREFIX = /^add a description\b/i;
const STUB_ONLY = /^add(\s+a)?\s*$/i;

/** The text if it is real prose; "" if it is empty or admin placeholder. */
export function realProse(text: string | null | undefined): string {
  const t = (text ?? "").trim();
  if (!t || STUB_PREFIX.test(t) || STUB_ONLY.test(t)) return "";
  return t;
}
