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
    expect(ui).toMatch(/if \(next && !log && !busy\) void load\(days\)/);
  });

  it("tells a driver when the fetch failed rather than showing an empty month", () => {
    // "You earned nothing" and "we could not load it" look identical on screen,
    // and the first is the worse thing to say by accident.
    expect(ui).toMatch(/Could not load your history/);
  });

  it("narrows to errands on the errands console", () => {
    expect(dash).toMatch(/<DeliveryLog only=\{only\} \/>/);
  });
});

describe("the driver and the owner read ONE log", () => {
  // The point of the whole arrangement. A driver asks what they are owed for
  // last week; two screens exist to settle it. If either the query or the
  // rendering forks, the pay dispute is settled by two numbers that disagree —
  // which is worse than having no screen at all.
  const view = read("components/delivery/DeliveryLogView.tsx");
  const driverSide = read("app/driver/DeliveryLog.tsx");
  const adminSide = read("app/admin/deliveries/DriverLog.tsx");
  const adminApi = read("app/api/admin/deliveries/route.ts");

  it("draws the rows with the same component on both sides", () => {
    for (const [name, src] of [["driver", driverSide], ["admin", adminSide]] as const) {
      expect(src, `${name} side stopped using the shared view`).toMatch(
        /import DeliveryLogView/,
      );
      expect(src).toMatch(/<DeliveryLogView/);
    }
  });

  it("counts money from the same rule in the one place it is written", () => {
    // Delivered only. A cancelled job still carries driver_earning, and on the
    // owner's screen that number becomes an argument with a driver.
    expect(view).toMatch(/done \?[\s\S]{0,200}centsToDecimalString\(r\.earning/);
    expect(view).toMatch(/—/);
  });

  it("offers the export from the one shared view, so both sides get it", () => {
    // The button lives beside the total it is a copy of, in the shared
    // component — so the owner settling pay and the driver checking it are
    // downloading the same rows from the same code.
    expect(view).toMatch(/logToCsv/);
    expect(view).toMatch(/logFileName/);
    // The BOM, as an escape rather than an invisible byte in the source.
    expect(view).toContain("uFEFF");
    // And the BOM must be an ESCAPE, not a raw byte: an invisible
    // character in source is one somebody deletes without seeing it.
    expect(view).not.toContain("﻿");
  });

  it("routes the admin read through the shared SQL, not a second query", () => {
    expect(adminApi).toMatch(/admin_driver_log/);
  });

  it("validates the driver id before handing it to Postgres", () => {
    // A malformed id should be a 400 the operator can read, not a 500 from a
    // failed cast.
    expect(adminApi).toMatch(/UUID\.test\(driverLog\)/);
  });

  it("fetches through the one shared hook", () => {
    // The third thing that must not fork. The endpoints differ and who they may
    // ask about differs; everything around the fetch — the window, the cache,
    // the failure text — is the same on both sides, and a difference there is
    // only ever a bug.
    for (const [name, src] of [["driver", driverSide], ["admin", adminSide]] as const) {
      expect(src, `${name} side stopped using the shared hook`).toMatch(
        /useDeliveryLog/,
      );
      expect(src).toMatch(/LOG_RANGES\.map/);
    }
  });

  it("keeps the history off the board's 15-second poll", () => {
    // Loading a month of history for every driver on the roster, every tick,
    // to render something nobody has opened.
    expect(adminSide).toMatch(/if \(next && !log && !busy\) void load\(days\)/);
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
