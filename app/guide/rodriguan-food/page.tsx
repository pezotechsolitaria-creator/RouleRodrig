import type { Metadata } from "next";
import Link from "next/link";
import { getContent } from "@/lib/content";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import AppPageHeader from "@/components/AppPageHeader";

// ── RODRIGUAN FOOD ──────────────────────────────────────────────────────────
//
// The site sells ten dishes and had no page explaining any of them. Somebody
// searching "what to eat in Rodrigues" or "tourte rodriguaise" found other
// people's writing, and the dish pages that could have answered them sat
// unlinked to any context.
//
// ── THE OCTOPUS CLOSED SEASON IS THE PAGE ───────────────────────────────────
// Ourite is on the menu, and the reason it is still there is a law made in
// Rodrigues: the Rodrigues Regional Assembly (Octopus Closed Season)
// Regulations 2012. No content farm writing "top 10 Mauritian dishes" knows
// this, and no aggregator can copy it, because it takes reading a gazette.
//
// The single most important thing about it is that the DATES ARE NOT FIXED.
// Regulation 4(1) puts them in the Commissioner's hands, announced each time by
// notice in at least two local newspapers. So this page states the mechanism and
// the last verified closure with its date attached, and explicitly refuses to
// publish a recurring calendar — because a page that says "closed every February"
// is wrong in the year it moves, and the person it misleads is a visitor
// deciding when to come, or a fisher reading it as guidance.
//
// ── AND IT CORRECTS THE MENU ────────────────────────────────────────────────
// Two of the site's own dish names are wrong, and the fact-check is unambiguous:
// "napolitain" should be "napolitaine" and it is a MAURITIAN biscuit, not a
// Rodriguan speciality; "mine frit legume" should be "mine frite légumes". Those
// are the owner's listings, so this page uses the correct spellings and the
// listings are flagged for him rather than edited underneath him.

export const revalidate = 3600;

const TITLE = "Rodriguan food: what to eat, and why the octopus has a season";
const DESCRIPTION =
  "Ourite, tourte rodriguaise, piments limon and cono-cono — what Rodriguan cooking actually is, and the law that closes the octopus fishery twice a year.";

