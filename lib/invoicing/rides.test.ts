import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RIDE_SERVICES, RIDE_SERVICE_META, rideReference } from "@/lib/rides/model";
import { SUBJECTS, supportedSubjects } from "./subjects";

const readSql = (file: string) =>
  readFileSync(join(process.cwd(), "supabase", "migrations", file), "utf8")
    // SQL comments stripped: this migration explains itself at length, and an
    // assertion that reads prose fails on its own documentation.
    .replace(/^\s*--.*$/gm, "");
const readTs = (...p: string[]) =>
  readFileSync(join(process.cwd(), ...p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const M203 = readSql("20260917170000_m203_the_third_subject_is_a_ride.sql");
const ISSUABLE = readTs("app", "api", "admin", "invoices", "issuable", "route.ts");

// ── THE REFERENCE THE CUSTOMER ALREADY HOLDS ────────────────────────────────
//
// A ride is tracked at /taxi/track?ref=RR-XXXXXX. If the invoice carries a
// different string, the document cannot be tied to anything the customer has,
// and every one generates an email instead of settling one. Two implementations
// of the same rule — one in TypeScript, one in SQL — is exactly the shape that
// drifts, so both are pinned here.
describe("the invoice reference is the ride reference", () => {
  it("is the first six hex of the id, uppercased, in TypeScript", () => {
    expect(rideReference("6493d3a1-0000-4000-8000-000000000000")).toBe("RR-6493D3");
  });

  it("is built the same way in SQL", () => {
    expect(M203).toContain("'RR-' || upper(substr(replace(r.id::text,'-',''), 1, 6))");
  });

  it("matches what the picker offers", () => {
    expect(ISSUABLE).toContain("reference: rideReference(r.id)");
  });
});

// ── ONE SET OF WORDS FOR A SERVICE ──────────────────────────────────────────
describe("the document uses the site's own service names", () => {
  it("spells every service exactly as RIDE_SERVICE_META does", () => {
    for (const s of RIDE_SERVICES) {
      expect(M203, s).toContain(`when '${s}'`);
      expect(M203, s).toContain(`'${RIDE_SERVICE_META[s].label}'`);
    }
  });

  it("falls back rather than printing a raw enum value", () => {
    // A service added to the database before this function is updated must not
    // put "hotel" on a customer's invoice.
    expect(M203).toContain("else 'Transfer'");
  });

  it("does not print ' to ' when there is nowhere to go", () => {
    // A private day hire has no dropoff at all.
    expect(M203).toContain("' — from ' || btrim(r.pickup_label)");
  });
});

// ── CENTS, AND NOTHING MULTIPLIES THEM ──────────────────────────────────────
describe("a fare is already in minor units", () => {
  it("is recorded as cents, raw, with no arithmetic", () => {
    expect(M203).toMatch(/elsif p_subject_type = 'ride_request' then[\s\S]*?v_unit\s*:=\s*'cents';\s*\n\s*v_cents\s*:=\s*v_raw;/);
  });

  it("is the only unit the map claims for it", () => {
    expect(SUBJECTS.ride_request.unit).toBe("cents");
    expect(SUBJECTS.ride_request.amountColumn).toBe("quoted_price");
  });

  it("reaches the picker unconverted", () => {
    expect(ISSUABLE).toContain("totalCents: r.quoted_price");
  });

  it("multiplies by 100 exactly as often as there are rupee subjects", () => {
    // This read `toBe(1)` while bookings.total_amount was the only rupee
    // source, which made the next rupee subject a failing test rather than a
    // passing one. Derived from the registry now — the invariant is that a
    // cents subject is never multiplied, not that there is exactly one rupee
    // subject in the world.
    const multiplications = ISSUABLE.match(/\*\s*100/g) ?? [];
    const rupeeSubjects = supportedSubjects().filter((k) => SUBJECTS[k].unit === "rupees");
    expect(multiplications.length).toBe(rupeeSubjects.length);
    expect(ISSUABLE).toContain("totalCents: b.total_amount * 100");
  });
});

// ── WHAT IS NOT OFFERED ─────────────────────────────────────────────────────
describe("the picker offers only rides that can actually be invoiced", () => {
  it("skips a ride with no quote", () => {
    // invoice_issue() raises on a null total; a button that always errors is
    // worse than no button.
    expect(ISSUABLE).toContain('.not("quoted_price", "is", null)');
  });

  it("skips a cancelled ride", () => {
    expect(ISSUABLE).toMatch(/from\("ride_requests"\)[\s\S]*?\.neq\("status", "cancelled"\)/);
  });

  it("skips one that already has a live invoice", () => {
    expect(ISSUABLE).toContain("done.has(`ride_request:${r.id}`)");
  });
});

describe("the subject is open for business", () => {
  it("is supported, with no pending excuse left behind", () => {
    expect(SUBJECTS.ride_request.supported).toBe(true);
    expect(SUBJECTS.ride_request.pending).toBeUndefined();
    expect(supportedSubjects()).toContain("ride_request");
  });

  it("still refuses everything without an adapter", () => {
    expect(M203).toContain("is not supported yet");
  });

  it("re-asserts that no public role can issue a document in the company's name", () => {
    expect(M203).toContain("raise exception 'anon can issue invoices'");
    expect(M203).toContain("raise exception 'authenticated can issue invoices'");
  });
});
