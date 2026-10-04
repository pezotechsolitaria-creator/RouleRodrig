import { describe, it, expect } from "vitest";
import { DEFAULT_CONTENT } from "@/lib/defaults";
import {
  RESERVED_BROWSE_IDS,
  categoryIdFromLabel,
  looksLikeEquipment,
  removeCategoryWarning,
} from "./vehicle-categories";

// ── A NEW RENTAL CATEGORY GETS A READABLE, FIXED ADDRESS (architecture review
// 2026-09-30, item 3) ───────────────────────────────────────────────────────
//
// The studio minted `cat-${Date.now()}`, and that id IS the /browse/<id> page.
// These pin the replacement against the real seeded categories.

const seeded = DEFAULT_CONTENT.vehicleCategories;

describe("categoryIdFromLabel", () => {
  it("derives the address from the name typed at creation", () => {
    expect(categoryIdFromLabel("Kayaks & Paddleboards", seeded)).toBe("kayaks-and-paddleboards");
    expect(categoryIdFromLabel("Vélos électriques", seeded)).toBe("velos-electriques");
  });

  it("never reuses an existing category's id — 'Kayak' is already seeded", () => {
    expect(seeded.some((c) => c.id === "kayak")).toBe(true);
    expect(categoryIdFromLabel("Kayak", seeded)).toBe("kayak-2");
  });

  it("never takes an address another /browse page already answers", () => {
    for (const reserved of RESERVED_BROWSE_IDS) {
      expect(categoryIdFromLabel(reserved, seeded)).toBe(`${reserved}-2`);
    }
    expect(categoryIdFromLabel("Stays", seeded)).toBe("stays-2");
  });

  it("refuses to invent one from a name with nothing to build it from", () => {
    expect(categoryIdFromLabel("  ", seeded)).toBe("");
    expect(categoryIdFromLabel("★★★", seeded)).toBe("");
  });

  it("never produces the old timestamp shape", () => {
    expect(categoryIdFromLabel("New Type", seeded)).not.toMatch(/^cat-\d+$/);
  });
});

describe("removeCategoryWarning", () => {
  const fleet = [{ category: "car" }, { category: "car" }, { category: undefined }] as { category?: string }[];

  it("warns before removing a category that still has vehicles, and counts them", () => {
    const w = removeCategoryWarning({ id: "car", label: "Cars", enabled: false }, fleet);
    expect(w).toContain("Cars still has 2 vehicles");
    expect(w).toContain("/browse/car stops working");
  });

  it("counts a vehicle with no category as a scooter, as the site does", () => {
    expect(removeCategoryWarning({ id: "scooter", label: "Scooters", enabled: false }, fleet)).toContain(
      "still has 1 vehicle.",
    );
  });

  it("warns about a live page even when it is empty", () => {
    expect(removeCategoryWarning({ id: "kayak", label: "Kayaks", enabled: true }, fleet)).toMatch(
      /switched on, so \/browse\/kayak is a live page/,
    );
  });

  it("asks nothing for an empty category that is already off", () => {
    expect(removeCategoryWarning({ id: "kayak", label: "Kayaks", enabled: false }, fleet)).toBeNull();
  });
});

describe("looksLikeEquipment — a hint only", () => {
  it("recognises equipment", () => {
    for (const l of ["Kayaks", "Bicycles", "Snorkel gear", "Mountain bikes", "Beach umbrellas"]) {
      expect(looksLikeEquipment(l), l).toBe(true);
    }
  });
  it("leaves motor vehicles alone, e-bikes and motorbikes included", () => {
    for (const l of ["Scooters", "Cars", "E-Bikes", "Motorbikes", "ebikes", "Motorcycles"]) {
      expect(looksLikeEquipment(l), l).toBe(false);
    }
  });
});
