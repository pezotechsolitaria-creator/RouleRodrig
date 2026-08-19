import { describe, expect, it } from "vitest";
import {
  holdInfo, holdRemaining, customerHoldCopy, merchantHoldCopy,
  checkoutHoldCopy, holdWindowLabel, projectedDeadline,
} from "./hold";

const NOW = Date.parse("2026-08-06T12:00:00Z");
const at = (hoursFromNow: number) => new Date(NOW + hoursFromNow * 3_600_000).toISOString();

describe("holdInfo", () => {
  it("returns null when there is no deadline, rather than inventing one", () => {
    // An order past payment has auto_release_at = null. The UI must show no
    // countdown at all, not a countdown to the epoch.
    expect(holdInfo(null)).toBeNull();
    expect(holdInfo(undefined)).toBeNull();
    expect(holdInfo("")).toBeNull();
    expect(holdInfo("not-a-date")).toBeNull();
  });

  it("reports hours left, flooring rather than rounding up", () => {
    // 7.9h left must read as 7, never 8 — overstating remaining time is the one
    // direction that costs the customer their order.
    expect(holdInfo(at(7.9), NOW)!.hoursLeft).toBe(7);
    expect(holdInfo(at(168), NOW)!.hoursLeft).toBe(168);
  });

  it("marks a passed deadline expired", () => {
    const h = holdInfo(at(-1), NOW)!;
    expect(h.expired).toBe(true);
    expect(h.hoursLeft).toBe(0);
  });

  it("flags the final 12 hours as urgent, and not before", () => {
    expect(holdInfo(at(13), NOW)!.urgent).toBe(false);
    expect(holdInfo(at(11), NOW)!.urgent).toBe(true);
    // Already expired is not "urgent" — there is nothing left to hurry for.
    expect(holdInfo(at(-1), NOW)!.urgent).toBe(false);
  });
});

describe("holdRemaining", () => {
  it("scales the unit to the magnitude", () => {
    expect(holdRemaining(holdInfo(at(168), NOW)!)).toBe("7 days");
    expect(holdRemaining(holdInfo(at(48), NOW)!)).toBe("2 days");
    expect(holdRemaining(holdInfo(at(5), NOW)!)).toBe("5 hours");
    expect(holdRemaining(holdInfo(at(1), NOW)!)).toBe("1 hour");
    expect(holdRemaining(holdInfo(at(0.4), NOW)!)).toBe("under an hour");
    expect(holdRemaining(holdInfo(at(-3), NOW)!)).toBe("expired");
  });
});

describe("customerHoldCopy", () => {
  const h = holdInfo(at(168), NOW)!;

  it("never tells a cash customer to pay in time — nothing is owed until handover", () => {
    // This is the regression the whole of M13 exists to prevent. The sweep used
    // to tell cash customers "It was not paid in time".
    const copy = customerHoldCopy("cash", h);
    expect(copy).toMatch(/pay the shop directly/i);
    expect(copy).toMatch(/nothing is charged now/i);
    expect(copy).not.toMatch(/upload/i);
  });

  it("does tell a bank-transfer customer to act, because they can", () => {
    const copy = customerHoldCopy("bank_transfer", h);
    expect(copy).toMatch(/transfer/i);
    expect(copy).toMatch(/proof of payment/i);
  });

  it("states plainly that nothing was charged once the window lapses", () => {
    const copy = customerHoldCopy("cash", holdInfo(at(-1), NOW)!);
    expect(copy).toMatch(/not been charged/i);
  });

  it("treats an unknown provider as pay-at-handover rather than demanding payment", () => {
    // Defaulting the other way would show a false "send us money" instruction.
    expect(customerHoldCopy(undefined, h)).toMatch(/pay the shop directly/i);
  });
});

describe("merchantHoldCopy", () => {
  it("tells the merchant a cash order dies on THEIR inaction", () => {
    const copy = merchantHoldCopy("cash", holdInfo(at(20), NOW)!);
    expect(copy).toMatch(/confirm within/i);
    expect(copy).toMatch(/returns to your shelf/i);
  });

  it("frames bank transfer as waiting on the customer instead", () => {
    expect(merchantHoldCopy("bank_transfer", holdInfo(at(20), NOW)!)).toMatch(/customer sends payment/i);
  });
});

// ── THE CHECKOUT DISCLOSURE (backlog #53) ──────────────────────────────────
//
// The bug this closes: a bank-transfer customer read the checkout screen, saw
// nothing about a deadline, wired the money on day three and found the order
// already cancelled. These tests pin the two properties that make the new copy
// worth anything — that it names a real moment in time, and that it never
// quietly widens the window it promises.

describe("holdWindowLabel", () => {
  it("prefers days when the window divides evenly, hours otherwise", () => {
    expect(holdWindowLabel(48)).toBe("2 days");
    expect(holdWindowLabel(168)).toBe("7 days");
    expect(holdWindowLabel(24)).toBe("1 day");
    expect(holdWindowLabel(36)).toBe("36 hours");
    expect(holdWindowLabel(1)).toBe("1 hour");
  });
});

describe("projectedDeadline", () => {
  it("projects from the moment asked, not from midnight or the epoch", () => {
    expect(projectedDeadline(48, NOW).toISOString()).toBe("2026-08-08T12:00:00.000Z");
  });
});

describe("checkoutHoldCopy", () => {
  it("names an actual date and time, not just a duration", () => {
    // The whole failure was that "48 hours" has no stated starting point. A
    // date is the thing a customer can hold a bank appointment against.
    const copy = checkoutHoldCopy("bank_transfer", 48, NOW);
    expect(copy).toContain("2 days");
    expect(copy).toMatch(/Sat 8 Aug, 16:00/);
  });

  it("tells a bank-transfer customer that missing it cancels the order", () => {
    const copy = checkoutHoldCopy("bank_transfer", 48, NOW);
    expect(copy).toMatch(/released|cancelled/);
    // They must also know the site will not take the money by itself, or the
    // warning reads as a threat of an automatic charge.
    expect(copy).toContain("never charged automatically");
  });

  it("does not tell a cash customer to pay in time — they owe nothing yet", () => {
    const copy = checkoutHoldCopy("cash", 168, NOW);
    expect(copy).toContain("7 days");
    expect(copy).not.toMatch(/transfer|proof of payment/);
    expect(copy).toContain("nothing is owed");
  });

  it("uses the seller vocabulary it is given, so a kitchen is not called a shop", () => {
    expect(checkoutHoldCopy("cash", 168, NOW, "kitchen")).toContain("kitchen");
  });

  it("agrees with the window the database will enforce", () => {
    // The number is passed in from order_hold_hours() rather than re-derived,
    // so a settings change moves the copy with it. If this ever starts failing,
    // the checkout screen and create_order() have drifted apart.
    const copy = checkoutHoldCopy("bank_transfer", 72, NOW);
    expect(copy).toContain("3 days");
    expect(copy).toMatch(/Sun 9 Aug, 16:00/);
  });
});
