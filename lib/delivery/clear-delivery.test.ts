import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");

// ── Clearing a delivery off the control centre ───────────────────────────────
//
// The owner: "make me able to clear deliveries in admin dashboard."
//
// The board is built around EXCEPTIONS — anything late or stuck sorts to the
// top and wears colour, so a calm page means nothing is wrong. Four rows left
// over from testing sat on it, one stuck at requires_admin for ever. That is
// worse than clutter: it teaches somebody to ignore the colour.
//
// The rules that matter here live in SQL (admin_clear_delivery and three
// readers). These guard the wiring, and above all the two decisions that make
// this safe rather than merely convenient.

describe("clearing archives, and never deletes", () => {
  const api = read("app/api/admin/deliveries/route.ts");
  const board = read("app/admin/deliveries/DeliveryBoard.tsx");

  it("is a routed action with an undo", () => {
    expect(api).toMatch(/z\.literal\("clear_delivery"\)/);
    expect(api).toMatch(/admin_clear_delivery/);
    expect(api).toMatch(/undo: z\.boolean\(\)/);
    expect(board).toMatch(/action: "clear_delivery"/);
  });

  it("never issues a delete", () => {
    // `deliveries` feeds the driver's 30-day log and their earnings. Removing a
    // row would silently change what somebody is shown they were paid, and a
    // mistaken clear would be unrecoverable.
    expect(api).not.toMatch(/\.delete\(\)/);
    expect(board).not.toMatch(/action: "delete/);
  });

  it("tells the operator the record is kept", () => {
    // A button called "Clear" reads as "destroy" unless it says otherwise, and
    // an operator who believes that will avoid using it on anything real.
    expect(board).toMatch(/The record is kept and this can be undone/);
  });
});

describe("a job that is still running cannot be cleared", () => {
  // Somebody may be holding a customer's package. Clearing it would take the
  // job off the board while the parcel is in a van AND off the driver's screen
  // while they are carrying it — which is exactly how a delivery gets lost with
  // nobody watching.
  //
  // The RPC refuses with RR089 and the sentence "Cancel it first, then clear
  // it." The button is deliberately NOT disabled: a refusal that says what to
  // do next is more use than a grey button with no explanation.
  const board = read("app/admin/deliveries/DeliveryBoard.tsx");
  const api = read("app/api/admin/deliveries/route.ts");

  it("surfaces the refusal instead of a dead button", () => {
    // RR089 is mapped to a 400 with the RPC's own message; without that
    // mapping it became a generic 500 and the button just stopped working.
    expect(api).toMatch(/BAD_INPUT/);
    expect(api).toMatch(/error\.code === BAD_INPUT/);
  });

  it("does not grey the button out on a guess", () => {
    // The client would have to duplicate the list of terminal statuses to do
    // that, and a second copy of that rule is one that drifts.
    expect(board).toMatch(/action: "clear_delivery", deliveryId: d\.id \}\)/);
    expect(board).not.toMatch(/disabled=\{[^}]*requires_admin/);
  });
});
