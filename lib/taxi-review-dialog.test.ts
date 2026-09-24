import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = readFileSync(join(process.cwd(), "app", "taxi", "page.tsx"), "utf8");
const REFERENCE = readFileSync(
  join(process.cwd(), "app", "deliver", "[id]", "RequestTracker.tsx"),
  "utf8",
);

// ── A KEYBOARD USER WAS TRAPPED BEHIND IT ───────────────────────────────────
//
// The driver review panel was a plain motion.div: no role, no aria-modal, no
// Escape, no focus move and no focus restore. Tab walked straight through the
// backdrop into the driver grid behind it, nothing announced that a dialog had
// opened, and the only way out was a mouse click — on a page whose whole point
// is that you can use it from a phone by the roadside.
//
// The repo already does this correctly elsewhere. This asserts the taxi page
// caught up, and that the reference it copied has not itself regressed.

describe("the driver review dialog announces itself", () => {
  it("is a dialog, and a modal one", () => {
    expect(SRC).toContain('role="dialog"');
    expect(SRC).toContain('aria-modal="true"');
  });

  it("is named by the driver's own heading", () => {
    // aria-label would have been a second copy of the name; labelledby points
    // at the one already on screen.
    expect(SRC).toContain("aria-labelledby={headingId}");
    expect(SRC).toContain("id={headingId}");
  });

  it("closes on Escape", () => {
    expect(SRC).toContain('e.key === "Escape"');
    expect(SRC).toContain('document.addEventListener("keydown"');
    // And unbinds: a listener per open is a listener per open, forever.
    expect(SRC).toContain('document.removeEventListener("keydown"');
  });

  it("moves focus in, and gives it back", () => {
    expect(SRC).toContain("panelRef.current?.focus()");
    // Without the restore, dismissing the dialog drops a keyboard user at the
    // top of the document rather than back on the button they pressed.
    expect(SRC).toContain("opener?.focus?.()");
  });

  it("takes its close label from the dictionary", () => {
    expect(SRC).toContain("aria-label={tx.close}");
    expect(SRC).not.toContain('aria-label="Close"');
  });
});

describe("the implementation it was modelled on still holds", () => {
  it("the delivery sheet is still a labelled modal dialog", () => {
    // If the reference regresses, the next person copying it inherits the bug.
    expect(REFERENCE).toContain('role="dialog"');
    expect(REFERENCE).toContain('aria-modal="true"');
  });
});
