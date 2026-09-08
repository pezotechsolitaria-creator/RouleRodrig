import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { DEAD_LEGS, PRE_PICKUP_LEGS, BROKEN_LEGS } from "./request-status";

const read = (p: string) => readFileSync(p, "utf8");

// ── THE REQUEST THAT COULD NEVER BE CLOSED ──────────────────────────────────
//
// `delivery_requests.status` goes to 'accepted' when a quote is taken and
// NOTHING ON THE SERVER EVER MOVES IT BACK — driver_cannot_complete() and
// admin_reassign_delivery() write only the deliveries row.
//
// cancel_delivery_request() has handled exactly this since m145: given a
// delivery that is cancelled, failed_delivery or returned_to_merchant it
// brings the request into line and answers true. But the page gated its only
// exit on PRE_PICKUP_LEGS, and not one of those three legs is in that list.
//
// So an operator killing a job with admin_force_delivery_status stranded the
// customer on a screen that said a driver was booked, for a job that no longer
// existed, with no control of any kind. A working server-side remedy that
// nothing in the product could reach.

describe("the legs a customer can still act on", () => {
  it("dead legs are exactly what the SQL brings into line", () => {
    // m145:399-402. If this list and that branch disagree, the button appears
    // and the request 409s.
    expect([...DEAD_LEGS].sort()).toEqual(
      ["cancelled", "failed_delivery", "returned_to_merchant"].sort(),
    );
  });

  it("does not overlap the pre-pickup window", () => {
    // They mean opposite things — one is "still stoppable", the other "already
    // over" — and one leg in both would make the label ambiguous.
    for (const leg of DEAD_LEGS) expect(PRE_PICKUP_LEGS).not.toContain(leg);
  });

  it("does not overlap the broken-but-live legs", () => {
    // BROKEN_LEGS still need a human, and the SQL does NOT accept them: a
    // request whose delivery is requires_admin must not offer a self-service
    // exit, because m145 would refuse it.
    for (const leg of DEAD_LEGS) expect(BROKEN_LEGS).not.toContain(leg);
  });
});

describe("the page offers the exit", () => {
  const src = read("app/deliver/[id]/RequestTracker.tsx");

  it("a stranded accepted request can be closed", () => {
    expect(src).toContain("DEAD_LEGS");
    expect(src).toMatch(/strandedAccepted/);
    expect(src).toMatch(/canWithdraw\s*=[\s\S]{0,120}strandedAccepted/);
  });

  it("it does not say 'withdraw' about something already over", () => {
    // "Withdraw" and "cancel" both tell the customer they are stopping
    // something that is still running. Neither is true here.
    expect(src).toContain("c.tracker.closeRequest");
  });

  it("an expired-but-unswept request stops contradicting itself", () => {
    // requestStatusCopy() calls an open request past its expiry dead long
    // before sweep_delivery_requests() reaches the row, and the button read
    // "Withdraw this request" underneath copy saying it had expired.
    expect(src).toMatch(/expiredUnswept[\s\S]{0,160}status\.tone === "dead"/);
  });
});

describe("the copy exists in every language", () => {
  it("closeRequest is not an English-only string", () => {
    // A missing key here is a crash, not a fallback: the tracker reads
    // c.tracker.closeRequest directly.
    const copy = read("lib/delivery/copy.i18n.ts");
    expect(copy.match(/closeRequest:/g) ?? []).toHaveLength(3);
  });
});

describe("cancelling tells everyone, on BOTH success paths", () => {
  it("there is one exit, not two", () => {
    // The retry path — a signed-in customer who originally posted as a guest,
    // whose ownership is proved by email — called notifyDriverOfCancellation
    // and returned, never notifyLosingDrivers. Every driver holding a standing
    // price on that request was told nothing, which is precisely the failure
    // the second call exists to prevent.
    const route = read("app/api/delivery-requests/[id]/route.ts");
    const at = route.indexOf("async function announceCancellation");
    expect(at, "the single exit is gone").toBeGreaterThan(-1);
    const helper = route.slice(at, route.indexOf("export async function POST"));

    // Both notifications live inside the one helper...
    expect(helper).toContain("await notifyDriverOfCancellation(id)");
    expect(helper).toContain("await notifyLosingDrivers(id)");

    // ...and the cancel branch reaches it twice — the ordinary path and the
    // guest-email retry — rather than hand-rolling the notifications, which
    // is how the retry came to skip one of them.
    expect(route.match(/announceCancellation\(id\)/g) ?? []).toHaveLength(2);

    // notifyLosingDrivers is also called on the ACCEPT path, which is a
    // different and correct use: accept_delivery_quote declines the others.
    // Scoped above so that one does not make this test pass or fail.
    expect(route.match(/await notifyLosingDrivers\(/g) ?? []).toHaveLength(2);
  });
});
