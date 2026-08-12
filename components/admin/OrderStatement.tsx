"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Download, Receipt } from "lucide-react";
import { centsToDecimalString } from "@/lib/money";

// ── The order statement ────────────────────────────────────────────────────
//
// A ledger, not a dashboard: one row per order, oldest first, with a running
// total. That shape is deliberate — it is the shape of a bank statement, so it
// reads without explanation, and every figure can be traced back to a single
// order rather than being an aggregate nobody can check.
//
// The Command Centre answers "what is happening now". This answers "what did
// this shop sell me in March", which is the question that matters at the end of
// a month, at tax time, or when a merchant disputes a number.

type Row = {
  id: string;
  at: string;
  order_number: string;
  shop: string;
  status: string;
  customer_name: string | null;
  fulfillment_method: string | null;
  total: number;
  commission: number;
  counted: number;
  running: number;
};
type ShopRow = { shop: string; orders: number; gross: number; commission: number; cancelled: number };
type Statement = {
  from: string;
  to: string;
  rows: Row[];
  byShop: ShopRow[];
  byMonth: { month: string; orders: number; gross: number }[];
  totals: { orders: number; gross: number; commission: number; cancelled: number; pending: number };
};

const rs = (cents: number) => `Rs ${centsToDecimalString(cents)}`;

// Only `collected` money counts toward the balance. A cancelled order still
// appears — it explains a gap in the numbering — but must not inflate a total.
const COUNTS = (s: string) => s === "collected";

const STATUS_STYLE: Record<string, string> = {
  collected: "text-green-400",
  cancelled: "text-red-400/80",
  refunded: "text-red-400/80",
};

