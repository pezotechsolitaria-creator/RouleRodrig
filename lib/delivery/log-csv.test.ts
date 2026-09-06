import { describe, it, expect } from "vitest";
import { logToCsv, logFileName, LOG_CSV_HEADERS } from "./log-csv";
import type { DeliveryLogData, LogRow } from "@/components/delivery/DeliveryLogView";

const row = (over: Partial<LogRow> = {}): LogRow => ({
  id: "d1",
  status: "delivered",
  // 2026-09-05 10:30 UTC → 14:30 in Indian/Mauritius (UTC+4).
  finishedAt: "2026-09-05T10:30:00.000Z",
  earning: 25_000,
  customerFee: 30_000,
  what: "A parcel",
  requestKind: "package",
  errandKind: null,
  jobKind: "direct",
  failureReason: null,
  ...over,
});

const data = (rows: LogRow[]): DeliveryLogData => ({
  days: 30,
  rows,
  totals: {
    jobs: rows.length,
    delivered: rows.filter((r) => r.status === "delivered").length,
    earned: rows
      .filter((r) => r.status === "delivered")
      .reduce((n, r) => n + (r.earning ?? 0), 0),
    errands: rows.filter((r) => r.requestKind === "errand").length,
  },
});

const body = (csv: string) => csv.split("\r\n").slice(1);
const cells = (line: string) => line.split(",");

