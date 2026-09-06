import { AlertTriangle, Wallet } from "lucide-react";
import { centsToDecimalString } from "@/lib/money";
import type { Earnings as EarningsResult } from "@/lib/merchant/earnings";

// The money block. Two figures, lifetime, store-scoped.
//
// No payout, no balance, no "pending" — the platform never holds the money, so
// every one of those would be a number that exists nowhere. What is true is
// what they have been paid and what they owe.

export default function Earnings({ earnings }: { earnings: EarningsResult }) {
  if (!earnings.ok) {
    // Either the read failed, or it returned nothing while the store has paid
    // orders. Never "Rs 0.00" — telling an owner who has taken money that they
    // earned nothing is the worst sentence this page could print.
    return (
      <section className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-4">
        <p className="flex items-center gap-2 font-syne text-sm font-bold text-amber-300">
          <AlertTriangle size={15} /> Earnings unavailable
        </p>
        <p className="mt-1 font-dm text-xs text-offwhite/70">
          We couldn&apos;t read your figures just now. This is not a zero — reload the page, and
          tell us if it keeps happening.
        </p>
      </section>
    );
  }

  if (earnings.orderCount === 0) {
    return (
      <section className="mt-4 rounded-2xl border border-white/10 bg-dark-card p-4">
        <p className="flex items-center gap-2 font-syne text-sm font-bold text-offwhite">
          <Wallet size={15} className="text-yellow" /> Earnings
        </p>
        <p className="mt-1 font-dm text-xs text-muted">
          No completed sales yet. When a customer confirms payment, what you earned and what you
          owe Roulé Rodrigues both appear here — commission is charged on the goods only, never on
          the delivery fee and never on tax.
        </p>
      </section>
    );
  }

  const pct =
    earnings.rate != null
      ? `${Number((earnings.rate * 100).toFixed(2))}%`
      : null;

  return (
    <section className="mt-4 rounded-2xl border border-white/10 bg-dark-card p-4">
      <p className="flex items-center gap-2 font-syne text-sm font-bold text-offwhite">
        <Wallet size={15} className="text-yellow" /> Earnings
      </p>

      <p className="mt-2 font-syne text-2xl font-extrabold text-yellow">
        Rs {centsToDecimalString(earnings.netCents)}
      </p>
      <p className="font-dm text-[11px] text-muted">
        paid to you across {earnings.orderCount} order{earnings.orderCount === 1 ? "" : "s"}
      </p>

      {/* Absent, not "Rs 0 owed". A zero line invites the merchant to wonder
          what they are being charged for — and on this platform's older orders
          the honest answer is nothing. */}
      {earnings.commissionCents > 0 && (
        <p className="mt-3 border-t border-white/10 pt-3 font-dm text-xs text-offwhite/80">
          Rs {centsToDecimalString(earnings.commissionCents)} commission owed to Roulé Rodrigues
          {pct && <span className="text-muted"> · {pct} of the goods</span>}
        </p>
      )}
    </section>
  );
}
