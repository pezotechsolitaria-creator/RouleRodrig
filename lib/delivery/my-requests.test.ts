import { describe, it, expect, beforeEach } from "vitest";
import { readSaved, saveRequest, emailFor, forgetRequest } from "./my-requests";

// A fake Storage, so this runs with no DOM and so the failure modes a real
// browser has — quota, private mode, a corrupted value that survived a deploy —
// can each be reproduced deliberately.
function fakeStore(initial?: string) {
  const map = new Map<string, string>();
  if (initial !== undefined) map.set("rr_delivery_requests", initial);
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    _raw: () => map.get("rr_delivery_requests"),
  };
}

const throwingStore = {
  getItem() {
    throw new Error("storage disabled");
  },
  setItem() {
    throw new Error("storage disabled");
  },
  removeItem() {
    throw new Error("storage disabled");
  },
};

let store: ReturnType<typeof fakeStore>;
beforeEach(() => {
  store = fakeStore();
});

describe("remembering a request", () => {
  it("reads back what it saved", () => {
    saveRequest({ id: "a", email: "marie@example.com", what: "A box" }, store);
    const out = readSaved(store);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("a");
    expect(out[0].email).toBe("marie@example.com");
    expect(out[0].savedAt).toBeTruthy();
  });

  it("puts the newest first", () => {
    saveRequest({ id: "a", what: "First" }, store);
    saveRequest({ id: "b", what: "Second" }, store);
    expect(readSaved(store).map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("never stores the same request twice", () => {
    // Re-posting, or simply landing on the tracking page again, must not grow
    // the list — it is a history, not a log.
    saveRequest({ id: "a", what: "A box" }, store);
    saveRequest({ id: "a", email: "new@example.com", what: "A box" }, store);
    const out = readSaved(store);
    expect(out).toHaveLength(1);
    expect(out[0].email).toBe("new@example.com");
  });

  it("caps the history rather than growing without limit", () => {
    for (let i = 0; i < 30; i++) saveRequest({ id: `r${i}`, what: `Job ${i}` }, store);
    const out = readSaved(store);
    expect(out).toHaveLength(20);
    expect(out[0].id).toBe("r29");
  });

  it("finds the email a device used, and admits when it has none", () => {
    saveRequest({ id: "a", email: "marie@example.com", what: "A box" }, store);
    saveRequest({ id: "b", what: "Signed in, no email needed" }, store);
    expect(emailFor("a", store)).toBe("marie@example.com");
    expect(emailFor("b", store)).toBeNull();
    expect(emailFor("never-seen", store)).toBeNull();
  });

  it("forgets one without forgetting the rest", () => {
    saveRequest({ id: "a", what: "A" }, store);
    saveRequest({ id: "b", what: "B" }, store);
    forgetRequest("a", store);
    expect(readSaved(store).map((r) => r.id)).toEqual(["b"]);
  });
});

describe("when the browser will not cooperate", () => {
  it("returns nothing rather than throwing with no storage at all", () => {
    // The page must render for somebody who has blocked storage. It degrades to
    // asking for the email, which is exactly the cross-device experience.
    expect(readSaved(null)).toEqual([]);
    expect(emailFor("a", null)).toBeNull();
    expect(() => saveRequest({ id: "a", what: "A" }, null)).not.toThrow();
    expect(() => forgetRequest("a", null)).not.toThrow();
  });

  it("survives a storage that throws on access", () => {
    // Safari in private mode throws on ACCESS, not on write.
    expect(readSaved(throwingStore)).toEqual([]);
    expect(() => saveRequest({ id: "a", what: "A" }, throwingStore)).not.toThrow();
    expect(() => forgetRequest("a", throwingStore)).not.toThrow();
  });

  it("survives a value that is not JSON", () => {
    expect(readSaved(fakeStore("{not json"))).toEqual([]);
  });

  it("survives a value that is JSON but the wrong shape", () => {
    // This key outlives deploys, so a shape change has to degrade to "we
    // forgot" rather than to a page that will not render.
    expect(readSaved(fakeStore('{"id":"a"}'))).toEqual([]);
    expect(readSaved(fakeStore("null"))).toEqual([]);
    expect(readSaved(fakeStore("42"))).toEqual([]);
  });

  it("drops only the malformed entries from a partly-good list", () => {
    const raw = JSON.stringify([
      { id: "good", what: "A box", savedAt: "2026-08-26T10:00:00Z" },
      { id: 42, what: "wrong type" },
      null,
      { what: "no id" },
    ]);
    const out = readSaved(fakeStore(raw));
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("good");
  });

  it("keeps writing to a good store after meeting a bad value", () => {
    const s = fakeStore("{not json");
    saveRequest({ id: "a", what: "A" }, s);
    expect(readSaved(s).map((r) => r.id)).toEqual(["a"]);
  });
});
