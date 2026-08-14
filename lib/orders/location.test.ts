import { describe, it, expect } from "vitest";
import {
  googleMapsLink, placeSearchLink, hasUsablePin, looksOffRodrigues, formatCoords,
} from "./location";

describe("hasUsablePin", () => {
  it("accepts a real Rodrigues pin", () => {
    expect(hasUsablePin(-19.6833, 63.4167)).toBe(true);
  });

  it("rejects a missing pin rather than guessing one", () => {
    expect(hasUsablePin(null, null)).toBe(false);
    expect(hasUsablePin(-19.68, null)).toBe(false);
    expect(hasUsablePin(null, 63.41)).toBe(false);
    expect(hasUsablePin(undefined, undefined)).toBe(false);
  });

  it("rejects 0,0 — the Gulf of Guinea, and the classic empty-field artefact", () => {
    expect(hasUsablePin(0, 0)).toBe(false);
  });

  it("rejects values that are not finite numbers", () => {
    expect(hasUsablePin(NaN, 63.4)).toBe(false);
    expect(hasUsablePin(-19.7, Infinity)).toBe(false);
  });

  it("rejects coordinates outside the possible range", () => {
    expect(hasUsablePin(-91, 63.4)).toBe(false);
    expect(hasUsablePin(-19.7, 181)).toBe(false);
  });
});

describe("looksOffRodrigues — catches the two mistakes people actually make", () => {
  it("passes a real island pin", () => {
    expect(looksOffRodrigues(-19.6833, 63.4167)).toBe(false);
    expect(looksOffRodrigues(-19.7554, 63.4419)).toBe(false);
  });

  it("catches a dropped minus sign", () => {
    expect(looksOffRodrigues(19.6833, 63.4167)).toBe(true);
  });

  it("catches a swapped pair", () => {
    expect(looksOffRodrigues(63.4167, -19.6833)).toBe(true);
  });

  it("catches Mauritius, which is the neighbour and 600km away", () => {
    expect(looksOffRodrigues(-20.348, 57.552)).toBe(true);
  });

  it("never blocks — it only warns", () => {
    // The function is a boolean for a form hint; nothing filters on it.
    expect(typeof looksOffRodrigues(0, 0)).toBe("boolean");
  });
});

describe("map links", () => {
  it("opens an exact pin, not a text search, when coordinates exist", () => {
    expect(googleMapsLink(-19.6833, 63.4167)).toBe(
      "https://www.google.com/maps/search/?api=1&query=-19.6833,63.4167",
    );
  });

  it("leads the fallback search with the business name", () => {
    const url = placeSearchLink("Atelier Vannerie", "Baie aux Huîtres");
    expect(decodeURIComponent(url)).toContain("Atelier Vannerie, Baie aux Huîtres, Rodrigues");
  });

  it("does not append the island when the address already carries it", () => {
    const url = decodeURIComponent(placeSearchLink("Miel de Rodrigues", "Mont Lubin, Rodrigues"));
    expect(url).toContain("Miel de Rodrigues, Mont Lubin, Rodrigues");
    // Once in the shop's name, once in the address, and no third copy.
    expect(url.match(/Rodrigues/g)?.length).toBe(2);
  });

  it("still appends the island when only the NAME mentions it", () => {
    // A business name is not a place; the geocoder still needs the island.
    const url = decodeURIComponent(placeSearchLink("Miel de Rodrigues", "Mont Lubin"));
    expect(url).toContain("Miel de Rodrigues, Mont Lubin, Rodrigues");
  });

  it("works with no business name", () => {
    expect(decodeURIComponent(placeSearchLink(null, "Port Mathurin"))).toContain(
      "Port Mathurin, Rodrigues",
    );
  });

  it("escapes an address so it cannot break out of the URL", () => {
    const url = placeSearchLink(null, "Rue de la Solidarité & Co #3");
    expect(url).not.toContain(" ");
    expect(url).not.toContain("#");
    expect(url).not.toContain("&Co");
  });
});

describe("formatCoords", () => {
  it("keeps enough precision for a doorstep and few enough digits to read aloud", () => {
    expect(formatCoords(-19.68331234, 63.41669876)).toBe("-19.68331, 63.41670");
  });
});
