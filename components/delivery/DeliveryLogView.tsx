"use client";

import {
  CheckCircle2,
  ClipboardCheck,
  Download,
  Package,
  XCircle,
} from "lucide-react";
import { centsToDecimalString } from "@/lib/money";
import { ERRAND_LABEL, isErrandKind } from "@/lib/delivery/kind";
import { logToCsv, logFileName } from "@/lib/delivery/log-csv";

// ── The last 30 days, drawn once ────────────────────────────────────────────
//
// Two screens show this: the driver's own console and the owner's driver card
// in /admin/deliveries. They exist to settle the same question — "what did I
// do, and what am I owed for it" — and the moment they are two components they
// can answer it differently.
//
// The SQL already refuses to fork: admin_driver_log and driver_delivery_log
// both call delivery_log_for, so the numbers are identical by construction.
// This is the same commitment on the rendering side. Purely presentational —
// it fetches nothing and decides nothing about who may see it.

export type LogRow = {
  id: string;
  status: string;
  finishedAt: string | null;
  earning: number | null;
  customerFee?: number | null;
  what: string;
  requestKind: string | null;
  errandKind: string | null;
  jobKind: "direct" | "store";
  failureReason: string | null;
};

export type LogTotals = {
  jobs: number;
  delivered: number;
  earned: number;
  errands: number;
};

export type DeliveryLogData = {
  days: number;
  rows: LogRow[];
  totals: LogTotals | null;
  driverName?: string;
};

/** "Fri 5 Sep" — the day is what somebody is looking for, not the minute. */
export function logDay(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Indian/Mauritius",
  });
}

/**
 * Hand the rows over as a file.
 *
 * Built in the browser from data already on screen: there is nothing here the
 * viewer cannot see, so a second authenticated round trip would buy nothing but
 * a wait on island data.
 *
 * The BOM is not decoration. Excel on Windows reads a UTF-8 file without one as
 * the system codepage, and the first thing that breaks is the accent in
 * "Roulé" — in a document about who is owed what, mangled names are the wrong
 * kind of wrong.
 */
function download(data: DeliveryLogData, rows: LogRow[]) {
  const csv = logToCsv({ ...data, rows });
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = logFileName(data.driverName, data.days);
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on the next tick rather than immediately: Safari has not always
  // finished reading the blob by the time click() returns, and a revoked URL
  // there is a download that silently produces nothing.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function DeliveryLogView({
  data,
  only,
  emptyText = "Nothing finished in the last 30 days yet.",
}: {
  data: DeliveryLogData;
  /** The errands console shows only errands. */
  only?: "errand";
  emptyText?: string;
}) {
  const rows = data.rows.filter((r) =>
    only === "errand" ? r.requestKind === "errand" : true,
  );

  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-white/10 bg-dark-card px-4 py-6 text-center font-dm text-sm text-muted">
        {emptyText}
      </p>
    );
  }

  return (
    <>
      {data.totals && (
        // Earnings first: it is the number this was opened for. Counted from
        // DELIVERED jobs only — a cancelled job still carries an earning on its
        // row, and including it would show money nobody was paid. On the
        // owner's screen that number becomes an argument with a driver.
        <div className="flex items-baseline justify-between gap-3 rounded-xl border border-white/10 bg-dark-card px-4 py-3">
          <span className="font-dm text-sm text-muted">
            {data.totals.delivered} completed
            {only !== "errand" && data.totals.errands > 0 && (
              <> · {data.totals.errands} errands</>
            )}
          </span>
          <span className="flex items-center gap-3">
            <span className="font-syne text-lg font-bold tabular-nums text-yellow">
              Rs {centsToDecimalString(data.totals.earned)}
            </span>
            {/* Next to the number it is a copy of. Somebody settling pay wants
                these rows somewhere they can sum and send on, and re-typing
                thirty of them is how a figure ends up wrong. */}
            <button
              type="button"
              onClick={() => download(data, rows)}
              title="Download these rows as a spreadsheet"
              className="inline-flex min-h-[32px] items-center gap-1.5 rounded-full border border-white/15 px-3 font-dm text-xs text-muted transition-colors hover:border-yellow/40 hover:text-yellow"
            >
              <Download size={13} /> CSV
            </button>
          </span>
        </div>
      )}

      <ul className="mt-2 divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/10 bg-dark-card">
        {rows.map((r) => {
          const done = r.status === "delivered";
          const Icon = r.requestKind === "errand" ? ClipboardCheck : Package;
          return (
            <li key={r.id} className="flex items-start gap-3 px-4 py-3">
              <Icon
                size={15}
                className={`mt-0.5 shrink-0 ${done ? "text-muted" : "text-red-400/70"}`}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-dm text-sm text-offwhite">
                  {r.what}
                </span>
                <span className="mt-0.5 block font-dm text-xs text-muted">
                  {logDay(r.finishedAt)}
                  {isErrandKind(r.errandKind) && <> · {ERRAND_LABEL[r.errandKind]}</>}
                  {!done && (
                    <>
                      {" · "}
                      <span className="text-red-300">
                        {r.status.replace(/_/g, " ")}
                      </span>
                    </>
                  )}
                </span>
                {/* Why it did not finish, when the row knows. The operator is
                    usually here BECAUSE of one of these, and making them open
                    the delivery to read it is the difference between answering
                    a driver now and answering them later. */}
                {!done && r.failureReason && (
                  <span className="mt-0.5 block font-dm text-xs text-muted/80">
                    {r.failureReason}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-right">
                {done ? (
                  <span className="font-dm text-sm tabular-nums text-offwhite">
                    Rs {centsToDecimalString(r.earning ?? 0)}
                  </span>
                ) : (
                  // Never a number here. A cancelled job's row still carries
                  // driver_earning, and printing it beside the word "cancelled"
                  // reads as money owed.
                  <span className="font-dm text-xs text-muted">—</span>
                )}
                <span className="mt-0.5 block">
                  {done ? (
                    <CheckCircle2 size={12} className="ml-auto text-green-400/70" />
                  ) : (
                    <XCircle size={12} className="ml-auto text-red-400/60" />
                  )}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}
