import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  RIDE_STATUSES,
  RIDE_SERVICES,
  RIDE_SERVICE_META,
  CUSTOMER_STATUS,
  ADMIN_STATUS,
  NEXT_STATUSES,
  canTransition,
  isOpenRide,
  searchingMessage,
  rideReference,
  formatRidePrice,
  offerMessage,
  pickupTimeLabel,
  pickupClock,
  type RideStatus,
} from "./model";
import { RIDES_COPY } from "./copy.i18n";

// A ride is a real-world commitment: somebody is standing by a road expecting a
// car. These tests are about the two ways that goes wrong — telling a person the
// wrong thing, and letting a status skip a step that had to happen first.

describe("the status graph", () => {
  it("matches admin_set_ride_status() in SQL, transition for transition", () => {
    // Duplicated deliberately — the server refuses illegal jumps, this stops a
    // screen OFFERING one. The duplication is only safe while they agree, so
    // this is the test that keeps them agreeing. Mirrors the CASE in M83.
    const sql: Record<string, RideStatus[]> = {
      driver_on_way: ["assigned"],
      arrived: ["assigned", "driver_on_way"],
      on_trip: ["assigned", "driver_on_way", "arrived"],
      completed: ["on_trip"],
      new: ["dispatching", "no_driver"],
    };
    for (const [to, froms] of Object.entries(sql)) {
      for (const from of froms) {
        expect(canTransition(from, to as RideStatus), `${from} → ${to}`).toBe(
          true,
        );
      }
      // And nothing else may reach it.
      for (const from of RIDE_STATUSES) {
        if (!froms.includes(from) && to !== "cancelled") {
          expect(
            canTransition(from, to as RideStatus),
            `${from} → ${to} must be refused`,
          ).toBe(false);
        }
      }
    }
  });

  it("never lets a ride jump straight to completed", () => {
    // The brief: do not mark a ride complete because a client said so. The
    // server enforces it; this proves no screen will even show the button.
    for (const from of RIDE_STATUSES) {
      if (from === "on_trip") continue;
      expect(canTransition(from, "completed"), from).toBe(false);
    }
  });

  it("lets anything still live be cancelled, and nothing finished", () => {
    expect(canTransition("assigned", "cancelled")).toBe(true);
    expect(canTransition("on_trip", "cancelled")).toBe(true);
    expect(canTransition("completed", "cancelled")).toBe(false);
    expect(canTransition("cancelled", "cancelled")).toBe(false);
  });

  it("gives a ride nobody accepted a way back into dispatch", () => {
    // Otherwise 'no_driver' is a dead end and the customer has to book again —
    // which the brief explicitly forbids.
    expect(canTransition("no_driver", "new")).toBe(true);
  });

  it("leaves no status without a defined set of next steps", () => {
    for (const s of RIDE_STATUSES) expect(NEXT_STATUSES[s], s).toBeDefined();
  });
});

describe("what people are told", () => {
  it("never shows the customer the platform's internal vocabulary", () => {
    // "dispatching", "no_driver" and "stage 3" are words about our plumbing.
    for (const s of RIDE_STATUSES) {
      const text = CUSTOMER_STATUS[s];
      expect(text, s).toBeTruthy();
      expect(text.toLowerCase()).not.toMatch(
        /dispatch|radius|stage|candidate|no_driver|null/,
      );
    }
  });

  it("does not tell the customer a failure when nobody accepted", () => {
    // Somebody is still going to get them a car. Saying "failed" is both unkind
    // and untrue.
    expect(CUSTOMER_STATUS.no_driver).toBe(
      "We're arranging this for you by hand",
    );
    expect(CUSTOMER_STATUS.no_driver.toLowerCase()).not.toMatch(
      /fail|error|sorry|unavailable/,
    );
  });

  it("is blunt with the operator, because they have to act on it", () => {
    expect(ADMIN_STATUS.no_driver).toMatch(/needs you/i);
  });

  it("labels every service and every status in both voices", () => {
    for (const s of RIDE_STATUSES) {
      expect(CUSTOMER_STATUS[s], s).toBeTruthy();
      expect(ADMIN_STATUS[s], s).toBeTruthy();
    }
    for (const s of RIDE_SERVICES)
      expect(RIDE_SERVICE_META[s].label, s).toBeTruthy();
  });

  it("asks for flight details only where a flight or ferry exists", () => {
    expect(RIDE_SERVICE_META.airport.needsArrival).toBe(true);
    expect(RIDE_SERVICE_META.ferry.needsArrival).toBe(true);
    // The brief: do not force taxi logic into every transfer, or transfer logic
    // into a town taxi.
    expect(RIDE_SERVICE_META.taxi.needsArrival).toBe(false);
    expect(RIDE_SERVICE_META.hotel.needsArrival).toBe(false);
  });
});

