"use client";

import { useCallback, useEffect, useState } from "react";
import { ClipboardList, Boxes, Loader2, RefreshCw } from "lucide-react";
import ShopOrderQueue from "./ShopOrderQueue";
import StockPanel from "./StockPanel";

// Two jobs, two tabs — the same arrangement as /admin/food and /kitchen.
// Orders first and by default: during trading that is the only screen that
// matters, and stock is set once at the start of a day.
//
// The shop list is loaded ONCE here and handed to both panels, so the two
// cannot disagree about which shops exist and neither has to re-derive
// "everything that is not a kitchen" for itself.

type Shop = { id: string; name: string };

export default function MarketplaceOps() {
  const [tab, setTab] = useState<"orders" | "stock">("orders");
  const [shops, setShops] = useState<Shop[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/marketplace-ops/orders?scope=open");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not load shops.");
      setShops((body.shops as Shop[]) ?? []);
      setError(null);
    } catch (e) {
      // Stated, never swallowed. A silent catch here would render an empty
      // desk that reads as "there are no shops" — which is exactly how the
      // food menu panel came to say "add a kitchen first" with four live.
      setError(e instanceof Error ? e.message : "Could not load shops.");
    }
  }, []);

  // Not `void load()` in the effect body: that sets state synchronously from
  // React's point of view, and it also lets a slow first response land after
  // the panel has gone. The cancel flag is the canonical fix for both.
  useEffect(() => {
    let cancelled = false;
    void (async () => { if (!cancelled) await load(); })();
    return () => { cancelled = true; };
  }, [load]);

  const tabCls = (active: boolean) =>
    `flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl font-syne text-sm font-bold transition-colors ${
      active ? "bg-yellow text-dark" : "border border-white/15 text-offwhite"
    }`;

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-4">
        <p className="font-dm text-sm text-red-200">{error}</p>
        <button
          onClick={() => void load()}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 font-dm text-xs text-offwhite hover:border-yellow/40"
        >
          <RefreshCw size={13} /> Try again
        </button>
      </div>
    );
  }

  if (shops === null) {
    return (
      <p className="flex items-center gap-2 font-dm text-sm text-muted">
        <Loader2 size={15} className="animate-spin" /> Loading the desk…
      </p>
    );
  }

  if (shops.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-dark-card px-6 py-10 text-center">
        <p className="font-syne text-lg font-bold text-offwhite">No shops yet</p>
        <p className="mt-1.5 font-dm text-sm text-muted">
          Every store on the platform is currently a kitchen — those are run from the Food desk.
          A shop appears here as soon as one is approved.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button onClick={() => setTab("orders")} className={tabCls(tab === "orders")}>
          <ClipboardList size={15} /> Orders
        </button>
        <button onClick={() => setTab("stock")} className={tabCls(tab === "stock")}>
          <Boxes size={15} /> Prices &amp; stock
        </button>
      </div>

      {tab === "orders" ? <ShopOrderQueue shops={shops} /> : <StockPanel shops={shops} />}
    </div>
  );
}
