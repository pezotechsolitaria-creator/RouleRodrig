import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── THE STAYS PAGE HAD NOTHING FOR GOOGLE TO MATCH (M146) ───────────────────
//
// Search Console, 90 days: /browse/stays was "Submitted and indexed", fetched
// successfully, robots-allowed — and drew ZERO impressions for any
// accommodation query. Not hotel, not guesthouse, not hebergement, not "where
// to stay". Nothing.
//
// The cause was not ranking. The page served 635 characters of unique text:
// three names, one description, no price, headed "Accommodations", and signed
// off with a line calling the site "a scooter-rental platform". The price and
// the amenities existed on every listing the whole time — priceNote reached
// only the booking form, highlights only the detail modal.
//
// These assertions are about the words on the page, because that was the
// entire defect. A future refactor that quietly drops them puts the page back
// where it started, and nothing else in the suite would notice.

const ROOT = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
/** Strip comments: the prose above and in the source must never satisfy a test. */
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const page = code(read("app/browse/[category]/page.tsx"));

/** The PLACE_SLUGS entry for one category. Assertions about a category's copy
 *  must read ITS block: there are four intros in this file now. */
const slugs = (name: string) => {
  const i = page.indexOf(`  ${name}: {`);
  return i < 0 ? "" : page.slice(i, i + 1400);
};
const card = code(read("components/RecommendedPlaces.tsx"));
const i18n = code(read("lib/i18n.ts"));

describe("the stays page says what it is", () => {
  it("heads the listings with the search, not the word 'Accommodations'", () => {
    expect(page).toMatch(/heading:\s*"Where to Stay in Rodrigues"/);
  });

  it("keeps the short label for the top bar, which truncates at 62%", () => {
    // Both must exist: the descriptive heading in the body, the short one in
    // the bar. Collapsing them would render "Where to Stay in Rod..." at 375px.
    expect(page).toMatch(/label:\s*"Accommodations"/);
    expect(page).toMatch(/title:\s*place\.heading\s*\?\?\s*place\.label/);
  });

  it("carries an intro using the words a guest actually searches with", () => {
    const intro = slugs("stays").match(/\s+intro:\s*"([^"]+)"/)?.[1] ?? "";
    expect(intro.length).toBeGreaterThan(120);
    for (const word of ["Guesthouses", "sea view", "breakfast", "air conditioning"]) {
      expect(intro.toLowerCase()).toContain(word.toLowerCase());
    }
  });

  it("prefers the category intro over the shared subtitle", () => {
    expect(page).toMatch(/subtitle:\s*place\.intro\s*\?\?\s*content\.recommended\.subtitle/);
  });
});

