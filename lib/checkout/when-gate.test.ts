import { describe, it, expect } from "vitest";
import {
  checkoutTiming, slotPaymentLine, slotWords, whenAppliesTo, WHEN_LOADING,
  type ChosenSlot, type Fulfilment, type TimingInput, type WhenState,
} from "./when-gate";
import { CHECKOUT_COPY, sellerWords } from "./copy.i18n";

// ── CHECKOUT'S TIMING GATE (M216) ───────────────────────────────────────────
//
// Chez Banane — the only kitchen on /food — needs 24 hours' notice, takes cash
// and offers all three fulfilments. Every case below is a customer who would
// otherwise have met a dark button, a refused order, or an ASAP option the
// server refuses. The figures are the real ones on 23 Sept 2026.

const WALK_UP: WhenState = { status: "ready", noticeHours: 0, asap: true, bookable: true };
const NOTICE: WhenState = { status: "ready", noticeHours: 24, asap: false, bookable: true };
const FAILED: WhenState = { status: "failed", noticeHours: 0, asap: true, bookable: false };
// Friday evening: Saturday is inside the notice, Sunday is shut.
const NOTICE_NOTHING_LEFT: WhenState = { ...NOTICE, bookable: false };

const FRIDAY_NOON: ChosenSlot = { date: "2026-09-25", time: "12:00", startsAt: "2026-09-25T08:00:00+00:00" };
const ALL: Fulfilment[] = ["pickup", "customer_delivery", "rr_delivery"];

const base = (over: Partial<TimingInput> = {}): TimingInput => ({
  isFood: true,
  fulfilment: "pickup",
  when: WALK_UP,
  slot: null,
  closedNow: false,
  deliveryOffNow: false,
  ...over,
});

describe("who is asked when", () => {
  it("a walk-up kitchen: collection only, as M161 had it", () => {
    expect(whenAppliesTo(true, "pickup", WALK_UP)).toBe(true);
    expect(whenAppliesTo(true, "rr_delivery", WALK_UP)).toBe(false);
    expect(whenAppliesTo(true, "customer_delivery", WALK_UP)).toBe(false);
  });

  it("a kitchen that needs notice: every fulfilment — the slot is the handover", () => {
    for (const f of ALL) {
      expect(whenAppliesTo(true, f, NOTICE), f).toBe(true);
      expect(checkoutTiming(base({ fulfilment: f, when: NOTICE })).visible, f).toBe(true);
    }
  });

  it("the server refusing ASAP is enough, even if the notice read came back 0", () => {
    // /api/food/slots reports asap:false when kitchen_notice_hours failed but
    // a day was explained as 'notice'. Same consequence: a time is required.
    const when: WhenState = { status: "ready", noticeHours: 0, asap: false, bookable: true };
    expect(checkoutTiming(base({ fulfilment: "rr_delivery", when })).needsNotice).toBe(true);
    expect(whenAppliesTo(true, "rr_delivery", when)).toBe(true);
  });

  it("never a shop or an event", () => {
    for (const f of ALL) {
      const t = checkoutTiming(base({ isFood: false, fulfilment: f, when: NOTICE, slot: FRIDAY_NOON }));
      expect(t.applies, f).toBe(false);
      expect(t.visible, f).toBe(false);
      expect(t.slot, f).toBeNull();
      expect(t.whenBlock, f).toBeNull();
    }
  });
});

describe("a hidden slot is never sent", () => {
  it("chosen under 'pick up' at a walk-up kitchen, then switched to delivery", () => {
    const t = checkoutTiming(base({ fulfilment: "rr_delivery", slot: FRIDAY_NOON }));
    expect(t.visible).toBe(false);
    expect(t.slot).toBeNull();
  });

  it("kept across a switch at a notice kitchen, where it still applies", () => {
    const t = checkoutTiming(base({ fulfilment: "rr_delivery", when: NOTICE, slot: FRIDAY_NOON }));
    expect(t.slot).toEqual(FRIDAY_NOON);
  });

  it("not sent while the picker has not answered", () => {
    const t = checkoutTiming(base({ fulfilment: "rr_delivery", when: WHEN_LOADING, slot: FRIDAY_NOON }));
    expect(t.slot).toBeNull();
  });
});

