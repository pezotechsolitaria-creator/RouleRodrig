import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// ── "Everyone can do it, but the admin confirms first" ──────────────────────
//
// These are source guards, not unit tests, and that is deliberate: every rule
// that matters here lives in SQL (driver_open_requests, offer_delivery_quote,
// apply_as_driver, and two table CHECKs), where a TypeScript test cannot reach
// it. What CAN regress silently in this repo is the wiring around them — a
// page that forgets its gate, a form that stops sending the role, a console
// that shows an errand runner somebody else's parcel run.

const read = (p: string) => readFileSync(p, "utf8");

describe("the errand runner's console", () => {
  const page = read("app/errands/page.tsx");

  it("refuses anybody the admin has not confirmed", () => {
    // The whole of the owner's condition. Without the status check this page
    // would open the board to every signed-in account that had ever filled in
    // the form — the SQL would still return nothing, so the failure would look
    // like an empty screen rather than like a hole.
    expect(page).toMatch(/status !== "approved"/);
    expect(page).toMatch(/redirect\("\/driver"\)/);
  });

  it("refuses somebody who did not sign up for errands", () => {
    expect(page).toMatch(/can_run_errands/);
  });

  it("sends a person with no account to apply, not to an empty board", () => {
    expect(page).toMatch(/redirect\("\/errands\/join"\)/);
  });

  it("shows only errand work", () => {
    // The point of the route. A runner who sees parcel jobs they cannot carry
    // learns to ignore the board.
    expect(page).toMatch(/only="errand"/);
  });

  it("reuses the one dashboard rather than forking it", () => {
    // If this ever stops importing DriverDashboard, somebody has started a
    // second copy of quoting, accepting, the handover PIN and the money — four
    // things that must never differ between two consoles.
    expect(page).toMatch(/import DriverDashboard from/);
  });
});

describe("the dashboard filter", () => {
  const dash = read("app/driver/DriverDashboard.tsx");

  it("narrows both the board and the work already taken", () => {
    // Filtering only the open board would leave an accepted parcel job sitting
    // on the errands console with no way to explain why it is there.
    expect(dash).toMatch(/only === "errand"[\s\S]{0,120}r\.kind === "errand"/);
    expect(dash).toMatch(/only === "errand"[\s\S]{0,160}a\.requestKind === "errand"/);
  });

  it("does not narrow the driver console", () => {
    // Somebody approved for both should find ALL their work on /driver rather
    // than having to remember which screen a job arrived on.
    expect(dash).toMatch(/:\s*allActive;/);
  });
});

describe("signing up", () => {
  const form = read("app/driver/apply/ApplyForm.tsx");
  const api = read("app/api/driver/apply/route.ts");
  const join = read("app/errands/join/page.tsx");

  it("asks what kind of work, and sends the answer", () => {
    expect(form).toMatch(/canDeliver/);
    expect(form).toMatch(/canRunErrands/);
    expect(form).toMatch(/canDeliver,\s*canRunErrands,/);
    expect(api).toMatch(/p_can_run_errands/);
  });

  it("will not let somebody apply to do nothing", () => {
    // Three layers say this — a table CHECK, the RPC, and here. This one is the
    // only one that can answer before the person presses anything.
    expect(form).toMatch(/noWorkChosen/);
    // And the button must be disabled, not merely inert: a submit that returns
    // early looks broken rather than blocked.
    expect(form).toMatch(/disabled=\{busy \|\| !terms \|\| noWorkChosen/);
  });

  it("does not pre-select a vehicle on the no-vehicle door", () => {
    // /errands/join promises "no vehicle needed". Defaulting the field to
    // "scooter" there would quietly contradict the promise above it.
    expect(form).toMatch(/defaultRole === "errand" \? "foot" : "scooter"/);
    expect(join).toMatch(/defaultRole="errand"/);
  });

  it("tells the applicant about the approval step before they fill it in", () => {
    // Somebody who expects to start this afternoon and then hears nothing has
    // been misled by the page, not by the queue.
    expect(join).toMatch(/confirms your account before any job reaches you/i);
  });

  it("shares the one application form", () => {
    expect(join).toMatch(/import ApplyForm from/);
  });
});

describe("what the admin is asked to confirm", () => {
  it("names the role on the card and in the alert", () => {
    // "New application" made every applicant look identical. An errand runner
    // on foot is a different decision from a lorry driver.
    expect(read("app/admin/deliveries/DeliveryBoard.tsx")).toMatch(/canRunErrands/);
    expect(read("app/api/driver/apply/route.ts")).toMatch(/New errand runner application/);
  });
});