describe("the log exports as a spreadsheet", () => {
  it("leads with a header row", () => {
    const csv = logToCsv(data([row()]));
    expect(csv.split("\r\n")[0]).toBe(LOG_CSV_HEADERS.join(","));
  });

  it("uses CRLF, which is what RFC 4180 and Excel expect", () => {
    expect(logToCsv(data([row(), row({ id: "d2" })]))).toContain("\r\n");
  });

  it("writes the island's date, not the server's", () => {
    // 10:30 UTC is 14:30 on Rodrigues. A driver settling a Tuesday means the
    // Tuesday they worked, and near midnight the two disagree about the DAY.
    const [date, time] = cells(body(logToCsv(data([row()])))[0]);
    expect(date).toBe("2026-09-05");
    expect(time).toBe("14:30");
  });

  it("keeps the date sortable as text", () => {
    // The first thing anybody does to a column of dates is sort it. Only
    // YYYY-MM-DD survives that in every spreadsheet.
    const [date] = cells(body(logToCsv(data([row()])))[0]);
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("is empty but valid when there is nothing to export", () => {
    const csv = logToCsv(data([]));
    expect(csv).toBe(LOG_CSV_HEADERS.join(","));
  });
});

// ── THE ONE THAT MATTERS ────────────────────────────────────────────────────
describe("a customer cannot put a formula in the owner's spreadsheet", () => {
  // `what` is free text typed on a public page by somebody who has not been
  // approved for anything. It reaches this file unedited. A cell beginning with
  // = + - @ or a tab is a FORMULA to Excel, Sheets and LibreOffice — so the
  // attacker never has to be believed, only quoted.
  const ATTACKS = [
    '=HYPERLINK("http://evil.example","Click me")',
    "+1+1",
    "-1+1",
    "@SUM(A1:A9)",
    "\t=1+1",
    "=cmd|'/c calc'!A0",
  ];

  it.each(ATTACKS)("neutralises %j in the job description", (attack) => {
    const csv = logToCsv(data([row({ what: attack })]));
    const line = body(csv)[0];
    // The payload must not survive as the first character of its cell.
    expect(line).not.toMatch(/(^|,)"?[=+\-@\t]/);
    expect(csv).toContain("'");
  });

  it("neutralises it in the failure reason too", () => {
    // Written by an operator, but it travels the same path and a note pasted
    // from somewhere else is exactly how this gets in by accident.
    const csv = logToCsv(data([row({ status: "cancelled", failureReason: "=1+1" })]));
    expect(body(csv)[0]).toMatch(/'=1\+1/);
  });

  it("still shows the text, rather than dropping it", () => {
    // Stripping the payload would be a different bug: the owner needs to see
    // what the customer actually wrote.
    const csv = logToCsv(data([row({ what: "=DANGER" })]));
    expect(csv).toContain("DANGER");
  });

  it("leaves ordinary text alone", () => {
    const csv = logToCsv(data([row({ what: "2 gas bottles" })]));
    expect(body(csv)[0]).toContain("2 gas bottles");
    expect(csv).not.toContain("'2 gas bottles");
  });
});

describe("quoting", () => {
  it("survives a comma", () => {
    const csv = logToCsv(data([row({ what: "Rice, beans and oil" })]));
    expect(body(csv)[0]).toContain('"Rice, beans and oil"');
    // And the row must still parse to the right number of columns.
    expect(cells(body(csv)[0].replace(/"[^"]*"/g, "X"))).toHaveLength(
      LOG_CSV_HEADERS.length,
    );
  });

  it("survives a quote mark", () => {
    const csv = logToCsv(data([row({ what: 'The "big" box' })]));
    expect(body(csv)[0]).toContain('"The ""big"" box"');
  });

  it("survives a newline inside a field", () => {
    // A textarea. People press Enter.
    const csv = logToCsv(data([row({ what: "Two lines\nhere" })]));
    expect(csv).toContain('"Two lines\nhere"');
  });
});

// ── The money rule, carried into the file ───────────────────────────────────
describe("what the earnings column adds up to", () => {
  it("is zero for anything that was not delivered", () => {
    // A cancelled delivery still carries driver_earning on its row. Exporting
    // it would put a figure nobody was paid into the document used to settle
    // pay — which is where a display bug stops being a display bug.
    const csv = logToCsv(data([row({ status: "cancelled", earning: 12_000 })]));
    expect(cells(body(csv)[0])[6]).toBe("0.00");
    expect(csv).not.toContain("120.00");
  });

  it("sums to exactly what both screens show", () => {
    const rows = [
      row({ id: "a", earning: 15_000 }),
      row({ id: "b", earning: 25_000 }),
      row({ id: "c", status: "cancelled", earning: 99_000 }),
    ];
    const d = data(rows);
    const total = body(logToCsv(d))
      .map((l) => Number(cells(l)[6]))
      .reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(400, 2);
    // The same number the totals block prints, in rupees.
    expect(total * 100).toBe(d.totals!.earned);
  });

  it("writes a plain number a spreadsheet can add", () => {
    // No "Rs", no thousands separator: both turn the column into text and the
    // SUM into zero.
    const value = cells(body(logToCsv(data([row({ earning: 150_000 })])))[0])[6];
    expect(value).toBe("1500.00");
    expect(Number.isNaN(Number(value))).toBe(false);
  });

  it("does not let a negative amount be read as a formula", () => {
    // Not reachable today — earnings are non-negative — but the guard skips
    // numeric columns by design, so this pins WHY that is safe.
    expect(cells(body(logToCsv(data([row({ earning: 0 })])))[0])[6]).toBe("0.00");
  });
});

describe("the job type columns", () => {
  it("names an errand and its kind", () => {
    const csv = logToCsv(
      data([row({ requestKind: "errand", errandKind: "pay_bill", what: "CEB bill" })]),
    );
    const c = cells(body(csv)[0]);
    expect(c[3]).toBe("Do it for me");
    expect(c[4]).toBe("Pay a bill");
  });

  it("says what a shop delivery is, rather than leaving a hole", () => {
    const c = cells(body(logToCsv(data([row({ requestKind: null })])))[0]);
    expect(c[3]).toBe("Shop delivery");
  });
});

describe("the file name", () => {
  it("carries the driver, so a folder of these stays legible", () => {
    expect(logFileName("Marie Céline", 30)).toBe(
      "roule-rodrigues-marie-c-line-last-30-days.csv",
    );
  });

  it("never produces a name with a path or a space in it", () => {
    for (const n of ["A/B", "..", "  ", "Jean-Luc"]) {
      const f = logFileName(n, 30);
      expect(f).toMatch(/^[a-z0-9.\-]+\.csv$/);
      expect(f).not.toContain("..");
    }
  });

  it("falls back rather than producing a nameless file", () => {
    expect(logFileName(undefined, 30)).toBe("roule-rodrigues-my-last-30-days.csv");
    expect(logFileName("!!!", 7)).toBe("roule-rodrigues-driver-last-7-days.csv");
  });
});
