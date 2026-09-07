import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PERSON_KINDS,
  KIND_LABEL,
  SEGMENT_LABEL,
  capabilitiesOf,
  taxiCapabilitiesOf,
  availabilityLabelFor,
  missingProfileFields,
  type PersonKind,
} from "./people";

// ── AN OPS DESK THAT CANNOT SEE SEVEN OF ITS PEOPLE IS NOT AN OPS DESK ──────
//
// The desk covered merchants and delivery partners. Five event organisers and
// two kitchens were operating on the platform and appeared on it nowhere.

describe("the kinds the desk covers", () => {
  it("covers every group that has its own table and its own rows", () => {
    expect([...PERSON_KINDS].sort()).toEqual([
      "driver",
      "kitchen",
      "merchant",
      "organizer",
      "service",
      "taxi",
    ]);
  });

  it("labels every kind, singular and plural, with nothing blank", () => {
    for (const k of PERSON_KINDS) {
      expect(KIND_LABEL[k].one.trim(), `no singular for ${k}`).not.toBe("");
      expect(KIND_LABEL[k].many.trim(), `no plural for ${k}`).not.toBe("");
      expect(SEGMENT_LABEL[k].trim(), `no segment word for ${k}`).not.toBe("");
    }
  });

  it("gives no two kinds the same plural", () => {
    const many = PERSON_KINDS.map((k) => KIND_LABEL[k].many);
    expect(new Set(many).size).toBe(many.length);
  });

  // ── A KIND IS A TABLE, NOT A JOB TITLE ──────────────────────────────────
  //
  // This assertion used to bar taxi as well as errands, on one rule: "two kinds
  // would list the same human twice and let an admin approve one half of them".
  // That rule is right, and it was being applied to two different situations.
  //
  // ERRANDS is a COLUMN. delivery_drivers.can_run_errands sits on the same row
  // as can_deliver, and the schema was checked again before this was changed:
  // those two are the only can_* columns on the table and there is no taxi
  // column anywhere on it. Splitting that row in two would produce two half-
  // people out of one, which is exactly what the original rule forbids.
  //
  // TAXI is a TABLE. taxi_drivers has its own rows, its own `active` switch,
  // its own driver_token, its own public page, and columns delivery_drivers has
  // never had — seats, luggage, airport runs. Exactly one user_id appears in
  // both tables today, and it is the owner's own preview account rather than a
  // real person listed twice. Where a genuine overlap does happen it is not the
  // duplication this rule was written against: that person is a courier AND a
  // taxi driver, holding two listings that must switch independently, because
  // suspending them as a courier must not take their car off the rank.
  it("does NOT split a driver into errands, which is a column on their row", () => {
    expect(PERSON_KINDS).not.toContain("errands" as PersonKind);
  });

  it("DOES list taxi drivers, because they are their own table", () => {
    expect(PERSON_KINDS).toContain("taxi" as PersonKind);
  });

  it("asks a taxi driver what they drive", () => {
    expect(missingProfileFields("taxi", { email: "n/a", phone: "1", segment: "" })).toEqual([
      "Vehicle type",
    ]);
    expect(
      missingProfileFields("taxi", { email: "n/a", phone: "1", segment: "Minivan" }),
    ).toEqual([]);
  });

  it("names what a taxi actually takes, and only what is true", () => {
    expect(
      taxiCapabilitiesOf({ handlesTaxi: true, handlesAirport: true, handlesTransfer: false }),
    ).toEqual(["Taxi", "Airport"]);
    expect(taxiCapabilitiesOf({})).toEqual([]);
  });

  it("does not tell a taxi driver they are on a delivery", () => {
    // One label map for both kinds would have been shorter and would have put
    // the wrong word on a real screen.
    expect(availabilityLabelFor("taxi", "busy")).toBe("On a ride");
    expect(availabilityLabelFor("driver", "busy")).toBe("On a delivery");
    expect(availabilityLabelFor("taxi", "available")).toBe("Online");
  });

  it("covers service providers now that trade_providers exists", () => {
    // This assertion used to say the opposite, and was right to: a tab whose
    // query returns nothing teaches an admin the desk is broken. The table
    // arrived in m177 with a real provider in it, and the exclusion became the
    // lie instead.
    expect(PERSON_KINDS).toContain("service" as PersonKind);
  });

  it("asks a trade what it actually is", () => {
    // A customer is choosing "car wash" or "plumber", not a business name they
    // have never heard of.
    expect(missingProfileFields("service", { email: "n/a", phone: "1", segment: "" })).toEqual([
      "Trade",
    ]);
  });
});

