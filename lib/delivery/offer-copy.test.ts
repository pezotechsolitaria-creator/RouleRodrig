import { describe, it, expect } from "vitest";
import { deliveryOfferLines, deliveryOfferTitle, type DeliveryOfferFacts } from "./offer-copy";

const DRIVER_PAGE = "https://roulerodrig.com/driver";

const facts = (over: Partial<DeliveryOfferFacts> = {}): DeliveryOfferFacts => ({
  shop: "Ti Kitchen",
  pay: "Rs 120",
  dropoffNote: "Jean tac",
  mapUrl: "https://www.google.com/maps/search/?api=1&query=-19.7,63.4",
  driverPageUrl: DRIVER_PAGE,
  ...over,
});

const text = (f: DeliveryOfferFacts) => [deliveryOfferTitle(f), ...deliveryOfferLines(f)].join("\n");

describe("the offer tells a driver what he needs to judge the job", () => {
  it("leads with the pay when there is one", () => {
    expect(deliveryOfferTitle(facts())).toBe("New delivery — Rs 120");
    expect(deliveryOfferTitle(facts({ pay: null }))).toBe("New delivery available");
  });

  it("carries where it comes FROM and where it goes TO", () => {
    const t = text(facts());
    expect(t).toContain("Pick up from Ti Kitchen.");
    expect(t).toContain("Drop-off: Jean tac");
    expect(t).toContain("Map: https://www.google.com/maps/search/");
  });

  it("still gives a location when the customer typed no note", () => {
    // The note is optional — checkout collects a GPS pin and says so, and the
    // box beside it is skippable. An offer carrying only the note would
    // frequently carry no location at all, which is why the pin is here.
    const t = text(facts({ dropoffNote: null }));
    expect(t).not.toContain("Drop-off:");
    expect(t).toContain("Map: ");
  });

  it("never leaves a dangling label", () => {
    // A bare "Drop-off:" reads as a bug, and with an optional note it would be
    // the common case.
    for (const note of [null, undefined, "", "   "]) {
      const t = text(facts({ dropoffNote: note }));
      expect(t, String(note)).not.toContain("Drop-off:");
    }
    for (const map of [null, undefined, "", "   "]) {
      const t = text(facts({ mapUrl: map }));
      expect(t, String(map)).not.toContain("Map:");
    }
  });

  it("degrades to a usable message when there is no location at all", () => {
    const lines = deliveryOfferLines(facts({ dropoffNote: null, mapUrl: null }));
    expect(lines).toEqual([
      "Pick up from Ti Kitchen.",
      "Open the driver page to accept — first to accept gets it.",
      DRIVER_PAGE,
    ]);
  });

  it("always ends with the page that actually accepts the job", () => {
    for (const f of [facts(), facts({ dropoffNote: null }), facts({ mapUrl: null, dropoffNote: null })]) {
      const lines = deliveryOfferLines(f);
      expect(lines[lines.length - 1]).toBe(DRIVER_PAGE);
      expect(lines.join("\n")).toContain("first to accept gets it");
    }
  });

  it("does not call a free-text note an address", () => {
    // The column is deliveries.dropoff_note, fed from a checkout box labelled
    // "Landmark or directions (optional)" beside copy saying "We deliver to a
    // GPS pin, not a street address". Calling it "Address" misdescribes what
    // the customer typed.
    expect(text(facts()).toLowerCase()).not.toContain("address");
  });

  it("uses none of our internal vocabulary", () => {
    const BANNED = [
      "dropoff_note", "dropoff_lat", "deliveries", "delivery_offers", "searching_driver",
      "dispatch", "candidate", "rpc", "queue", "payload", "null", "undefined",
    ];
    const t = text(facts()).toLowerCase();
    for (const w of BANNED) expect(t, `leaked "${w}"`).not.toContain(w);
  });

  it("keeps the title identical for push and WhatsApp, so the two cannot drift", () => {
    // Both channels call deliveryOfferTitle; this asserts the shared shape
    // rather than two copies of the same ternary.
    const f = facts({ pay: "Rs 90" });
    expect(deliveryOfferTitle(f)).toBe("New delivery — Rs 90");
  });
});