describe("the button waits for a time where one is required", () => {
  it("a notice kitchen with nothing chosen: 'Choose when you want it'", () => {
    expect(checkoutTiming(base({ when: NOTICE })).whenBlock).toBe("choose");
  });

  it("…and with a time chosen, nothing in the way", () => {
    expect(checkoutTiming(base({ when: NOTICE, slot: FRIDAY_NOON })).whenBlock).toBeNull();
  });

  it("nothing bookable in the horizon says so rather than 'choose'", () => {
    expect(checkoutTiming(base({ when: NOTICE_NOTHING_LEFT })).whenBlock).toBe("none");
  });

  it("a walk-up kitchen goes as ASAP, as it always did", () => {
    expect(checkoutTiming(base({ when: WALK_UP })).whenBlock).toBeNull();
    expect(checkoutTiming(base({ fulfilment: "rr_delivery", when: WALK_UP })).whenBlock).toBeNull();
  });

  it("holds while the picker is loading", () => {
    expect(checkoutTiming(base({ when: WHEN_LOADING })).whenBlock).toBe("loading");
  });

  it("a failed read is not a silent ASAP: blocked, and the picker shown with its Retry", () => {
    for (const f of ALL) {
      const t = checkoutTiming(base({ fulfilment: f, when: FAILED }));
      expect(t.whenBlock, f).toBe("failed");
      expect(t.visible, f).toBe(true);
    }
  });

  it("does nothing for a shop or an event", () => {
    expect(checkoutTiming(base({ isFood: false, when: WHEN_LOADING })).whenBlock).toBeNull();
  });
});

describe("closed now does not stop an order for later", () => {
  it("23:44 on a Wednesday, Friday noon chosen: every option open, the order can go", () => {
    for (const f of ALL) {
      const t = checkoutTiming(base({ fulfilment: f, when: NOTICE, slot: FRIDAY_NOON, closedNow: true, deliveryOffNow: true }));
      expect(t.closedFor[f], f).toBe(false);
      expect(t.scheduleReady, f).toBe(true);
      expect(t.closedBanner, f).toBe("later");
    }
    expect(checkoutTiming(base({ fulfilment: "rr_delivery", when: NOTICE, deliveryOffNow: true })).deliveryOffFor).toBe(false);
  });

  it("a notice kitchen, closed, nothing chosen yet: the radios stay open and the time is what is asked for", () => {
    const t = checkoutTiming(base({ when: NOTICE, closedNow: true }));
    expect(t.closedFor).toEqual({ pickup: false, customer_delivery: false, rr_delivery: false });
    expect(t.whenBlock).toBe("choose");
  });

  it("an ASAP order at a shut walk-up kitchen is still blocked, with the old banner", () => {
    const shut: WhenState = { ...WALK_UP, bookable: false };
    const t = checkoutTiming(base({ when: shut, closedNow: true }));
    expect(t.scheduleReady).toBe(false);
    expect(t.closedBanner).toBe("hard");
    expect(t.closedFor).toEqual({ pickup: true, customer_delivery: true, rr_delivery: true });
  });

  it("a shut walk-up kitchen with a time later today: collection opens, delivery does not", () => {
    const t = checkoutTiming(base({ when: WALK_UP, closedNow: true }));
    expect(t.closedFor.pickup).toBe(false);
    expect(t.closedFor.rr_delivery).toBe(true);
    expect(t.closedBanner).toBe("later");
    // ...but only once a time is actually chosen.
    expect(t.scheduleReady).toBe(false);
    const u = checkoutTiming(base({ when: WALK_UP, closedNow: true, slot: FRIDAY_NOON }));
    expect(u.scheduleReady).toBe(true);
  });

  it("delivery not running now still stops an ASAP delivery from a walk-up kitchen", () => {
    const t = checkoutTiming(base({ fulfilment: "rr_delivery", when: WALK_UP, deliveryOffNow: true }));
    expect(t.deliveryOffFor).toBe(true);
    expect(t.scheduleReady).toBe(false);
  });

  it("no red flash while the picker loads", () => {
    const t = checkoutTiming(base({ when: WHEN_LOADING, closedNow: true }));
    expect(t.closedBanner).toBeNull();
    expect(t.closedFor.pickup).toBe(false);
  });

  it("a failed read is not answered with 'closed, come back later' either", () => {
    // Nobody knows yet whether this kitchen takes an order for Friday. The
    // Retry is the thing to act on; the button is held meanwhile.
    for (const f of ALL) {
      const t = checkoutTiming(base({ fulfilment: f, when: FAILED, closedNow: true, deliveryOffNow: true }));
      expect(t.closedBanner, f).toBeNull();
      expect(t.closedFor[f], f).toBe(false);
      expect(t.deliveryOffFor, f).toBe(false);
      expect(t.whenBlock, f).toBe("failed");
    }
  });

  it("promises 'order for later' only when a later time exists", () => {
    // Friday 20:00 at Chez Banane: Saturday is inside the 24 hours, Sunday is
    // shut. The picker says there is nothing to book; the banner must not
    // say there is.
    const t = checkoutTiming(base({ when: NOTICE_NOTHING_LEFT, closedNow: true }));
    expect(t.closedBanner).toBe("hard");
    expect(t.whenBlock).toBe("none");
  });

  it("a shop keeps the plain rule", () => {
    const t = checkoutTiming(base({ isFood: false, closedNow: true }));
    expect(t.closedBanner).toBe("hard");
    expect(t.scheduleReady).toBe(false);
  });
});