describe("searchingMessage", () => {
  it("widens the reassurance without ever admitting the radius", () => {
    const all = [1, 2, 3, 4, 9].map(searchingMessage);
    for (const m of all)
      expect(m.toLowerCase()).not.toMatch(/radius|stage|km|\d/);
    // Each round says something different, so the screen does not look frozen.
    expect(new Set(all.slice(0, 3)).size).toBe(3);
  });

  it("stops escalating rather than panicking on round 9", () => {
    expect(searchingMessage(9)).toBe(searchingMessage(4));
  });
});

describe("isOpenRide", () => {
  it("counts a ride nobody accepted as still open — it needs a human", () => {
    expect(isOpenRide("no_driver")).toBe(true);
    expect(isOpenRide("completed")).toBe(false);
    expect(isOpenRide("cancelled")).toBe(false);
  });
});

describe("rideReference", () => {
  it("reads the same way as every other reference on the platform", () => {
    expect(rideReference("4f2a91b3-0000-4000-8000-000000000000")).toBe(
      "RR-4F2A91",
    );
  });
});

describe("formatRidePrice", () => {
  it("says 'Price on request' rather than Rs 0 when there is no price", () => {
    // Rs 0 is a promise of a free ride. There is no such thing.
    expect(formatRidePrice(null)).toBe("Price on request");
    expect(formatRidePrice(undefined)).toBe("Price on request");
  });

  it("formats minor units as rupees with a thousands separator", () => {
    expect(formatRidePrice(180000)).toBe("Rs 1,800");
    expect(formatRidePrice(50000)).toBe("Rs 500");
  });
});

describe("offerMessage", () => {
  const msg = offerMessage({
    driverName: "Jean",
    service: "airport",
    pickup: "Port Mathurin jetty",
    dropoff: "Plaine Corail Airport",
    passengers: 6,
    whenText: "Now",
    price: 180000,
    acceptUrl: "https://roulerodrig.com/r/abc123",
  });

  it("carries everything needed to decide, in one readable message", () => {
    // This IS the dispatch channel: no app, no push, read once on a phone.
    for (const part of [
      "Jean",
      "Port Mathurin jetty",
      "Plaine Corail Airport",
      "Now",
      "6",
      "Rs 1,800",
      "https://roulerodrig.com/r/abc123",
    ]) {
      expect(msg, part).toContain(part);
    }
  });

  it("says the race out loud, so a slow tap is not a surprise", () => {
    expect(msg).toMatch(/first to accept/i);
  });

  it("puts the link last, where a thumb ends up", () => {
    expect(msg.trimEnd().endsWith("https://roulerodrig.com/r/abc123")).toBe(
      true,
    );
  });
});

