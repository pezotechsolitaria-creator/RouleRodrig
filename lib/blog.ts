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

// `table` renders after the paragraphs. Tables exist for the sections an AI
// answer wants to lift whole — a month-by-month or mode-by-mode comparison is
// citable in a way six paragraphs of prose are not. Every cell must restate a
// fact the surrounding prose already makes: a table is a summary, not a place
// to smuggle in claims the sourced text never made.
export type BlogSection = {
  heading: string;
  paragraphs: string[];
  table?: { headers: string[]; rows: string[][] };
};

// `fr` = URL of the post's French equivalent, when a real one exists. Powers
// the hreflang pair in generateMetadata — and hreflang only works when BOTH
// pages annotate each other, so the French page must carry the mirror block.

export interface BlogPost {
  slug: string;
  title: string; // <h1> + used in listings
  metaTitle: string; // <title>, kept ≤ 60 chars
  description: string; // meta description, 140–160 chars
  keyword: string; // primary keyword this post targets
  published: string; // ISO date
  updated: string; // ISO date
  readMinutes: number;
  fr?: string; // URL of the French equivalent page (see note above)
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
        heading: "How many days are enough? The short answer: 4 to 5",
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
      {
        href: "/blog/rodrigues-itinerary",
        label: "The day-by-day itinerary: 3, 5 or 7 days",
      },
      {
        href: "/browse/scooter",
        label: "Rent a scooter to explore the island",
      },
      { href: "/guide/beaches", label: "The best beaches in Rodrigues" },
      { href: "/guide/routes", label: "Scooter routes around the island" },
      { href: "/guide/hiking", label: "Hiking trails in Rodrigues" },
      {
        href: "/guide/rodrigues",
        label: "The full local's guide to Rodrigues",
      },
    ],
  },

  // ── Every figure below was verified against a primary source before it was
  //    written, and the ones that could NOT be verified are named as such in
  //    the prose rather than quietly dropped. Sources: Mauritius Meteorological
  //    Services, Statistics Mauritius, the Rodrigues Regional Assembly's own
  //    regulations, the Mauritius Shipping Corporation timetable, and the
  //    airport operator. Where two official Mauritian bodies disagree — and on
  //    the distance to Rodrigues they disagree by 50 km — the post says so
  //    rather than picking the prettier number.
  {
    slug: "how-to-get-around-rodrigues",
    title: "How to Get Around Rodrigues",
    metaTitle: "How to Get Around Rodrigues Island | Roule Rodrigues",
    // Same topic, genuinely translated writing — the one FR page that had no
    // hreflang partner anywhere (the audit's orphan). The related list below
    // already offers it to readers; this makes the pairing machine-readable.
    fr: "/fr/se-deplacer-a-rodrigues",
    description:
      "Buses, taxis, scooters and cars in Rodrigues — what each costs, what it actually reaches, and the airport bus timetable almost nobody publishes.",
    keyword: "how to get around Rodrigues",
    published: "2026-08-27",
    updated: "2026-08-27",
    readMinutes: 6,
    intro:
      "Rodrigues is about 18 km long and you can drive its length in well under an hour. That makes it tempting to assume getting around will sort itself out. It will not: there are buses, but they were built for Rodriguans going to work, not for visitors going to beaches, and the last one leaves earlier than you think.",
    sections: [
      {
        // Question-form heading: "how do you get around Rodrigues" is the
        // literal phrasing an AI assistant is asked, and none of this page's
        // 22 headings matched it. The voicey ones below stay voicey.
        heading: "How do you get around Rodrigues?",
        paragraphs: [
          "Hire something. A scooter if there are two of you with light bags; a car if you are a family, have luggage, or want air conditioning and a roof when a shower comes through. Buses exist and are worth knowing about, but no bus goes to the beach you came here for.",
          "The distances are short and the roads are good. What makes them slow is that they climb, drop and turn constantly — the island is hilly in a way the map does not show.",
        ],
        // Every cell restates a fact from the sections below — nothing new.
        table: {
          headers: ["Mode", "Cost", "Best for", "The catch"],
          rows: [
            [
              "Bus",
              "About Rs 29 airport fare",
              "Everyday routes Rodriguans use — about twenty lines from Port Mathurin",
              "Airport service stops at 16:30, and no bus reaches the beaches",
            ],
            [
              "Taxi",
              "No official fare table — agree the price before you get in",
              "Flight arrivals and door-to-door trips",
              "Every driver sets their own fare",
            ],
            [
              "Scooter",
              "The cheapest rental — current rates on our scooter page",
              "Two people with light bags; the narrow coastal lanes",
              "Rain showers, and nowhere for a suitcase",
            ],
            [
              "Car",
              "Daily rates on our car page",
              "Families, luggage, air conditioning, wet afternoons",
              "Costs more than a scooter",
            ],
          ],
        },
      },
      {
        heading: "The bus, honestly",
        paragraphs: [
          "There is a real network: about twenty licensed routes, almost all radiating from the traffic centre at Port Mathurin, regulated by the National Land Transport Authority. It is a proper public service and Rodriguans use it every day.",
          "Two of those routes serve the airport. The stop is a three-minute walk from the terminal, opposite the Plaine Corail police station, running from 06:00 to 16:30, at a fare of about Rs 29 — figures published by the airport operator itself, which is the only place we could find them stated.",
          "That 16:30 is the fact worth carrying. If your flight lands late afternoon, the airport bus is not an option and you will be taking a taxi whether you planned to or not.",
        ],
      },
      {
        heading: "Taxis, and the thing nobody tells you",
        paragraphs: [
          "Taxis meet every scheduled flight from the airport car park. They carry yellow roof signage and a sticker on the front doors, and they may be a car, an SUV or a pick-up. A door-to-door shuttle also meets each flight.",
          "No official fare table is published anywhere in Rodrigues. So agree the price before you get in. That is not haggling and nobody will take it badly — it is simply how it works here, and asking is what a local does.",
          "We deliberately do not print a price list on this site. Any number we invented would end up quoted at a driver who never agreed to it, and the person who loses that argument is a Rodriguan taxi driver rather than a website.",
        ],
      },
      {
        heading: "Should you rent a scooter or a car?",
        paragraphs: [
          "A scooter is cheaper, parks anywhere, and gets you down the narrow coastal lanes where the good swimming is. Two people with day bags need nothing more.",
          "A car earns its money the moment you add a third person, a suitcase, a child, or a wet afternoon. Rodrigues gets rain in short bursts, and the difference between a shower on a scooter and a shower in a car is the difference between a story and a ruined day.",
          "Plenty of visitors do both: a car for the week, a scooter for one day of poking about.",
        ],
      },
      {
        heading: "Driving here",
        paragraphs: [
          "Traffic drives on the LEFT, as in Mauritius. If you are arriving from France or Réunion that is the opposite of your habit, and the first few junctions deserve your full attention.",
          "A licence issued by a competent foreign authority is legally accepted for driving in Mauritius, so you do not need a Mauritian one. The statutory minimum age to drive a car is 18 — note that rental companies commonly set a higher minimum of their own, which is company policy rather than law, so ask whoever you are hiring from.",
          "Speeding is an offence under section 124 of the Road Traffic Act, penalised in bands. We are not printing specific km/h limits here: we could confirm the regulation that sets them, but not the numbers themselves, from any government source — and a made-up speed limit is a worse thing to publish than none.",
        ],
      },
      {
        heading: "Getting here in the first place",
        paragraphs: [
          "Air Mauritius flies daily from SSR International to Plaine Corail (RRG) — about an hour and a half. The airline says 1h35 and the tourism office says 1h30; either way you are there before you have finished a coffee. Air Austral also runs a seasonal service from Réunion, so Rodrigues is not only reachable via Mauritius.",
          "There is a passenger ferry, the MV Mauritius Trochetia, run by the Mauritius Shipping Corporation. It is roughly MONTHLY rather than weekly — the operator's own timetable shows four passenger voyages across September to December 2026 — and the crossing is about 36 hours out from Port Louis and nearer 24 coming back. She carries 108 passengers. Check the schedule before you build a plan around it.",
          "The airport is officially Plaine Corail, renamed in 2017, but the operator's own website still calls it Sir Gaëtan Duval. Both names are in live use and you will hear both.",
        ],
      },
    ],
    related: [
      {
        href: "/browse/scooter",
        label: "Scooters, with prices and availability",
      },
      { href: "/browse/car", label: "Cars for families and longer stays" },
      { href: "/taxi", label: "Local taxi drivers" },
      {
        href: "/fr/se-deplacer-a-rodrigues",
        label: "Lire cette page en français",
      },
      {
        href: "/guide/rodrigues",
        label: "The full local's guide to Rodrigues",
      },
    ],
  },
  {
    slug: "rodrigues-vs-mauritius",
    title: "Rodrigues vs Mauritius: An Honest Comparison",
    metaTitle:
      "Rodrigues vs Mauritius: Is It Worth Visiting? | Roule Rodrigues",
    description:
      "Rodrigues has 8 hotels to Mauritius's 109, and a lagoon twice the size of the island. The honest case for and against, with the numbers, from people who live here.",
    keyword: "Rodrigues vs Mauritius",
    published: "2026-08-27",
    updated: "2026-08-27",
    readMinutes: 7,
    intro:
      "We rent scooters on Rodrigues, so you would expect us to tell you to come. Instead, here is the case against — first, and with numbers — because the visitors who have a bad time here are almost always the ones who arrived expecting Mauritius and found something else.",
    sections: [
      {
        heading: "Do not come here for a resort",
        paragraphs: [
          "Statistics Mauritius counts 109 licensed hotels on the Island of Mauritius, with 14,112 rooms between them, and classes a hotel as 'large' at more than 80 rooms — 61 of them qualify.",
          "The Rodrigues Tourism Office lists eight hotels for the entire island, and the best known of them, Constance Tekoma, has 32 rooms. Not one Rodrigues property reaches that 'large' threshold. Official hotel statistics do not even cover Rodrigues: there is no published room-capacity series for the island at all.",
          "There is no golf, effectively no nightlife, and no shopping beyond the market and the village shops. If any of that is what a holiday means to you, go to Mauritius. You will have a better time, and we would rather say so now than take your booking.",
        ],
      },
      {
        heading: "What you get instead",
        paragraphs: [
          "A lagoon of roughly 240 km² wrapped around an island of about 110 km² — so there is more than twice as much water as land. You will also read that Rodrigues has the largest lagoon in the Indian Ocean. It does not: the Great Chagos Bank, in the same ocean, is 12,642 km². The true figure is impressive enough without the superlative.",
          "Beaches you will have to yourself on a weekday, and the arithmetic makes that inevitable rather than lucky. Of 141,738 arrivals in 2024, 86,889 were residents of the Island of Mauritius and another 28,053 were Rodriguans coming home. The United Kingdom accounted for 532 people. The United States, 290.",
          "That is the real character of the place. Rodrigues is where Mauritius goes on holiday, not where the world does.",
        ],
      },
      {
        heading: "It is not simply a smaller Mauritius",
        paragraphs: [
          "Rodrigues has been an autonomous region since 2001–02, under Chapter VIA of the Constitution, with its own Regional Assembly of 18 elected members and its own Capital and Consolidated Funds. It makes its own law in the areas listed in the Fourth Schedule of the Rodrigues Regional Assembly Act — fisheries, agriculture, environment, marine parks, forestry.",
          "That is not a technicality a visitor can ignore. The octopus closed season that shapes the island's most famous dish is Rodriguan law, made here, and it is the reason there is still octopus to eat.",
          "Language differs too. At the 2022 census, Creole was the language usually spoken at home for 42,832 of 43,604 Rodriguans — 98.2%, against 77.9% on Mauritius. Sixteen people gave English and 117 gave French. Bhojpuri, spoken at home by tens of thousands of Mauritians, is essentially absent here.",
        ],
      },
      {
        heading: "The size of the place",
        paragraphs: [
          "The 2022 census counted 43,604 residents; the official estimate at the end of 2024 was 44,313. Mauritius has 1,189,493 people on 1,868 km².",
          "How far apart are they? Officially, nobody agrees. Published figures run from 553 km to 650 km, and two Mauritian government bodies disagree with each other by 50 km. We are not going to pick one for the look of it. It is a short flight and a long ferry, and that is the part that affects your plans.",
          "Fishing is the economy in a way it simply is not on the mainland: 2,504 registered fishing boats and 1,179 registered fishermen — including 159 professional fisherwomen — among 44,000 people.",
        ],
      },
      {
        heading: "Who should choose Rodrigues over Mauritius?",
        paragraphs: [
          "People who want an island rather than a hotel. If your idea of a good week is a scooter, a lagoon, a walk down to a beach with nobody on it, and dinner cooked by whoever's house you booked, Rodrigues is close to unimprovable.",
          "People who want to be looked after by staff in uniform will find the island bewildering and slightly boring, and the honest advice is to spend that money in Mauritius.",
          "Plenty of people do both, and it is the sensible answer: Rodrigues is a short hop from Mauritius, and a week split between them shows you two genuinely different countries inside one republic.",
        ],
      },
    ],
    related: [
      {
        href: "/guide/rodrigues",
        label: "The full local's guide to Rodrigues",
      },
      {
        href: "/blog/how-many-days-in-rodrigues",
        label: "How many days do you need?",
      },
      { href: "/guide/beaches", label: "Every beach worth your time" },
      {
        href: "/guide/ile-aux-cocos",
        label: "Île aux Cocos, the island's best excursion",
      },
    ],
  },
  {
    slug: "best-time-to-visit-rodrigues",
    title: "The Best Time to Visit Rodrigues",
    metaTitle: "Best Time to Visit Rodrigues: Month by Month | Roule Rodrigues",
    description:
      "Rodrigues weather month by month from the official climate record: temperatures, rainfall, cyclone season, and when the island's own festivals actually fall.",
    keyword: "best time to visit Rodrigues",
    published: "2026-08-27",
    updated: "2026-08-27",
    readMinutes: 7,
    intro:
      "Rodrigues has no bad season, which is an unhelpful thing to be told when you are booking flights. So here is the actual climate record from the Mauritius Meteorological Services, what it means for a week here, and the dates worth planning around.",
    sections: [
      {
        heading: "When is the best time to visit Rodrigues?",
        paragraphs: [
          "September to December is the driest stretch and the easiest weather to plan around. January to March is hottest, wettest, and when cyclones are most likely. May to October is cooler, and it is the window the tourism office recommends for kitesurfing.",
          "None of those is a season to avoid. The temperature range across the whole year is small enough that your choice is about rain and wind, not about warmth.",
        ],
        // A season-by-season summary of the sections below, in one liftable
        // block. Grouped by season rather than twelve rows because that is
        // how the official record itself reports — a per-month row would
        // force cells the sources never stated.
        table: {
          headers: ["Months", "Weather (official record)", "Worth knowing"],
          rows: [
            [
              "January – March",
              "Hottest — daily maximums up to 29.4 °C in March; February is the wettest month and the humidity peak",
              "Cyclone activity peaks late January to mid-March",
            ],
            [
              "April – June",
              "Cooling down; May has the calmest wind on record (16.9 km/h)",
              "The tourism office's kitesurfing window opens in May",
            ],
            [
              "July – August",
              "Coolest — August averages 24.8 °C max / 18.8 °C min; July has the most rain days (15)",
              "August is the windiest month on record (19.6 km/h)",
            ],
            [
              "September – December",
              "The driest stretch — September–October driest, 7–8 rain days a month October to December",
              "The easiest weather to plan around; Kreol Festival late November – early December",
            ],
          ],
        },
      },
      {
        heading: "Temperature: a narrow band all year",
        paragraphs: [
          "The Meteorological Services give a mean summer temperature of 25.9 °C for Rodrigues and a mean winter temperature of about 22.3 °C — a difference of 3.6 degrees across the entire year.",
          "Average daily maximums run from 24.8 °C in August, the coolest month, to 29.4 °C in March. Average minimums run from 18.8 °C in August to 23.8 °C in February. January to March are the hottest months.",
          "The extremes ever recorded at the Rodrigues station are 34.0 °C in February and 14.5 °C in July. In other words: you will not be cold, and you will not be dangerously hot.",
        ],
      },
      {
        heading: "Rain: less than Mauritius, but not as little as people say",
        paragraphs: [
          "Rodrigues averages about 1,116 mm of rain a year, roughly 55% of the island-wide Mauritius mean of about 2,010 mm. So the shorthand that Rodrigues is drier is true.",
          "It deserves one caveat. Measured against the west coast of Mauritius, where most beach hotels sit, Rodrigues is actually WETTER — Medine records about 781 mm a year. Drier than Mauritius overall; wetter than the part of Mauritius most visitors experience.",
          "February is the wettest month and September–October the driest. The more useful number, though, is rain DAYS: October, November and December see 8, 7 and 8 days a month with more than 1 mm, against 15 days in July. A wet July here means many small interruptions; a wet February means fewer, heavier ones.",
          "Humidity sits between 74% and 81% all year, peaking in February.",
        ],
      },
      {
        heading: "When is cyclone season, honestly?",
        paragraphs: [
          "You will read that the cyclone season 'officially runs 15 November to 15 May'. We could not find that in any primary source. What we could verify: the World Meteorological Organization defines the South-West Indian Ocean season as 1 July to 30 June; Mauritius's own National Disaster Risk Reduction and Management Centre gives 1 November to 15 May; and the Meteorological Services publish no start or end date at all on their cyclone pages.",
          "Météo-France La Réunion recorded 13 named storms in the 2024–25 season against a normal of 10, with activity peaking between late January and mid-March. That peak is the part worth planning around.",
          "The warning system is worth understanding before you need it. A Class I warning comes 36 to 48 hours before gusts of 120 km/h are expected, Class II with about 12 hours of daylight left, Class III with about 6, and Class IV once those gusts are actually recorded. It is clear, well run, and it gives you time.",
          "For scale: during Cyclone Joaninha in March 2019, Port Mathurin gusted over 100 km/h for more than 33 hours, peaking at 161 km/h. That is rare, and it is why the warnings exist.",
        ],
      },
      {
        heading: "Wind, and the kitesurfing question",
        paragraphs: [
          "The tourism office recommends May to October for kitesurfing, says wind typically reaches at least 10 knots year-round, and names Mourouk as the main spot, with a lagoon about 1.5 m deep.",
          "One honest note, because kite schools quote bigger numbers. The official monthly wind record for Rodrigues varies only between 16.9 km/h in May and 19.6 km/h in August, and it shows no clean winter peak — January, February and July all sit at 19.3 km/h. Figures like '20–25 knots' or '220 windy days a year' come from operators, not from the meteorological record.",
        ],
      },
      {
        heading: "Dates worth planning around",
        paragraphs: [
          "The Fête du Poisson, which marks the opening of the seine fishing season, is held on 1 March. It is a fixed date and it is the most Rodriguan day of the year.",
          "The Rodrigues Kreol Festival runs in late November and early December — not October, as several travel sites claim — and its dates move each year. The 25th edition ran 1–7 December 2024 and the 26th ran 30 November to 7 December 2025. Check before you book around it.",
          "The Rodrigues International Kitesurf Festival is NOT running in 2026: the organising association has taken a sabbatical year after ten editions. A separate competition runs 2–5 July 2026 at Anse Mourouk under a different club.",
        ],
      },
    ],
    related: [
      {
        href: "/guide/rodrigues",
        label: "The full local's guide to Rodrigues",
      },
      {
        href: "/blog/how-many-days-in-rodrigues",
        label: "How many days do you need?",
      },
      {
        href: "/blog/how-to-get-around-rodrigues",
        label: "How to get around the island",
      },
      {
        href: "/browse/scooter",
        label: "Scooters, with prices and availability",
      },
    ],
  },

  // ── The itinerary post ─────────────────────────────────────────────────────
  // "Rodrigues itinerary" is the classic ask an assistant gets after "is it
  // worth visiting", and nothing on the site answered it day by day. Every
  // place named below is already published ON THIS SITE — the beaches and
  // viewpoints guides, the tours listings, the how-many-days and best-time
  // posts — so this post is a composition of first-party content, not new
  // claims. No distances or timings are stated that the site does not already
  // state; where order matters (market day, wind) it defers to the posts that
  // carry the verified facts.
  {
    slug: "rodrigues-itinerary",
    title: "A Rodrigues Itinerary for 3, 5 or 7 Days",
    metaTitle: "Rodrigues Itinerary — 3, 5 & 7 Days | Roule Rodrigues",
    description:
      "A day-by-day Rodrigues itinerary from locals: the east-coast beaches, Trou d'Argent, Mont Limon, Île aux Cocos and where to eat — for 3, 5 or 7 days.",
    keyword: "Rodrigues itinerary",
    published: "2026-08-29",
    updated: "2026-08-29",
    readMinutes: 7,
    intro:
      "Rodrigues is about 18 km end to end, which sounds like a place you could see in a day. You can't — the roads climb and wind, the best beaches hide at the end of footpaths, and the island rewards slowness. Here is how we'd actually spend 3, 5 or 7 days, built around one simple rule: one part of the island per day.",
    sections: [
      {
        heading: "How should you structure a Rodrigues itinerary?",
        paragraphs: [
          "One area per day. The island is small but hilly, so hopping between coasts all day means riding more than being anywhere. Base yourself anywhere you like — nowhere is far — sort out your wheels for the whole stay before you arrive, and give each day one corner of the island: the east coast and its beaches, the interior and its viewpoints, the lagoon, the town.",
          "Two of these days depend on timing rather than preference: Port Mathurin is at its best when the market is on, and a boat day needs the lagoon's cooperation — so keep those two flexible and fix the beach and viewpoint days around them.",
        ],
        table: {
          headers: ["Day", "Where", "The heart of it"],
          rows: [
            [
              "1",
              "East coast",
              "Pointe Coton, then the coastal walk past St François to hidden Trou d'Argent",
            ],
            [
              "2",
              "The interior",
              "Giant tortoises at the François Leguat Reserve, Caverne Patate, sunset from Mont Limon",
            ],
            [
              "3",
              "Port Mathurin & the north",
              "The town, the market if your dates line up, the northern coast at your own pace",
            ],
            [
              "4",
              "The lagoon",
              "Boat trip to the Île aux Cocos bird sanctuary, or snorkelling over the coral at Rivière Banane",
            ],
            [
              "5",
              "The south — and nowhere",
              "Mourouk and the south coast, then a morning that goes nowhere in particular",
            ],
          ],
        },
      },
      {
        heading: "3 days: the greatest hits",
        paragraphs: [
          "Days 1 to 3 of the table are the trip: east coast, interior, town. It works — you will have seen the island's headline sights — but it's tight, and you'll be choosing between things rather than doing them all. If you must drop something, drop the town day before you drop Trou d'Argent.",
          "With this little time, wheels are not optional. A scooter puts every stop on the map within reach and lets you chase the light instead of a timetable; book it before you land so day one starts at a beach and not at a counter.",
        ],
      },
      {
        heading: "5 days: the version we'd tell a friend to book",
        paragraphs: [
          "Five days is the whole table, and it's the island at the pace it was built for. The additions over a long weekend are the ones people come back talking about: the lagoon day — Île aux Cocos and its birds, or snorkelling at Rivière Banane with a local skipper — and a day with nothing planned at all, which on Rodrigues has a way of becoming the best one.",
          "Eat deliberately along the way: Rodriguan food is a reason to visit in itself, and the dishes worth ordering — ourite rougaille first among them — are on our food page with the people who cook them.",
        ],
      },
      {
        heading: "7 days: the island at its own pace",
        paragraphs: [
          "A week is the five-day plan plus repetition, which is the luxury: going back to the beach you loved, a second boat morning, a proper hike on the coastal trails instead of a taster. Kitesurfers will camp on Mourouk's lagoon; hikers can take the routes page and work through it; everyone else gets to do the rarest thing on a holiday — nothing, twice.",
        ],
      },
      {
        heading: "When should you come, and how do you get around?",
        paragraphs: [
          "Both questions have their own honest answers on this site, written from the official records rather than brochure copy: the month-by-month weather is in our best-time guide, and the bus-taxi-scooter-car decision is laid out in the getting-around guide. The short version: September to December is the easiest weather to plan around, and hire something with wheels — no bus goes to the beach you came here for.",
        ],
      },
    ],
    related: [
      { href: "/browse/scooter", label: "Rent a scooter for the whole itinerary" },
      { href: "/browse/car", label: "Cars for families and longer stays" },
      { href: "/browse/tours", label: "Île aux Cocos & lagoon boat trips" },
      { href: "/guide/beaches", label: "Every beach on the island, mapped" },
      { href: "/guide/viewpoints", label: "Viewpoints & landmarks in Rodrigues" },
      { href: "/blog/best-time-to-visit-rodrigues", label: "The best time to visit" },
      { href: "/blog/how-many-days-in-rodrigues", label: "How many days do you need?" },
    ],
  },
];

export function getPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}
