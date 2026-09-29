// ── THE META DESCRIPTION OF A VEHICLE PAGE ──────────────────────────────────
//
// The vehicle pages print the owner's own copy, cleaned by metaDescription().
// That fixed the broken characters, but the copy itself was never written for
// a search result. Measured on the live site, 29 Sep 2026:
//
//   /browse/car/suzuki-swift-latest-gen   "Get ready to discover every corner
//                                          of Rodrigues Island in absolute
//                                          comfort and style!"         85 chars
//   /browse/car/toyota-hilux              "🚙 Toyota Hilux – Powerful, Reliable
//                                          & Ready for Adventure Explore …"
//
// Neither says "rental", neither has the price, and the Hilux spends its first
// forty characters repeating the heading. The title already carries the price;
// the description is where the specs and what is included belong, and every
// one of those is already a field on the listing.
//
// Only when there is a price. Without one the caller keeps the owner's copy,
// because a spec list with no price is a worse sentence than his.

import { MAX_DESCRIPTION } from "@/lib/food/meta-description";

type VehicleForMeta = {
  name: string;
  /** Rs per day, already parsed. */
  from: number | null;
  specs?: string[] | null;
  included?: string[] | null;
};

/**
 * Chips and list items are Title Cased ("5 Seats", "2 Reflective Vests"); a
 * sentence is not. Word by word, and only a plain Capitalised word: "GPS",
 * "WhatsApp", "24/7" and "125cc" come through untouched.
 */
function sentenceCase(s: string): string {
  return s
    .split(" ")
    .map((w) => (/^[A-Z][a-z]+$/.test(w) ? w.toLowerCase() : w))
    .join(" ");
}

function upperFirst(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** "a, b and c" */
function list(items: string[]): string {
  return items.length < 2
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const len = (s: string) => Array.from(s).length;

export function vehicleMetaDescription(v: VehicleForMeta): string {
  if (!v.from) return "";
  const name = v.name.replace(/\s+/g, " ").trim();
  const lead = `${name} rental in Rodrigues, Rs ${v.from.toLocaleString("en-US")}/day`;

  // "Helmet Included" is a spec chip on the scooters; it is said properly in
  // the included list, so it is not said twice.
  const specs = (v.specs ?? [])
    .map((s) => s.trim())
    .filter((s) => s && !/included/i.test(s))
    .slice(0, 3)
    .map(sentenceCase);
  const head = specs.length ? `${lead}: ${specs.join(", ")}.` : `${lead}.`;

  // The included list is free text. An item with a comma inside it ("Daily,
  // weekly & long-term rentals", "Well-maintained, clean vehicles") is a
  // selling line, not a thing in the box, and would break the list it joins.
  const included = (v.included ?? [])
    .map((s) => s.trim())
    .filter((s) => s && !s.includes(",") && len(s) <= 32)
    .map(sentenceCase);

  for (let n = included.length; n > 0; n--) {
    const d = `${head} ${upperFirst(list(included.slice(0, n)))} included.`;
    if (len(d) <= MAX_DESCRIPTION) return d;
  }
  return len(head) <= MAX_DESCRIPTION ? head : `${lead}.`;
}