// ── PRIVATE HIRE ASKS ONLY WHERE TO COLLECT YOU ─────────────────────────────
//
// The destination was first made OPTIONAL for a day hire, which was not enough:
// an optional field is still a question on the screen, so customers invented a
// place to get past the step and a driver was sent a trip nobody was taking.
// The field is now not rendered at all for private hire.
//
// Asserted against the source because the decision lives in one branch of the
// booking form, and the failure mode is that a later edit "restores" the field
// for consistency with the other services.
describe("private hire has no destination field", () => {
  const form = readFileSync(
    join(__dirname, "../../app/taxi/book/BookRide.tsx"),
    "utf8",
  );

  it("never offers TAKE ME TO as an optional field", () => {
    // The exact label that used to render for a day hire.
    expect(form).not.toMatch(/TAKE ME TO — OPTIONAL/);
    expect(form).not.toMatch(/Leave empty for a day hire/);
  });

  it("still asks every other service where they are going", () => {
    // The label moved into lib/rides/copy.i18n.ts when the screen was
    // translated. The branch that decides WHETHER to ask is still here.
    expect(RIDES_COPY.en.book.step2.dropoffLabel).toBe("TAKE ME TO");
    for (const l of ["fr", "cr"] as const) {
      expect(RIDES_COPY[l].book.step2.dropoffLabel, l).toBeTruthy();
    }
    expect(form).toMatch(/const needsDropoff = service !== "private"/);
  });

  it("keeps PICK ME UP AT, which is the one thing a day hire does need", () => {
    expect(RIDES_COPY.en.book.step2.pickupLabel).toBe("PICK ME UP AT");
  });

  it("summarises a day hire without an empty arrow", () => {
    // `A → undefined` was what the confirmation step rendered once dropoff
    // could legitimately be null.
    expect(form).toMatch(/driver for the day/);
  });

  it("agrees with the model: private hire needs no arrival", () => {
    expect(RIDE_SERVICE_META.private.needsArrival).toBe(false);
  });
});

