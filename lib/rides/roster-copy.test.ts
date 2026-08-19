import { describe, it, expect } from "vitest";
import {
  classifyRosterSkip,
  assessRoster,
  rosterBlockedAlert,
  rosterCauseSentence,
  rosterDedupeKey,
  RIDE_ROSTER_TYPE,
  type RosterCandidate,
  type RosterCause,
} from "./roster-copy";

// The eight reason_skipped values, copied VERBATIM out of production
// pg_get_functiondef('ride_candidates') rather than out of a migration file —
// the repo .sql has drifted and the database is the truth. If one of these ever
// stops matching, this file is the thing that says so out loud.
const REASON = {
  off: "not working today",
  busy: "marked busy",
  onRide: "already on a ride",
  seats: "seats 4 < 5 passengers",
  airport: "no airport runs",
  transfer: "no transfers",
  town: "no town taxi",
  distance: "12.4 km away, outside this round",
} as const;

const driver = (id: string, reason: string | null, name = "Sam"): RosterCandidate => ({
  driver_id: id,
  name,
  reason_skipped: reason,
});

const BUCKET = "2026-08-14T12";

describe("every reason the engine can give is understood", () => {
  it("maps each production string to a code", () => {
    expect(classifyRosterSkip(REASON.off)).toBe("off");
    expect(classifyRosterSkip(REASON.busy)).toBe("busy");
    expect(classifyRosterSkip(REASON.onRide)).toBe("on_ride");
    expect(classifyRosterSkip(REASON.seats)).toBe("seats");
    expect(classifyRosterSkip(REASON.airport)).toBe("service");
    expect(classifyRosterSkip(REASON.transfer)).toBe("service");
    expect(classifyRosterSkip(REASON.town)).toBe("service");
    expect(classifyRosterSkip(REASON.distance)).toBe("distance");
  });

  it("reads a free driver as free, not as an unknown problem", () => {
    expect(classifyRosterSkip(null)).toBeNull();
    expect(classifyRosterSkip("  ")).toBeNull();
    expect(classifyRosterSkip(undefined)).toBeNull();
  });

  it("treats a reason it has never seen as a real problem, not as silence", () => {
    // These strings are display prose built inside SQL, and a wording tweak on
    // the dispatch desk would pass tsc, build and every other test. The failure
    // mode that must NOT exist is the alarm quietly switching itself off.
    expect(classifyRosterSkip("driver is on holiday in Mauritius")).toBe("blocked");
  });

  it("recognises a seat message whatever the numbers are", () => {
    expect(classifyRosterSkip("seats 4 < 12 passengers")).toBe("seats");
    expect(classifyRosterSkip("seats 1 < 2 passengers")).toBe("seats");
  });
});

