import { describe, it, expect } from "vitest";
import {
  HOLD_MS, firstStepDelay, isUnoptimizedSrc, nextPhotoIndex, uniquePhotos,
} from "./photos";

describe("uniquePhotos", () => {
  it("drops the cover when it is also the first gallery photo", () => {
    // THE case this exists for. Every caller passes [image, ...images], and in
    // this content model `image` is usually images[0] — so without the dedupe
    // the card crossfades a photo into an identical copy of itself, which reads
    // as a stalled slideshow rather than a gallery.
    const cover = "a.jpg";
    expect(uniquePhotos([cover, "a.jpg", "b.jpg", "c.jpg"])).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
  });

  it("keeps the cover first, because it is the photo the owner chose", () => {
    expect(uniquePhotos(["cover.jpg", "b.jpg", "a.jpg"])[0]).toBe("cover.jpg");
  });

  it("drops blanks — an unset cover is \"\" in this model, not undefined", () => {
    expect(uniquePhotos(["", "  ", null, undefined, "a.jpg"])).toEqual(["a.jpg"]);
  });

  it("returns an empty list when there is nothing to show", () => {
    expect(uniquePhotos([])).toEqual([]);
    expect(uniquePhotos([null, "", undefined])).toEqual([]);
  });

  it("de-duplicates anywhere in the list, not just the front", () => {
    expect(uniquePhotos(["a.jpg", "b.jpg", "a.jpg"])).toEqual(["a.jpg", "b.jpg"]);
  });
});

describe("nextPhotoIndex", () => {
  it("advances and wraps, so the gallery loops", () => {
    expect(nextPhotoIndex(0, 3)).toBe(1);
    expect(nextPhotoIndex(1, 3)).toBe(2);
    expect(nextPhotoIndex(2, 3)).toBe(0);
  });

  it("stays put for a single photo — the common case starts no timer", () => {
    expect(nextPhotoIndex(0, 1)).toBe(0);
    expect(nextPhotoIndex(0, 0)).toBe(0);
  });

  it("visits every photo exactly once per lap", () => {
    const total = 5;
    const seen: number[] = [];
    let i = 0;
    for (let step = 0; step < total; step++) {
      seen.push(i);
      i = nextPhotoIndex(i, total);
    }
    expect(seen).toEqual([0, 1, 2, 3, 4]);
    expect(i).toBe(0); // back to the cover
  });
});

describe("firstStepDelay", () => {
  it("gives neighbouring cards different start times", () => {
    // A grid mounts in one render; identical delays make every card flip at the
    // same instant, which looks like a glitch.
    const first4 = [0, 1, 2, 3].map(firstStepDelay);
    expect(new Set(first4).size).toBe(4);
  });

  it("never waits less than the normal hold", () => {
    for (let i = 0; i < 12; i++) expect(firstStepDelay(i)).toBeGreaterThanOrEqual(HOLD_MS);
  });

  it("stays bounded, so no card sits still while its neighbours move", () => {
    for (let i = 0; i < 100; i++) expect(firstStepDelay(i)).toBeLessThan(HOLD_MS + 2000);
  });

  it("survives junk rather than producing NaN and a dead timer", () => {
    expect(firstStepDelay(-3)).toBeGreaterThanOrEqual(HOLD_MS);
    expect(firstStepDelay(NaN)).toBe(HOLD_MS);
    expect(firstStepDelay(1.7)).toBeGreaterThanOrEqual(HOLD_MS);
  });
});

describe("isUnoptimizedSrc", () => {
  it("optimizes Supabase-hosted photos", () => {
    expect(isUnoptimizedSrc("https://abc.supabase.co/storage/x.jpg")).toBe(false);
  });

  it("passes through local uploads and other hosts", () => {
    expect(isUnoptimizedSrc("/uploads/x.jpg")).toBe(true);
    expect(isUnoptimizedSrc("https://example.com/x.jpg")).toBe(true);
  });
});
