import type { BlogPost } from "@/lib/blog";
import type { CocosBooking } from "@/lib/ile-aux-cocos-listing";
import { RODRIGUES_KNOWLEDGE } from "@/lib/rodrigues-knowledge";

// ── THE FAQs THE GUIDE AND BLOG PAGES RENDER, IN ONE MODULE ─────────────────
// (architecture review 2026-09-30, item 8)
//
// /llms-full.txt is "every FAQ the site renders, as plain text, built from the
// same modules the pages render them from" — and four sets of answers were
// missing from it, because they lived inside page files: the island guide's
// knowledge questions (their wording is the TITLES map in
// app/guide/rodrigues/page.tsx), the Île aux Cocos FAQ, the Rodriguan food
// FAQ, and the blog's question sections. A Next page file may not export
// anything but its page API, so the llms builder could not import them, and a
// second copy typed into the builder would drift the first time either
// changed.
//
// So they live here, word for word as the pages print them, and the pages and
// lib/llms-txt.ts read the same functions. lib/page-faqs.test.ts renders each
// page and fails the moment its FAQPage says anything this module does not.
//
// Nothing here is a price except the Île aux Cocos cost answer, which is the
// listing's own figure (lib/ile-aux-cocos-listing.ts) and is empty of one when
// no listing is found.

/** One question and its answer, the shape the pages' FAQPage markup reads. */
export type PageFaq = { q: string; a: string };

// ── /guide/rodrigues ────────────────────────────────────────────────────────

// Human-readable section titles for the knowledge entries (English, for SEO).
// MUST cover every id in RODRIGUES_KNOWLEDGE — a missing key falls back to the
// raw slug, which then renders as a heading AND ships inside the FAQPage schema.
// That's how "budget" went live as a question Google could index.
export const KNOWLEDGE_TITLES: Record<string, string> = {
  getThere: "How to get to Rodrigues",
  bestTime: "Best time to visit Rodrigues",
  money: "Money & currency",
  phoneData: "Phone, SIM cards & mobile data",
  budget: "How much does a trip to Rodrigues cost?",
  gettingAround: "Getting around the island",
  tortoises: "Giant tortoises — François Leguat Reserve",
  cocos: "Île aux Cocos bird sanctuary",
  caves: "Caverne Patate cave",
  trouDArgent: "Trou d'Argent beach",
  montLimon: "Mont Limon viewpoint",
  food: "Rodriguan food & specialities",
  culture: "Culture, séga & the Port Mathurin market",
  activities: "Activities — snorkelling, diving, kitesurfing",
  safety: "Safety & responsible travel",
  hiddenGems: "Hidden gems",
};

