import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PERSON_KINDS,
  KIND_LABEL,
  SEGMENT_LABEL,
  capabilitiesOf,
  missingProfileFields,
  type PersonKind,
} from "./people";

// ── AN OPS DESK THAT CANNOT SEE SEVEN OF ITS PEOPLE IS NOT AN OPS DESK ──────
//
// The desk covered merchants and delivery partners. Five event organisers and
// two kitchens were operating on the platform and appeared on it nowhere.

describe("the kinds the desk covers", () => {
  it("covers every group that has its own table and its own rows", () => {
    expect([...PERSON_KINDS].sort()).toEqual(["driver", "kitchen", "merchant", "organizer"]);
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

  // The decision worth defending, because the owner asked for taxi and errands
  // AS KINDS and they are not.
  it("does NOT split a driver into taxi and errands", () => {
    // Deliveries and errands are columns on ONE delivery_drivers row
    // (can_deliver, can_run_errands). Two kinds would list the same human
    // twice and let an admin approve one half of them.
    expect(PERSON_KINDS).not.toContain("taxi" as PersonKind);
    expect(PERSON_KINDS).not.toContain("errands" as PersonKind);
  });

  it("does NOT invent a service-provider kind before its table exists", () => {
    // trade_providers is designed and unbuilt. A tab whose query returns
    // nothing teaches an admin the desk is broken.
    expect(PERSON_KINDS).not.toContain("service" as PersonKind);
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
