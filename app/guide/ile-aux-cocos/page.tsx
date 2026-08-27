import type { Metadata } from "next";
import Link from "next/link";
import { getContent } from "@/lib/content";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import AppPageHeader from "@/components/AppPageHeader";

// ── ÎLE AUX COCOS ───────────────────────────────────────────────────────────
//
// The island's best-known excursion, and until now it existed on this site as
// three strings: a heading label on /guide/rodrigues, a planner item, and one
// bookable listing. Somebody searching "ile aux cocos" — which is what people
// search before they search anything else about Rodrigues — found the site's
// competitors instead.
//
// ── EVERY FACT ON THIS PAGE IS SOURCED, AND THE THIN ONES ARE MARKED ────────
// The temptation on a page like this is to write beautifully about a place and
// let the detail drift. Detail is the entire value here: somebody deciding
// whether to spend a morning and Rs 2,000 needs to know that they cannot just
// turn up, and that half the island is closed to them.
//
// Sources, cited on the page itself because a claim a reader cannot check is
// worth less than one they can:
//   · Rodrigues Tourism Office — discover-rodrigues.com/nature-wildlife/ile-aux-cocos
//     4 km west; authorisation from Discovery Rodrigues Co. Ltd; departures
//     from Pointe du Diable by chartered boat, lunch included.
//   · Wikipedia — the breeding species list, the coordinates, and the closed
//     southern tip marked with wooden posts.
//
// What is deliberately NOT stated: the island's area, the exact boat crossing
// time, the current permit fee, and any bird population figure. Numbers for
// those circulate widely and none of them is sourced well enough to publish
// under a local operator's name. A guide that is silent where it does not know
// is worth more than one that guesses; the "what we cannot tell you" block
// says so out loud.

export const revalidate = 3600;

const TITLE = "Île aux Cocos, Rodrigues: what to know before you book";
const DESCRIPTION =
  "Île aux Cocos is a seabird reserve 4 km west of Rodrigues. You cannot visit on your own — access needs authorisation and a licensed boat. What the trip involves, what is closed to visitors, and how to book.";

export const metadata: Metadata = {
  title: `${TITLE} | Roule Rodrigues`,
  description: DESCRIPTION,
  alternates: {
    canonical: `${SITE_URL}/guide/ile-aux-cocos`,
    // Must mirror the block on /fr/ile-aux-cocos. A one-way hreflang is
    // silently ignored — the same note /guide/beaches already carries.
    languages: {
      "en-US": `${SITE_URL}/guide/ile-aux-cocos`,
      "fr-FR": `${SITE_URL}/fr/ile-aux-cocos`,
      "x-default": `${SITE_URL}/guide/ile-aux-cocos`,
    },
  },
  openGraph: {
    title: `${TITLE} | Roule Rodrigues`,
    description: DESCRIPTION,
    url: `${SITE_URL}/guide/ile-aux-cocos`,
    type: "article",
    images: [`${SITE_URL}/og-image.jpg`],
  },
};

// Answer-first, because these are the questions asked verbatim and a direct
// first sentence is what an AI answer or a featured snippet can lift whole.
const FAQ: { q: string; a: string }[] = [
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
    q: "How much does the Île aux Cocos excursion cost?",
    a: "Operators price it themselves and it usually includes the boat and lunch. The trip listed on Roulé Rodrigues is Rs 2,000 per person with Les Inséparables. Confirm what is included when you book, because that varies between operators.",
  },
  {
    q: "When should you go?",
    a: "Mornings, and book ahead rather than on the day. Boats go when the lagoon allows, so a trip can be moved for weather — leave a spare day if it matters to you.",
  },
];