// ── AN ARRIVAL RUN CARRIES ITS FLIGHT OR FERRY NUMBER (M119) ────────────────
//
// It used to be "(OPTIONAL)". A driver sent to Plaine Corail without it cannot
// know the plane is two hours late — he waits, or the customer lands to nobody.
// Required in the form AND at the API, because the form is a convenience and
// the route is the rule.
describe("flight and ferry numbers are required", () => {
  const form = readFileSync(
    join(__dirname, "../../app/taxi/book/BookRide.tsx"),
    "utf8",
  );
  const api = readFileSync(
    join(__dirname, "../../app/api/rides/route.ts"),
    "utf8",
  );

  it("applies to exactly the services that meet an arrival", () => {
    expect(RIDE_SERVICE_META.airport.needsArrival).toBe(true);
    expect(RIDE_SERVICE_META.ferry.needsArrival).toBe(true);
    // And to nothing else — a taxi across the island has no flight.
    expect(RIDE_SERVICE_META.taxi.needsArrival).toBe(false);
    expect(RIDE_SERVICE_META.hotel.needsArrival).toBe(false);
    expect(RIDE_SERVICE_META.private.needsArrival).toBe(false);
  });

  it("no longer offers the number as optional", () => {
    expect(form).not.toMatch(/FLIGHT OR BOAT NUMBER \(OPTIONAL\)/);
  });

  it("names the right thing for a boat and for a plane", () => {
    expect(RIDES_COPY.en.book.step2.ferryRefLabel).toMatch(/FERRY OR BOAT/);
    expect(RIDES_COPY.en.book.step2.flightRefLabel).toMatch(/FLIGHT NUMBER/);
    // Both must exist in every language, or one service loses its label.
    for (const l of ["fr", "cr"] as const) {
      expect(RIDES_COPY[l].book.step2.ferryRefLabel, l).toBeTruthy();
      expect(RIDES_COPY[l].book.step2.flightRefLabel, l).toBeTruthy();
    }
  });

  it("blocks the step until the number is given", () => {
    expect(form).toMatch(/flightRefOk/);
    expect(form).toMatch(/canContinue2[\s\S]{0,200}flightRefOk/);
  });

  it("is enforced at the API, not only in the form", () => {
    // A client-side requirement is a hint; this is the boundary.
    expect(api).toMatch(/needsArrival/);
    expect(api).toMatch(/\.refine\(/);
    expect(api).toMatch(/flightRef/);
  });

  it("reads needsArrival rather than listing the services again", () => {
    // Two hardcoded lists drift; one flag cannot.
    expect(api).toMatch(/RIDE_SERVICE_META\[v\.service\]/);
  });
});

// ── THE NUMBER REACHES THE PEOPLE WHO ACT ON IT (M120) ──────────────────────
//
// M119 collected it and M120 delivers it. The gap it closes: the offer screen
// showed the flight, but once a driver ACCEPTED, his job card did not — so the
// one person standing at Plaine Corail could not see which plane.
describe("the flight number is shown where it is used", () => {
  const at = (rel: string) =>
    readFileSync(join(__dirname, "..", "..", rel), "utf8");

  it("the RPC puts it on the driver's job and offer", () => {
    const sql = at(
      "supabase/migrations/20260819160000_m120_driver_job_carries_flight.sql",
    );
    // Both objects, or the driver only sees it before he commits.
    expect(
      sql.match(/'flightRef', r?\.?v?_?r?\.?flight_ref/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(2);
    expect(sql).toMatch(/'meetGreet', v_r\.meet_greet/);
  });

  it("the driver job card renders it", () => {
    const card = at("app/d/[token]/DriverHome.tsx");
    expect(card).toMatch(/flightRef\?: string \| null/);
    expect(card).toMatch(/home\.job\.flightRef/);
    // And says which kind, because a boat is not a flight.
    expect(card).toMatch(/FERRY \/ BOAT/);
  });

  it("the admin desk selects and shows it", () => {
    expect(at("app/api/admin/rides/route.ts")).toMatch(
      /flight_ref, meet_greet/,
    );
    const desk = at("app/admin/rides/RidesDesk.tsx");
    expect(desk).toMatch(/flight_ref\?: string \| null/);
    expect(desk).toMatch(/r\.flight_ref/); // the list row
    expect(desk).toMatch(/ride\.flight_ref/); // the opened ride
  });

  it("surfaces the meet-and-greet request to the driver", () => {
    // Asked for at booking and never passed on is how someone waits outside.
    expect(at("app/d/[token]/DriverHome.tsx")).toMatch(
      /Wait inside with a sign/,
    );
  });
});

// ── WHEN TO BE THERE (M121) ─────────────────────────────────────────────────
//
// A driver reads this standing in Rodrigues. The island is UTC+4, so a server
// formatting in UTC would tell him to leave four hours early — which is the
// whole reason this is one function and not a toLocaleString in two components.
describe("pickupTimeLabel", () => {
  // 06:20 UTC is 10:20 in Rodrigues.
  const iso = "2026-08-20T06:20:00Z";

  it("renders the island's clock, not the server's", () => {
    expect(pickupTimeLabel("later", iso)).toContain("10:20");
    expect(pickupTimeLabel("later", iso)).not.toContain("06:20");
  });

  it("carries the day, because an airport run is often tomorrow", () => {
    const out = pickupTimeLabel("later", iso);
    expect(out).toMatch(/Thu/);
    expect(out).toMatch(/20 Aug/);
  });

  it("says so plainly when there is no appointed time", () => {
    expect(pickupTimeLabel("now", null)).toBe("As soon as possible");
    expect(pickupTimeLabel("now", iso)).toBe("As soon as possible");
    expect(pickupTimeLabel("later", null)).toBe("As soon as possible");
  });

  it("does not print Invalid Date when the timestamp is rubbish", () => {
    expect(pickupTimeLabel("later", "not-a-date")).toBe("As soon as possible");
  });

  it("uses a 24-hour clock, so 14:20 is never read as 2am", () => {
    expect(pickupTimeLabel("later", "2026-08-20T10:20:00Z")).toContain("14:20");
    expect(pickupTimeLabel("later", "2026-08-20T10:20:00Z")).not.toMatch(
      /pm|PM/,
    );
  });
});

describe("pickupClock", () => {
  it("is the time alone, for the admin chip", () => {
    expect(pickupClock("later", "2026-08-20T06:20:00Z")).toBe("10:20");
  });

  it("is null when there is nothing to show, so no stray separator renders", () => {
    expect(pickupClock("now", null)).toBeNull();
    expect(pickupClock("later", "rubbish")).toBeNull();
  });
});

describe("the pickup time is shown beside the flight", () => {
  const at = (rel: string) =>
    readFileSync(join(__dirname, "..", "..", rel), "utf8");

  it("on the driver's job card", () => {
    const card = at("app/d/[token]/DriverHome.tsx");
    expect(card).toMatch(/pickupTimeLabel/);
    expect(card).toMatch(/PICK UP/);
  });

  it("and on the admin desk, from the same function", () => {
    // Two formatters would eventually disagree about the same ride.
    const desk = at("app/admin/rides/RidesDesk.tsx");
    expect(desk).toMatch(
      /pickupTimeLabel\(ride\.when_kind, ride\.scheduled_at\)/,
    );
    expect(desk).toMatch(/pickupClock\(r\.when_kind, r\.scheduled_at\)/);
    expect(desk).not.toMatch(/toLocaleTimeString/);
  });
});

// ── THE PROMISE MATCHES WHO ACTUALLY KEEPS IT (M122) ────────────────────────
//
// The field said "We track the flight". Nothing did: there is no flight-status
// integration, and on Rodrigues there does not need to be — the driver checks
// the flight himself, which is normal practice on the island. So the sentence
// names the driver, not a system we do not run.
//
// M120 is what makes it true: the flight number and pickup time now reach the
// driver's job card, so he has something to check.
describe("the arrival promise names who keeps it", () => {
  const form = readFileSync(
    join(__dirname, "../../app/taxi/book/BookRide.tsx"),
    "utf8",
  );

  it("does not claim the platform tracks flights, in any language", () => {
    // There is no flight-status API. Saying otherwise is a promise nobody owns
    // — and a translation is precisely where such a promise creeps back in,
    // because the translator is not the person who knows there is no API.
    expect(form).not.toMatch(/We track the flight/i);
    expect(form).not.toMatch(/We track the boat/i);
    for (const l of ["en", "fr", "cr"] as const) {
      const help = `${RIDES_COPY[l].book.step2.flightRefWhy} ${RIDES_COPY[l].book.step2.ferryRefWhy}`;
      expect(help, l).not.toMatch(/nous suivons le vol/i);
      expect(help, l).not.toMatch(/we track/i);
      expect(help, l).not.toMatch(/nou swiv vol/i);
    }
  });

  it("says the driver watches it, for both a plane and a boat", () => {
    expect(RIDES_COPY.en.book.step2.flightRefWhy).toMatch(
      /Your driver watches the flight/,
    );
    expect(RIDES_COPY.en.book.step2.ferryRefWhy).toMatch(
      /Your driver watches the boat/,
    );
  });

  it("still gives the reason the number is being asked for", () => {
    // Required fields need a why, or they read as bureaucracy.
    expect(RIDES_COPY.en.book.step2.flightRefWhy).toMatch(
      /even if you are delayed/,
    );
    expect(RIDES_COPY.en.book.step2.ferryRefWhy).toMatch(/not an hour early/);
  });
});

// ── THE DISPATCH DESK IS THREE PLACES, NOT SIX PILLS (M123) ─────────────────
//
// "Rework entirely the taxi panel in admin because it is very confusing."
// The cause was structural: Queue, Drivers and Fares were three INDEPENDENT
// booleans, so all three could be open at once and the queue — the reason the
// page exists — was pushed off the bottom. Six identical-looking pills gave no
// hint that three changed the page and three did something.
describe("the admin rides desk", () => {
  const desk = readFileSync(
    join(__dirname, "../../app/admin/rides/RidesDesk.tsx"),
    "utf8",
  );

  it("has one place at a time, not three independent toggles", () => {
    expect(desk).not.toMatch(/const \[showRoster/);
    expect(desk).not.toMatch(/const \[showFares/);
    expect(desk).toMatch(
      /const \[view, setView\] = useState<"queue" \| "drivers" \| "fares">/,
    );
  });

  it("marks which tab you are on, for a screen reader too", () => {
    expect(desk).toMatch(
      /aria-current=\{view === t\.id \? "page" : undefined\}/,
    );
  });

  it("keeps New ride an ACTION on the queue, not a fourth place", () => {
    // It is something you do while looking at the queue, and it closes itself.
    expect(desk).toMatch(/view === "queue" && showNew/);
  });

  it("only offers actions that belong to where you are", () => {
    // "Clear expired offers" on the Fares screen is noise.
    expect(desk).toMatch(/\{view === "queue" && \(\s*<>/);
  });

  it("counts rides still needing a decision, not rows loaded", () => {
    // With scope "all" the list carries finished rides; a tab reading 200
    // would say nothing at all.
    expect(desk).toMatch(/filter\(\(r\) => isOpenRide\(r\.status\)\)/);
  });
});
