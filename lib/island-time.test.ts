import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { ISLAND_TZ, islandDate, islandIsoFromLocal, islandLocalFromIso } from "./island-time";

// ── A TIME TYPED ON THIS SITE IS A TIME ON THIS ISLAND ──────────────────────
//
// `<input type="datetime-local">` returns a bare wall clock with no zone, and
// `new Date(it)` resolves it in the BROWSER'S zone. For a tourist who has not
// changed their phone from Paris, 14:30 became 16:30 for the driver — and
// every screen downstream agreed with the driver, because the stored instant
// really was the wrong one.

describe("a wall clock becomes the instant it names on Rodrigues", () => {
  it("reads 14:30 as 14:30 on the island, whatever the device thinks", () => {
    // Rodrigues is UTC+4, so 14:30 local is 10:30Z.
    expect(islandIsoFromLocal("2026-10-01T14:30")).toBe("2026-10-01T10:30:00.000Z");
  });

  it("is NOT what the old expression produced for a phone left on Paris", () => {
    // The regression in one assertion. Paris in October is UTC+2, so the old
    // code stored 12:30Z — which the ride desk, the driver's WhatsApp and the
    // customer's own tracking page all render, in Mauritius time, as 16:30.
    const correct = islandIsoFromLocal("2026-10-01T14:30")!;
    const whatParisWouldHaveSent = "2026-10-01T12:30:00.000Z";
    expect(correct).not.toBe(whatParisWouldHaveSent);
    const hoursWrong =
      (Date.parse(whatParisWouldHaveSent) - Date.parse(correct)) / 3_600_000;
    expect(hoursWrong).toBe(2);
  });

  it("handles the early hours, where a UTC reading changes the DAY", () => {
    // 01:00 on the 2nd is 21:00Z on the 1st. Read as UTC it would be the
    // wrong date as well as the wrong time.
    expect(islandIsoFromLocal("2026-10-02T01:00")).toBe("2026-10-01T21:00:00.000Z");
  });

  it("round-trips back to the same wall clock through the island zone", () => {
    // The real invariant: whatever the visitor typed is what the island reads
    // back. Checked across a year so any future DST rule would surface here.
    for (const local of [
      "2026-01-15T08:00", "2026-04-02T23:45", "2026-07-21T00:00",
      "2026-10-01T14:30", "2026-12-31T19:05",
    ]) {
      const iso = islandIsoFromLocal(local)!;
      const back = new Intl.DateTimeFormat("sv-SE", {
        timeZone: ISLAND_TZ, hour12: false,
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit",
      }).format(new Date(iso)).replace(" ", "T");
      expect(back, local).toBe(local);
    }
  });

  it("refuses what it cannot read, rather than inventing midnight UTC", () => {
    // Returning a date for junk is how "no time given" becomes "00:00".
    for (const junk of ["", "tomorrow", "2026-10-01", "2026-13-01T10:00",
                        "2026-10-01T25:00", "2026-10-01T10:61"]) {
      expect(islandIsoFromLocal(junk), junk).toBeNull();
    }
  });

  it("accepts the space-separated form as well as the T", () => {
    expect(islandIsoFromLocal("2026-10-01 14:30")).toBe("2026-10-01T10:30:00.000Z");
  });
});

describe("today, on the island", () => {
  it("is already tomorrow at 21:00 UTC", () => {
    expect(islandDate(new Date("2026-09-23T21:00:00Z"))).toBe("2026-09-24");
    // What the naive spelling would have said.
    expect(new Date("2026-09-23T21:00:00Z").toISOString().slice(0, 10)).toBe("2026-09-23");
  });

  it("is still the same day at 19:00 UTC", () => {
    expect(islandDate(new Date("2026-09-23T19:00:00Z"))).toBe("2026-09-23");
  });
});

describe("an instant comes back as the wall clock that was set", () => {
  it("round-trips through an edit form without moving the event", () => {
    // The edit panel built its value from getFullYear()/getHours() — the
    // DEVICE'S clock — while the create form sent Mauritius time. Opening an
    // event on a phone in another zone showed a start time that was not the
    // one saved, and saving it back moved the event.
    for (const local of ["2026-08-22T19:30", "2026-01-01T00:00", "2026-06-30T23:59"]) {
      expect(islandLocalFromIso(islandIsoFromLocal(local)), local).toBe(local);
    }
  });

  it("gives an empty string for nothing, not the epoch", () => {
    expect(islandLocalFromIso(null)).toBe("");
    expect(islandLocalFromIso("")).toBe("");
    expect(islandLocalFromIso("not a date")).toBe("");
  });
});

// ── NOTHING MAY PARSE A WALL CLOCK IN THE DEVICE'S ZONE AGAIN ───────────────
describe("no form converts a datetime-local with a bare new Date()", () => {
  const ROOT = process.cwd();

  function tsx(dir: string, out: string[] = []): string[] {
    for (const e of readdirSync(dir)) {
      const full = join(dir, e);
      if (e === "node_modules" || e.startsWith(".")) continue;
      if (statSync(full).isDirectory()) tsx(full, out);
      else if (e.endsWith(".tsx")) out.push(full);
    }
    return out;
  }

  const FORMS = tsx(join(ROOT, "app"))
    .filter((f) => readFileSync(f, "utf8").includes('type="datetime-local"'));

  it("finds the forms at all", () => {
    expect(FORMS.length).toBeGreaterThanOrEqual(5);
  });

  it("every one of them reads the island's clock", () => {
    // `new Date("2026-10-01T14:30")` resolves in the BROWSER'S zone. Any file
    // with a datetime-local input that also converts one must go through
    // lib/island-time, or it is storing a different instant than was typed.
    const offenders: string[] = [];
    for (const f of FORMS) {
      const src = readFileSync(f, "utf8");
      const converts = /new Date\([^)]*\)\s*\.toISOString\(\)/.test(src)
        || /\+04:00/.test(src);
      if (converts && !src.includes("island-time")) {
        offenders.push(relative(ROOT, f).split("\\").join("/"));
      }
    }
    expect(offenders).toEqual([]);
  });
});
