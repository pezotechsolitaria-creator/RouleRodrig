// ── THE TEMPLATE'S OWN WORDS, LIVE ON THE SITE ──────────────────────────────
//
// Adding a vehicle in /admin pre-fills its text fields with instructions:
//
//     tagline      "Add a short tagline."
//     description  "Add a description for this car."
//
// Those are prompts to the owner, not copy. Left untouched they render to
// customers, and on 2026-09-09 three of the four cars on /browse/car were
// showing "ADD A SHORT TAGLINE." above the model name — on the page a
// "car rental Rodrigues" searcher lands on.
//
// This does not invent copy and does not edit the owner's row. It only refuses
// to PRINT the placeholder, so the line collapses to nothing until real words
// exist. An empty eyebrow is invisible; "ADD A SHORT TAGLINE." is a shop that
// looks abandoned.
//
// Matched loosely — trimmed, case-insensitive, trailing full stop optional —
// because these are typed by hand into other categories too ("Add a
// description for this scooter").

const PLACEHOLDER = [
  /^add a short tagline\.?$/i,
  /^add a (short )?description( for this \w+)?\.?$/i,
  /^add a tagline\.?$/i,
  /^short tagline\.?$/i,
  /^description\.?$/i,
];

/** Is this the admin form's own prompt rather than something the owner wrote? */
export function isPlaceholderCopy(text: string | null | undefined): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  return PLACEHOLDER.some((re) => re.test(t));
}

/**
 * The text, or null when it is the template's placeholder.
 *
 * Callers already guard on falsiness (`{item.tagline && …}`), so returning
 * null makes the whole line disappear with no other change.
 */
export function realCopy(text: string | null | undefined): string | null {
  const t = (text ?? "").trim();
  if (!t || isPlaceholderCopy(t)) return null;
  return text ?? null;
}
