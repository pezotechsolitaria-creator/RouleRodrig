import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { bookingReachLine, takesService, type RosterDriver } from "./reachability";
import { reachedNobody } from "./offer-outcome";

// RR-0E90AD, 29 Sep 2026. The one driver who takes airport runs could not be
// told about any offer, and the system knew it every round and said nothing.

const SAM: RosterDriver = {
  id: "sam", name: "Mr Sam", active: true,
  handles_taxi: true, handles_airport: true, handles_transfer: true,
};

describe("a round that reached nobody", () => {
  const round = (over: Partial<Parameters<typeof reachedNobody>[0]> = {}) => ({
    sent: 0, pushed: 0, unreachable: [] as unknown[], noContact: [] as unknown[], failed: [] as unknown[], ...over,
  });

  it("is RR-0E90AD's round: nothing sent, nothing pushed, one driver with no alerts", () => {
    expect(reachedNobody(round({ unreachable: [{ name: "Mr Sam" }] }))).toBe(true);
  });

  it("counts a missing number and a failed send the same way", () => {
    expect(reachedNobody(round({ noContact: [{ name: "Anil" }] }))).toBe(true);
    expect(reachedNobody(round({ failed: [{ name: "Ravi", error: "CallMeBot 500" }] }))).toBe(true);
  });

  it("is quiet once anybody was reached, by either channel", () => {
    expect(reachedNobody(round({ sent: 1, unreachable: [{ name: "Mr Sam" }] }))).toBe(false);
    expect(reachedNobody(round({ pushed: 1, unreachable: [{ name: "Mr Sam" }] }))).toBe(false);
  });

  it("is quiet when every driver is in their quiet hours, or the read failed", () => {
    // No targets at all: by design they hold the offer and are not woken, and
    // an alarm about a read we could not make would be a guess.
    expect(reachedNobody(round())).toBe(false);
  });
});

describe("will any driver hear about this booking?", () => {
  it("warns when the only driver for the service has no alerts set up", () => {
    const line = bookingReachLine([SAM], new Set(), "airport");
    expect(line).toContain("No driver will hear about this: Mr Sam has no WhatsApp or phone alerts set up.");
    expect(line).toContain("Send link");
  });

  it("says nothing once one of them can be reached", () => {
    expect(bookingReachLine([SAM, { ...SAM, id: "ravi", name: "Ravi" }], new Set(["ravi"]), "airport")).toBeNull();
  });

  it("only counts drivers who take that kind of ride, the way the engine does", () => {
    const townOnly = { ...SAM, id: "t", name: "Town", handles_airport: false };
    // The reachable driver does not do airport runs, so he does not help.
    expect(bookingReachLine([SAM, townOnly], new Set(["t"]), "airport")).toContain("Mr Sam has no");
    expect(takesService(townOnly, "airport")).toBe(false);
    expect(takesService({ ...SAM, handles_transfer: false }, "hotel")).toBe(false);
    expect(takesService({ ...SAM, handles_taxi: null }, "taxi")).toBe(true);
  });

  it("says switched off, not 'takes no rides', when the only takers are switched off", () => {
    expect(bookingReachLine([{ ...SAM, active: false }], new Set(["sam"]), "airport"))
      .toBe("⚠️ Every driver who takes this kind of ride is switched off (Mr Sam). Switch one back on, or ring a driver yourself.");
  });

  it("says nobody takes it only when nobody does, switched on or off", () => {
    expect(bookingReachLine([{ ...SAM, handles_airport: false }], new Set(["sam"]), "airport"))
      .toBe("⚠️ No driver on the list takes this kind of ride. Ring one yourself.");
  });

  it("names several in one sentence", () => {
    const line = bookingReachLine([SAM, { ...SAM, id: "r", name: "Ravi" }], new Set(), "taxi");
    expect(line).toContain("Mr Sam and Ravi have no WhatsApp");
  });
});