export const metadata: Metadata = {
  title: `${TITLE} | Roule Rodrigues`,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/guide/rodriguan-food` },
  openGraph: {
    title: `${TITLE} | Roule Rodrigues`,
    description: DESCRIPTION,
    url: `${SITE_URL}/guide/rodriguan-food`,
    type: "article",
    images: [`${SITE_URL}/og-image.jpg`],
  },
};

/** Each of these is on the site's own menu, so the definitions have to be right. */
const DISHES: { name: string; what: string; href?: string }[] = [
  {
    name: "Ourite",
    what: "Octopus — the word is Mauritian and Rodriguan Creole, pieuvre in French. It is the island's signature ingredient, most often as ourite rougaille or a curry, and sometimes dried.",
    href: "/food/ourite-rougaille",
  },
  {
    name: "Rougaille",
    what: "Not a dish but a sauce: spiced tomato and onion built on garlic, ginger, chilli and thyme. It is common across Mauritius, Réunion and the Seychelles, which is why you meet it attached to almost anything.",
  },
  {
    name: "Tourte rodriguaise",
    what: "A shortcrust pie with a fruit filling, classically coconut and papaya with cinnamon. Sold at the Port Mathurin market in a dozen variations — chocolate-coconut, coconut-honey-lime, guava, pineapple, mango.",
  },
  {
    name: "Piments limon",
    what: "Specific to Rodrigues: small pickled green limes, ground and mixed with chillies. If you take one thing home, take a jar of this.",
  },
  {
    name: "Cono-cono",
    what: "A lagoon shellfish, served as a salad with a homemade vinaigrette, green leaves, fresh ginger and lime.",
  },
  {
    name: "Farata",
    what: "A layered flatbread, thicker and chewier than a roti, served with curries, chutneys and pickles.",
    href: "/food/farata-rougaille",
  },
  {
    name: "Boulettes",
    what: "Dumplings of Chinese origin, most often boulette chouchou — chayote, also called niouk yen — served in broth or as a salad.",
    href: "/food/boulettes",
  },
  {
    name: "Mine frite",
    what: "The Sino-Mauritian dish of egg noodles fried in a wok, usually with carrot, cabbage and whatever else is good that day.",
  },
];

const FAQ: { q: string; a: string }[] = [
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

export default async function RodriguanFoodPage() {
  const content = await getContent();

  return (
    <>
      <JsonLd
        data={[
          breadcrumbLd([
            { name: "Home", url: SITE_URL },
            { name: "Island guide", url: `${SITE_URL}/guide/rodrigues` },
            { name: "Rodriguan food", url: `${SITE_URL}/guide/rodriguan-food` },
          ]),
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQ.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          },
        ]}
      />

      <AppPageHeader showBack backHref="/guide/rodrigues" />

      <main className="min-h-[calc(100vh-3.5rem)] bg-dark px-4 pb-16 pt-4 text-offwhite">
        <article className="mx-auto max-w-2xl">
          <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">
            ISLAND GUIDE
          </p>
          <h1 className="mt-1 font-syne text-3xl font-extrabold leading-tight sm:text-4xl">
            Rodriguan food
          </h1>

          <p className="mt-4 font-dm text-lg leading-relaxed text-offwhite/90">
            Rodriguan cooking is Creole with Chinese, Indian and European
            influences, built almost entirely on what the island grows and
            catches. A traditional meal comes with rice or maize and red beans,
            and something spiced beside it. The one thing you should eat is
            octopus — and the reason there is still octopus to eat is a law made
            here.
          </p>

          {/* The un-copyable part, and the reason the page exists. */}
          <section className="mt-8">
            <h2 className="font-syne text-xl font-extrabold">
              The octopus has a closed season
            </h2>
            <p className="mt-3 font-dm leading-relaxed text-muted">
              Twice a year, taking octopus in Rodrigues becomes a criminal
              offence. The Rodrigues Regional Assembly (Octopus Closed Season)
              Regulations 2012 prohibit collecting, killing, fishing, landing or
              possessing it by any means, except for research with written
              authorisation. Anyone holding five kilos or more on the first day
              of a closure has to declare it. A first conviction carries a fine
              of Rs 3,000 to Rs 5,000; a second, up to Rs 10,000 and
              imprisonment.
            </p>
            <p className="mt-3 font-dm leading-relaxed text-muted">
              It works. Landings fell from about 770 tonnes a year in 1994 to a
              low near 250. Thirteen years after the first closure in 2012 they
              were back to roughly 600 tonnes, and at the October 2025 reopening
              fishers landed 18,504 kg in a single day — against 16,384 kg at
              the same moment the year before, with bigger animals.
            </p>
            <p className="mt-3 font-dm leading-relaxed text-muted">
              About 1,200 fishers are affected each time. During a closure they
              are redeployed across 58 designated sites to maritime
              surveillance, reforestation, and clearing forest and rivers. That
              is the part worth knowing as a visitor: the island pays for its
              own conservation out of the same pockets it protects.
            </p>

            <div className="mt-4 rounded-2xl border border-yellow/30 bg-yellow/[0.06] p-4">
              <p className="font-dm leading-relaxed text-offwhite/90">
                <strong>We do not publish the dates, on purpose.</strong> They
                are not fixed. Regulation 4(1) puts each closure in the hands of
                the Commissioner responsible for fisheries, announced by notice
                in at least two local newspapers. The last one we can verify ran{" "}
                <strong>26 January to 28 February 2026</strong>, reopening on 1
                March. A page claiming a recurring calendar would be wrong in
                the year it moves — so ask locally, or ask us, and we will tell
                you what is actually happening this month.
              </p>
            </div>
          </section>

          <section className="mt-8">
            <h2 className="font-syne text-xl font-extrabold">
              What the words on the menu mean
            </h2>
            <dl className="mt-3 space-y-4">
              {DISHES.map((d) => (
                <div key={d.name}>
                  <dt className="font-syne text-base font-bold text-offwhite">
                    {d.href ? (
                      <Link href={d.href} className="hover:text-yellow">
                        {d.name}
                      </Link>
                    ) : (
                      d.name
                    )}
                  </dt>
                  <dd className="mt-1 font-dm leading-relaxed text-muted">
                    {d.what}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="mt-8">
            <h2 className="font-syne text-xl font-extrabold">
              Where to actually eat
            </h2>
            <p className="mt-3 font-dm leading-relaxed text-muted">
              The best food on Rodrigues is served in people&apos;s houses. A{" "}
              <em>table d&apos;hôte</em> is a single fixed menu at a set price,
              historically at the host&apos;s own table — book a day ahead,
              because it is cooked for the number of people who said they were
              coming.
            </p>
            <p className="mt-3 font-dm leading-relaxed text-muted">
              For everything else there is the Port Mathurin market. It runs
              through the week, but Saturday is when the island turns out:
              achards, piment, honey, salted and dried fish, red kidney beans,
              and tourte in coconut, papaya, honey, chocolate and lime.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="font-syne text-xl font-extrabold">
              Common questions
            </h2>
            <dl className="mt-3 space-y-4">
              {FAQ.map((f) => (
                <div key={f.q}>
                  <dt className="font-syne text-base font-bold text-offwhite">
                    {f.q}
                  </dt>
                  <dd className="mt-1 font-dm leading-relaxed text-muted">
                    {f.a}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="mt-8 rounded-2xl border border-white/10 bg-dark-card p-5">
            <h2 className="font-syne text-lg font-extrabold">Order some</h2>
            <p className="mt-2 font-dm text-sm leading-relaxed text-muted">
              Several of these are cooked to order on Roulé Rodrigues, and the
              food concierge will book you a table where they are not.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/food"
                className="flex min-h-12 items-center justify-center rounded-xl bg-yellow px-5 font-dm text-sm font-bold text-dark"
              >
                See the food
              </Link>
              <Link
                href="/guide/rodrigues"
                className="flex min-h-12 items-center justify-center rounded-xl border border-white/15 px-5 font-dm text-sm text-offwhite"
              >
                Island guide
              </Link>
            </div>
          </section>

          <section className="mt-8 border-t border-white/10 pt-5">
            <h2 className="font-syne text-sm font-bold text-muted">Sources</h2>
            <ul className="mt-2 space-y-1 font-dm text-xs text-muted">
              <li>
                Rodrigues Regional Assembly (Octopus Closed Season) Regulations
                2012 — GN No. 2 of 2012, Government Gazette of Mauritius No. 69,
                7 July 2012.
              </li>
              <li>
                Communiqué of the Commissioner of Agriculture and Fisheries, 12
                January 2026, for the 26 January – 28 February 2026 closure.
              </li>
              <li>
                <a
                  href="https://discover-rodrigues.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-yellow"
                >
                  Rodrigues Tourism Office
                </a>{" "}
                — the island&apos;s cooking and its dishes.
              </li>
            </ul>
            <p className="mt-3 font-dm text-xs text-muted/70">
              Closure dates change every year. If something here has gone out of
              date, tell us —{" "}
              {content.contact.email || "and we will correct it"}.
            </p>
          </section>
        </article>
      </main>
    </>
  );
}
