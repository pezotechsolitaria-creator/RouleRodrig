import { describe, it, expect } from "vitest";
import type { RecommendedPlace } from "@/lib/defaults";
import {
  SERVICE_ONLY_CLEARED, hasServiceLeftovers, describeLeftovers, showsServiceFacts,
} from "./service-fields";

// The bug this locks down, in the owner's words: "there is a problem for
// accommodations in the admin dashboard as it mixes up with activities like i
// could not delete the up to people which is illogical."
//
// A guesthouse was announcing "4h · up to 10" because it had briefly been an
// activity, and no editor anywhere could reach those fields to clear them.

const place = (over: Partial<RecommendedPlace>): RecommendedPlace => ({
  id: "p1", category: "hotel", name: "Lakaze Mama", description: "", image: "", ...over,
});

describe("showsServiceFacts", () => {
  it("is false for a hotel, whatever leftover numbers it carries", () => {
    // The exact live row: category hotel, no service tag, 240 minutes and 10
    // guests left behind. A place to sleep has no duration.
    expect(showsServiceFacts(place({ durationMinutes: 240, maxGuests: 10 }))).toBe(false);
  });

  it("is false for a plain activity — a tour is not a listed service", () => {
    expect(showsServiceFacts(place({ category: "activity", maxGuests: 36 }))).toBe(false);
  });

  it("is true only once the owner has said WHICH service it is", () => {
    for (const t of ["massage", "fishing", "boat"] as const) {
      expect(showsServiceFacts(place({ category: "activity", serviceType: t })), t).toBe(true);
    }
  });
});

describe("hasServiceLeftovers", () => {
  it("spots each field on its own", () => {
    expect(hasServiceLeftovers(place({ durationMinutes: 240 }))).toBe(true);
    expect(hasServiceLeftovers(place({ maxGuests: 10 }))).toBe(true);
    expect(hasServiceLeftovers(place({ providerName: "Arnaud" }))).toBe(true);
    expect(hasServiceLeftovers(place({ meetingPoint: "The jetty" }))).toBe(true);
    expect(hasServiceLeftovers(place({ included: ["Towels"] }))).toBe(true);
  });

  it("is quiet for a clean listing, and for an empty inclusions array", () => {
    expect(hasServiceLeftovers(place({}))).toBe(false);
    expect(hasServiceLeftovers(place({ included: [] }))).toBe(false);
  });

  it("ignores fields a hotel legitimately uses", () => {
    // capacity means ROOMS here, and priceNote is every listing's business.
    expect(hasServiceLeftovers(place({ capacity: 3, priceNote: "Rs 7000 per day" }))).toBe(false);
  });
});

describe("SERVICE_ONLY_CLEARED", () => {
  it("strips every field hasServiceLeftovers looks for", () => {
    const dirty = place({
      durationMinutes: 240, maxGuests: 10, providerName: "Arnaud",
      meetingPoint: "The jetty", included: ["Towels"], serviceType: "boat",
    });
    const cleaned = { ...dirty, ...SERVICE_ONLY_CLEARED };
    expect(hasServiceLeftovers(cleaned)).toBe(false);
    expect(showsServiceFacts(cleaned)).toBe(false);
  });

  it("leaves everything a listing still needs", () => {
    const dirty = place({
      name: "Lakaze Mama", priceNote: "Rs 1000 per day", capacity: 4,
      highlights: ["All living amenities available"], images: ["/a.jpg"],
      bookable: true, durationMinutes: 240, maxGuests: 10,
    });
    const cleaned = { ...dirty, ...SERVICE_ONLY_CLEARED };
    expect(cleaned.name).toBe("Lakaze Mama");
    expect(cleaned.priceNote).toBe("Rs 1000 per day");
    expect(cleaned.capacity).toBe(4);
    expect(cleaned.highlights).toEqual(["All living amenities available"]);
    expect(cleaned.images).toEqual(["/a.jpg"]);
    expect(cleaned.bookable).toBe(true);
  });
});

describe("describeLeftovers", () => {
  it("names what is about to be deleted, in the order it appears on screen", () => {
    expect(describeLeftovers(place({ durationMinutes: 240, maxGuests: 10 })))
      .toBe("240 min, up to 10 people");
  });

  it("pluralises inclusions", () => {
    expect(describeLeftovers(place({ included: ["Towels"] }))).toBe("1 inclusion");
    expect(describeLeftovers(place({ included: ["Towels", "Oils"] }))).toBe("2 inclusions");
  });

  it("is empty when there is nothing to describe", () => {
    expect(describeLeftovers(place({}))).toBe("");
  });
});
