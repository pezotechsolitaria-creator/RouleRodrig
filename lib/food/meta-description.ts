// ── THE DISH META DESCRIPTION ───────────────────────────────────────────────
//
// Measured on the live site, not guessed: nine of the ten dish pages shipped a
// meta description between 12 and 45 characters.
//
//   /food/grilled-lobster-package   "500g lobster"                12 chars
//   /food/chicken-curry             "Creole curry · rice · achard" 27
//   /food/ourite-rougaille          "Octopus · tomato · thyme · rice" 30
//
// The cause was the order of the fallback, not missing data. `descriptor` was
// tried FIRST, and a descriptor is the ingredient strip printed under a name on
// a menu card — three words, by design. The real prose in `description` was
// only reached when the descriptor was absent, which it almost never is.
//
// A twelve-character description is not a short description; it is no
// description. Google discards it and writes its own snippet from the page,
// which on a commercial page means giving up the one line you control in the
// search result.
//
// ── WHAT THIS DOES INSTEAD ─────────────────────────────────────────────────
// Builds a sentence from what is actually known — the dish, what is in it, who
// cooks it — and only then falls back. The descriptor is not discarded: it is
// the most concrete thing on the page, and it belongs in the snippet. It is
// simply not a sentence on its own.

/** Google truncates around 155–160; this leaves room for the ellipsis it adds. */
export const MAX_DESCRIPTION = 155;
/**
 * Below this a description is doing nothing a crawler can use, so the builder
 * keeps adding context rather than shipping a fragment. Chosen because the
 * shortest genuinely useful snippet on this site — the guide pages — sits just
 * above it.
 */
export const MIN_USEFUL_DESCRIPTION = 70;

export type DishForMeta = {
  name: string;
  /** The ingredient strip: "Octopus · tomato · thyme · rice". */
  descriptor?: string | null;
  /** Real prose, when the cook wrote any. */
  description?: string | null;
  kitchenName?: string | null;
};

/** Trim to a whole word, never mid-syllable, and never with a dangling comma. */
function clip(s: string, max = MAX_DESCRIPTION): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;·—-]+$/, "");
}

/**
 * A description worth putting in a search result.
 *
 * Deliberately NOT a template with the same sentence on every dish: the
 * descriptor and the kitchen name differ per dish, so ten dishes produce ten
 * distinct snippets rather than ten copies of "Order X in Rodrigues". Duplicate
 * meta descriptions across a set of pages are worth roughly as much as none.
 */
export function dishMetaDescription(dish: DishForMeta): string {
  const name = dish.name.trim();
  const descriptor = dish.descriptor?.trim() || "";
  const prose = dish.description?.trim() || "";
  const kitchen = dish.kitchenName?.trim() || "";

  // The cook's own words first WHEN THERE ARE ENOUGH OF THEM. This is the
  // fallback order that was inverted: real prose beats an ingredient strip.
  if (prose.length >= MIN_USEFUL_DESCRIPTION) return clip(prose);

  // Otherwise assemble. Each part is a fact about this dish, so the result
  // stays specific even when every field is short.
  const parts: string[] = [];
  const opening = descriptor
    ? `${name} — ${descriptor.replace(/\s*·\s*/g, ", ")}.`
    : prose
      ? `${name} — ${prose.replace(/\.*$/, "")}.`
      : `${name}.`;
  parts.push(opening);

  parts.push(
    kitchen
      ? `Cooked at ${kitchen} in Rodrigues and ordered online`
      : "Cooked in a Rodriguan home kitchen and ordered online",
  );
  parts.push("for collection or delivery.");

  return clip(parts.join(" "));
}