// Last-resort fallback for a knowledge id with no KNOWLEDGE_TITLES entry. The
// old fallback was the raw id, so a missing key rendered "budget" as a heading
// and shipped it into the FAQPage schema as a question Google could index. A
// key should always exist — but if one is ever forgotten again, this degrades
// to something readable instead of leaking a slug.
function humanize(id: string): string {
  const words = id.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The heading /guide/rodrigues prints for a knowledge entry. */
export function knowledgeTitle(id: string): string {
  return KNOWLEDGE_TITLES[id] ?? humanize(id);
}

/** The island guide's questions: each section's heading and its English text. */
export function rodriguesGuideFaq(): PageFaq[] {
  return RODRIGUES_KNOWLEDGE.map((k) => ({ q: knowledgeTitle(k.id), a: k.en }));
}

// ── /guide/ile-aux-cocos ────────────────────────────────────────────────────

/** "Rs 1,999 per person", from the listing — or nothing at all. */
export function cocosPriceText(b: CocosBooking): string | null {
  if (!b.price) return null;
  return `Rs ${b.price.toLocaleString("en-US")}${b.perPerson ? " per person" : ""}`;
}

/** What the listing is and costs, in one sentence; empty without a listing. */
function listedTrip(b: CocosBooking): string {
  if (!b.name) return "";
  const price = cocosPriceText(b);
  return price
    ? `The trip listed on Roule Rodrigues, ${b.name}, is ${price}.`
    : `The trip listed on Roule Rodrigues is ${b.name}.`;
}

const COCOS_PRICE_Q = "How much does the Île aux Cocos excursion cost?";

// Answer-first, because these are the questions asked verbatim and a direct
// first sentence is what an AI answer or a featured snippet can lift whole.
const COCOS_FAQ: PageFaq[] = [
  {
    q: "Can you visit Île aux Cocos on your own?",
    a: "No. The island is a nature reserve and is not open to the public independently — visits are guided, by boat, and access requires authorisation from Discovery Rodrigues Co. Ltd. In practice that means booking through a local operator, who arranges the permission as part of the trip.",
  },
  {
    q: "Where is Île aux Cocos?",
    a: "Four kilometres west of Rodrigues, inside the lagoon. It is uninhabited. Excursions depart from Pointe du Diable by chartered boat.",
  },
  {
    q: "What birds are on Île aux Cocos?",
    a: "It is a breeding site for brown noddy, lesser noddy, sooty tern, fairy tern and roseate tern. Migratory waders recorded there include ruddy turnstone, curlew sandpiper, crab-plover and whimbrel. The nesting colonies are the reason the island is protected and the reason access is limited.",
  },
  {
    q: "Is all of the island open to visitors?",
    a: "No. The southern tip is marked off with wooden posts and closed, to keep people away from the nesting colony. Staying out of it is not a formality — it is the condition the reserve is visited on.",
  },
  {
    q: COCOS_PRICE_Q,
    // Written by cocosFaq() from the listing — see below.
    a: "",
  },
  {
    q: "When should you go?",
    a: "Mornings, and book ahead rather than on the day. Boats go when the lagoon allows, so a trip can be moved for weather — leave a spare day if it matters to you.",
  },
];

/** The Île aux Cocos questions, the cost answer quoting the listing. */
export function cocosFaq(b: CocosBooking): PageFaq[] {
  return COCOS_FAQ.map((f) =>
    f.q === COCOS_PRICE_Q
      ? {
          q: f.q,
          a: [
            "Operators price it themselves and it usually includes the boat and lunch.",
            listedTrip(b),
            "Confirm what is included when you book, because that varies between operators.",
          ]
            .filter(Boolean)
            .join(" "),
        }
      : f,
  );
}

// ── /guide/rodriguan-food ───────────────────────────────────────────────────

export const RODRIGUAN_FOOD_FAQ: PageFaq[] = [
  {
    q: "What is ourite?",
    a: "Octopus, in Mauritian and Rodriguan Creole. It is the most Rodriguan thing on any menu here, usually served as a rougaille or a curry. It is fished on foot on the reef flats at low tide, largely by women known as piqueuses working with iron-tipped sticks.",
  },
  {
    q: "Why is octopus sometimes unavailable in Rodrigues?",
    a: "Because the fishery is closed by law twice a year. The Rodrigues Regional Assembly (Octopus Closed Season) Regulations 2012 make it an offence to collect, kill, fish, land or possess octopus during a closed period. The dates are not fixed: the Commissioner responsible for fisheries sets each closure and announces it in at least two local newspapers.",
  },
  {
    q: "Does the closed season actually work?",
    a: "Yes, measurably. Landings fell from about 770 tonnes a year in 1994 to a low of about 250 tonnes. Thirteen years after the closures began in 2012, they had recovered to roughly 600 tonnes a year. At the October 2025 reopening, 18,504 kg were landed in a single day against 16,384 kg at the equivalent 2024 opening — and the animals were bigger.",
  },
  {
    q: "What is a table d'hôte?",
    a: "A single fixed menu at a set price, historically served at the host's own table for guests staying in the house. On Rodrigues it is the best eating on the island and usually needs a day's notice.",
  },
  {
    q: "When is the Port Mathurin market?",
    a: "It runs through the week, but Saturday is the day the island turns out. Expect achards, piment, local honey, salted and dried fish and octopus, red kidney beans, and tourte in every variation.",
  },
  {
    q: "Is Rodriguan honey a protected product?",
    a: "No, and it is worth being precise. Mauritius only gained a legal route to register geographical indications when the Industrial Property Act 2019 came into force on 31 January 2022. Rodriguan honey has no GI. It is excellent, artisanal and made in small quantities — 171 known beekeepers produced about 15 tonnes in 2013/14, most with fewer than ten hives — but 'protected' would be the wrong word.",
  },
];

// ── /blog/[slug] ────────────────────────────────────────────────────────────

/**
 * A post's FAQ: the sections whose headings literally ARE questions, with the
 * section's own visible paragraphs as the answer — so the markup can never
 * claim a Q&A the page does not render. Empty for a post with none.
 */
export function blogFaq(post: Pick<BlogPost, "sections">): PageFaq[] {
  return post.sections
    .filter((s) => s.heading.trim().endsWith("?"))
    .map((s) => ({ q: s.heading.trim(), a: s.paragraphs.join(" ") }));
}
