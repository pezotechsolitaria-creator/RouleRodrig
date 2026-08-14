// Blog posts — informational travel content targeting the questions tourists
// ask BEFORE they book (the "how many days", "best time", "how to get there"
// searches). Each post exists to rank for a real informational keyword and to
// link internally to the money pages (scooter/car) and the guide pages.
//
// Deliberately code-defined, not admin-editable: these are long-form, carefully
// sourced articles where accuracy matters, not quick CMS edits. Every factual
// claim traces to lib/rodrigues-knowledge.ts (researched) or links out to a
// guide page that carries the detail — no invented figures. Quality over volume:
// a few true, useful articles, added at a natural cadence, not AI slop at scale.

export type BlogSection = { heading: string; paragraphs: string[] };

export interface BlogPost {
  slug: string;
  title: string; // <h1> + used in listings
  metaTitle: string; // <title>, kept ≤ 60 chars
  description: string; // meta description, 140–160 chars
  keyword: string; // primary keyword this post targets
  published: string; // ISO date
  updated: string; // ISO date
  readMinutes: number;
  intro: string;
  sections: BlogSection[];
  // Internal links shown at the end — reinforces the money + guide pages.
  related: { href: string; label: string }[];
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "how-many-days-in-rodrigues",
    title: "How Many Days Do You Need in Rodrigues?",
    metaTitle: "How Many Days Do You Need in Rodrigues? | Roule Rodrigues",
    description:
      "How long to spend on Rodrigues Island: a local's honest take on 3, 5 and 7-day trips, what fits in each, and how to see the most of the island.",
    keyword: "how many days in Rodrigues",
    published: "2026-07-18",
    updated: "2026-07-18",
    readMinutes: 6,
    intro:
      "Rodrigues is small — about 18 km end to end — so it's tempting to think a day or two will do it. It won't. The island is slow on purpose, the roads wind, and half its best moments are the ones you didn't plan. Here's an honest answer to how long you actually need, depending on the kind of trip you want.",
    sections: [
      {
        heading: "The short answer: 4 to 5 days",
        paragraphs: [
          "If you want a real feel for Rodrigues without rushing, plan for four or five days. That's enough to see the headline sights, spend unhurried time on two or three beaches, do one boat or reserve excursion, and still have a morning that goes nowhere in particular — which, on Rodrigues, is the point.",
          "Fewer than three days and you'll spend more time moving than being anywhere. More than a week and you'll have seen the island, though plenty of people happily stay longer just to slow down.",
        ],
      },
      {
        heading: "2–3 days: the island's greatest hits",
        paragraphs: [
          "A long weekend covers the essentials. Give one day to the east coast and its beaches — Pointe Coton, the walk to hidden Trou d'Argent — and one to the interior and the giant tortoises at the François Leguat Reserve, plus the view from Mont Limon. Add the Saturday market in Port Mathurin if your dates line up.",
          "It works, but it's tight. You'll be choosing between things rather than doing them all, and the island's quieter corners will stay unseen.",
        ],
      },
      {
        heading: "4–5 days: the sweet spot",
        paragraphs: [
          "With four or five days the island opens up. Beyond the highlights you can add a boat trip to the Île aux Cocos bird sanctuary, an afternoon in the Caverne Patate cave, a coastal hike, and time to actually swim rather than just photograph the lagoon.",
          "This is also enough time to eat well and slowly — Rodriguan food is a reason to visit in itself — and to discover a beach or viewpoint that isn't in any guide, which tends to become the trip's favourite.",
        ],
      },
      {
        heading: "A week or more: the island at its own pace",
        paragraphs: [
          "Seven days lets you do Rodrigues the way locals wish visitors would: no schedule, one thing a day, long lunches, and the freedom to go back to the spot you loved. Kitesurfers, hikers and anyone who came to switch off entirely will fill a week without trying.",
        ],
      },
      {
        heading: "Getting around is the real decision",
        paragraphs: [
          "However many days you have, how you get around decides how much of the island you actually reach. Rodrigues has little traffic, good roads and short distances, which makes a scooter the natural way to explore — you can be at a different beach every day and stop wherever the view is. A car makes more sense for families or a longer stay.",
          "Whatever you choose, book it before you arrive: the island is small and the good vehicles go quickly in season.",
        ],
      },
    ],
    related: [
      { href: "/browse/scooter", label: "Rent a scooter to explore the island" },
      { href: "/guide/beaches", label: "The best beaches in Rodrigues" },
      { href: "/guide/routes", label: "Scooter routes around the island" },
      { href: "/guide/hiking", label: "Hiking trails in Rodrigues" },
      { href: "/guide/rodrigues", label: "The full local's guide to Rodrigues" },
    ],
  },
];

export function getPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}
