import { describe, expect, it } from "vitest";
import { isPlaceholderCopy, realCopy } from "./placeholder-copy";

// ── "Add a description for this car." WAS A META DESCRIPTION ────────────────
//
// /browse/car/new-cars was live, indexable and in the sitemap on 2026-09-09
// with exactly that as its <meta name="description"> — the sentence Google
// prints under a search result — an H1 of "NEW CARS", "ADD A SHORT TAGLINE."
// in the body and a price of "From Rs 0/day".
//
// Three of the four REAL cars were also printing "ADD A SHORT TAGLINE." above
// their model name, because the admin form pre-fills these fields with prompts
// to the owner and the site printed the prompts.
//
// Nothing here edits the owner's row or invents copy. It only declines to
// PRINT the template's own words, so the line collapses until real ones exist.

describe("isPlaceholderCopy", () => {
  it("catches the two strings that actually shipped", () => {
    expect(isPlaceholderCopy("Add a short tagline.")).toBe(true);
    expect(isPlaceholderCopy("Add a description for this car.")).toBe(true);
  });

  it("is not fooled by case, spacing or a missing full stop", () => {
    // These are typed by hand as often as they are pre-filled.
    expect(isPlaceholderCopy("  ADD A SHORT TAGLINE  ")).toBe(true);
    expect(isPlaceholderCopy("add a description for this scooter")).toBe(true);
  });

  it("leaves real copy alone", () => {
    expect(isPlaceholderCopy("Stylish, Nimble, and Fuel-efficient")).toBe(false);
    expect(
      isPlaceholderCopy("🚙 Toyota Hilux – Powerful, Reliable & Ready"),
    ).toBe(false);
  });

  it("does not swallow a real sentence that merely starts with 'Add'", () => {
    // "Add a driver for Rs 500/day" is an upsell, not a prompt. Over-matching
    // here would silently delete the owner's words, which is worse than the
    // bug being fixed.
    expect(isPlaceholderCopy("Add a second driver for Rs 500 a day.")).toBe(false);
  });

  it("treats empty as nothing to say, not as a placeholder", () => {
    expect(isPlaceholderCopy("")).toBe(false);
    expect(isPlaceholderCopy(null)).toBe(false);
  });
});

describe("realCopy", () => {
  it("returns null for a placeholder so the line disappears", () => {
    // Callers guard on falsiness already, so null removes the element with no
    // other change — an empty eyebrow is invisible, the prompt is not.
    expect(realCopy("Add a short tagline.")).toBeNull();
    expect(realCopy("   ")).toBeNull();
  });

  it("passes real copy through untouched, whitespace and all", () => {
    // It is the owner's text; trimming it here would be a second opinion the
    // rest of the site does not share.
    expect(realCopy(" Stylish, Nimble ")).toBe(" Stylish, Nimble ");
  });
});
