import { describe, it, expect } from "vitest";
import {
  newRequestTitle,
  newRequestLines,
  quoteArrivedTitle,
  quoteArrivedLines,
  quoteAcceptedTitle,
  quoteAcceptedLines,
  type RequestFacts,
} from "./request-copy";

const PACKAGE: RequestFacts = {
  id: "r1",
  kind: "package",
  what: "A medium box, about 10 kg",
  sizeClass: "standard",
  pickupText: "Port Mathurin",
  pickupNote: "the yellow shop by the market",
  dropoffText: "Fatima Bay",
  dropoffNote: "blue gate, first floor",
  contactName: "Marie",
};

const SHOPPING: RequestFacts = {
  ...PACKAGE,
  kind: "shop_and_deliver",
  what: "2 gas bottles, 12 kg",
  sizeClass: "large",
  spendCap: 150000,
};

describe("a job appearing on the board", () => {
  it("says name your price, not here is a job", () => {
    // Every OTHER message a delivery driver gets is an assignment they win by
    // tapping fast. A board post that does not say otherwise reads as a race
    // they have already lost, and they stop opening the next one.
    expect(newRequestTitle(PACKAGE)).toMatch(/name your price/i);
    expect(newRequestTitle(SHOPPING)).toMatch(/name your price/i);
  });

  it("tells the two kinds apart in the title", () => {
    expect(newRequestTitle(SHOPPING)).toMatch(/shopping/i);
    expect(newRequestTitle(PACKAGE)).not.toMatch(/shopping/i);
  });

  it("carries BOTH addresses, with the notes that find the door", () => {
    // The owner's standing instruction: the address is in every driver message,
    // including this one, which is sent before anybody has committed. A driver
    // cannot price a job without knowing where it starts and ends.
    const lines = newRequestLines(PACKAGE).join("\n");
    expect(lines).toContain("Port Mathurin — the yellow shop by the market");
    expect(lines).toContain("Fatima Bay — blue gate, first floor");
  });

  it("survives a place with no note", () => {
    const lines = newRequestLines({ ...PACKAGE, pickupNote: null, dropoffNote: "" }).join("\n");
    expect(lines).toContain("Collect: Port Mathurin");
    expect(lines).not.toMatch(/Port Mathurin —\s*$/m);
    expect(lines).toContain("Deliver: Fatima Bay");
  });

  it("never lets the shopping cap be mistaken for the fee", () => {
    // The failure: a driver reads "Rs 1500" as their pay, quotes Rs 100 against
    // it, and is out of pocket the moment they reach the till.
    const lines = newRequestLines(SHOPPING).join("\n");
    expect(lines).toMatch(/repay what you spend, up to Rs 1500/i);
    expect(lines).toMatch(/your fee is separate/i);
  });

  it("says nothing about a budget on a collection", () => {
    const lines = newRequestLines(PACKAGE).join("\n");
    expect(lines).not.toMatch(/repay|spend|budget/i);
  });

  it("warns when only a car or van will do", () => {
    expect(newRequestLines(SHOPPING).join("\n")).toMatch(/car or van/i);
    expect(newRequestLines(PACKAGE).join("\n")).not.toMatch(/car or van/i);
  });

  it("says how much competition there already is, in the right plural", () => {
    expect(newRequestLines({ ...PACKAGE, quoteCount: 1 }).join("\n")).toMatch(
      /1 driver has already quoted/,
    );
    expect(newRequestLines({ ...PACKAGE, quoteCount: 3 }).join("\n")).toMatch(
      /3 drivers have already quoted/,
    );
    expect(newRequestLines({ ...PACKAGE, quoteCount: 0 }).join("\n")).not.toMatch(/already quoted/);
  });
});

