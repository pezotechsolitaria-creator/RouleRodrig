import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── A PAGE CALLED "SCOOTER ROUTES" THAT LISTED ONE SCOOTER ROUTE ────────────
//
// /guide/routes splits content.rideRoutes on `kind`: "ride" fills the scooter
// section, "hike" fills the trails section. Six routes existed and FIVE were
// filed as hikes, so the section that pairs with vehicle hire showed a single
// entry while three rides sat under "Hiking trails".
//
// The miscategorisation was visible in the routes' own words:
//
//   Anse aux Anglais → Mourouk   "A scenic coastal RIDE from Anse aux Anglais"
//   East-Coast Beach Run         "RIDE from Port Mathurin across the island"
//   Graviers & Trou d'Argent     "RIDE to the Graviers car park, then take the
//                                 scenic ~30-minute coastal walk"
//
// and the two genuine hikes read nothing like them — "a tough inland TREK…
// much is off-trail through dense vegetation", with precise one-way times
// (4h34, 3h07) and Advanced difficulty, against the rides' "Half day" / Easy.
//
// The data was corrected in site_content, which no test can reach. What this
// guards is the code that would make such a fix invisible again.

const PAGE = readFileSync(join(process.cwd(), "app/guide/routes/page.tsx"), "utf8");

describe("the split that decides which section a route lands in", () => {
  it("still partitions on kind, defaulting to ride", () => {
    // If the default flips to "hike", every route with no kind disappears from
    // the section that sells.
    expect(PAGE).toMatch(/\(r\.kind \?\? "ride"\) === "ride"/);
    expect(PAGE).toMatch(/r\.kind === "hike"/);
  });

  it("counts each section in its own heading", () => {
    // "Scooter rides (1)" is what made the problem visible at a glance. A bare
    // heading would have hidden it.
    // The rides heading is built as a template so the count disappears when
    // the list is empty; the hikes heading is inline. Both must keep the count.
    expect(PAGE).toMatch(/Scooter rides\$\{rides\.length \? ` \(\$\{rides\.length\}\)`/);
    expect(PAGE).toMatch(/Hiking trails \(\{hikes\.length\}\)/);
  });

  it("only renders routes that have a name and a description", () => {
    expect(PAGE).toMatch(/\.filter\(\(r\) => r\.name && r\.description\)/);
  });
});

describe("the routes page offers both ways to see the island", () => {
  it("links scooter hire", () => {
    expect(PAGE).toMatch(/href="\/browse\/scooter"/);
  });

  it("links car hire too", () => {
    // Three of the four rides are half-day crossings of an 18 km island and
    // every one is a drive as readily as a ride. This page is where somebody
    // decides HOW to see Rodrigues, and it offered one answer.
    expect(PAGE).toMatch(/href="\/browse\/car"/);
  });
});

describe("the hiking teasers stay teasers", () => {
  it("links each trail to its write-up rather than repeating it", () => {
    // Deliberate: the climb, terrain and water detail live on /guide/hiking,
    // and giving these an h3 here would compete with the page that owns them.
    // Checked before changing, and left alone.
    expect(PAGE).toMatch(/href=\{`\/guide\/hiking#\$\{r\.id\}`\}/);
  });

  it("does not promote a trail name to a heading on this page", () => {
    const hikeBlock = PAGE.slice(PAGE.indexOf("Hiking trails ("));
    expect(hikeBlock.slice(0, 1400)).not.toMatch(/<h3/);
  });
});