// Wiring. Asserted on imports and calls, not on prose, so a comment that
// explains the old bug cannot make the test pass or fail.
describe("the pieces are actually connected", () => {
  it("the dispatch worker checks every round and alerts when it reached nobody", () => {
    const cron = readFileSync("app/api/cron/notifications/route.ts", "utf8");
    expect(cron).toMatch(/import \{ reachedNobody \} from "@\/lib\/rides\/offer-outcome";/);
    expect(cron).toMatch(/notifyOwnerRideUnreached,/);
    expect(cron).toMatch(/const sends = await Promise\.allSettled\(offeredRides\.map\(\(r\) => notifyRideOffers\(r\.rideId\)\)\);/);
    expect(cron).toMatch(/reachedNobody\(s\.value\)/);
    expect(cron).toMatch(/notifyOwnerRideUnassigned\(r\.id, \{ reminder: true \}\)/);
  });

  it("every round is written down before anything decides whether to alert", () => {
    const cron = readFileSync("app/api/cron/notifications/route.ts", "utf8");
    const record = cron.indexOf("await recordOfferReach(offeredRides[i].rideId, offeredRides[i].stage, s.value);");
    const alert = cron.indexOf("await notifyOwnerRideUnreached(offeredRides[i].rideId, s.value)");
    expect(record).toBeGreaterThan(-1);
    expect(alert).toBeGreaterThan(record);
  });

  it("the reminder never rebuilds 'who was alerted' from today's setup", () => {
    const notify = readFileSync("lib/rides/notify.ts", "utf8");
    expect(notify).toMatch(/readNeverAlerted\(admin, rideId, \{ fallBackToSetup: opts\.reminder !== true \}\)/);
    // Answered offers are never reported as unalerted.
    expect(notify).toMatch(/o\.status !== "declined" && o\.status !== "accepted"/);
  });

  it("the booking alert carries the warning line", () => {
    const route = readFileSync("app/api/rides/route.ts", "utf8");
    expect(route).toMatch(/import \{ bookingReachLine, type RosterDriver \} from "@\/lib\/rides\/reachability";/);
    expect(route).toMatch(/^\s*reachLine,\s*$/m);
  });

  it("the rides desk is sent the two setup checks the Drivers tab shows", () => {
    const api = readFileSync("app/api/admin/rides/route.ts", "utf8");
    expect(api).toMatch(/admin\.rpc\("taxi_whatsapp_readiness"\)/);
    expect(api).toMatch(/admin\.rpc\("taxi_push_readiness"\)/);
    expect(api).toMatch(/push_ready: pushReady\.error \? undefined : pushMap\.get/);
  });

  it("the 'Alerts are on' push opens the driver's own page, not a dead offer link", () => {
    const route = readFileSync("app/api/driver-home/route.ts", "utf8");
    expect(route).toMatch(/url: `\/d\/\$\{p\.token\}`/);
    expect(route).not.toMatch(/url: `\/r\/\$\{p\.token\}`/);
  });

  it("the Drivers tab saves a checked WhatsApp code on its own button", () => {
    const desk = readFileSync("app/admin/rides/RidesDesk.tsx", "utf8");
    expect(desk).toMatch(/import \{ extractCallMeBotKey \} from "@\/lib\/notifications\/callmebot-number";/);
    expect(desk).toMatch(/const key = extractCallMeBotKey\(f\.whatsapp_key\);/);
    expect(desk).toMatch(/onSave\(d\.id, \{ whatsapp_api_key: key \}\)/);
    // The row's own Save never carries the key, so it can never wipe one.
    expect(desk).not.toMatch(/whatsapp_api_key: f\.whatsapp_key/);
  });

  it("the API refuses a code it cannot use, whichever screen sent it", () => {
    const api = readFileSync("app/api/admin/taxi/route.ts", "utf8");
    expect(api).toMatch(/import \{ extractCallMeBotKey \} from "@\/lib\/notifications\/callmebot-number";/);
    expect((api.match(/normaliseContacts\(row\) \?\? normaliseKey\(row\)/g) ?? []).length).toBe(2);
  });
});