export default async function IleAuxCocosPage() {
  const content = await getContent();

  return (
    <>
      <JsonLd
        data={[
          breadcrumbLd([
            { name: "Home", url: SITE_URL },
            { name: "Island guide", url: `${SITE_URL}/guide/rodrigues` },
            { name: "Île aux Cocos", url: `${SITE_URL}/guide/ile-aux-cocos` },
          ]),
          {
            "@context": "https://schema.org",
            "@type": "TouristAttraction",
            "@id": `${SITE_URL}/guide/ile-aux-cocos#place`,
            name: "Île aux Cocos",
            description:
              "An uninhabited seabird reserve four kilometres west of Rodrigues, visited by guided boat. Breeding site for noddies and terns; the southern tip is closed to visitors.",
            url: `${SITE_URL}/guide/ile-aux-cocos`,
            // From the coordinates published on Wikipedia for the island
            // itself — a place, not a business address, so this is checkable.
            geo: {
              "@type": "GeoCoordinates",
              latitude: -19.7194,
              longitude: 63.3,
            },
            containedInPlace: {
              "@type": "Place",
              name: "Rodrigues Island, Mauritius",
            },
            isAccessibleForFree: false,
            publicAccess: false,
          },
          // Legitimate FAQPage markup: every question below is rendered on the
          // page, in the same words.
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
            Île aux Cocos
          </h1>

          {/* The answer, first and in one paragraph. Somebody who reads only
              this has the thing that changes their plans. */}
          <p className="mt-4 font-dm text-lg leading-relaxed text-offwhite/90">
            Île aux Cocos is an uninhabited seabird reserve four kilometres west
            of Rodrigues. <strong>You cannot go on your own.</strong> It is
            visited by guided boat, access needs authorisation, and the southern
            tip of the island is fenced off entirely so the nesting colonies are
            left alone. Book it through an operator, who arranges the permission
            with the trip.
          </p>

          <section className="mt-8">
            <h2 className="font-syne text-xl font-extrabold">
              What the trip actually is
            </h2>
            <p className="mt-3 font-dm leading-relaxed text-muted">
              A boat crossing from Pointe du Diable, a few hours on a sandbank
              island in the western lagoon, and lunch — most operators include
              it. What you are going for is the birds: the island is a breeding
              site for brown noddy, lesser noddy, sooty tern, fairy tern and
              roseate tern, and they are there in numbers that are difficult to
              describe to somebody who has not stood underneath them. Migratory
              waders turn up too — ruddy turnstone, curlew sandpiper,
              crab-plover, whimbrel.
            </p>
            <p className="mt-3 font-dm leading-relaxed text-muted">
              Boats go when the lagoon allows. If the weather moves your trip,
              that is normal — leave a spare day rather than putting it on your
              last morning.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="font-syne text-xl font-extrabold">
              The part people get wrong
            </h2>
            <div className="mt-3 rounded-2xl border border-yellow/30 bg-yellow/[0.06] p-4">
              <p className="font-dm leading-relaxed text-offwhite/90">
                The southern tip is marked off with wooden posts and closed to
                visitors. That is not a suggestion or a soft boundary — it is
                the condition the reserve is open on, and the whole reason the
                colony is still there to visit. Walk the part you are shown and
                stay out of the rest.
              </p>
            </div>
          </section>

          <section className="mt-8">
            <h2 className="font-syne text-xl font-extrabold">
              What we cannot tell you
            </h2>
            <p className="mt-3 font-dm leading-relaxed text-muted">
              Figures circulate for the island&apos;s size, the crossing time
              and the number of birds on it. We have not found any of them
              sourced well enough to repeat, so this page does not. Ask your
              operator when you book — they cross it every week and their answer
              is worth more than a number copied between websites.
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
            <h2 className="font-syne text-lg font-extrabold">Booking it</h2>
            <p className="mt-2 font-dm text-sm leading-relaxed text-muted">
              The excursion listed on Roulé Rodrigues runs with Les
              Inséparables. Operators arrange the authorisation as part of the
              trip, so booking with one is how the permission happens.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/browse/tours"
                className="flex min-h-12 items-center justify-center rounded-xl bg-yellow px-5 font-dm text-sm font-bold text-dark"
              >
                See the excursion
              </Link>
              <Link
                href="/guide/rodrigues"
                className="flex min-h-12 items-center justify-center rounded-xl border border-white/15 px-5 font-dm text-sm text-offwhite"
              >
                Island guide
              </Link>
            </div>
          </section>

          {/* Sources on the page, not in a comment. A reader who wants to check
              a claim about a protected reserve should be able to. */}
          <section className="mt-8 border-t border-white/10 pt-5">
            <h2 className="font-syne text-sm font-bold text-muted">Sources</h2>
            <ul className="mt-2 space-y-1 font-dm text-xs text-muted">
              <li>
                <a
                  href="https://discover-rodrigues.com/nature-wildlife/ile-aux-cocos"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-yellow"
                >
                  Rodrigues Tourism Office — Île aux Cocos
                </a>{" "}
                — authorisation, departure point.
              </li>
              <li>
                <a
                  href="https://en.wikipedia.org/wiki/%C3%8Ele_aux_Cocos"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-yellow"
                >
                  Wikipedia — Île aux Cocos
                </a>{" "}
                — breeding species, closed southern tip, position.
              </li>
            </ul>
            <p className="mt-3 font-dm text-xs text-muted/70">
              Prices and access rules change. If you find something here out of
              date, tell us — {content.contact.email || "and we will fix it"}.
            </p>
            <p className="mt-3 font-dm text-xs text-muted/70">
              <Link
                href="/fr/ile-aux-cocos"
                className="underline hover:text-yellow"
              >
                Lire cette page en français
              </Link>
            </p>
          </section>
        </article>
      </main>
    </>
  );
}