describe("capabilities, which is how errands are actually shown", () => {
  it("names both when a partner does both, as most here do", () => {
    expect(capabilitiesOf({ canDeliver: true, canRunErrands: true })).toEqual([
      "Deliveries",
      "Errands",
    ]);
  });

  it("names only what is true", () => {
    expect(capabilitiesOf({ canDeliver: false, canRunErrands: true })).toEqual(["Errands"]);
    expect(capabilitiesOf({ canDeliver: true, canRunErrands: false })).toEqual(["Deliveries"]);
  });

  it("returns nothing rather than guessing when both are null", () => {
    expect(capabilitiesOf({ canDeliver: null, canRunErrands: null })).toEqual([]);
    expect(capabilitiesOf({})).toEqual([]);
  });
});

describe("what counts as an incomplete profile", () => {
  it("asks a restaurant where to collect, which is the field this island needs", () => {
    // "Green gate beside the market" is worth more than a street address here.
    expect(missingProfileFields("kitchen", { email: "n/a", phone: "+230 5000 0000", segment: "" }))
      .toEqual(["Where to collect"]);
  });

  it("is satisfied once a kitchen has a collection point and a phone", () => {
    expect(
      missingProfileFields("kitchen", {
        email: "n/a",
        phone: "+230 5000 0000",
        segment: "On the beach",
      }),
    ).toEqual([]);
  });

  it("still asks a merchant what they sell and a driver what they drive", () => {
    expect(missingProfileFields("merchant", { email: "a@b.co", phone: "1", segment: "" })).toEqual([
      "What they sell",
    ]);
    expect(missingProfileFields("driver", { email: "n/a", phone: "1", segment: "" })).toEqual([
      "Vehicle type",
    ]);
  });
});

describe("filling a profile in on somebody's behalf", () => {
  const route = readFileSync(
    join(process.cwd(), "app", "api", "admin", "people", "complete", "route.ts"),
    "utf8",
  );
  const ui = readFileSync(
    join(process.cwd(), "app", "admin", "people", "CompleteProfile.tsx"),
    "utf8",
  );

  it("writes ONLY contact details, never status or verification", () => {
    // An admin typing a phone number they were told is help. An admin marking
    // somebody verified from the same box is a different power entirely.
    for (const forbidden of ["status", "kyc_status", "approved_at", "verification"]) {
      expect(
        route.includes(`patch[${forbidden}]`) || route.includes(`"${forbidden}":`),
        `the complete endpoint can write ${forbidden}`,
      ).toBe(false);
    }
  });

  it("knows where every kind's details live, exhaustively", () => {
    // A Record, so a fifth kind fails the build rather than silently writing
    // nothing and reporting success.
    expect(route).toContain("const TARGET: Record<");
    for (const k of PERSON_KINDS) expect(route).toContain(`${k}: {`);
  });

  it("writes a kitchen's collection point to food_kitchens, not to stores", () => {
    expect(route).toContain('.from("food_kitchens")');
    expect(route).toContain("pickup_hint");
  });

  it("records what was typed, not merely that something changed", () => {
    expect(route).toContain("people.complete_profile");
    expect(route).toContain("filled:");
  });

  it("offers no box for a field it cannot write", () => {
    // A driver's email lives on auth.users once claimed and only they can
    // change it. A box that silently does nothing is worse than no box.
    expect(ui).toContain("missing.filter((m) => FIELD[m])");
  });
});
