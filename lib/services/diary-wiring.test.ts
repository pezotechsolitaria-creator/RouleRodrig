import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { primaryFor, secondaryFor } from "@/lib/merchant/nav-links";
import { MERCHANT_KINDS } from "@/lib/merchant/kind";
import { HOME_BLOCKS } from "@/components/merchant/home/blocks";

const read = (p: string) => readFileSync(p, "utf8");

// ── The service diary ───────────────────────────────────────────────────────
//
// The owner: "now build the booked slots and calendar for services."
//
// The RULES live in SQL — service_slots decides what is free and
// book_service_slot decides what may be sold, under a row lock. These guard the
// wiring around them, and the handful of decisions that would be silently wrong
// rather than loudly broken.

describe("a trade gets a diary where a shop gets orders", () => {
  it("puts the diary in the dock, not behind More", () => {
    // A car wash sells appointments; almost nothing reaches it through the
    // order queue. Docked to Orders it would tap an empty screen every morning.
    const service = primaryFor("service").map((l) => l.href);
    expect(service).toContain("/merchant/diary");
    expect(service).not.toContain("/merchant/orders");
  });

  it("does not give any other kind a diary", () => {
    for (const kind of MERCHANT_KINDS.filter((k) => k !== "service")) {
      expect(primaryFor(kind).map((l) => l.href)).not.toContain("/merchant/diary");
      expect(primaryFor(kind).map((l) => l.href)).toContain("/merchant/orders");
    }
  });

  it("keeps Orders reachable for a trade rather than losing it", () => {
    // Whatever a kind displaces from the dock reappears on /merchant/more,
    // which renders from this same file — the property that stops the two
    // disagreeing about where a merchant can go.
    expect(secondaryFor("service", false).map((l) => l.href)).toContain("/merchant/orders");
  });

  it("keeps the dock at five slots for every kind", () => {
    // The slot COUNT and ORDER are what let muscle memory survive switching
    // between two of your own businesses.
    for (const kind of MERCHANT_KINDS) {
      expect(primaryFor(kind), kind).toHaveLength(5);
      expect(primaryFor(kind)[0].href).toBe("/merchant");
      expect(primaryFor(kind)[4].href).toBe("/merchant/more");
    }
  });
});

describe("the home screen answers who is coming today", () => {
  it("gives a trade the booked block instead of stock or a menu", () => {
    expect(HOME_BLOCKS.service).toContain("BookedToday");
    expect(HOME_BLOCKS.service).not.toContain("Stock");
    expect(HOME_BLOCKS.service).not.toContain("ServingToday");
  });

  it("is the only kind that loads a diary", () => {
    for (const kind of MERCHANT_KINDS.filter((k) => k !== "service")) {
      expect(HOME_BLOCKS[kind], kind).not.toContain("BookedToday");
    }
  });

  it("asks for one day, not the whole diary", () => {
    const page = read("app/merchant/(app)/page.tsx");
    expect(page).toMatch(/service_calendar[\s\S]{0,60}p_days: 1/);
  });
});

describe("the store id never comes from the request", () => {
  const api = read("app/api/merchant/diary/route.ts");

  it("is resolved server-side on every path", () => {
    // Same rule as /api/merchant/own-delivery: a provider must not be able to
    // read or fill somebody else's diary by crafting the request by hand.
    expect(api).toMatch(/getOwnStoreId/);
    expect(api).not.toMatch(/storeId: z\./);
    expect(api).not.toMatch(/p_store_id: body\./);
  });

  it("proves a duration belongs to this store before writing it", () => {
    // service_durations is keyed only by variant_id. Without this a competitor
    // could quietly make a rival's wash three hours long and empty their diary.
    expect(api).toMatch(/products!inner\(store_id\)/);
    expect(api).toMatch(/\.eq\("products\.store_id", storeId\)/);
  });

  it("never writes a booking by hand", () => {
    // Capacity is decided under a row lock inside book_service_slot. Two people
    // booking the last 09:00 slot at once is the ordinary case on a busy
    // morning, and an insert here would accept both.
    expect(api).toMatch(/rpc\("book_service_slot"/);
    expect(api).not.toMatch(/from\("service_bookings"\)/);
  });

  it("records a phone booking as one", () => {
    // A provider whose bookings are all 'provider' has a website that is not
    // working for them, and that is only visible if the source is honest.
    expect(api).toMatch(/p_source: "provider"/);
  });
});

describe("a refusal reaches the provider as a sentence", () => {
  const api = read("app/api/merchant/diary/route.ts");

  it("passes the RPC's own words through for the refusals it raises", () => {
    // "That time was just taken. Choose another." is more use than a 500, and
    // it is the only thing that explains why a slot that was on screen a second
    // ago is gone.
    expect(api).toMatch(/P0001/);
    expect(api).toMatch(/SPOKEN\.has\(error\.code\)/);
  });

  it("says why a day is empty instead of showing a blank list", () => {
    const diary = read("components/merchant/ServiceDiary.tsx");
    // "closed" and "fully booked" lead to two different sentences on the phone.
    expect(api).toMatch(/reason:/);
    expect(diary).toMatch(/SLOT_REASON/);
  });

  it("offers only times the booker will actually accept", () => {
    const diary = read("components/merchant/ServiceDiary.tsx");
    // A clock the provider types into is a double booking they find out about
    // later; these come from service_slots.
    expect(diary).toMatch(/\/api\/merchant\/diary\?slots=/);
    expect(diary).not.toMatch(/type="time"/);
  });
});

describe("cancelling is not deleting", () => {
  const api = read("app/api/merchant/diary/route.ts");

  it("changes a status and never removes a booking", () => {
    expect(api).toMatch(/rpc\("set_service_booking_status"/);
    // The only delete in this route clears a DURATION, which is a setting.
    const deletes = api.match(/\.delete\(\)/g) ?? [];
    expect(deletes).toHaveLength(1);
    expect(api).toMatch(/from\("service_durations"\)\.delete\(\)/);
  });
});