describe("deciding whether a wider search can still help", () => {
  it("raises the alarm when there is nobody switched on at all", () => {
    // ride_candidates reads `from taxi_drivers t … where t.active`, so an empty
    // or entirely switched-off list yields no rows and NO reason at all. A
    // classifier that only reads reason_skipped describes this as nothing
    // whatsoever, which is how it stayed silent.
    const a = assessRoster({ atStage: [], atWidest: [] });
    expect(a.alarm).toBe(true);
    expect(a.alarm && a.cause).toBe("no_roster");
  });

  it("stays quiet while a driver is only out of range for THIS round", () => {
    // Ride c21cf582, 2026-08-13: 14:14:12 found 0 drivers, 14:15:26 found 1.
    // Alarming on the first empty round pages the owner 74 seconds before the
    // system fixes itself, and that is how an alarm becomes a muted number.
    const a = assessRoster({
      atStage: [driver("d1", REASON.distance)],
      atWidest: [driver("d1", null)],
    });
    expect(a.alarm).toBe(false);
    expect(!a.alarm && a.why).toBe("wider_search");
  });

  it("raises on the FIRST empty round when no width can help", () => {
    const a = assessRoster({
      atStage: [driver("d1", REASON.off)],
      atWidest: [driver("d1", REASON.off)],
    });
    expect(a.alarm).toBe(true);
    expect(a.alarm && a.cause).toBe("off");
    expect(a.alarm && a.blockedName).toBe("Sam");
  });

  it("stays quiet when the only free driver has already turned this one down", () => {
    // offer_ride carries a filter ride_candidates knows nothing about:
    //   and not exists (… o.status in ('declined','withdrawn'))
    // A man who said no is not a broken driver list, and the give-up message
    // already words that case correctly.
    const a = assessRoster({
      atStage: [driver("d1", null)],
      atWidest: [driver("d1", null)],
    });
    expect(a.alarm).toBe(false);
    expect(!a.alarm && a.why).toBe("already_asked");
  });

  it("stays quiet rather than inventing an alarm when this round's read failed", () => {
    // atStage empty because the read errored, not because nobody was skipped.
    const a = assessRoster({ atStage: [], atWidest: [driver("d1", null)] });
    expect(a.alarm).toBe(false);
  });

  it("names a single blocked driver, and refuses to name a crowd", () => {
    const one = assessRoster({
      atStage: [driver("d1", REASON.busy, "Marc")],
      atWidest: [driver("d1", REASON.busy, "Marc")],
    });
    expect(one.alarm && one.blockedName).toBe("Marc");

    const many = assessRoster({
      atStage: [driver("d1", REASON.busy, "Marc"), driver("d2", REASON.busy, "Sam")],
      atWidest: [driver("d1", REASON.busy, "Marc"), driver("d2", REASON.busy, "Sam")],
    });
    expect(many.alarm && many.blockedName).toBeNull();
    expect(many.alarm && many.blocked).toBe(2);
  });

  it("leads with the cause the owner can actually fix", () => {
    // One man switched off outranks one legitimately out on a job: the first is
    // a phone call, the second is nothing to do.
    const a = assessRoster({
      atStage: [driver("d1", REASON.onRide, "Marc"), driver("d2", REASON.off, "Sam")],
      atWidest: [driver("d1", REASON.onRide, "Marc"), driver("d2", REASON.off, "Sam")],
    });
    expect(a.alarm && a.cause).toBe("off");
    expect(a.alarm && a.mixed).toBe(true);
  });

  it("recognises each remaining cause", () => {
    const cases: [string, RosterCause][] = [
      [REASON.busy, "busy"],
      [REASON.onRide, "on_ride"],
      [REASON.seats, "seats"],
      [REASON.airport, "service"],
      [REASON.transfer, "service"],
      [REASON.town, "service"],
      ["something entirely new", "blocked"],
    ];
    for (const [reason, cause] of cases) {
      const a = assessRoster({ atStage: [driver("d1", reason)], atWidest: [driver("d1", reason)] });
      expect(a.alarm, reason).toBe(true);
      expect(a.alarm && a.cause, reason).toBe(cause);
    }
  });

  it("does not treat a driver with no known location as out of range", () => {
    // The one driver on the list has no base and has never sent a position, so
    // road_km is null and the distance branch is guarded by `road_km is not
    // null`. He is free at every width; waiting buys nothing.
    const a = assessRoster({ atStage: [driver("d1", null)], atWidest: [driver("d1", null)] });
    expect(!a.alarm && a.why).toBe("already_asked");
  });
});

