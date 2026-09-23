import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── THE COOK'S SCREEN, AGAINST THE SPEC IT WAS WRITTEN FROM ─────────────────
//
// This screen cannot be driven in a test or a browser without a kitchen login,
// so what follows guards the decisions that were made deliberately and would
// be silently undone by a later edit. Each one is a line or two, and none of
// them fails loudly when it goes.

const SRC = readFileSync(join(process.cwd(), "app/kitchen/KitchenBoard.tsx"), "utf8");

/** The file with comments stripped — the explanations legitimately quote the
 *  very strings some of these assertions ban. */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "")
  .split(/\r?\n/)
  .filter((l) => !l.trim().startsWith("//"))
  .join("\n");

describe("losing the server never looks like a quiet evening", () => {
  it("has a THIRD state for a failed first load", () => {
    // Before this, `if (!dash)` returned a spinner and the error banner was
    // rendered further down — unreachable. A first fetch that failed spun
    // forever on a screen propped up during service.
    expect(CODE).toMatch(/if \(!dash && error\)/);
    expect(CODE).toContain("Couldn&apos;t load your orders");
  });

  it("offers a way out of that state rather than only describing it", () => {
    const block = CODE.slice(CODE.indexOf("if (!dash && error)"));
    expect(block.slice(0, 900)).toMatch(/onClick=\{\(\) => void loadRef\.current\(\)\}/);
  });

  it("does not show the cheerful empty state while the last read failed", () => {
    // A green tick and "No orders" under a red error banner is the same lie in
    // two colours.
    expect(CODE).toMatch(/live\.length === 0 && done\.length === 0 && !error/);
  });
});

describe("the dock is where a thumb is", () => {
  it("is fixed to the bottom, not a pill row at the top", () => {
    expect(CODE).toMatch(/fixed inset-x-0 bottom-0/);
    expect(CODE).toContain('aria-label="Kitchen sections"');
  });

  it("clears 48px, because this audience has wet hands", () => {
    const dock = CODE.slice(CODE.indexOf('aria-label="Kitchen sections"'));
    expect(dock).toMatch(/min-h-\[56px\]/);
  });

  it("keeps its cells and their order in one place", () => {
    // A hand-written row beside a hand-written list is how the two disagree.
    expect(CODE).toMatch(/const DOCK = \[/);
    for (const id of ["orders", "allday", "menu", "history"]) {
      expect(CODE).toContain(`id: "${id}" as const`);
    }
  });

  it("shows no Money cell, because a cook is not shown money", () => {
    const dock = CODE.slice(CODE.indexOf("const DOCK = ["));
    expect(dock.slice(0, 600).toLowerCase()).not.toContain('"money"');
  });

  it("respects the phone's safe area", () => {
    expect(CODE).toContain("env(safe-area-inset-bottom)");
  });
});

describe("the poll that once billed 110,000 requests a day", () => {
  it("still mounts once and reads the latest load through a ref", () => {
    expect(CODE).toMatch(/setInterval\(\(\) => void loadRef\.current\(\), 15_000\)/);
    expect(CODE).not.toMatch(/setInterval\(\(\) => void load\(\), 15_000\)/);
  });

  it("assigns that ref in an effect, not during render", () => {
    // Writing a ref while rendering is a side effect in a function React may
    // run twice, and react-hooks/refs is right to call it an error.
    expect(CODE).toMatch(/useEffect\(\(\) => \{\s*loadRef\.current = load;\s*\}, \[load\]\)/);
  });
});

// ── M216: orders booked a day or two ahead ────────────────────────────────
// The day logic is tested in lib/kitchen/board.test.ts against a fixed clock.
// These guard the wiring: that the component actually asks it.
describe("a booked order is not cooked before its day (M216)", () => {
  it("never renders the advance button for a Coming-up order", () => {
    // The one place "Start cooking" is rendered. Losing `!holdForDay` puts a
    // big yellow button on Friday's order on Wednesday.
    expect(CODE).toMatch(/\{next && !o\.waitingOnTransfer && !holdForDay && \(\s*<button\s+onClick=\{\(\) => void advance\(o\)\}/);
    expect(CODE).toMatch(/const holdForDay = waitsForItsDay\(o, nowDate\)/);
  });

  it("puts something in the button's place, with a way to clear the new-order banner", () => {
    const at = CODE.indexOf("{next && !o.waitingOnTransfer && holdForDay && (");
    expect(at).toBeGreaterThan(0);
    const block = CODE.slice(at);
    expect(block.slice(0, 1200)).toContain("cook on the day");
    expect(block.slice(0, 1200)).toMatch(/setNewIds\(\(prev\) => prev\.filter\(\(id\) => id !== o\.id\)\)/);
  });

  it("keeps Cancel on a Coming-up order — the day hold is on cooking, not on letting go", () => {
    // A customer who rings on Wednesday to call off Friday's lunch must be
    // let go on Wednesday. Only "Start cooking" waits for the day.
    expect(CODE).toMatch(/\{!o\.awaitingPayment && !o\.finished && \(\s*<button\s+onClick=\{\(\) => void cancelOrder\(o\)\}/);
  });

  it("leads every booked card with its window", () => {
    expect(CODE).toMatch(/const headline = slotHeadline\(o, nowDate\)/);
    // Above the order number, i.e. first on the card.
    expect(CODE.indexOf("{headline ? (")).toBeLessThan(CODE.indexOf("{o.orderNumber}</p>"));
  });

  it("lists Today above Coming up", () => {
    const today = CODE.indexOf("{board.today.map(renderCard)}");
    const later = CODE.indexOf("{board.later.map(renderCard)}");
    expect(today).toBeGreaterThan(0);
    expect(later).toBeGreaterThan(today);
  });

  it("still chimes for a pre-order — the new-order set is every live order", () => {
    // Filtering this by day would make Friday's booking arrive in silence,
    // and a booking nobody noticed is a Friday that goes wrong.
    expect(CODE).toContain("const live = (next.orders ?? []).filter((o) => !o.finished);");
    expect(CODE).toMatch(/if \(fresh\.length > 0\) \{\s*chime\.play\(\);/);
  });

  it("gives All Day the board's clock, so the two tabs split the day at the same instant", () => {
    expect(CODE).toContain("<AllDayPanel orders={live} now={now} />");
  });
});
