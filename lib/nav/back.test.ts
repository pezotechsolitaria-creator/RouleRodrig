import { describe, it, expect } from "vitest";
import { canGoBack, readDepth, bumpDepth, NAV_DEPTH_KEY } from "./back";

function fakeStorage(initial?: Record<string, string>) {
  const map = new Map(Object.entries(initial ?? {}));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    map,
  };
}

// The failure this whole thing exists to prevent runs in BOTH directions, and
// only one of them is visible: a back arrow that goes to the homepage is
// annoying, a back arrow that walks the visitor off the site is a lost sale.
describe("canGoBack", () => {
  it("says no on the first page of a tab", () => {
    // Depth 1 is a deep link, a shared URL, a search result. There is nothing
    // in-app behind it, so back() would leave the site.
    expect(canGoBack(1)).toBe(false);
  });

  it("says yes once the visitor has moved around inside the app", () => {
    expect(canGoBack(2)).toBe(true);
    expect(canGoBack(9)).toBe(true);
  });

  it("refuses anything that is not a real count", () => {
    for (const bad of [0, -1, NaN, Infinity]) {
      expect(canGoBack(bad), String(bad)).toBe(false);
    }
  });
});

describe("readDepth", () => {
  it("reads a stored count", () => {
    expect(readDepth(fakeStorage({ [NAV_DEPTH_KEY]: "3" }))).toBe(3);
  });

  it("returns 0 for nothing, junk or a negative", () => {
    expect(readDepth(fakeStorage())).toBe(0);
    expect(readDepth(fakeStorage({ [NAV_DEPTH_KEY]: "banana" }))).toBe(0);
    expect(readDepth(fakeStorage({ [NAV_DEPTH_KEY]: "-2" }))).toBe(0);
  });

  it("returns 0 rather than throwing when storage refuses", () => {
    // Private browsing. The safe direction: no provable history means the
    // caller uses its declared parent instead of guessing.
    const hostile = {
      getItem() {
        throw new Error("denied");
      },
    };
    expect(readDepth(hostile)).toBe(0);
    expect(canGoBack(readDepth(hostile))).toBe(false);
  });
});

describe("bumpDepth", () => {
  it("counts each in-app navigation", () => {
    const s = fakeStorage();
    bumpDepth(s);
    expect(readDepth(s)).toBe(1);
    bumpDepth(s);
    expect(readDepth(s)).toBe(2);
    // Two navigations in, back has somewhere to go.
    expect(canGoBack(readDepth(s))).toBe(true);
  });

  it("never throws when storage refuses", () => {
    const hostile = {
      getItem() {
        throw new Error("denied");
      },
      setItem() {
        throw new Error("denied");
      },
    };
    expect(() => bumpDepth(hostile)).not.toThrow();
  });
});
