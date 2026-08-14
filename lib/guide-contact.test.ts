import { describe, it, expect } from "vitest";
import { guideGreeting, guideWaLink } from "./guide-contact";

describe("guideGreeting", () => {
  it("names the guide so it does not read as a broadcast", () => {
    expect(guideGreeting("en", "Jean-Marc")).toContain("Hello Jean-Marc!");
  });

  it("names the trail when the visitor came from one", () => {
    expect(guideGreeting("en", "Jean-Marc", "Mont Limon at sunrise")).toContain(
      '"Mont Limon at sunrise"',
    );
  });

  it("still works when the owner left the guide's name blank", () => {
    // providerName is optional in the content model, so this is a real state,
    // not a hypothetical. It must not produce "Hello !".
    expect(guideGreeting("en")).toBe(
      "Hello! I found you on Roule Rodrigues. I'd like to go hiking in Rodrigues. Are you available?",
    );
    expect(guideGreeting("en", "   ")).not.toContain("  ");
  });

  it("speaks all three languages", () => {
    expect(guideGreeting("fr", "Marie")).toContain("Bonjour Marie");
    expect(guideGreeting("cr", "Marie")).toContain("Bonzour Marie");
    expect(guideGreeting("en", "Marie")).toContain("Hello Marie");
  });

  it("says where they were found, in every language", () => {
    // The guide needs to know the site is sending them work — that is the
    // whole argument for listing.
    for (const lang of ["en", "fr", "cr"] as const) {
      expect(guideGreeting(lang, "Marie")).toContain("Roule Rodrigues");
    }
  });

  it("always ends by asking something", () => {
    // A message that asks nothing is one nobody replies to.
    for (const lang of ["en", "fr", "cr"] as const) {
      expect(guideGreeting(lang, "Marie", "Trou d'Argent").trim().endsWith("?")).toBe(true);
      expect(guideGreeting(lang, "Marie").trim().endsWith("?")).toBe(true);
    }
  });

  it("ignores a blank trail rather than quoting an empty string", () => {
    expect(guideGreeting("en", "Marie", "   ")).not.toContain('""');
  });
});

describe("guideWaLink", () => {
  it("builds a link a local number can actually be reached on", () => {
    const href = guideWaLink("5942 1234", "en", "Jean-Marc");
    expect(href).toMatch(/^https:\/\/wa\.me\/23059421234\?text=/);
    expect(decodeURIComponent(href!.split("?text=")[1])).toContain("Hello Jean-Marc!");
  });

  it("carries the trail through to the message", () => {
    const href = guideWaLink("59421234", "fr", "Marie", "Mont Limon");
    expect(decodeURIComponent(href!.split("?text=")[1])).toContain("Mont Limon");
  });

  it("returns null with no number, so the card renders no dead button", () => {
    expect(guideWaLink("", "en", "Jean-Marc")).toBeNull();
    expect(guideWaLink(undefined, "en", "Jean-Marc")).toBeNull();
    expect(guideWaLink("ask at the hotel", "en", "Jean-Marc")).toBeNull();
  });
});
