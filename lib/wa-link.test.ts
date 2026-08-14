import { describe, it, expect } from "vitest";
import { normalizeWaNumber, waLink } from "./wa-link";

describe("normalizeWaNumber", () => {
  it("prefixes a bare local Rodrigues number", () => {
    // The case that matters: numbers are written like this all over the island,
    // and the inline `replace(/\D/g,"")` used elsewhere leaves "59421234",
    // which wa.me cannot route.
    expect(normalizeWaNumber("5942 1234")).toBe("23059421234");
    expect(normalizeWaNumber("5942-1234")).toBe("23059421234");
  });

  it("keeps an already-international number", () => {
    expect(normalizeWaNumber("+230 5942 1234")).toBe("23059421234");
    expect(normalizeWaNumber("23059421234")).toBe("23059421234");
  });

  it("handles the 00 international prefix", () => {
    expect(normalizeWaNumber("0023059421234")).toBe("23059421234");
  });

  it("strips a local trunk zero", () => {
    expect(normalizeWaNumber("059421234")).toBe("23059421234");
  });

  it("accepts a pasted wa.me link, because an admin field invites one", () => {
    expect(normalizeWaNumber("https://wa.me/23059421234")).toBe("23059421234");
    expect(normalizeWaNumber("wa.me/23059421234")).toBe("23059421234");
    expect(normalizeWaNumber("https://api.whatsapp.com/send?phone=23059421234")).toBe("23059421234");
  });

  it("ignores a ?text= saved with a pasted link", () => {
    expect(normalizeWaNumber("https://wa.me/23059421234?text=hello%20there")).toBe("23059421234");
  });

  it("refuses nothing, junk and scraps rather than making a dead link", () => {
    expect(normalizeWaNumber(undefined)).toBeNull();
    expect(normalizeWaNumber(null)).toBeNull();
    expect(normalizeWaNumber("")).toBeNull();
    expect(normalizeWaNumber("   ")).toBeNull();
    expect(normalizeWaNumber("call me")).toBeNull();
    expect(normalizeWaNumber("123")).toBeNull();
  });

  it("leaves a foreign international number alone", () => {
    // A guide with a French mobile is still reachable.
    expect(normalizeWaNumber("+33 6 12 34 56 78")).toBe("33612345678");
  });
});

describe("waLink", () => {
  it("builds a plain link with no message", () => {
    expect(waLink("5942 1234")).toBe("https://wa.me/23059421234");
  });

  it("URL-encodes the pre-filled message", () => {
    const href = waLink("5942 1234", "Hi Jean, I'd like to hike Mont Limon");
    expect(href).toBe(
      "https://wa.me/23059421234?text=Hi%20Jean%2C%20I'd%20like%20to%20hike%20Mont%20Limon",
    );
  });

  it("keeps accents and emoji intact through encoding", () => {
    const href = waLink("59421234", "Randonnée 🥾");
    expect(href).toContain("?text=");
    expect(decodeURIComponent(href!.split("?text=")[1])).toBe("Randonnée 🥾");
  });

  it("treats a blank message as no message", () => {
    expect(waLink("59421234", "   ")).toBe("https://wa.me/23059421234");
  });

  it("returns null when there is no usable number, so nothing renders", () => {
    expect(waLink("", "Hi")).toBeNull();
    expect(waLink("not a phone", "Hi")).toBeNull();
  });
});
