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
    expect(out.codePointAt(0)).toBe(0x1f697); // the car emoji survives
  });

  it("does not stop on a preposition", () => {
    // The shipped one ended "…is the perfect companion for".
    const out = metaDescription(SWIFT);
    expect(out).not.toMatch(/\b(for|the|a|an|of|to|and|with|in|on)$/i);
    expect(out.endsWith(".") || out.endsWith("…")).toBe(true);
  });

  it("counts an emoji as one character, not two", () => {
    // .slice counts UTF-16 units, so a surrogate pair spent two of the budget
    // and a cut could land between its halves.
    const out = metaDescription("🚗".repeat(200), 10);
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
