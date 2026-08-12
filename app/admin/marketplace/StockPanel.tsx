"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, PackageX, Search, AlertTriangle } from "lucide-react";
import { DraftInput, parseLooseNumber } from "@/components/ui/draft-input";
import { shopWrite, type ShopProduct, type ShopVariant } from "./types";

// ── Prices and stock, editable by the owner on a seller's behalf ───────────
//
// The owner, about restaurants: "if they are not computer literate, WE, the
// admin, can do it for them in our main dashboard." The same is true of a
// marketplace seller, more so — a shop has real stock counts that go wrong at
// exactly the moment nobody is near a laptop.
//
// Three controls per item, because three things actually change during a
// trading day: the price, how many are left, and whether it is for sale at all.
// Creating and deleting products stays in /merchant, where the seller owns
// their catalogue; this desk keeps a live shop CORRECT, it does not take the
// business over.
//
// The number fields use DraftInput. A plain controlled input that re-derives
// its value from parsed state destroys half-typed text — that is the bug that
// made prices impossible to type ("12." parsed to 1200 and rendered back "12")
// and every Rodrigues latitude impossible to enter. Same component, same
// reason, do not swap it back for a raw <input>.

type Draft = { price?: string; stock?: string };

function lowStock(v: ShopVariant): boolean {
  if (v.stock == null) return false;
  const threshold = v.lowStockThreshold ?? 0;
  return v.stock <= threshold;
}