describe("the card shows the price and the amenities", () => {
  it("renders priceNote, which was reaching only the booking form", () => {
    expect(card).toMatch(/\{p\.priceNote\}/);
  });

  it("renders highlights, which were reaching only the detail modal", () => {
    expect(card).toMatch(/p\.highlights/);
    expect(card).toMatch(/p\.highlights\.slice\(/);
  });

  it("prints the price note verbatim rather than reformatting it", () => {
    // "from Rs 2500 per night (for one person)" is the owner's own wording.
    // Parsing a number out of it and re-rendering is how you publish a price
    // the owner does not honour.
    expect(card).not.toMatch(/priceNote[\s\S]{0,120}(parseFloat|parseInt|replace\()/);
  });
});

describe("the places disclaimer no longer disclaims the topic", () => {
  it("does not call the site a scooter-rental platform to accommodation searchers", () => {
    for (const claim of [
      "Roule Rodrigues is a scooter-rental platform and is not responsible",
      "Roule Rodrigues est une plateforme de location de scooters et n'est pas responsable",
      "Roule Rodrigues enn plateform lokasion skooter ek nou pa responsab",
    ]) {
      expect(i18n).not.toContain(claim);
    }
  });

  it("still limits liability for the independent businesses", () => {
    // The point was never to weaken the disclaimer — only to stop the page
    // telling Google it is about something else.
    expect(i18n).toContain("is not responsible for their services or bookings");
    expect(i18n).toContain("n'est pas responsable de leurs services ou réservations");
    expect(i18n).toContain("pa responsab pou zot servis ouswa rezervasion");
  });
});

describe("no page tells a search engine this is only a scooter site", () => {
  it("has removed the self-description from every disclaimer, in all three languages", () => {
    // It survived on the taxi page after the places one was fixed, with a code
    // comment flagging it as the owner's call. He made it on 2026-08-29.
    for (const claim of [
      "is a scooter-rental platform",
      "est une plateforme de location de scooters",
      "enn plateform lokasion skooter",
    ]) {
      expect(i18n).not.toContain(claim);
    }
  });

  it("keeps the taxi liability wording, which is the point of the sentence", () => {
    expect(i18n).toContain("is not a transport operator and is not responsible for their service");
    expect(i18n).toContain("n'est pas un opérateur de transport et n'est pas responsable de leur service");
    expect(i18n).toContain("pa enn operater transpor ek nou pa responsab pou zot servis");
  });
});

describe("the stays copy exists in French, not only English", () => {
  const card = code(read("components/RecommendedPlaces.tsx"));

  it("carries a French heading and intro", () => {
    expect(page).toMatch(/headingFr:\s*"Où loger à Rodrigues"/);
    const fr = slugs("stays").match(/introFr:\s*"([^"]+)"/)?.[1] ?? "";
    expect(fr.length).toBeGreaterThan(120);
  });

  it("uses the words a French visitor actually searches with", () => {
    const fr = (slugs("stays").match(/introFr:\s*"([^"]+)"/)?.[1] ?? "").toLowerCase();
    // "hébergement Rodrigues" and "chambre d'hôtes" are the queries; the page
    // that ranks best on this whole site is a French one, at position 3.6.
    for (const w of ["chambres d", "hôtels", "hébergement", "vue sur mer",
                     "petit-déjeuner", "climatisation", "piscine", "prix par nuit"]) {
      expect(fr).toContain(w);
    }
  });

  it("resolves both headings through loc(), like every other localised field", () => {
    expect(card).toMatch(/loc\(language, content\.title, content\.titleFr, content\.titleCr\)/);
    expect(card).toMatch(/loc\(language, content\.subtitle, content\.subtitleFr, content\.subtitleCr\)/);
  });

  it("passes the French strings from the page into the component", () => {
    expect(page).toMatch(/titleFr:\s*place\.headingFr/);
    expect(page).toMatch(/subtitleFr:\s*place\.introFr/);
  });
});

describe("the sibling browse categories got the same treatment", () => {
  // Measured as Googlebot before writing any of it: /browse/activities served
  // 1265 chars under an h1 reading "Activities", /browse/tours 1692 under
  // "Guided Tours". /browse/getting-around was NOT touched — it already
  // carries a real bilingual title and subtitle from site_content — and
  // /browse/restaurants was not either: it 404s by design, is noindexed,
  // unlinked and absent from the sitemap, because restaurants live at /food.
  it("activities has a heading and intro in both languages", () => {
    const b = slugs("activities");
    expect(b).toMatch(/heading: "Things to Do in Rodrigues"/);
    expect(b).toMatch(/headingFr: "Que faire/);
    expect(b).toMatch(/introFr:/);
  });

  it("tours has a heading and intro in both languages", () => {
    const b = slugs("tours");
    expect(b).toMatch(/heading: "Guided Tours & Boat Trips in Rodrigues"/);
    expect(b).toMatch(/headingFr: "Excursions et sorties en mer/);
    expect(b).toMatch(/introFr:/);
  });

  it("the tours intro names only excursions that actually exist", () => {
    // Ile aux Cocos, Riviere Banane snorkelling, traditional fishing and a
    // lagoon trip are the four live listings. If the owner removes one, this
    // test does not catch it — but naming a fifth that never existed is the
    // failure mode worth guarding, so the intro must stay inside this set.
    const intro = slugs("tours").match(/\s+intro:\s*"([^"]+)"/)?.[1] ?? "";
    expect(intro.length).toBeGreaterThan(120);
    for (const real of ["Cocos", "Banane", "fishing", "lagoon"]) {
      expect(intro).toContain(real);
    }
  });

  it("the activities intro promises no variety it cannot keep", () => {
    // That list is a single spa treatment on some days. An intro advertising
    // "hiking, diving and kayaking" would be false exactly when it matters.
    const intro = slugs("activities").match(/\s+intro:\s*"([^"]+)"/)?.[1] ?? "";
    expect(intro).not.toMatch(/hiking|diving|kayak|dozens|wide range|something for everyone/i);
  });
});
