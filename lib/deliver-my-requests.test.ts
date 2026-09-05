import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DELIVER_COPY } from "./delivery/copy.i18n";

// ── THE LIST BECAME A GRAVEYARD (M163) ──────────────────────────────────────
//
// The owner's /deliver screen showed five rows: two waiting on an admin, one
// cancelled, one delivered, one expired. Everything that had ever happened,
// stacked at equal weight, with the one row that still mattered indistinct
// among them.
//
// Sorting the dead rows to the bottom -- which this list already did -- was
// not enough, because the list is CAPPED AT FIVE. Three finished jobs can push
// the one request holding a live quote off the end of it entirely. A delivered
// job from last week must not be able to hide a driver waiting on an answer
// today.
//
// So finished work is now SEPARATED, not merely ordered: what is still moving
// is the list, and what is over is collapsed history underneath it.

const SRC = readFileSync(
  join(__dirname, "..", "app", "deliver", "MyRequests.tsx"),
  "utf8",
);

describe("finished work leaves the list", () => {
  it("splits live from past rather than sorting them together", () => {
    expect(SRC).toContain("const live = all.filter((r) => !isDone(r))");
    expect(SRC).toContain("const past = all.filter(isDone)");
    expect(SRC).toContain("setRows({ live, past })");
  });

  it("counts every ending as finished, not just cancellation", () => {
    // A delivery can end five ways. Missing one leaves a dead row sitting in
    // the live list for ever -- which is how "Delivered" outlived its journey.
    for (const ending of [
      "cancelled", "expired",
      "delivered", "failed_delivery", "returned_to_merchant",
    ]) {
      expect(SRC).toContain(`"${ending}"`);
    }
  });

  it("caps the live list, so history can never crowd out a live quote", () => {
    expect(SRC).toContain("rows.live.slice(0, 5)");
  });
});

describe("history is history", () => {
  it("is collapsed by default", () => {
    // <details> with no `open` attribute. If this ever gains one, the screen
    // is back to showing everything at once.
    expect(SRC).toContain("<details className=\"group mt-3\">");
    expect(SRC).not.toMatch(/<details[^>]*\sopen[\s>]/);
  });

  it("needs no JavaScript and no second render path", () => {
    // A tab or a filter chip would need state, a second branch and its own
    // keyboard handling. <details> is announced as expandable for free.
    expect(SRC).toContain("<summary");
    expect(SRC).not.toContain("useState<\"live\" | \"past\">");
  });

  it("never lets a finished row wear the accent", () => {
    // `muted` is passed true for every history row and forces `wants` off, so
    // a delivered job cannot look like something waiting on the customer.
    expect(SRC).toContain("const wants = !muted && copy?.needsCustomer === true");
    expect(SRC).toContain("rows.past.slice(0, 10).map((r) => row(r, true))");
    expect(SRC).toContain("rows.live.slice(0, 5).map((r) => row(r, false))");
  });
});

describe("it says something when nothing is waiting", () => {
  it("has an empty line rather than a gap under the heading", () => {
    expect(SRC).toContain("c.mine.empty");
  });

  it("is written in all three languages", () => {
    // DELIVER_COPY is typed per language, so a missing key is a compile
    // error -- but the WORDS still have to be real ones, not English thrice.
    const en = DELIVER_COPY.en.mine;
    const fr = DELIVER_COPY.fr.mine;
    const cr = DELIVER_COPY.cr.mine;
    for (const m of [en, fr, cr]) {
      expect(typeof m.empty).toBe("string");
      expect(m.empty.length).toBeGreaterThan(3);
      expect(typeof m.pastTitle(2)).toBe("string");
      expect(m.pastTitle(2)).toContain("2");
    }
    expect(new Set([en.empty, fr.empty, cr.empty]).size).toBe(3);
    expect(new Set([en.pastTitle(1), fr.pastTitle(1), cr.pastTitle(1)]).size).toBe(3);
  });
});
