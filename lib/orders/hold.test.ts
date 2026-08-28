import { describe, expect, it } from "vitest";
import {
  holdInfo, holdRemaining, customerHoldCopy, merchantHoldCopy,
  checkoutHoldCopy, holdWindowLabel, projectedDeadline, holdDeadlineLabel,
} from "./hold";
import { dateLocales } from "@/lib/i18n";

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

// ── THE COUNTDOWN IN THREE LANGUAGES ────────────────────────────────────────
//
// /track renders "Reserved until <deadline> — <remaining> left" and had the
// sentence translated while both VALUES stayed English, so a French reader got
// "il reste 2 days pour payer". These helpers are shared with two English
// order screens and the order-placed email, which is why `lang` is optional.
describe("holdRemaining speaks the reader's language", () => {
  const inHours = (hoursLeft: number) => ({
    expired: false,
    hoursLeft,
    deadline: new Date("2026-09-12T10:30:00Z"),
  });

  it("still answers in English when nobody asks for a language", () => {
    // The guard for app/orders/track, app/orders/[id] and the order-placed
    // email: none of them passes a language and none of them should change.
    expect(holdRemaining(inHours(48) as never)).toBe("2 days");
    expect(holdRemaining(inHours(3) as never)).toBe("3 hours");
    expect(holdRemaining(inHours(1) as never)).toBe("1 hour");
    expect(holdRemaining(inHours(0) as never)).toBe("under an hour");
  });

  it("translates the unit, not just the sentence around it", () => {
    expect(holdRemaining(inHours(48) as never, "fr")).toBe("2 jours");
    expect(holdRemaining(inHours(48) as never, "cr")).toBe("2 zour");
    expect(holdRemaining(inHours(3) as never, "fr")).toBe("3 heures");
    expect(holdRemaining(inHours(3) as never, "cr")).toBe("3 ler");
  });

  it("never leaves an English unit in a translated sentence", () => {
    for (const lang of ["fr", "cr"] as const) {
      for (const h of [48, 3, 1, 0]) {
        expect(holdRemaining(inHours(h) as never, lang), `${lang}/${h}`)
          .not.toMatch(/(days?|hours?|under an hour)/);
      }
    }
  });

  it("formats the deadline in the reader's locale, not the engine's", () => {
    const h = { expired: false, hoursLeft: 5, deadline: new Date("2026-09-12T10:30:00Z") };
    const en = holdDeadlineLabel(h as never);
    const fr = holdDeadlineLabel(h as never, "fr");
    expect(en).not.toBe(fr);
    // Same instant, same timezone, whatever the words: 14:30 in Mauritius.
    expect(en).toContain("14:30");
    expect(fr).toContain("14:30");
  });
});

describe("dateLocales", () => {
  it("never hands Intl a tag that could fall back to the visitor's OS locale", () => {
    // `mfe` resolves on some ICU builds and not others. Unresolved, Intl uses
    // the ENGINE default — the visitor's own locale — so a customer in Berlin
    // would read a Rodrigues deadline in German. The fallback is stated.
    expect(dateLocales("cr")).toEqual(["mfe", "fr-FR"]);
    expect(dateLocales("fr")).toEqual(["fr-FR"]);
    expect(dateLocales("en")).toEqual(["en-GB"]);
    expect(dateLocales(undefined)).toEqual(["en-GB"]);
  });

  it("always ends in a locale every engine has", () => {
    for (const lang of ["en", "fr", "cr"] as const) {
      const list = dateLocales(lang);
      const last = list[list.length - 1];
      expect(Intl.DateTimeFormat.supportedLocalesOf(last), `${lang} -> ${last}`)
        .toHaveLength(1);
    }
  });
});
