import { describe, it, expect } from "vitest";
import { classifyOfferTarget } from "./offer-outcome";

// The bug this pins is guard ORDER, not logic. lib/rides/notify.ts had
//
//     if (!t.phone) return;                        <- fires on ""
//     if (!t.api_key) { result.unreachable.push(); return; }
//
// and taxi_drivers.whatsapp held an EMPTY STRING, so coalesce(whatsapp, phone)
// handed back "". The bare return sat one line above the only writer of
// `unreachable`, so that driver produced no send, no counter and no log — a
// result indistinguishable from a healthy dispatch with nobody to ask.

describe("classifyOfferTarget", () => {
  it("separates 'no number' from 'never opted in' — they need opposite fixes", () => {
    // Editing the driver record vs walking him through the CallMeBot opt-in.
    expect(classifyOfferTarget({ phone: "", api_key: "abc123" })).toBe("no_contact");
    expect(classifyOfferTarget({ phone: "+23058066022", api_key: "" })).toBe("no_key");
  });

  it("treats the empty string as no number — the exact production value", () => {
    // taxi_drivers.whatsapp was "" for the only driver on the platform, and
    // coalesce(whatsapp, phone) returns the blank because '' is not NULL.
    expect(classifyOfferTarget({ phone: "" })).toBe("no_contact");
  });

  it("treats whitespace as no number, because a space is not a phone", () => {
    // A plain falsy check passes " " straight through to CallMeBot as a
    // request to message nobody.
    expect(classifyOfferTarget({ phone: "   ", api_key: "abc123" })).toBe("no_contact");
    expect(classifyOfferTarget({ phone: "\t\n", api_key: "abc123" })).toBe("no_contact");
  });

  it("treats null and undefined as no number", () => {
    expect(classifyOfferTarget({ phone: null, api_key: "abc123" })).toBe("no_contact");
    expect(classifyOfferTarget({ api_key: "abc123" })).toBe("no_contact");
    expect(classifyOfferTarget({})).toBe("no_contact");
  });

  it("treats a whitespace api_key as no key, not as a usable credential", () => {
    expect(classifyOfferTarget({ phone: "+23058066022", api_key: "   " })).toBe("no_key");
    expect(classifyOfferTarget({ phone: "+23058066022", api_key: null })).toBe("no_key");
    expect(classifyOfferTarget({ phone: "+23058066022" })).toBe("no_key");
  });

  it("sends when both are real", () => {
    expect(classifyOfferTarget({ phone: "+23058066022", api_key: "1234567" })).toBe("send");
  });

  it("checks the number BEFORE the key — the ordering that was wrong", () => {
    // A driver with neither must report the number problem, because that is
    // the one the owner fixes first: an opt-in cannot be sent to nobody.
    expect(classifyOfferTarget({ phone: "", api_key: "" })).toBe("no_contact");
  });

  it("never returns anything a caller has no branch for", () => {
    const seen = new Set<string>();
    for (const phone of ["", "  ", null, undefined, "+23058066022"]) {
      for (const api_key of ["", "  ", null, undefined, "1234567"]) {
        seen.add(classifyOfferTarget({ phone, api_key }));
      }
    }
    expect([...seen].sort()).toEqual(["no_contact", "no_key", "send"]);
  });
});