export default function StockPanel({ shops }: { shops: { id: string; name: string }[] }) {
  const [products, setProducts] = useState<ShopProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [storeId, setStoreId] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (storeId) params.set("storeId", storeId);
    try {
      const res = await fetch(`/api/admin/marketplace-ops/products?${params}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to load products.");
      setProducts(body.products ?? []);
      setError(null);
    } catch (e) {
      setProducts(null);
      setError(e instanceof Error ? e.message : "Failed to load products.");
    }
  }, [storeId]);

  // Not `void load()` in the effect body: that sets state synchronously from
  // React's point of view, and it also lets a slow first response land after
  // the panel has gone. The cancel flag is the canonical fix for both.
  useEffect(() => {
    let cancelled = false;
    void (async () => { if (!cancelled) await load(); })();
    return () => { cancelled = true; };
  }, [load]);

  const save = useCallback(
    async (variant: ShopVariant, patch: Record<string, unknown>, what: string) => {
      setBusy(variant.id);
      const result = await shopWrite("/api/admin/marketplace-ops/products", {
        method: "PATCH",
        body: JSON.stringify({ variantId: variant.id, ...patch }),
      });
      setBusy(null);
      if (!result.ok) { toast.error(result.error); return; }
      toast.success(what);
      // Clear the draft so the field re-syncs to what the server now holds.
      setDrafts((d) => ({ ...d, [variant.id]: {} }));
      void load();
    },
    [load],
  );

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return products ?? [];
    return (products ?? []).filter(
      (p) =>
        p.name.toLowerCase().includes(needle) ||
        p.storeName.toLowerCase().includes(needle) ||
        p.variants.some((v) => (v.name ?? "").toLowerCase().includes(needle) || (v.sku ?? "").toLowerCase().includes(needle)),
    );
  }, [products, q]);

  const lowCount = useMemo(
    () => (products ?? []).reduce((n, p) => n + p.variants.filter((v) => v.isActive && lowStock(v)).length, 0),
    [products],
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
          className="rounded-full border border-white/10 bg-dark-card px-3 py-1.5 font-dm text-xs text-offwhite"
        >
          <option value="">All shops</option>
          {shops.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <label className="inline-flex flex-1 items-center gap-2 rounded-full border border-white/10 bg-dark-card px-3 py-1.5">
          <Search size={13} className="shrink-0 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find an item…"
            className="w-full bg-transparent font-dm text-xs text-offwhite placeholder:text-muted focus:outline-none"
          />
        </label>
      </div>

      {/* The one number worth interrupting for. A shop that has quietly run to
          zero is still taking orders it cannot fill. */}
      {lowCount > 0 && (
        <p className="mt-3 inline-flex items-center gap-2 rounded-xl border border-orange-400/40 bg-orange-400/10 px-3 py-2 font-dm text-xs text-orange-200">
          <AlertTriangle size={14} />
          {lowCount === 1 ? "1 item is out or nearly out" : `${lowCount} items are out or nearly out`}
        </p>
      )}

      {error && (
        <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 font-dm text-sm text-red-200">
          {error}
        </div>
      )}

      {products === null && !error && (
        <div className="mt-8 flex items-center gap-2 font-dm text-sm text-muted">
          <Loader2 size={15} className="animate-spin" /> Loading the catalogue…
        </div>
      )}

      {products !== null && visible.length === 0 && (
        <div className="mt-8 rounded-2xl border border-white/10 bg-dark-card px-6 py-10 text-center">
          <PackageX size={24} className="mx-auto text-muted" />
          <p className="mt-2 font-syne text-lg font-bold text-offwhite">Nothing here</p>
          <p className="mt-1.5 font-dm text-sm text-muted">
            {q.trim()
              ? "No item matches that search."
              : "These shops have no products yet. Sellers add them in their own dashboard."}
          </p>
        </div>
      )}

      <div className="mt-5 space-y-4">
        {visible.map((p) => (
          <article key={p.id} className="rounded-2xl border border-white/10 bg-dark-card p-4">
            <header className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-syne text-base font-extrabold text-offwhite">
                {p.name}
                <span className="ml-2 font-dm text-xs font-normal text-muted">{p.storeName}</span>
              </p>
              {p.status !== "active" && (
                <span className="rounded-full border border-white/15 px-2 py-0.5 font-dm text-[11px] text-muted">
                  {p.status}
                </span>
              )}
            </header>

            <div className="mt-3 space-y-3">
              {p.variants.map((v) => {
                const draft = drafts[v.id] ?? {};
                return (
                  <div
                    key={v.id}
                    className={`rounded-xl border p-3 ${
                      !v.isActive
                        ? "border-white/10 bg-dark/40 opacity-60"
                        : lowStock(v)
                          ? "border-orange-400/40 bg-orange-400/[0.06]"
                          : "border-white/10"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-dm text-sm text-offwhite">
                        {v.name || "Standard"}
                        {v.sku && <span className="ml-2 text-xs text-muted">{v.sku}</span>}
                      </p>
                      {busy === v.id && <Loader2 size={14} className="animate-spin text-yellow" />}
                    </div>

                    <div className="mt-2.5 flex flex-wrap items-end gap-3">
                      <label className="flex flex-col gap-1">
                        <span className="font-bebas text-[10px] tracking-[0.2em] text-muted">PRICE (RS)</span>
                        <DraftInput
                          inputMode="decimal"
                          value={(v.price / 100).toFixed(2)}
                          onChange={(raw) => setDrafts((d) => ({ ...d, [v.id]: { ...draft, price: raw } }))}
                          onBlur={(raw) => {
                            const n = parseLooseNumber(raw.replace(",", "."));
                            if (n === null) return;
                            const minor = Math.round(n * 100);
                            if (minor === v.price) return;
                            if (minor < 0) { toast.error("A price cannot be negative."); return; }
                            void save(v, { price: minor }, `${p.name} is now Rs ${(minor / 100).toFixed(2)}`);
                          }}
                          className="w-28 rounded-lg border border-white/15 bg-dark px-2.5 py-2 font-dm text-sm text-offwhite focus:border-yellow/50 focus:outline-none"
                        />
                      </label>

                      <label className="flex flex-col gap-1">
                        <span className="font-bebas text-[10px] tracking-[0.2em] text-muted">IN STOCK</span>
                        <DraftInput
                          inputMode="numeric"
                          value={v.stock == null ? "" : String(v.stock)}
                          placeholder="—"
                          onChange={(raw) => setDrafts((d) => ({ ...d, [v.id]: { ...draft, stock: raw } }))}
                          onBlur={(raw) => {
                            if (raw.trim() === "") return;
                            const n = parseLooseNumber(raw);
                            if (n === null || !Number.isInteger(n)) return;
                            if (n === v.stock) return;
                            if (n < 0) { toast.error("Stock cannot be negative."); return; }
                            void save(v, { stock: n }, `${p.name}: ${n} in stock`);
                          }}
                          className="w-24 rounded-lg border border-white/15 bg-dark px-2.5 py-2 font-dm text-sm text-offwhite focus:border-yellow/50 focus:outline-none"
                        />
                      </label>

                      <button
                        onClick={() =>
                          void save(
                            v,
                            { isActive: !v.isActive },
                            v.isActive ? `${p.name} taken off sale` : `${p.name} back on sale`,
                          )
                        }
                        disabled={busy !== null}
                        className={`min-h-[38px] rounded-lg px-3 font-dm text-xs font-semibold disabled:opacity-50 ${
                          v.isActive
                            ? "border border-white/20 text-offwhite hover:border-red-400/50 hover:text-red-300"
                            : "bg-yellow text-dark"
                        }`}
                      >
                        {v.isActive ? "Take off sale" : "Put back on sale"}
                      </button>
                    </div>

                    {v.isActive && lowStock(v) && (
                      <p className="mt-2 font-dm text-xs text-orange-300">
                        {v.stock === 0 ? "Out of stock — customers cannot buy this." : `Only ${v.stock} left.`}
                      </p>
                    )}
                  </div>
                );
              })}
              {p.variants.length === 0 && (
                <p className="font-dm text-xs text-muted">This product has no sellable options yet.</p>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
