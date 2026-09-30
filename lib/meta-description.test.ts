import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { metaDescription } from "./meta-description";

// The Suzuki Swift's real description, copied from production on 2026-09-10.
// It genuinely opens with an emoji AND a zero-width space, which is how the
// bug reached the live page in the first place.
const ZWSP = "​";
const SWIFT =
  `${ZWSP}🚗 Get ready to discover Rodrigues in comfort and style. The Suzuki Swift ` +
  `is the perfect companion for exploring every corner of the island, from Port Mathurin ` +
  `to the quiet south coast.`;

describe("the sentence Google prints under the result", () => {
  it("strips the invisible character the copy was pasted with", () => {
    // Served live as content="<e2 80 8b>Get ready…". Invisible in an editor,
    // and the first character of the search snippet.
    const out = metaDescription(SWIFT);
    expect(out.startsWith(ZWSP)).toBe(false);
    expect(out).not.toContain(ZWSP);
    // The car emoji used to survive here. It no longer does (SEO audit
    // 2026-09-29 T5): a snippet should open on the owner's first word.
    expect(out.startsWith("Get ready to discover Rodrigues")).toBe(true);
  });

  it("does not stop on a preposition", () => {
    // The shipped one ended "…is the perfect companion for".
    const out = metaDescription(SWIFT);
    expect(out).not.toMatch(/\b(for|the|a|an|of|to|and|with|in|on)$/i);
    expect(out.endsWith(".") || out.endsWith("…")).toBe(true);
  });

  it("counts an emoji as one character, not two", () => {
    // .slice counts UTF-16 units, so a surrogate pair spent two of the budget
    // and a cut could land between its halves. A word first: an OPENING emoji
    // is now stripped (T5), and "🚗".repeat(200) alone would come back empty
    // and pass this without measuring anything.
    const out = metaDescription(`Go ${"🚗 ".repeat(200)}`, 10);
    expect(out).toBe("Go 🚗 🚗 🚗…");
    expect(Array.from(out.replace(/…$/, "")).length).toBeLessThanOrEqual(10);
    expect(out).not.toContain("�");
  });

  it("collapses the newlines his copy really contains", () => {
    // These land inside an HTML attribute as literal line breaks.
    expect(metaDescription("One line.\n\nAnother line.")).toBe(
      "One line. Another line.",
    );
  });

  it("returns empty for copy that is only invisible characters", () => {
    // So the caller's own fallback sentence still fires.
    expect(metaDescription(`${ZWSP}  \n `)).toBe("");
    expect(metaDescription(null)).toBe("");
  });

  it("leaves short copy exactly as the owner wrote it", () => {
    // This must never become a rewrite of his words.
    expect(metaDescription("Automatic, air-conditioned, insured.")).toBe(
      "Automatic, air-conditioned, insured.",
    );
  });

  it("prefers a whole sentence but will not return a stub", () => {
    const early = "Yes. " + "word ".repeat(60);
    // The full stop at position 4 is too early to be the whole description.
    expect(metaDescription(early).endsWith("…")).toBe(true);
  });

  it("keeps an emoji that is not the first thing in the copy", () => {
    // Only the OPENING emoji goes. One mid-copy is the owner's own voice.
    expect(metaDescription("Suzuki Burgman 125cc 🛵 comfortable and smooth.")).toBe(
      "Suzuki Burgman 125cc 🛵 comfortable and smooth.",
    );
  });

  it("returns empty for copy that is nothing but emoji", () => {
    expect(metaDescription("🚗🛵")).toBe("");
  });
});

// ── LINES THAT WERE NEVER SENTENCES (SEO audit 2026-09-29 T5/T6) ───────────
//
// Live copy, 29 Sept: the Hilux joined its heading onto its first sentence,
// the Île aux Cocos listing served raw "* " bullets, and the Sunrise hike a
// "📍" before every line. The experience pages reuse this function, so these
// shapes are pinned here rather than in either caller.
describe("line breaks in the owner's copy", () => {
  it("ends a line that has no punctuation with a full stop", () => {
    expect(
      metaDescription("🚙 Ready for Adventure\nExplore Rodrigues with the Hilux, a proper 4x4."),
    ).toBe("Ready for Adventure. Explore Rodrigues with the Hilux, a proper 4x4.");
  });

  it("does not add a second stop after a line that already ends one", () => {
    expect(metaDescription("Ready for adventure!\nExplore Rodrigues.")).toBe(
      "Ready for adventure! Explore Rodrigues.",
    );
  });

  it("lets a colon hand on to the list under it", () => {
    expect(
      metaDescription("Le prix comprend :\n\n* Transport en bateau\n* Ticket d'entrée\n* Repas"),
    ).toBe("Le prix comprend : Transport en bateau. Ticket d'entrée. Repas");
  });

  it("strips '- ' bullets and the 📍 pin as well as '* '", () => {
    expect(metaDescription("📍 Start: Anse aux Anglais\n📍 Finish: Mourouk\n- Bring water")).toBe(
      "Start: Anse aux Anglais. Finish: Mourouk. Bring water",
    );
  });

  it("joins a line the owner wrapped mid-sentence with a space", () => {
    // A lower-case start is a continuation, not a new sentence.
    expect(metaDescription("Discover every corner\nof the island in comfort.")).toBe(
      "Discover every corner of the island in comfort.",
    );
  });

  it("strips an opening emoji with a variation selector", () => {
    // "🏝️" is U+1F3DD followed by U+FE0F.
    expect(metaDescription("🏝️ Excursion à l'Île aux Coco")).toBe("Excursion à l'Île aux Coco");
  });

  it("leaves a hyphen inside a line alone", () => {
    expect(metaDescription("Air-conditioned - automatic - insured.")).toBe(
      "Air-conditioned - automatic - insured.",
    );
  });

  it("still cuts on a sentence boundary after joining", () => {
    const long = `Heading line\n${"A sentence that runs on. ".repeat(10)}`;
    const out = metaDescription(long);
    expect(Array.from(out).length).toBeLessThanOrEqual(155);
    expect(out.startsWith("Heading line. A sentence")).toBe(true);
    expect(out.endsWith(".")).toBe(true);
  });
});

describe("the callers", () => {
  it("is what the vehicle pages actually use", () => {
    const src = readFileSync(
      join(process.cwd(), "app", "browse", "[category]", "[vehicle]", "page.tsx"),
      "utf8",
    );
    expect(src).toContain("metaDescription(realCopy(item.description)");
    // The hard slice that shipped the bug.
    expect(src).not.toContain('.slice(0, 155)');
  });
});
