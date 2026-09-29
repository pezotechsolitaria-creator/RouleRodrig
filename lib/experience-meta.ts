// ── THE META DESCRIPTION OF ONE EXPERIENCE'S OWN PAGE ───────────────────────
//
// These pages used `place.description.slice(0, 155)`, the operator's own text.
// Measured on the live site, 29 Sep 2026:
//
//   /experiences/ile-aux-cocos-…        "🏝️ Excursion à l'Île aux Coco – 1 999 Rs
//                                        par personne\n\nLe prix comprend :\n\n*
//                                        Transport en bateau\n* …Guide su"
//   /experiences/sunrise-hike-…         "📍 Start: Anse aux Anglais\n📍 Finish: …"
//   /experiences/plongee-en-apnee-…     "Free equipment"               14 chars
//
// Emoji, bullet markers and line breaks inside an HTML attribute, French on an
// English page, cut mid-word — or a two-word fragment Google throws away and
// replaces with a snippet of its own choosing.
//
// The operator's prose is written for the page, not for a search result, and
// no amount of trimming turns a bullet list into a sentence. So the snippet is
// BUILT from the structured fields the owner already fills in — name, kind,
// provider, price, duration, group size — which are the facts someone
// comparing results actually needs. Nothing is invented: a field that is
// missing is a clause that is left out.

import type { RecommendedPlace } from "@/lib/defaults";
import { placePrice } from "@/lib/place-detail";
import { formatDuration } from "@/lib/experiences";
import { MAX_DESCRIPTION } from "@/lib/food/meta-description";

type ExperienceForMeta = Pick<
  RecommendedPlace,
  | "name"
  | "serviceType"
  | "isTour"
  | "priceNote"
  | "depositAmount"
  | "providerName"
  | "durationMinutes"
  | "maxGuests"
  | "capacity"
  | "bookable"
>;

// The name says what it is more precisely than the vertical does: "Plongée en
// apnée" is filed under boat trips, and "snorkelling" is the word an English
// search uses. Checked before the service type for that reason.
const KIND_FROM_NAME: [RegExp, string][] = [
  [/apn[ée]e|snorkel|plong[ée]e/i, "a snorkelling trip"],
  [/p[êe]che|fishing/i, "a fishing trip"],
  [/massage|\bspa\b|rituel/i, "a spa treatment"],
  [/\bhike\b|randonn/i, "a guided hike"],
];

const KIND_FROM_SERVICE: Record<NonNullable<RecommendedPlace["serviceType"]>, string> = {
  massage: "a massage",
  fishing: "a fishing trip",
  boat: "a boat trip",
  hiking: "a guided hike",
  chauffeur: "a private driver",
};

function kindOf(p: ExperienceForMeta): string {
  for (const [re, kind] of KIND_FROM_NAME) if (re.test(p.name)) return kind;
  if (p.serviceType) return KIND_FROM_SERVICE[p.serviceType];
  return p.isTour ? "a guided excursion" : "an activity";
}

/** "Rituel Signature Harmony Spa (1 h 30)" — the duration is said separately. */
function bareName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, "").replace(/\s+/g, " ").trim();
}

export function experienceMetaDescription(p: ExperienceForMeta): string {
  const name = bareName(p.name);
  const kind = kindOf(p);
  const where = /rodrigues/i.test(name) ? "" : " in Rodrigues";
  // "Sunrise hike …, a guided hike" says it twice; the name already did.
  const noun = kind.split(" ").pop() ?? "";
  const named = new RegExp(`\\b${noun}`, "i").test(name);
  const provider = p.providerName?.trim();

  const head = (withProvider: boolean) =>
    `${name}${named ? "" : `, ${kind}`}${where}${withProvider && provider ? ` with ${provider}` : ""}.`;

  const price = placePrice(p);
  const duration = formatDuration(p.durationMinutes);
  // capacity is spots per DATE; for a tour that is the group size, for a
  // therapist it is how many appointments fit in a day, which is not.
  const group = p.maxGuests ?? (p.isTour && (p.capacity ?? 0) > 1 ? p.capacity : undefined);

  const facts = (full: boolean) => {
    if (!price) return "";
    const parts = [
      `Rs ${price.toLocaleString("en-US")} per person${full && duration ? ` for ${duration}` : ""}`,
      full && group && group > 1 ? `up to ${group} people` : null,
    ].filter(Boolean);
    return ` ${parts.join(", ")}.`;
  };

  const closers = p.bookable
    ? [" Check the dates and book online.", " Book online."]
    : [" See the details and enquire.", ""];

  // Most to least informative; the first that fits wins. The provider and the
  // group size go before the price does, and the price never goes at all.
  const candidates = [
    ...closers.map((c) => head(true) + facts(true) + c),
    head(true) + facts(true),
    head(true) + facts(false) + closers[1],
    head(false) + facts(false),
  ];
  const fit = candidates.find((d) => Array.from(d).length <= MAX_DESCRIPTION);
  if (fit) return fit;

  // Only a name far longer than any on the site gets here. Cut the name at a
  // word, keep the price.
  const tail = `${where}.${facts(false)}`;
  const room = MAX_DESCRIPTION - Array.from(tail).length - 1;
  const words = name.split(" ");
  let short = "";
  for (const w of words) {
    if (Array.from(`${short} ${w}`.trim()).length > room) break;
    short = `${short} ${w}`.trim();
  }
  return `${short || Array.from(name).slice(0, room).join("")}…${tail}`;
}
