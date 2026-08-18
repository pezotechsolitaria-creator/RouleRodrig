import { describe, it, expect } from "vitest";
import { resolveHeroBackground, type WorldHero } from "./types";

// What the Curated hero paints, and — more importantly — what it does NOT
// download. These are the three rules that are impossible to see in a
// screenshot and easy to break while editing the component.

const FALLBACK = { canvas: "var(--cur-bg)", glow: "var(--cur-champagne)" };
const IMAGES = ["/a.jpg", "/b.jpg"];
const hero = (background?: WorldHero["background"]) => ({ background }) as Pick<WorldHero, "background">;

describe("the hero always paints something", () => {
  it("falls back to the world's own tokens when nothing is set", () => {
    // Not transparent. A hero with no background set must not show the page
    // behind it while the first photograph decodes.
    const r = resolveHeroBackground(hero(), IMAGES, FALLBACK);
    expect(r.canvas).toBe("var(--cur-bg)");
    expect(r.glow).toBe("var(--cur-champagne)");
  });

  it("treats an emptied field as unset rather than as a colour", () => {
    // The admin's Reset button writes "", and whitespace is what a half-cleared
    // field leaves behind. Either must give the default back, not black.
    const r = resolveHeroBackground(hero({ colour: "   ", accent: "" }), IMAGES, FALLBACK);
    expect(r.canvas).toBe("var(--cur-bg)");
    expect(r.glow).toBe("var(--cur-champagne)");
  });

  it("takes any CSS colour the editor typed, not only hex", () => {
    const r = resolveHeroBackground(
      hero({ colour: "rgb(20 14 10)", accent: "var(--cur-copper)" }),
      IMAGES,
      FALLBACK,
    );
    expect(r.canvas).toBe("rgb(20 14 10)");
    expect(r.glow).toBe("var(--cur-copper)");
  });
});

describe("colour mode costs nothing to load", () => {
  it("returns NO stills — not stills that are merely hidden", () => {
    // The whole point. A hidden <Image> is still fetched and still competes to
    // be the LCP element; returning none means the browser never asks for it.
    const r = resolveHeroBackground(hero({ mode: "colour" }), IMAGES, FALLBACK);
    expect(r.painted).toBe(true);
    expect(r.stills).toEqual([]);
  });

  it("keeps the photographs in the document, so switching back restores them", () => {
    // Destroying the stills on a mode change would make Colour a one-way door
    // and lose an editor's work to a misclick.
    const doc = hero({ mode: "colour" });
    resolveHeroBackground(doc, IMAGES, FALLBACK);
    expect(IMAGES).toEqual(["/a.jpg", "/b.jpg"]);
    expect(resolveHeroBackground({ background: { ...doc.background, mode: "photo" } }, IMAGES, FALLBACK).stills)
      .toEqual(IMAGES);
  });

  it("keeps photography when the mode is absent, so nothing saved before this changes", () => {
    expect(resolveHeroBackground(hero(), IMAGES, FALLBACK).stills).toEqual(IMAGES);
    expect(resolveHeroBackground(hero({}), IMAGES, FALLBACK).painted).toBe(false);
  });
});

describe("the drift is opt-out, not opt-in", () => {
  it("moves unless the editor turned it off", () => {
    // Absent means animated: a document saved before this existed should get
    // the intended hero, not a still one.
    expect(resolveHeroBackground(hero(), IMAGES, FALLBACK).animated).toBe(true);
    expect(resolveHeroBackground(hero({ animated: true }), IMAGES, FALLBACK).animated).toBe(true);
    expect(resolveHeroBackground(hero({ animated: false }), IMAGES, FALLBACK).animated).toBe(false);
  });
});
