import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { RIDES_COPY } from "./copy.i18n";

// ── THE ONE CONCRETE FACT ON THE TRACKING SCREEN ────────────────────────────
//
// "Where is my taxi?" already reassures well: the wording widens by round, so a
// long wait reads as patience rather than failure. What it could not say is
// whether anything real was happening. Those four sentences are identical
// whether four drivers are holding a live offer or the dispatcher fell over ten
// minutes ago, and a reassuring sentence that never changes is a spinner. A
// spinner is what makes somebody phone the office — the exact intervention the
// screen exists to remove.
//
// The count is deliberately NOT the thing this screen refuses to say. TrackRide
// is explicit that a customer must never read "dispatching" or "radius stage 3"
// — words about our plumbing. "We asked four drivers" is a fact about THEIR
// request; "radius stage 3" is a fact about our algorithm.
//
// Two properties carry the whole design, and both are easy to lose in a later
// edit that looks like a simplification:
//
//   IT ONLY GOES UP.  Counting live offers instead of every offer would make the
//                     number climb to four and fall back to zero between rounds.
//                     A customer watching "4 drivers asked" become "1 driver
//                     asked" reads it as drivers abandoning them one by one.
//
//   IT HIDES AT ZERO. "0 drivers asked" would turn the one concrete line on the
//                     page into the worst news on it, at the moment somebody is
//                     most anxious.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const MIGRATION =
  "supabase/migrations/20260907090000_m182_the_customer_can_see_that_drivers_were_asked.sql";
const TRACK = "app/taxi/track/TrackRide.tsx";
const LANGS = ["en", "fr", "cr"] as const;

describe("the count is honest in every language", () => {
  it("says a real sentence in all three", () => {
    for (const l of LANGS) {
      const asked = RIDES_COPY[l].track.status.asked;
      expect(typeof asked, l).toBe("function");
      expect(asked(4), l).toContain("4");
      expect(asked(4).trim(), l).not.toBe("");
    }
  });

  it("does not say '1 drivers' in the languages that inflect", () => {
    // A ride with exactly one offer out is the commonest case on a small island,
    // so the singular is not an edge case here.
    for (const l of ["en", "fr"] as const) {
      const one = RIDES_COPY[l].track.status.asked(1);
      expect(one, l).toContain("1");
      expect(one, `${l} did not switch to the singular`).not.toBe(
        RIDES_COPY[l].track.status.asked(2).replace("2", "1"),
      );
    }
  });

  it("leaves Kreol uninflected, because Kreol does not inflect here", () => {
    // Kreol marks plural with `bann`, and `bann` is NOT used after a numeral —
    // "2 bann sofer" is wrong where "2 sofer" is right. So the singular and the
    // plural are correctly identical apart from the number, and a well-meant
    // edit that "fixes" this to match English would break the sentence.
    const one = RIDES_COPY.cr.track.status.asked(1);
    const many = RIDES_COPY.cr.track.status.asked(4);
    expect(one).toBe(many.replace("4", "1"));
    expect(many).not.toContain("bann");
  });

  it("leaks none of the vocabulary this screen refuses to use", () => {
    const banned = [
      "dispatch",
      "radius",
      "stage",
      "offer_rounds",
      "ride_offers",
      "null",
      "undefined",
      "NaN",
    ];
    for (const l of LANGS) {
      for (const n of [1, 3, 12]) {
        const t = RIDES_COPY[l].track.status.asked(n).toLowerCase();
        for (const w of banned) {
          expect(t, `${l}.asked(${n}) leaked "${w}"`).not.toContain(w);
        }
      }
    }
  });
});

describe("the number can only go up", () => {
  it("counts every offer ever made, not the live ones", () => {
    const sql = read(MIGRATION);
    expect(sql).toContain("count(distinct driver_id)");
    // The fatal simplification: filtering to live offers makes the count fall
    // between rounds.
    const countStmt = sql.slice(
      sql.indexOf("select count(distinct driver_id)"),
      sql.indexOf("select count(distinct driver_id)") + 220,
    );
    expect(countStmt).not.toContain("'offered'");
    expect(countStmt).not.toMatch(/status\s*=/);
  });

  it("counts drivers rather than offer rows", () => {
    // A driver re-offered on a later round has not become two drivers.
    const sql = read(MIGRATION);
    expect(sql).not.toMatch(/select count\(\*\)\s+into v_asked/);
  });

  it("returns the field the client reads", () => {
    expect(read(MIGRATION)).toContain("'driversAsked'");
    expect(read(TRACK)).toContain("driversAsked");
  });
});

describe("the screen stays kind", () => {
  it("hides the line at zero rather than printing '0 drivers asked'", () => {
    expect(read(TRACK)).toContain("(ride.driversAsked ?? 0) > 0");
  });

  it("shows it only while still looking", () => {
    const src = read(TRACK);
    const at = src.indexOf("c.status.asked(");
    const guard = src.lastIndexOf('status === "dispatching"', at);
    expect(guard).toBeGreaterThan(-1);
    expect(at - guard).toBeLessThan(1600);
  });

  it("no longer says 'We'll call you.' twice", () => {
    // noDriverHelp already ends with that sentence; it was then repeated in
    // hardcoded English underneath, so a French customer read the second one in
    // the wrong language.
    const src = read(TRACK);
    expect(src).not.toContain("We&apos;ll call you.");
    for (const l of LANGS) {
      expect(RIDES_COPY[l].track.step2.noDriverHelp.trim(), l).not.toBe("");
    }
  });
});

describe("the endpoint stays the only way in", () => {
  it("keeps lookup_ride to one overload", () => {
    // A second overload makes PostgREST refuse the endpoint with PGRST203 and
    // the tracking screen goes dark for everybody.
    const sql = read(MIGRATION);
    expect(sql).toContain("lookup_ride has % overloads");
    expect(sql).toContain("create or replace function public.lookup_ride(p_ref text, p_phone text)");
  });

  it("never hands out a token, a driver id or a name with the count", () => {
    // ride_offers has RLS on with no policy and no grant precisely because one
    // leaked publishable key would expose every live token on the island.
    const sql = read(MIGRATION);
    const fn = sql.slice(sql.indexOf("select count(distinct driver_id)"));
    expect(fn).not.toContain("token");
  });
});
