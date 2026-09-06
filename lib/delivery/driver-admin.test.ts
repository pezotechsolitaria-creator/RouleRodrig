import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");

// Source guards. Every rule that matters lives in SQL — admin_set_driver_roles,
// driver_delivery_log and two table CHECKs — where a TypeScript test cannot
// reach. What regresses silently in this repo is the wiring: an action that
// stops being routed, an endpoint that starts leaking, a number summed from the
// wrong rows.

describe("the per-driver errands toggle", () => {
  const api = read("app/api/admin/deliveries/route.ts");
  const board = read("app/admin/deliveries/DeliveryBoard.tsx");

  it("is a routed action, not just a button", () => {
    expect(api).toMatch(/z\.literal\("driver_roles"\)/);
    expect(api).toMatch(/admin_set_driver_roles/);
    expect(board).toMatch(/action: "driver_roles"/);
  });

  it("passes BOTH roles every time, never one", () => {
    // The RPC writes what it is given. Sending only the flag that changed would
    // silently clear the other one — turning errands off would also stop
    // offering the person parcels, which is exactly the outcome this toggle
    // exists to avoid.
    expect(board).toMatch(/canDeliver:[\s\S]{0,90}canRunErrands:/);
  });

  it("shows the operator the refusal instead of a dead button", () => {
    // admin_set_driver_roles raises RR089 for "both off" with a sentence
    // written to be acted on. Without this mapping it became a generic 500 and
    // the toggle just stopped working with no explanation.
    expect(api).toMatch(/RR089/);
    expect(api).toMatch(/error\.code === BAD_INPUT/);
    expect(api).toMatch(/BAD_INPUT[\s\S]{0,80}status: 400/);
  });
});

describe("the account page lists both consoles", () => {
  const roles = read("lib/account/roles.ts");

  it("offers the errands door to somebody who has it", () => {
    // This page exists because the platform grew a console per role and the
    // only way to reach yours was to know the URL. Adding a second provider
    // console without listing it would recreate that exact problem.
    expect(roles).toMatch(/key: "errands"/);
    expect(roles).toMatch(/href: "\/errands"/);
    expect(roles).toMatch(/can_run_errands/);
  });

  it("does not hide a working driver's own door on an old row", () => {
    // A row read before the column existed comes back undefined. Treating that
    // as "no deliveries" would take the driver console away from an active
    // driver — so the test is `!== false`, not truthiness.
    expect(roles).toMatch(/can_deliver !== false/);
  });

  it("reads the roles it branches on", () => {
    expect(roles).toMatch(/select\(\s*"id, full_name, status, can_deliver, can_run_errands"/);
  });
});

describe("the 30-day log", () => {
  const api = read("app/api/driver/log/route.ts");
  const ui = read("app/driver/DeliveryLog.tsx");
  const dash = read("app/driver/DriverDashboard.tsx");

  it("takes no driver id", () => {
    // current_driver() keys on auth.uid(), so the RPC can only ever return the
    // caller's own history. An id parameter here would be the one way to turn
    // this into a read of somebody else's earnings.
    expect(api).not.toMatch(/driverId|p_driver_id/);
  });

  it("bounds the window rather than trusting the query string", () => {
    expect(api).toMatch(/Math\.min\(Math\.max\(Math\.trunc\(raw\), 1\), 90\)/);
  });

  it("is not on the 20-second poll", () => {
    // The dashboard re-fetches /api/driver every 20s. A month of finished work
    // does not change on that cadence, and riding along would spend a driver's
    // island data on history they are not looking at.
    expect(dash).not.toMatch(/driver\/log/);
    expect(ui).toMatch(/if \(next && !log && !busy\) void load\(\)/);
  });

  it("never prints money against a job that was not delivered", () => {
    // A cancelled delivery still carries driver_earning on its row. Printing it
    // beside the word "cancelled" reads as money owed.
    expect(ui).toMatch(/done \?[\s\S]{0,200}centsToDecimalString\(r\.earning/);
    expect(ui).toMatch(/&mdash;|—/);
  });

  it("tells a driver when the fetch failed rather than showing an empty month", () => {
    // "You earned nothing" and "we could not load it" look identical on screen,
    // and the first is the worse thing to say by accident.
    expect(ui).toMatch(/Could not load your history/);
  });

  it("narrows to errands on the errands console", () => {
    expect(ui).toMatch(/only === "errand" \? r\.requestKind === "errand" : true/);
    expect(dash).toMatch(/<DeliveryLog only=\{only\} \/>/);
  });
});

describe("no JSX attribute wraps an expression in quotes", () => {
  // Found while adding the errands door to /account: `title="{t.account.
  // helpGuides}"` is a STRING, so the page rendered the braces verbatim. Four
  // of them had accumulated, and the worst was a review box whose placeholder
  // read "{t.rating.reviewExample}" to every customer rating a shop.
  //
  // It type-checks, it lints, and it renders — the only thing that catches it
  // is looking. So: look, on every run.
  const FILES = [
    "app/account/page.tsx",
    "app/account/DriverCodeBox.tsx",
    "components/orders/RateShopCard.tsx",
    "components/orders/ReceiptUploader.tsx",
  ];

  it.each(FILES)("%s", (file) => {
    const bad = readFileSync(file, "utf8").match(/="\{[a-zA-Z_$][^"]*\}"/g);
    expect(
      bad?.join(", "),
      `${file} has a JSX attribute quoting an expression — it will render the braces.`,
    ).toBeUndefined();
  });
});
