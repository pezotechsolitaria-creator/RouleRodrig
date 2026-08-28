import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── SENDING THE TRAFFIC YOU ALREADY HAVE (M136) ─────────────────────────────
//
// The owner wants a first car booking. Ranking a new page from zero takes
// months; the French scooter page ALREADY ranks and already brings roughly ten
// customers a period. The fastest honest route to a car customer is the reader
// who is on that page right now and needs four seats.
//
// It linked to the car page only from "À découvrir aussi" — fifth in a list at
// the very bottom, below the FAQ, which is where links go to be ignored. The
// FAQ meanwhile ended on "nos scooters 125cc accueillent confortablement deux
// personnes" and left the family of four with nowhere to go.
//
// So the answer to the question that answer creates now exists, in content,
// with the real car price. That serves the reader first and moves link equity
// second, which is the only order that survives a Google update.

const ROOT = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const SCOOTER = "app/fr/location-scooter-rodrigues/page.tsx";
const CAR = "app/fr/location-voiture-rodrigues/page.tsx";

describe("the page that ranks answers the question it raises", () => {
  const src = read(SCOOTER);

  it("tells a family of four what a car costs", () => {
    expect(src).toMatch(/Nous sommes plus de deux/);
    expect(src).toMatch(/rs\(carFrom\)/);
  });

  it("reads that price from the live fleet, never types it", () => {
    // A car price hardcoded here would drift from the car page the first time
    // the owner changed it, and the two would advertise different numbers.
    expect(src).toMatch(/const carFrom = fleetFromPrice\(fleet, "car"\)/);
    expect(src).not.toMatch(/Rs 1 ?500/);
  });

  it("keeps every original answer intact", () => {
    // The formula works. This adds; it does not rewrite.
    for (const q of [
      "Combien coûte la location d'un scooter",
      "Y a-t-il une durée minimale",
      "Faut-il un permis de conduire",
      "Livrez-vous le scooter",
      "Le casque est-il fourni",
    ]) {
      expect(src, `lost the FAQ: ${q}`).toContain(q);
    }
  });
});

describe("the car page answers the arrival", () => {
  const src = read(CAR);

  it("says you can collect at Plaine Corail", () => {
    // "Location voiture aéroport Rodrigues" is the query of somebody who has
    // already booked a flight. The page mentioned the airport zero times.
    expect(src).toMatch(/Plaine Corail/);
    expect(src).toMatch(/aéroport/);
  });

  it("promises the airport in the description a searcher reads first", () => {
    expect(src).toMatch(/DESCRIPTION[\s\S]{0,300}Plaine Corail/);
  });

  it("keeps the description inside what Google will show", () => {
    // Past ~155 characters it is truncated, and the airport promise is at the
    // end — the half that would be cut.
    const m = src.match(/const DESCRIPTION = \(from: number\) =>\s*\n\s*`([^`]+)`/);
    expect(m, "could not find the description").toBeTruthy();
    const rendered = m![1].replace(/\$\{rs\(from\)\}/g, "1 500");
    expect(rendered.length, `description is ${rendered.length} chars`).toBeLessThanOrEqual(160);
  });

  it("ties the promise to the flight number the booking already collects", () => {
    // Not an invented service: M119 made the flight number required on an
    // arrival run precisely so a delay does not strand anyone.
    expect(src).toMatch(/numéro de vol/);
  });

  it("still answers car-or-scooter, so the link works both ways", () => {
    expect(src).toMatch(/Voiture ou scooter/);
  });
});