export default function OrderStatement() {
  const [data, setData] = useState<Statement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState<string>("");
  const [shop, setShop] = useState<string>("");

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (year) qs.set("year", year);
      const res = await fetch(`/api/admin/statement?${qs}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not load.");
      setData(body as Statement);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load.");
    }
  }, [year]);

  useEffect(() => {
    void load();
  }, [load]);

  // Filtering by shop happens here rather than server-side: the year is already
  // fetched, so switching shop should be instant, not another round trip.
  const rows = useMemo(
    () => (data?.rows ?? []).filter((r) => !shop || r.shop === shop),
    [data, shop],
  );

  const shopTotals = useMemo(() => {
    if (!shop) return null;
    const mine = rows.filter((r) => COUNTS(r.status));
    return { orders: mine.length, gross: mine.reduce((n, r) => n + r.total, 0) };
  }, [rows, shop]);

  function exportCsv() {
    // Plain CSV, because the point of a statement is that it leaves the system.
    // An accountant with Excel should never have to ask for an export format.
    const head = ["Date", "Order", "Shop", "Customer", "Fulfilment", "Status", "Amount (Rs)"];
    const lines = rows.map((r) =>
      [
        new Date(r.at).toISOString().slice(0, 10),
        r.order_number,
        r.shop,
        r.customer_name ?? "",
        r.fulfillment_method ?? "",
        r.status,
        centsToDecimalString(r.total),
      ]
        // Quote everything and double interior quotes: a shop called
        // O'Brien, Ltd would otherwise split into two columns.
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `roule-rodrigues-statement-${year || "12m"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (error) {
    return <p className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 font-dm text-sm text-red-300">{error}</p>;
  }
  if (!data) {
    return (
      <p className="flex items-center gap-2 font-dm text-sm text-muted">
        <Loader2 size={14} className="animate-spin" /> Building the statement…
      </p>
    );
  }

  const thisYear = new Date().getFullYear();

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={year}
          onChange={(e) => setYear(e.target.value)}
          aria-label="Period"
          className="min-h-[40px] rounded-xl border border-white/15 bg-dark px-3 font-dm text-sm text-offwhite"
        >
          <option value="">Last 12 months</option>
          {[thisYear, thisYear - 1, thisYear - 2].map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select
          value={shop}
          onChange={(e) => setShop(e.target.value)}
          aria-label="Shop"
          className="min-h-[40px] rounded-xl border border-white/15 bg-dark px-3 font-dm text-sm text-offwhite"
        >
          <option value="">All shops</option>
          {data.byShop.map((s) => (
            <option key={s.shop} value={s.shop}>{s.shop}</option>
          ))}
        </select>
        <button
          onClick={exportCsv}
          disabled={rows.length === 0}
          className="flex min-h-[40px] items-center gap-1.5 rounded-xl border border-white/15 px-3 font-dm text-sm text-offwhite disabled:opacity-50"
        >
          <Download size={14} /> CSV
        </button>
      </div>

      {/* Headline figures */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Completed" value={String(shopTotals?.orders ?? data.totals.orders)} />
        <Stat label="Revenue" value={rs(shopTotals?.gross ?? data.totals.gross)} accent />
        <Stat label="In progress" value={String(data.totals.pending)} />
        <Stat label="Cancelled" value={String(data.totals.cancelled)} />
      </div>

      {/* Per shop — the answer to "what do I invoice this restaurant for". */}
      {!shop && data.byShop.some((s) => s.orders > 0) && (
        <div className="mt-6">
          <h2 className="font-bebas text-[11px] tracking-[0.3em] text-yellow">BY SHOP</h2>
          <ul className="mt-2 divide-y divide-white/5 rounded-2xl border border-white/10 bg-dark-card">
            {data.byShop.filter((s) => s.orders > 0).map((s) => (
              <li key={s.shop} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-dm text-sm text-offwhite">{s.shop}</p>
                  <p className="font-dm text-xs text-muted">
                    {s.orders} order{s.orders === 1 ? "" : "s"}
                    {s.cancelled > 0 && ` · ${s.cancelled} cancelled`}
                  </p>
                </div>
                <span className="shrink-0 font-syne text-sm font-bold text-yellow">{rs(s.gross)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* The ledger */}
      <h2 className="mt-6 font-bebas text-[11px] tracking-[0.3em] text-yellow">TRANSACTIONS</h2>
      {rows.length === 0 ? (
        <div className="mt-2 rounded-2xl border border-white/10 bg-dark-card p-8 text-center">
          <Receipt size={22} className="mx-auto text-muted" />
          <p className="mt-2 font-dm text-sm text-muted">No transactions in this period.</p>
        </div>
      ) : (
        // Scrolls inside its own container so the page never scrolls sideways.
        <div className="mt-2 overflow-x-auto rounded-2xl border border-white/10 bg-dark-card">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-left font-dm text-[11px] uppercase tracking-wider text-muted">
                <th className="px-3 py-2.5 font-medium">Date</th>
                <th className="px-3 py-2.5 font-medium">Order</th>
                <th className="px-3 py-2.5 font-medium">Shop</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 text-right font-medium">Amount</th>
                <th className="px-3 py-2.5 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-white/5 last:border-0">
                  <td className="whitespace-nowrap px-3 py-2.5 font-dm text-xs text-muted">
                    {new Date(r.at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })}
                  </td>
                  <td className="px-3 py-2.5 font-dm text-xs text-offwhite">{r.order_number}</td>
                  <td className="max-w-[10rem] truncate px-3 py-2.5 font-dm text-xs text-muted">{r.shop}</td>
                  <td className={`px-3 py-2.5 font-dm text-xs ${STATUS_STYLE[r.status] ?? "text-muted"}`}>
                    {r.status.replace(/_/g, " ")}
                  </td>
                  <td className={`whitespace-nowrap px-3 py-2.5 text-right font-dm text-xs ${
                    COUNTS(r.status) ? "text-offwhite" : "text-muted line-through"
                  }`}>
                    {rs(r.total)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-syne text-xs font-bold text-yellow">
                    {rs(r.running)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 font-dm text-xs text-muted">
        Balance counts completed orders only. Cancelled and refunded rows are shown so the record is
        complete, but struck through and excluded from the total.
      </p>
    </div>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-dark-card p-3.5">
      <p className="font-bebas text-[10px] tracking-[0.25em] text-muted">{label.toUpperCase()}</p>
      <p className={`mt-1 font-syne text-lg font-extrabold ${accent ? "text-yellow" : "text-offwhite"}`}>{value}</p>
    </div>
  );
}
