import { describe, expect, it } from "vitest";
import { holdInfo, holdRemaining, customerHoldCopy, merchantHoldCopy } from "./hold";

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