describe("a price reaching the customer", () => {
  const base = {
    fee: 25000,
    driverName: "Jean",
    vehicleType: "van",
    what: "A medium box, about 10 kg",
  };

  it("leads with the price, because that is the decision", () => {
    expect(quoteArrivedTitle({ fee: 25000, quoteCount: 1 })).toContain("Rs 250");
  });

  it("distinguishes the first price from a later one", () => {
    expect(quoteArrivedTitle({ fee: 25000, quoteCount: 1 })).toMatch(/you have a price/i);
    expect(quoteArrivedTitle({ fee: 25000, quoteCount: 3 })).toMatch(/a new price/i);
  });

  it("ALWAYS ends by saying nobody is coming yet", () => {
    // The one fact this whole message exists to carry. It is last so it is what
    // survives truncation on a lock screen, and unconditional so no branch can
    // drop it.
    for (const count of [1, 2, 7]) {
      const lines = quoteArrivedLines({ ...base, note: null, quoteCount: count });
      expect(lines.at(-1)).toMatch(/nobody is on the way until you choose/i);
    }
  });

  it("names the driver and what they drive", () => {
    const lines = quoteArrivedLines({ ...base, note: null, quoteCount: 1 }).join("\n");
    expect(lines).toContain("Jean (van) will do it for Rs 250");
  });

  it("does not print empty brackets when the vehicle is unknown", () => {
    const lines = quoteArrivedLines({ ...base, vehicleType: null, note: null, quoteCount: 1 }).join("\n");
    expect(lines).toContain("Jean will do it for Rs 250");
    expect(lines).not.toContain("()");
  });

  it("passes on what the driver said, and stays quiet when they said nothing", () => {
    expect(
      quoteArrivedLines({ ...base, note: "I can come this afternoon", quoteCount: 1 }).join("\n"),
    ).toMatch(/They said: I can come this afternoon/);
    expect(quoteArrivedLines({ ...base, note: "   ", quoteCount: 1 }).join("\n")).not.toMatch(
      /They said/,
    );
  });

  it("mentions the comparison only once there is one", () => {
    expect(quoteArrivedLines({ ...base, note: null, quoteCount: 3 }).join("\n")).toMatch(
      /3 prices to compare/,
    );
    expect(quoteArrivedLines({ ...base, note: null, quoteCount: 1 }).join("\n")).not.toMatch(
      /to compare/,
    );
  });
});

describe("the driver who won", () => {
  it("leads with the accepted price", () => {
    expect(quoteAcceptedTitle({ fee: 25000 })).toMatch(/accepted — Rs 250/);
  });

  it("carries both addresses and the customer's phone", () => {
    // The driver is about to set off. Everything they need is in the message,
    // not behind a tap on a bad signal.
    const lines = quoteAcceptedLines({
      fee: 25000,
      request: PACKAGE,
      contactPhone: "+23057123456",
    }).join("\n");
    expect(lines).toContain("Port Mathurin — the yellow shop by the market");
    expect(lines).toContain("Fatima Bay — blue gate, first floor");
    expect(lines).toContain("Marie · +23057123456");
  });

  it("NEVER contains the PIN", () => {
    // The code is the customer's proof that the right person turned up. A driver
    // who already knows it can close a delivery they never made.
    const lines = quoteAcceptedLines({
      fee: 25000,
      request: PACKAGE,
      contactPhone: "+23057123456",
      pin: "4821",
    }).join("\n");
    expect(lines).not.toContain("4821");
    expect(lines).toMatch(/read you a 4-digit code/i);
  });

  it("tells a shopping driver to buy first, keep the receipt, and what they collect", () => {
    const lines = quoteAcceptedLines({ fee: 25000, request: SHOPPING }).join("\n");
    expect(lines).toMatch(/buy it first/i);
    expect(lines).toMatch(/keep the receipt/i);
    // Both numbers, never merged — merging them is how a driver ends up short.
    expect(lines).toMatch(/Rs 250 for you, plus what you spent/);
    expect(lines).toMatch(/up to Rs 1500/);
  });

  it("asks a collection driver for the fee alone", () => {
    const lines = quoteAcceptedLines({ fee: 25000, request: PACKAGE }).join("\n");
    expect(lines).toMatch(/Collect at the door: Rs 250\./);
    expect(lines).not.toMatch(/what you spent/);
  });

  it("omits the customer line rather than printing a stray separator", () => {
    const lines = quoteAcceptedLines({
      fee: 25000,
      request: { ...PACKAGE, contactName: null },
      contactPhone: null,
    }).join("\n");
    expect(lines).not.toMatch(/Customer:/);
    expect(lines).not.toMatch(/ · $/m);
  });
});
