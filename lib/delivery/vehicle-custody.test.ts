import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { ERRAND_LABEL, isVehicleJob, errandToColumns } from "./kind";

const read = (p: string) => readFileSync(p, "utf8");

// ── Somebody else is driving a customer's car ────────────────────────────────
//
// The owner asked whether a car could be tracked. It could not: nothing in the
// database held a plate, and the live map showed a moving dot for the person
// with no record of what they were driving.
//
// The rules below are the ones that make the difference between a record and
// EVIDENCE. Most live in SQL — a table CHECK, an RPC, two constraints — so
// these guard the wiring around them, which is what regresses silently.

describe("a car job knows which car", () => {
  it("is its own errand kind", () => {
    expect(isVehicleJob("vehicle")).toBe(true);
    expect(isVehicleJob("pay_bill")).toBe(false);
    expect(isVehicleJob(null)).toBe(false);
    expect(ERRAND_LABEL.vehicle).toMatch(/car/i);
  });

  it("does not narrow the fleet", () => {
    // The customer's car drives itself away — the driver is not carrying it.
    // Filtering on a vehicle they will not be using would shrink the pool for
    // no reason; whether they may DRIVE it is a licence question the owner
    // settles at approval, which no fleet table can answer.
    expect(errandToColumns("vehicle")).toEqual({
      sizeClass: "standard",
      cargoKind: "general",
    });
  });

  it("asks for the plate, and only on a car job", () => {
    const form = read("app/deliver/DeliverForm.tsx");
    expect(form).toMatch(/errandKind === "vehicle"/);
    expect(form).toMatch(/c\.what\.plateLabel/);
    // Required before the screen can be left — the table refuses a blank plate,
    // so asking is better than letting the post fail at the end.
    expect(form).toMatch(/errandKind !== "vehicle" \|\| plate\.trim\(\)\.length >= 2/);
  });

  it("refuses a plate on any other errand", () => {
    const api = read("app/api/delivery-requests/route.ts");
    expect(api).toMatch(/Only a car collection carries a number plate/);
  });
});

// ── THE RULE THE WHOLE FEATURE EXISTS FOR ───────────────────────────────────
describe("a handover cannot be recorded without a photograph", () => {
  // Enforced in three places: a table CHECK, the RPC, and the button. A
  // handover row with no photograph is worse than no row — it looks like proof
  // and settles nothing, and this is the only job where "it already had that
  // scratch" is an argument about real money.
  const ui = read("app/driver/VehicleHandover.tsx");
  const api = read("app/api/driver/route.ts");

  it("the button is disabled until there is one", () => {
    expect(ui).toMatch(/disabled=\{busy \|\| photos\.length === 0\}/);
  });

  it("the endpoint refuses an empty list", () => {
    expect(api).toMatch(/photos: z\.array\([\s\S]{0,120}\)\.min\(1\)/);
  });

  it("opens the camera rather than the gallery", () => {
    // A driver standing at a car should not be sent to find a picture they
    // have not taken yet.
    expect(ui).toMatch(/capture="environment"/);
  });

  it("does not let a refused location block the record", () => {
    // Where it changed hands is useful; being unable to record the handover at
    // all because somebody denied a permission is not.
    expect(ui).toMatch(/getCurrentPosition\(/);
    expect(ui).toMatch(/\(\) => done\(\{\}\)/);
  });
});

describe("what the owner sees", () => {
  const panel = read("app/admin/deliveries/VehicleCustody.tsx");
  const board = read("app/admin/deliveries/DeliveryBoard.tsx");
  const api = read("app/api/admin/deliveries/route.ts");

  it("has its own tab on the delivery desk", () => {
    expect(board).toMatch(/"cars"/);
    expect(board).toMatch(/<VehicleCustody \/>/);
  });

  it("reads through the admin RPC", () => {
    expect(api).toMatch(/admin_vehicle_custody/);
  });

  it("leads with the plate and how long the car has been gone", () => {
    // Everything else is context. A car out since yesterday is the one to ring
    // about, so it is the thing that wears colour.
    expect(panel).toMatch(/\{v\.plate\}/);
    expect(panel).toMatch(/held\(v\.heldMinutes\)/);
  });

  it("offers both phone numbers", () => {
    // The two calls an operator makes from this row are to the person holding
    // the car and the person who owns it.
    expect(panel).toMatch(/v\.driverPhone/);
    expect(panel).toMatch(/v\.customerPhone/);
  });

  it("says when a pickup photo is missing", () => {
    // Impossible through the app, but a row written any other way would leave
    // the owner with no evidence and no warning.
    expect(panel).toMatch(/no pickup photo/);
  });

  it("lets the owner actually look at the photographs", () => {
    // "3 photos at pickup" answers whether the handover was documented. It does
    // not answer the question the panel is opened with — whether the scratch
    // being complained about is already in the pickup photo.
    const viewer = read("app/admin/deliveries/VehiclePhotos.tsx");
    expect(panel).toMatch(/<VehiclePhotos/);
    expect(api).toMatch(/admin_vehicle_photos/);
    // Both handovers together: comparing them IS the feature.
    expect(viewer).toMatch(/data\?\.events\.map/);
    expect(viewer).toMatch(/collected: "At pickup"/);
    expect(viewer).toMatch(/returned: "When it came back"/);
  });

  it("signs the photos short-lived and never stores a URL", () => {
    // The bucket is private. A URL that outlived the moment somebody asked
    // would be a copy of a customer's car sitting in a browser history.
    expect(api).toMatch(/createSignedUrl\(p, 300\)/);
    // The RPC hands back PATHS; only the route turns them into URLs.
    const viewer = read("app/admin/deliveries/VehiclePhotos.tsx");
    expect(viewer).toMatch(/if \(next\) void load\(\)/);
    // Re-fetched on every open rather than cached, or a second look shows
    // broken images once the signature has expired.
    expect(viewer).not.toMatch(/if \(next && !data\)/);
  });

  it("does not let Next cache an expiring image", () => {
    expect(read("app/admin/deliveries/VehiclePhotos.tsx")).toMatch(/unoptimized/);
  });

  it("has no button that marks a car returned", () => {
    // Custody is DERIVED from the two handover rows. A status an operator can
    // set by hand is a second version of the truth, and this is the one place
    // where the two disagreeing means an argument about somebody's car.
    expect(panel).not.toMatch(/method: "POST"/);
    expect(panel).not.toMatch(/method: "PATCH"/);
  });
});