describe("the sentence that replaces the reservation clock", () => {
  it("is the slot, in Rodrigues time, with its date spelled out", () => {
    // 08:00 UTC is 12:00 on the island.
    expect(slotWords(FRIDAY_NOON, "en")).toBe("Friday 25 September, 12:00–12:30");
    expect(slotWords(FRIDAY_NOON, "fr")).toBe("vendredi 25 septembre, 12:00–12:30");
    expect(slotWords(FRIDAY_NOON, "cr")).toBe("Vandredi 25 Septam, 12:00–12:30");
    expect(slotWords(null, "en")).toBeNull();
    expect(slotWords({ ...FRIDAY_NOON, startsAt: null }, "en")).toBeNull();
  });

  it("says how the money changes hands, per fulfilment", () => {
    const c = CHECKOUT_COPY.en.form.slotted;
    const s = sellerWords("en", "food");
    const when = "Friday 25 September, 12:00–12:30";
    expect(slotPaymentLine(c, s, "cash", "pickup", when)).toBe(
      "Pay in cash when you collect — Friday 25 September, 12:00–12:30.",
    );
    expect(slotPaymentLine(c, s, "cash", "rr_delivery", when)).toContain("hands it to the driver");
    expect(slotPaymentLine(c, s, "cash", "customer_delivery", when)).toContain("whoever collects it");
    expect(slotPaymentLine(c, s, "bank_transfer", "pickup", when)).toContain("Send the transfer");
  });

  it("carries the slot in every language, for every case", () => {
    for (const l of ["en", "fr", "cr"] as const) {
      const c = CHECKOUT_COPY[l].form.slotted;
      const s = sellerWords(l, "food");
      const when = slotWords(FRIDAY_NOON, l)!;
      for (const p of ["cash", "bank_transfer"] as const) {
        for (const f of ALL) {
          expect(slotPaymentLine(c, s, p, f, when), `${l}.${p}.${f}`).toContain(when);
        }
      }
      // The reservation-clock vocabulary must not leak into it.
      expect(slotPaymentLine(c, s, "cash", "pickup", when)).not.toMatch(/reserv|7 days|7 jours/i);
    }
  });
});
