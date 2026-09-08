import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");

// ── "DELIVERY STOPS AT SOME POINT LIKE IT SAYS ERROR" ───────────────────────
//
// Five dead ends, all reachable on a phone, all ending in an error the person
// cannot get past. Each is pinned here because each was invisible: none of them
// ever reached Sentry (see the last block).

describe("both ways to pay can be shut, and Confirm must not fire", () => {
  const src = read("app/deliver/[id]/RequestTracker.tsx");

  it("the default is never a disabled option", () => {
    // `cashAllowed || !transferAllowed ? "cash" : "bank_transfer"` selected
    // CASH when neither was allowed — the greyed one — and both buttons were
    // disabled so it could not be changed.
    // Checked on the useState CALL, not the whole file — the comment above it
    // quotes the old expression while explaining what it did wrong.
    const call = src.slice(
      src.indexOf("const [method, setMethod] = useState<PaymentMethod>("),
    ).slice(0, 400);
    expect(call).toMatch(/cashAllowed \? "cash" : "bank_transfer"/);
    expect(call).not.toMatch(/cashAllowed \|\| !transferAllowed/);
  });

  it("Confirm is dead when neither method can be taken", () => {
    // It was `disabled={busy}` only, so the one tappable control sent a
    // request the server was certain to refuse.
    expect(src).toMatch(/const canPay = cashAllowed \|\| transferAllowed/);
    expect(src).toMatch(/disabled=\{busy \|\| !canPay\}/);
  });

  it("and it says so before the tap, in three languages", () => {
    expect(src).toContain("c.pay.noWayToPay");
    const copy = read("lib/delivery/copy.i18n.ts");
    expect(copy.match(/noWayToPay:/g) ?? []).toHaveLength(3);
  });
});

describe("every camera upload shrinks first", () => {
  it("including the vehicle handover, which is a HARD stop", () => {
    // Its submit is disabled until photos.length > 0 — "the whole feature is
    // this rule" — so a phone that shoots over 4 MB meant the driver could not
    // record the handover at all, standing at the customer's car.
    const src = read("app/driver/VehicleHandover.tsx");
    expect(src).toContain("shrinkImage");
    expect(src).toMatch(/const file = await shrinkImage\(input\)/);
  });

  it("all five inputs are covered", () => {
    const files = [
      "app/deliver/PhotoInput.tsx",
      "app/deliver/[id]/RequestTracker.tsx",
      "app/driver/VehicleHandover.tsx",
    ];
    for (const f of files) expect(read(f)).toContain("shrinkImage");
  });
});

describe("a rejected photo can be picked again", () => {
  it("every file input clears itself", () => {
    // Without this, re-choosing THE SAME file fires no change event and the
    // button appears dead — which is the first thing anyone tries after a
    // rejection.
    for (const f of [
      "app/deliver/PhotoInput.tsx",
      "app/deliver/[id]/RequestTracker.tsx",
    ]) {
      expect(read(f).match(/e\.target\.value = ""/g) ?? []).toHaveLength(2);
    }
    expect(read("app/driver/VehicleHandover.tsx")).toMatch(
      /fileRef\.current\.value = ""/,
    );
  });
});

describe("a signal blip is not a dead driver link", () => {
  const src = read("app/d/[token]/DriverHome.tsx");

  it("the response is checked before it is believed", () => {
    // Every failure landed on setHome({ ok: false }) → "This link has stopped
    // working", a screen whose only way out is asking the office for a new
    // code. load() re-runs after every toggle and every advance.
    expect(src).toMatch(/if \(!r\.ok \|\| !body\)/);
    expect(src).toMatch(/r\.json\(\)\.catch\(\(\) => null\)/);
  });

  it("it offers a retry instead of a funeral", () => {
    expect(src).toContain("No signal just now");
    expect(src).toContain("Try again");
  });

  it("a failed poll does not wipe a working console", () => {
    expect(src).toMatch(/if \(!home && unreachable\)/);
  });
});

describe("route-level errors are finally recorded", () => {
  it("app/error.tsx reports to Sentry like global-error does", () => {
    // It carried the comment "hook for an error tracker (Sentry, etc.)" and
    // called none. Every route crash in the delivery journey was unrecorded,
    // which is why Sentry has nothing on /deliver — not because it is healthy.
    const src = read("app/error.tsx");
    expect(src).toContain('from "@sentry/nextjs"');
    expect(src).toMatch(/Sentry\.captureException\(error\)/);
  });
});
