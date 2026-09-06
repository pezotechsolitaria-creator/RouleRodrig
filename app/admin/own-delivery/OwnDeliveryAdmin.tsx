"use client";

import { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";

type Row = {
  id: string;
  name: string;
  slug: string;
  status: string;
  enabled: boolean;
  trackingApproved: boolean;
  note: string | null;
};

export default function OwnDeliveryAdmin() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");

  async function load() {
    const res = await fetch("/api/admin/own-delivery");
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Couldn't load shops.");
      return;
    }
    setRows(data.stores);
  }

  useEffect(() => {
    load().catch(() => setError("Couldn't load shops."));
  }, []);

  async function toggle(row: Row) {
    setBusy(row.id);
    try {
      const res = await fetch("/api/admin/own-delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: row.id, approved: !row.trackingApproved }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "That didn't work.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  }

  if (error) {
    return (
      <p className="mt-6 rounded-xl border border-red-400/30 bg-red-500/[0.07] p-4 font-dm text-sm text-red-300">
        {error}
      </p>
    );
  }

  if (!rows) {
    return <Loader2 size={18} className="mt-8 animate-spin text-muted" />;
  }

  const needle = q.trim().toLowerCase();
  const shown = needle
    ? rows.filter((r) => r.name.toLowerCase().includes(needle) || r.slug.includes(needle))
    : rows;
  const on = rows.filter((r) => r.trackingApproved).length;

  return (
    <div className="mt-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a shop"
            className="min-h-[44px] w-full rounded-xl border border-white/15 bg-dark-card pl-9 pr-3 font-dm text-sm text-offwhite placeholder:text-muted/60"
          />
        </div>
        <span className="shrink-0 font-dm text-xs text-muted">
          {on} of {rows.length} on
        </span>
      </div>

      <ul className="mt-4 space-y-2">
        {shown.map((r) => (
          <li
            key={r.id}
            className="flex items-center gap-3 rounded-xl border border-white/10 bg-dark-card p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-dm text-sm font-semibold text-offwhite">{r.name}</p>
              <p className="font-dm text-[11px] text-muted">
                {r.status !== "active" && <span className="text-muted/70">{r.status} · </span>}
                {/* The merchant's own switch, shown because approving tracking
                    for a shop that does not deliver turns it on for them — and
                    an admin should know they are doing that. */}
                {r.enabled ? "delivers its own orders" : "not delivering its own orders yet"}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={r.trackingApproved}
              aria-label={`Tracked delivery for ${r.name}`}
              disabled={busy === r.id}
              onClick={() => toggle(r)}
              className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-40 ${
                r.trackingApproved ? "bg-green-500" : "bg-white/15"
              }`}
            >
              <span
                className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform ${
                  r.trackingApproved ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </li>
        ))}
      </ul>

      {shown.length === 0 && (
        <p className="mt-4 font-dm text-sm text-muted">No shop matches that.</p>
      )}
    </div>
  );
}
