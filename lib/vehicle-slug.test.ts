import { describe, expect, it } from "vitest";
import type { FleetItem } from "@/lib/defaults";
import { findVehicle, vehicleHref, vehicleName, vehicleSlug } from "@/lib/vehicle-slug";

// The three vehicles as they actually exist in production, including the
// timestamp id on the Swift and the trailing space in its name. These tests
// exist because the whole point of the module is that a link the owner pastes
// into WhatsApp still resolves months later — so the cases that matter are the
// real rows, not tidy fixtures.
const fleet = [
  { id: "burgman", name: "BURGMAN 125cc", category: "scooter" },
  { id: "avenis", name: "Avenis 125cc", category: "scooter" },
  { id: "veh-1783380348440", name: "Suzuki Swift (Latest Gen) ", category: "car" },
] as unknown as FleetItem[];

describe("vehicleSlug", () => {
  it("slugs the live names", () => {
    expect(fleet.map(vehicleSlug)).toEqual([
      "burgman-125cc",
      "avenis-125cc",
      "suzuki-swift-latest-gen",
    ]);
  });

  it("never leaves a trailing dash, even when the name ends in punctuation", () => {
    expect(vehicleSlug({ name: "Suzuki Swift (Latest Gen) " })).toBe("suzuki-swift-latest-gen");
    expect(vehicleSlug({ name: "Scooter!!!" })).toBe("scooter");
  });

  it("strips accents rather than dropping the word", () => {
    expect(vehicleSlug({ name: "Scooter Électrique" })).toBe("scooter-electrique");
  });

  it("falls back to the id when the name is punctuation only", () => {
    expect(vehicleSlug({ id: "veh-9", name: "!!!" })).toBe("veh-9");
  });

  it("returns an empty slug rather than throwing when there is nothing to use", () => {
    expect(vehicleSlug({})).toBe("");
  });
});

describe("findVehicle", () => {
  it("finds a vehicle by its slug", () => {
    expect(findVehicle(fleet, "scooter", "avenis-125cc")?.id).toBe("avenis");
  });

  it("still resolves a bare id, so links predating slugs keep working", () => {
    expect(findVehicle(fleet, "scooter", "burgman")?.id).toBe("burgman");
    expect(findVehicle(fleet, "car", "veh-1783380348440")?.id).toBe("veh-1783380348440");
  });

  it("is case-insensitive, because pasted links get capitalised", () => {
    expect(findVehicle(fleet, "scooter", "Avenis-125cc")?.id).toBe("avenis");
  });

  it("will not return a vehicle from another category", () => {
    expect(findVehicle(fleet, "scooter", "suzuki-swift-latest-gen")).toBeUndefined();
    expect(findVehicle(fleet, "car", "burgman-125cc")).toBeUndefined();
  });

  it("treats a vehicle with no category as a scooter", () => {
    const noCat = [{ id: "x", name: "Mystery Bike" }] as unknown as FleetItem[];
    expect(findVehicle(noCat, "scooter", "mystery-bike")?.id).toBe("x");
  });

  it("returns undefined for an unknown slug instead of the first vehicle", () => {
    expect(findVehicle(fleet, "scooter", "harley-davidson")).toBeUndefined();
  });
});

describe("vehicleHref", () => {
  it("matches the URLs that are live in the sitemap", () => {
    expect(fleet.map(vehicleHref)).toEqual([
      "/browse/scooter/burgman-125cc",
      "/browse/scooter/avenis-125cc",
      "/browse/car/suzuki-swift-latest-gen",
    ]);
  });

  it("round-trips: every href resolves back to the vehicle it came from", () => {
    for (const v of fleet) {
      const [, , category, slug] = vehicleHref(v).split("/");
      expect(findVehicle(fleet, category, slug)?.id).toBe(v.id);
    }
  });

  it("defaults an uncategorised vehicle to the scooter route", () => {
    expect(vehicleHref({ id: "x", name: "Mystery Bike" })).toBe("/browse/scooter/mystery-bike");
  });
});

describe("vehicleName", () => {
  it("trims the trailing space that shipped in the live Swift name", () => {
    expect(vehicleName({ name: "Suzuki Swift (Latest Gen) " })).toBe("Suzuki Swift (Latest Gen)");
  });

  it("collapses runs of internal whitespace", () => {
    expect(vehicleName({ name: "BURGMAN   125cc" })).toBe("BURGMAN 125cc");
  });

  it("collapses a newline pasted into the admin textarea", () => {
    expect(vehicleName({ name: "Suzuki\nSwift" })).toBe("Suzuki Swift");
  });

  it("falls back to the id when the name is blank", () => {
    expect(vehicleName({ name: "   ", id: "veh-1" })).toBe("veh-1");
  });

  it("never renders an empty heading", () => {
    expect(vehicleName({})).toBe("Vehicle");
  });

  it("leaves an already-clean name untouched", () => {
    expect(vehicleName({ name: "Avenis 125cc" })).toBe("Avenis 125cc");
  });
});
