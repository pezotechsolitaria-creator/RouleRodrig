import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── DO NOT ARGUE AGAINST YOURSELF (M142) ────────────────────────────────────
//
// An external audit scored this site Pass on almost everything and gave social
// proof the one outright FAIL. The evidence it cited was a single sentence,
// live on the homepage of a business that has taken real bookings:
//
//     "Be the first to leave a review"
//
// It is a fair invitation, and it also tells every visitor — and every AI
// engine reading the page — that nobody has ever reviewed this business. The
// wording now invites the same review without volunteering the count.
//
// This is NOT the fix. The fix is asking the customers who already rented to
// post one, and only the owner can do that. This stops the page arguing
// against itself while that happens.

const SRC = readFileSync(
  join(__dirname, "..", "components", "ReviewsContact.tsx"),
  "utf8",
);
const code = SRC.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

describe("the empty reviews state", () => {
  it("no longer announces that there are none", () => {
    expect(code).not.toMatch(/Be the first to leave a review/);
    expect(code).not.toMatch(/Soyez le premier à laisser un avis/);
    expect(code).not.toMatch(/Vinn premie pou kit enn komanter/);
  });

  it("still invites a review, in all three languages", () => {
    expect(code).toMatch(/Tell other travellers/);
    expect(code).toMatch(/aux autres voyageurs/);
    expect(code).toMatch(/lezot vwayazer/);
  });

  it("still renders no stars when there is no real rating", () => {
    // The rule that must never regress: this once fell back to 5 filled gold
    // stars above "be the first to leave a review" — an invented rating, which
    // is worse than none, because a rating is the one thing on the page a
    // visitor is asked to trust.
    expect(code).toMatch(/\{avg && <Stars/);
  });

  it("keeps the review form reachable", () => {
    // Removing the prompt entirely would have closed the only route a happy
    // customer has to leave one.
    expect(code).toMatch(/setOpen\(true\)/);
  });
});