describe("what the owner reads", () => {
  const text = (cause: RosterCause, extra: Record<string, unknown> = {}) => {
    const a = rosterBlockedAlert({ cause, ...extra }, BUCKET);
    return [a.title, ...a.lines].join("\n");
  };

  it("says what is wrong AND what to do, for every cause", () => {
    const causes: RosterCause[] = ["no_roster", "off", "busy", "seats", "service", "on_ride", "blocked"];
    for (const c of causes) {
      const a = rosterBlockedAlert({ cause: c }, BUCKET);
      expect(a.title.length, c).toBeGreaterThan(0);
      // head + todo + board at minimum.
      expect(a.lines.length, c).toBeGreaterThanOrEqual(3);
      expect(a.lines[a.lines.length - 1], c).toContain("/admin/rides");
    }
  });

  it("names the one driver who is holding everything up", () => {
    expect(text("off", { blockedName: "Sam" })).toContain("Sam is marked as not working today");
    expect(text("off")).toContain("Every driver is marked as not working today");
  });

  it("does not cry wolf when nothing is actually broken", () => {
    // Every driver out on a job is capacity, not a fault. The message must not
    // send the owner looking for a setting to change.
    expect(text("on_ride")).toContain("Nothing is broken");
    expect(text("on_ride")).toContain("Nothing to fix");
  });

  it("counts the people waiting, and says nothing when it cannot", () => {
    expect(text("off", { ridesWaiting: 1 })).toContain("1 person is waiting");
    expect(text("off", { ridesWaiting: 3 })).toContain("3 people are waiting");
    expect(text("off", { ridesWaiting: 0 })).not.toContain("waiting right now");
    expect(text("off", { ridesWaiting: null })).not.toContain("waiting right now");
    expect(text("off", { ridesWaiting: Number.NaN })).not.toContain("waiting right now");
  });

  it("admits when the drivers are stuck for different reasons", () => {
    expect(text("off", { mixed: true })).toContain("for different reasons");
    expect(text("off", { mixed: false })).not.toContain("for different reasons");
  });

  it("never names a customer — one message may stand for three of them", () => {
    for (const c of ["no_roster", "off", "busy", "on_ride"] as RosterCause[]) {
      const t = text(c, { ridesWaiting: 3 }).toLowerCase();
      expect(t, c).not.toContain("call them now");
      expect(t, c).not.toContain("pickup:");
    }
  });

  it("uses none of our internal vocabulary", () => {
    const BANNED = [
      "no_driver", "reason_skipped", "ride_candidates", "dispatch", "dispatching",
      "stage", "radius", "offer_rounds", "ride_offers", "ride_requests",
      "taxi_drivers", "notification", "enum", "rpc", "queue", "cron", "sweep",
      "escalation", "dedupe", "uuid", "payload", "slot", "candidate",
    ];
    const causes: RosterCause[] = ["no_roster", "off", "busy", "seats", "service", "on_ride", "blocked"];
    for (const c of causes) {
      const t = text(c, { ridesWaiting: 2, blockedName: "Sam", mixed: true }).toLowerCase();
      for (const w of BANNED) {
        expect(t, `${c} leaked "${w}"`).not.toContain(w);
      }
      expect(t).not.toMatch(/\b(null|undefined|nan)\b/i);
    }
  });
});

describe("one fault is one message, however many people it strands", () => {
  it("gives three rides stranded by one cause a single key", () => {
    const a = rosterDedupeKey("off", BUCKET);
    const b = rosterDedupeKey("off", BUCKET);
    expect(a).toBe(b);
  });

  it("separates different causes in the same hour — different remedies", () => {
    expect(rosterDedupeKey("off", BUCKET)).not.toBe(rosterDedupeKey("busy", BUCKET));
  });

  it("does not let a permanent key swallow tomorrow's outage", () => {
    // notification_jobs_dedupe_key has NO time window, so a cause-only key
    // would be claimed for ever and the second outage would vanish into
    // suppressed_count. The bucket is load-bearing, not decoration.
    expect(rosterDedupeKey("off", "2026-08-14T12")).not.toBe(rosterDedupeKey("off", "2026-08-15T09"));
  });

  it("keeps a shape enqueue_notification cannot mangle", () => {
    // The RPC appends ':' || slot_id. The bucket contains no colon, so the key
    // stays exactly four segments.
    const k = rosterDedupeKey("off", BUCKET);
    expect(k.split(":")).toHaveLength(4);
    expect(k.startsWith("ride:roster:")).toBe(true);
  });

  it("cannot be confused with the per-customer ride key", () => {
    expect(rosterDedupeKey("off", BUCKET).startsWith("ride:no-driver:")).toBe(false);
  });

  it("matches the alert it is attached to", () => {
    const a = rosterBlockedAlert({ cause: "busy" }, BUCKET);
    expect(a.dedupeKey).toBe(rosterDedupeKey("busy", BUCKET));
    expect(a.type).toBe(RIDE_ROSTER_TYPE);
  });
});

describe("the one-line version, for the message that names the customer", () => {
  it("is present tense, because it is read back seconds later", () => {
    expect(rosterCauseSentence("busy", "Sam")).toBe("Sam is marked busy.");
    expect(rosterCauseSentence("off", "Sam")).toBe("Sam is marked as not working today.");
  });

  it("drops the name when there is a crowd", () => {
    expect(rosterCauseSentence("off", null)).toContain("Every driver");
    expect(rosterCauseSentence("off", "  ")).toContain("Every driver");
  });

  it("says nothing rather than restating what the message already said", () => {
    // The give-up message already says nobody was free to ask. A vaguer
    // repetition of that is worse than an omission.
    expect(rosterCauseSentence("blocked")).toBeNull();
  });

  it("covers every cause that has a remedy", () => {
    for (const c of ["no_roster", "off", "busy", "on_ride", "seats", "service"] as RosterCause[]) {
      expect(rosterCauseSentence(c), c).toBeTruthy();
    }
  });
});
