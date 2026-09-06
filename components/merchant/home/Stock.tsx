import Link from "next/link";
import { AlertTriangle, Package } from "lucide-react";
import type { DashboardStats } from "@/lib/merchant/context";

// ── STOCK, AS ONE SENTENCE AND A DOOR ───────────────────────────────────────
//
// Replaces three StatCards — Products, Low stock, Out of stock — which between
// them occupied three quarters of the home screen's numeric real estate to say
// something a merchant can only act on somewhere else. Two of the three read
// zero on a healthy shop, and a zero in a box labelled "Out of stock" is a
// congratulation nobody needs repeating every time they open the app.
//
// The rule this block follows: say the number that requires action, or say
// nothing. A shop with everything in stock gets a single quiet line; a shop
// with something at zero gets an amber row and a link that lands on the list
// already filtered.
//
// Shop-only, by registry. A kitchen counting portions asks "what can I still
// serve today", which is a different query and therefore a different block —
// this one is never handed a kind and never decides for itself.

export default function Stock({
  stats,
  productCount,
}: {
  stats: DashboardStats | null;
  productCount: number;
}) {
  // Never traded on the catalogue at all: the useful thing is the door, not a
  // count of nothing.
  if (productCount === 0) {
    return (
      <section className="mt-4 rounded-2xl border border-white/10 bg-dark-card p-4">
        <p className="flex items-center gap-2 font-syne text-sm font-bold text-offwhite">
          <Package size={15} className="text-yellow" /> Nothing in your catalogue yet
        </p>
        <p className="mt-1 font-dm text-xs text-muted">
          Add your first product — a name and a price is enough to start selling. You can add a
          photo later.
        </p>
        <Link
          href="/merchant/products/new"
          className="mt-3 inline-flex min-h-[44px] items-center rounded-xl bg-yellow px-5 font-syne text-sm font-bold text-dark"
        >
          Add a product
        </Link>
      </section>
    );
  }

  const out = stats?.outOfStockCount ?? 0;
  const low = stats?.lowStockCount ?? 0;
  const needsAction = out > 0 || low > 0;

  return (
    <section className="mt-4 rounded-2xl border border-white/10 bg-dark-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="flex items-center gap-2 font-syne text-sm font-bold text-offwhite">
          <Package size={15} className="text-yellow" /> Catalogue
        </p>
        <Link href="/merchant/products" className="font-dm text-xs text-muted hover:text-yellow">
          {productCount} item{productCount === 1 ? "" : "s"}
        </Link>
      </div>

      {needsAction ? (
        <Link
          href="/merchant/products"
          className="mt-2 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-3 py-2.5 font-dm text-xs text-amber-200"
        >
          <AlertTriangle size={14} className="shrink-0" />
          <span>
            {/* Out of stock is stated first: it is the one that is actively
                costing a sale right now, not merely approaching. */}
            {out > 0 && (
              <strong>
                {out} item{out === 1 ? "" : "s"} out of stock
              </strong>
            )}
            {out > 0 && low > 0 && ", "}
            {low > 0 && (
              <>
                {low} running low
              </>
            )}
            {" — "}tap to restock
          </span>
        </Link>
      ) : (
        <p className="mt-1 font-dm text-xs text-muted">Everything in stock.</p>
      )}
    </section>
  );
}
