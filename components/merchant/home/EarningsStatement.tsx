import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { centsToDecimalString } from "@/lib/money";
import type { EarningLine } from "@/lib/merchant/earnings";

// ── THE STATEMENT BEHIND THE NUMBER ─────────────────────────────────────────
//
// The Home block says what the merchant has earned. This says which sales it
// came from. A total nobody can break down is a total nobody can check, and
// this is the only money on the platform that one human owes another — the
// customer pays the merchant directly, and the merchant owes Roulé Rodrigues
// its share. Both sides deserve to see the arithmetic.
//
// Every figure is CENTS and goes through centsToDecimalString. This is a
// reconciliation surface, so money is written in full — never the short form
// that drops ".00", per the note in lib/money.ts.

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function EarningsStatement({ lines }: { lines: EarningLine[] | null }) {
  // A failed read is not an empty statement. Showing "no completed sales" to a
  // merchant whose sales we simply could not load is the same lie as showing
  // them Rs 0.00.
  if (lines === null) {
    return (
      <section className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-4">
        <p className="flex items-center gap-2 font-syne text-sm font-bold text-amber-300">
          <AlertTriangle size={15} /> Statement unavailable
        </p>
        <p className="mt-1 font-dm text-xs text-offwhite/70">
          We couldn&apos;t load your sales just now. This is not an empty statement — reload the
          page, and tell us if it keeps happening.
        </p>
      </section>
    );
  }

  if (lines.length === 0) {
    return (
      <section className="rounded-2xl border border-white/10 bg-dark-card p-4">
        <p className="font-dm text-xs text-muted">
          No completed sales yet. Once a customer confirms payment and you hand the order over,
          every sale appears here with what you were paid and what you owe.
        </p>
      </section>
    );
  }

  const net = lines.reduce((n, l) => n + l.netCents, 0);
  const commission = lines.reduce((n, l) => n + l.commissionCents, 0);

  return (
    <section className="rounded-2xl border border-white/10 bg-dark-card">
      {/* Totals first: the answer, then the working. */}
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 border-b border-white/10 p-4">
        <div>
          <p className="font-syne text-xl font-extrabold text-yellow">
            Rs {centsToDecimalString(net)}
          </p>
          <p className="font-dm text-[11px] text-muted">paid to you</p>
        </div>
        {commission > 0 && (
          <div>
            <p className="font-syne text-xl font-extrabold text-offwhite">
              Rs {centsToDecimalString(commission)}
            </p>
            <p className="font-dm text-[11px] text-muted">owed to Roulé Rodrigues</p>
          </div>
        )}
      </div>

      {/* A table on a phone is a horizontal scrollbar nobody finds, so each sale
          is a row that stacks. The order number links to the order itself,
          because "which sale was that" is the next question after "how much". */}
      <ul className="divide-y divide-white/5">
        {lines.map((l) => (
          <li key={l.orderId} className="p-4">
            <div className="flex items-baseline justify-between gap-3">
              <Link
                href={`/merchant/orders/${l.orderId}`}
                className="font-dm text-sm font-semibold text-offwhite hover:text-yellow"
              >
                {l.orderNumber}
              </Link>
              <span className="shrink-0 font-syne text-sm font-bold text-yellow">
                Rs {centsToDecimalString(l.netCents)}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-dm text-[11px] text-muted">
              <span>{formatDate(l.placedAt)}</span>
              <span className="opacity-50">·</span>
              <span>customer paid Rs {centsToDecimalString(l.customerTotalCents)}</span>
              {l.commissionCents > 0 && (
                <>
                  <span className="opacity-50">·</span>
                  <span>
                    commission Rs {centsToDecimalString(l.commissionCents)}
                    {l.rate != null && ` (${Number((l.rate * 100).toFixed(2))}%)`}
                  </span>
                </>
              )}
            </div>
            {/* The one line that stops the arithmetic looking wrong. Commission
                is charged on the goods alone, so on any order carrying tax or a
                delivery fee, customer_total minus commission will NOT equal the
                net — and a merchant checking by hand would think they had been
                short-changed. */}
            {l.commissionCents > 0 && l.commissionableCents !== l.customerTotalCents && (
              <p className="mt-1 font-dm text-[10px] text-muted/70">
                charged on Rs {centsToDecimalString(l.commissionableCents)} of goods — never on tax
                or delivery
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
