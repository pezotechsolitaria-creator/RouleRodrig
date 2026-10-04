import { beforeEach, describe, expect, it, vi } from "vitest";
import { SITE_URL } from "@/lib/site";
// Loaded with the mocks below in place: vitest hoists vi.mock above imports.
import { sendRequestExpired, sendVehicleUnavailable } from "@/lib/email";

// ── THE WAY BACK GOES TO WHAT THEY BOOKED (architecture review 2026-09-30) ──
//
// The declined email ("We couldn't get you that one") and the expired-request
// email both linked /browse/scooter, whatever had been booked — so a customer
// turned down for a car was sent to the scooter listing as the way back. These
// call the real senders and read the HTML they hand to the mail router.
//
// lib/email/links.test.ts checks every LITERAL link against the routes on
// disk; a link built from the booking's own category is a runtime value it
// cannot see, which is why it is pinned here.

const sent = vi.hoisted(() => ({ html: [] as string[] }));

// The fleet the booking's vehicle is looked up in (lib/vehicle-name.ts). The
// Swift carries the trailing space its live name has, because the admin
// decline path passes the display name, not the id.
vi.mock("@/lib/content", () => ({
  getContent: async () => ({
    fleet: [
      { id: "burgman", name: "BURGMAN 125cc", category: "scooter" },
      { id: "veh-1783380348440", name: "Suzuki Swift (Latest Gen) ", category: "car" },
      { id: "kayak-1", name: "Sit-on-top Kayak", category: "kayak" },
      { id: "legacy", name: "Old Scooter" },
    ],
  }),
}));
vi.mock("@/lib/email/send", () => ({
  sendTransactionalEmail: async (o: { html: string }) => {
    sent.html.push(o.html);
    return { ok: true };
  },
}));
// The brand lookup is best-effort and must not reach a database here.
vi.mock("@/lib/supabase/admin", () => ({
  getPrivileged: async () => {
    throw new Error("no database in this test");
  },
}));

const booking = (scooter: string) => ({
  id: "3f2a9c10-0000-4000-8000-000000000000",
  email: "guest@example.com",
  name: "Guest",
  scooter,
  start_date: "2026-10-12",
  end_date: "2026-10-14",
});

/** Every /browse link in the one email just sent. */
const browseLinks = () =>
  [...(sent.html.at(-1) ?? "").matchAll(/href="([^"]*\/browse\/[^"]*)"/g)].map((m) => m[1]);

beforeEach(() => {
  sent.html = [];
});

describe("the declined email", () => {
  it("sends a car customer to the cars, by fleet id", async () => {
    await sendVehicleUnavailable({ ...booking("veh-1783380348440"), note: null });
    expect(browseLinks()).toEqual([`${SITE_URL}/browse/car`]);
  });

  it("and by the display name the admin decline passes", async () => {
    await sendVehicleUnavailable({ ...booking("Suzuki Swift (Latest Gen) "), note: null });
    expect(browseLinks()).toEqual([`${SITE_URL}/browse/car`]);
  });

  it("sends any other category to its own page", async () => {
    await sendVehicleUnavailable({ ...booking("kayak-1"), note: null });
    expect(browseLinks()).toEqual([`${SITE_URL}/browse/kayak`]);
  });

  it("still sends a scooter customer to the scooters", async () => {
    await sendVehicleUnavailable({ ...booking("burgman"), note: null });
    expect(browseLinks()).toEqual([`${SITE_URL}/browse/scooter`]);
  });

  it("falls back to the scooters, as before, when the vehicle is unknown", async () => {
    // "the vehicle" is what the admin route passes when the name lookup is
    // empty; a row with no category is a scooter everywhere else too.
    await sendVehicleUnavailable({ ...booking("the vehicle"), note: null });
    expect(browseLinks()).toEqual([`${SITE_URL}/browse/scooter`]);
    await sendVehicleUnavailable({ ...booking("legacy"), note: null });
    expect(browseLinks()).toEqual([`${SITE_URL}/browse/scooter`]);
  });
});

describe("the expired-request email", () => {
  it("sends a car customer to the cars", async () => {
    await sendRequestExpired(booking("veh-1783380348440"));
    expect(browseLinks()).toEqual([`${SITE_URL}/browse/car`]);
  });

  it("still sends a scooter customer to the scooters", async () => {
    await sendRequestExpired(booking("burgman"));
    expect(browseLinks()).toEqual([`${SITE_URL}/browse/scooter`]);
  });
});
