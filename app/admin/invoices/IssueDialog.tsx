"use client";

import { useEffect, useState } from "react";
import { X, FileText } from "lucide-react";
import type { Invoice, IssuableSubject } from "@/lib/invoicing/types";
import { money } from "@/lib/invoicing/register";

// ── ISSUING ─────────────────────────────────────────────────────────────────
//
// The picker sends a SUBJECT, never an amount. invoice_issue() reads the
// authoritative row and converts in SQL, and the figure shown here is only a
// preview so the admin knows which booking they are picking.
//
// A subject that already has a live invoice is not offered at all: the database
// would refuse it, and a button that always errors is worse than no button.


export default function IssueDialog({
  onClose, onIssued,
}: {
  onClose: () => void;
  onIssued: (inv: Invoice) => void;
}) {
  const [rows, setRows] = useState<IssuableSubject[] | null>(null);
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/admin/invoices/issuable", { cache: "no-store" });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error ?? "Could not load.");
        setRows(body.issuable ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load.");
      }
    })();
  }, []);

  async function issue(row: IssuableSubject) {
    setBusyId(row.subjectId);
    setError(null);
    try {
      const res = await fetch("/api/admin/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectType: row.subjectType, subjectId: row.subjectId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Could not issue the invoice.");
      onIssued(body.invoice as Invoice);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not issue the invoice.");
    } finally {
      setBusyId(null);
    }
  }

  const shown = (rows ?? []).filter((r) =>
    `${r.who} ${r.reference} ${r.what}`.toLowerCase().includes(q.trim().toLowerCase()),
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Issue an invoice"
      className="fixed inset-0 z-[600] flex items-end justify-center bg-black/70 sm:items-center sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-t-3xl border border-white/12 bg-dark-card sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3 p-5 pb-3">
          <div>
            <h2 className="font-syne text-lg font-extrabold text-offwhite">Issue an invoice</h2>
            <p className="mt-0.5 font-dm text-xs text-muted">
              Pick the booking, order or ride. The amount comes from the record itself.
            </p>
          </div>
          <button
            type="button" onClick={onClose} aria-label="Close"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/12"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 pb-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Customer, reference, or vehicle"
            aria-label="Search"
            className="min-h-12 w-full rounded-xl border border-white/12 bg-dark px-4 font-dm text-sm"
          />
        </div>

        {error && (
          <p className="mx-5 mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 font-dm text-sm text-red-300">
            {error}
          </p>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          {rows === null && !error && (
            <p className="py-10 text-center font-dm text-sm text-muted">Loading…</p>
          )}

          {/* Everything already invoiced is excluded upstream, so an empty list
              here means the book is complete — not that something is broken. */}
          {rows !== null && rows.length === 0 && (
            <div className="py-10 text-center">
              <FileText size={20} className="mx-auto text-muted" />
              <p className="mt-2 font-dm text-sm text-muted">
                Everything with a total already has an invoice.
              </p>
            </div>
          )}
          {rows !== null && rows.length > 0 && shown.length === 0 && (
            <p className="py-10 text-center font-dm text-sm text-muted">Nothing matches.</p>
          )}

          <ul className="space-y-2">
            {shown.map((r) => (
              <li
                key={`${r.subjectType}:${r.subjectId}`}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-dm text-sm text-offwhite">{r.who}</span>
                  <span className="block truncate font-dm text-xs text-muted">
                    {r.reference} · {r.what}
                    {r.when ? ` · ${r.when.slice(0, 10)}` : ""}
                  </span>
                  {/* What the picker knows and the invoice does not — chiefly
                      that a delivery fee has usually been collected already,
                      so the document about to be issued needs a payment
                      recorded against it straight away. */}
                  {r.note && (
                    <span className="mt-0.5 block font-dm text-[11px] text-amber-200/80">
                      {r.note}
                    </span>
                  )}
                </span>
                <span className="shrink-0 font-dm text-sm tabular-nums text-offwhite">
                  {money(r.totalCents)}
                </span>
                <button
                  type="button"
                  onClick={() => void issue(r)}
                  disabled={busyId !== null}
                  className="min-h-11 shrink-0 rounded-xl bg-yellow px-4 font-syne text-xs font-bold text-dark disabled:opacity-40"
                >
                  {busyId === r.subjectId ? "Issuing…" : "Issue"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
