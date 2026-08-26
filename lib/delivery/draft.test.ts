import { describe, it, expect } from "vitest";
import {
  clearDraft,
  clearQueued,
  draftHasContent,
  isRetryable,
  queueRequest,
  readDraft,
  readQueued,
  writeDraft,
  type Draft,
  type RequestPayload,
} from "./draft";

// A Storage that lives in a Map, so none of this needs a DOM.
function fakeStore(seed: Record<string, string> = {}) {
  const m = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    /** For assertions only. */
    raw: m,
  };
}

// A Storage that throws on everything — Safari private mode, and any browser
// with site data blocked. The form must still render.
const hostile = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};

const DRAFT: Omit<Draft, "v" | "savedAt"> = {
  kind: "package",
  what: "A box from my sister",
  budget: "",
  item: "general",
  largeAndHeavy: false,
  photoPath: null,
  pickup: { id: "port-mathurin", name: "Port Mathurin", area: "Town", lat: -19.68, lng: 63.41 },
  dropoff: null,
  pickupNote: "",
  dropoffNote: "",
  namesShop: false,
  name: "Marie",
  phone: "+23057123456",
  guestEmail: "",
  step: "where",
};

const PAYLOAD: RequestPayload = {
  kind: "package",
  what: "A box",
  pickupText: "Port Mathurin",
  dropoffText: "Mont Lubin",
  sizeClass: "standard",
  cargoKind: "general",
  contactName: "Marie",
  contactPhone: "+23057123456",
};

describe("the draft survives a closed tab", () => {
  it("writes and reads back what was typed", () => {
    const s = fakeStore();
    writeDraft(DRAFT, s);
    const back = readDraft(s);
    expect(back?.what).toBe("A box from my sister");
    expect(back?.pickup?.name).toBe("Port Mathurin");
    expect(back?.step).toBe("where");
  });

  it("returns null when there is nothing saved", () => {
    expect(readDraft(fakeStore())).toBeNull();
  });

  it("forgets a draft older than a day", () => {
    const then = new Date("2026-08-25T09:00:00Z");

    const stale = fakeStore();
    writeDraft(DRAFT, stale, then);
    // 25 hours later: this is not a draft, it is an archaeological find.
    expect(readDraft(stale, then.getTime() + 25 * 3600_000)).toBeNull();
    // And reading it out SWEEPS it, so the next visit does not pay the parse
    // again. Each store gets one clock here for that reason — asserting the
    // 23-hour case against this one would be asserting against a store the
    // line above already emptied.
    expect(stale.raw.has("rr_delivery_draft")).toBe(false);

    const fresh = fakeStore();
    writeDraft(DRAFT, fresh, then);
    expect(readDraft(fresh, then.getTime() + 23 * 3600_000)).not.toBeNull();
  });

  it("drops a draft written by an older version of this file", () => {
    // The version gate is what lets the shape change without a migration.
    const s = fakeStore({ rr_delivery_draft: JSON.stringify({ v: 0, what: "old" }) });
    expect(readDraft(s)).toBeNull();
  });

  it("survives garbage in storage rather than throwing", () => {
    expect(readDraft(fakeStore({ rr_delivery_draft: "not json{" }))).toBeNull();
    expect(readDraft(fakeStore({ rr_delivery_draft: "[]" }))).toBeNull();
    expect(readDraft(fakeStore({ rr_delivery_draft: "null" }))).toBeNull();
  });

  it("degrades to no-draft when storage is blocked entirely", () => {
    // The whole point of injecting Storage: a blocked browser gets a working
    // form, not a white screen.
    expect(() => writeDraft(DRAFT, hostile)).not.toThrow();
    expect(readDraft(hostile)).toBeNull();
    expect(() => clearDraft(hostile)).not.toThrow();
  });

  it("clears on demand", () => {
    const s = fakeStore();
    writeDraft(DRAFT, s);
    clearDraft(s);
    expect(readDraft(s)).toBeNull();
  });
});

describe("only a draft with something in it is worth offering back", () => {
  it("says no to a form nobody started", () => {
    // Restoring this would put "we kept what you started" on an empty form,
    // which teaches people the message is noise.
    const empty: Draft = {
      ...DRAFT,
      v: 1,
      savedAt: new Date().toISOString(),
      what: "",
      pickup: null,
      name: "",
      phone: "",
    };
    expect(draftHasContent(empty)).toBe(false);
    expect(draftHasContent(null)).toBe(false);
  });

  it("says yes to a photo with no words at all", () => {
    // The 44% who cannot write answer step one with a picture. A draft holding
    // only a photo is a draft holding the whole answer.
    const photoOnly: Draft = {
      ...DRAFT,
      v: 1,
      savedAt: new Date().toISOString(),
      what: "",
      pickup: null,
      name: "",
      phone: "",
      photoPath: "requests/abc.jpg",
    };
    expect(draftHasContent(photoOnly)).toBe(true);
  });

  it("says yes to any real answer", () => {
    expect(draftHasContent({ ...DRAFT, v: 1, savedAt: new Date().toISOString() })).toBe(true);
  });
});

describe("the outbox is a promise, not a cache", () => {
  it("keeps a finished request that could not be sent", () => {
    const s = fakeStore();
    queueRequest(PAYLOAD, s);
    expect(readQueued(s)?.payload.dropoffText).toBe("Mont Lubin");
  });

  it("holds ONE, so signal returning cannot post a burst", () => {
    const s = fakeStore();
    queueRequest(PAYLOAD, s);
    queueRequest({ ...PAYLOAD, what: "A second thing" }, s);
    expect(readQueued(s)?.payload.what).toBe("A second thing");
    clearQueued(s);
    expect(readQueued(s)).toBeNull();
  });

  it("refuses a queued item the server would reject", () => {
    // A poison queue fails on a screen nobody is looking at. Better to forget.
    const s = fakeStore({
      rr_delivery_outbox: JSON.stringify({
        queuedAt: new Date().toISOString(),
        payload: { kind: "package", what: "x" }, // no dropoff, no phone
      }),
    });
    expect(readQueued(s)).toBeNull();
    expect(s.raw.has("rr_delivery_outbox")).toBe(false);
  });

  it("forgets an unsent request after a week", () => {
    const s = fakeStore();
    const then = new Date("2026-08-01T09:00:00Z");
    queueRequest(PAYLOAD, s, then);
    expect(readQueued(s, then.getTime() + 6 * 86400_000)).not.toBeNull();
    // By now the price and the need have both moved on; posting it silently
    // would be the wrong kind of surprise.
    expect(readQueued(s, then.getTime() + 8 * 86400_000)).toBeNull();
  });

  it("keeps the draft and the outbox in separate slots", () => {
    const s = fakeStore();
    writeDraft(DRAFT, s);
    queueRequest(PAYLOAD, s);
    clearDraft(s);
    // Posting clears the draft. It must NOT take the unsent request with it.
    expect(readQueued(s)).not.toBeNull();
  });
});

describe("what is worth retrying", () => {
  it("retries a failure that never reached the server", () => {
    expect(isRetryable(null)).toBe(true);
  });

  it("retries the server being unwell", () => {
    for (const s of [500, 502, 503, 504, 408, 429]) {
      expect(isRetryable(s), String(s)).toBe(true);
    }
  });

  it("does NOT retry a request the server looked at and refused", () => {
    // Getting this backwards is how an outbox retries a rejection forever.
    for (const s of [400, 401, 403, 404, 409, 422]) {
      expect(isRetryable(s), String(s)).toBe(false);
    }
  });
});
