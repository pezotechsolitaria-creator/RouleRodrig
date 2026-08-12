import { describe, it, expect } from "vitest";
import { statusWords, fulfilmentWords, notSellingNote, type ShopScheduleFacts } from "./plain-words";

// These tests are about one thing: a shop that is shut must not read as a shop
// that is open. That was the actual failure — at 17:12, twelve minutes after
// closing, three shops all displayed "Opens 08:00".

// Rodrigues is UTC+4 with no DST, so a fixed instant is unambiguous.
const at = (iso: string) => new Date(iso);
const facts = (over: Partial<ShopScheduleFacts>): ShopScheduleFacts => ({
  hasSchedule: true, isOpen: false, isClosedToday: false,
  opensAt: "08:00:00", closesAt: "17:00:00", nextOpenAt: null, ...over,
});

describe("statusWords", () => {
  it("says WHEN it opens again, not what time it opens on a normal day", () => {
    // 12 Aug 2026 17:12 island = 13:12Z. Next opening is tomorrow 08:00 island.
    const w = statusWords(
      facts({ nextOpenAt: "2026-08-13T04:00:00Z" }),
      at("2026-08-12T13:12:00Z"),
    );
    expect(w.badge).toBe("Opens tomorrow 08:00");
    expect(w.tone).toBe("closed");
  });

  it("says 'Opens at' when it is still the same day", () => {
    // 06:00 island, opening at 08:00 island the same morning.
    const w = statusWords(
      facts({ nextOpenAt: "2026-08-12T04:00:00Z" }),
      at("2026-08-12T02:00:00Z"),
    );
    expect(w.badge).toBe("Opens at 08:00");
  });

  it("names the weekday when it is further out than tomorrow", () => {
    const w = statusWords(
      facts({ nextOpenAt: "2026-08-17T04:00:00Z" }),
      at("2026-08-12T13:12:00Z"),
    );
    expect(w.badge).toBe("Opens Monday 08:00");
  });

  it("tells an open shop when it closes, which is the next thing you need", () => {
    const w = statusWords(facts({ isOpen: true, closesAt: "17:00:00" }));
    expect(w.badge).toBe("Open until 17:00");
    expect(w.tone).toBe("open");
  });

  it("claims nothing about a shop that never set hours", () => {
    const w = statusWords(facts({ hasSchedule: false }));
    expect(w.badge).toBe("");
    expect(w.tone).toBe("unknown");
  });

  it("falls back to 'Closed today' rather than inventing a time", () => {
    expect(statusWords(facts({ isClosedToday: true, nextOpenAt: null })).badge).toBe("Closed today");
  });

  it("does not throw or print 'Invalid Date' on a malformed timestamp", () => {
    const w = statusWords(facts({ nextOpenAt: "not-a-date" }));
    expect(w.badge).toBe("Closed");
    expect(w.tone).toBe("closed");
  });

  it("uses island midnight, not the server's, to decide 'tomorrow'", () => {
    // 22:00Z on the 12th is already 02:00 on the 13th in Rodrigues. An opening
    // at 08:00 on the 13th is therefore TODAY, not tomorrow.
    const w = statusWords(
      facts({ nextOpenAt: "2026-08-13T04:00:00Z" }),
      at("2026-08-12T22:00:00Z"),
    );
    expect(w.badge).toBe("Opens at 08:00");
  });
});

describe("fulfilmentWords", () => {
  it("never says 'Your own driver' — it sounded like a requirement to own one", () => {
    const words = fulfilmentWords({
      offersPickup: true, offersRrDelivery: true, offersOwnDelivery: true,
      acceptsCash: true, acceptsBankTransfer: true,
    });
    expect(words).toEqual([
      "Collect in person", "Delivered to you", "Send someone to collect", "Pay cash", "Bank transfer",
    ]);
  });

  it("puts how-you-get-it before how-you-pay", () => {
    const words = fulfilmentWords({
      offersPickup: true, offersRrDelivery: false, offersOwnDelivery: false,
      acceptsCash: true, acceptsBankTransfer: false,
    });
    expect(words.indexOf("Collect in person")).toBeLessThan(words.indexOf("Pay cash"));
  });

  it("says nothing at all when a shop offers nothing", () => {
    expect(fulfilmentWords({
      offersPickup: false, offersRrDelivery: false, offersOwnDelivery: false,
      acceptsCash: false, acceptsBankTransfer: false,
    })).toEqual([]);
  });
});

describe("notSellingNote", () => {
  it("gives the customer the consequence, never the billing reason", () => {
    expect(notSellingNote(false)).toBe("Not selling online yet");
    expect(notSellingNote(false)).not.toMatch(/subscription|plan|billing|expired/i);
  });

  it("is silent for a shop that can sell", () => {
    expect(notSellingNote(true)).toBe("");
  });
});
