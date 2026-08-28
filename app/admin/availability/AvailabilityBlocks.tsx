"use client";

import { useEffect, useState } from "react";
import { CalendarOff, Loader2, Trash2, Plus } from "lucide-react";

// ── "THIS ONE IS GONE UNTIL FRIDAY" ─────────────────────────────────────────
//
// The screen behind the reported bug: a date showing free on the website while
// the scooter is already lent out. The availability engine was never stale —
// it reads live rows on every request — it simply had no way to hear about a
// vehicle that left through the door rather than through the site.
//
// So this is deliberately the smallest thing that can be true: pick a vehicle,
// pick two dates, say why in your own words, save. It has to be usable on a
// phone at the counter with a customer waiting, which is the moment it will
// actually be used.

type Block = {
  id: string;
  scooter: string;
  start_date: string;
  end_date: string;
  asset_id: string | null;
  reason: string | null;
};

type Vehicle = { id: string; name: string };

const today = () => new Date().toISOString().slice(0, 10);

export default function AvailabilityBlocks({
  vehicles,
}: {
  vehicles: Vehicle[];
}) {
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [scooter, setScooter] = useState(vehicles[0]?.id ?? "");
  const [start, setStart] = useState(today());
  const [end, setEnd] = useState(today());
  const [reason, setReason] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/availability-blocks", {
          cache: "no-store",
        });
        const json = await res.json();
        if (!cancelled) setBlocks(json.blocks ?? []);
      } catch {
        if (!cancelled) setBlocks([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function reload() {
    const res = await fetch("/api/admin/availability-blocks", {
      cache: "no-store",
    });
    const json = await res.json();
    setBlocks(json.blocks ?? []);
  }

  async function add() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/availability-blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scooter,
          start_date: start,
          end_date: end,
          reason,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not save that.");
        return;
      }
      setReason("");
      await reload();
    } catch {
      setError("Could not save that — check your connection.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    // Giving dates BACK is the one action here that can cost money if it is
    // wrong: the vehicle goes back on sale immediately.
    if (!window.confirm("Put this vehicle back on sale for these dates?"))
      return;
    await fetch(`/api/admin/availability-blocks?id=${id}`, {
      method: "DELETE",
    });
    await reload();
  }

  const nameOf = (id: string) => vehicles.find((v) => v.id === id)?.name ?? id;

  return (
    <section>
      <h2 className="flex items-center gap-2 font-syne text-base font-extrabold">
        <CalendarOff size={16} className="text-yellow" /> Take a vehicle off the
        calendar
      </h2>
      <p className="mt-1 font-dm text-[13px] text-muted">
        Lent to somebody, in for a service, or rented at the counter. The
        website stops offering it the moment you save.
      </p>

      <div className="mt-4 rounded-2xl border border-white/10 bg-dark-card p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="font-dm text-[11px] uppercase tracking-wider text-muted">
              Vehicle
            </span>
            <select
              value={scooter}
              onChange={(e) => setScooter(e.target.value)}
              className="mt-1 min-h-12 w-full rounded-xl border border-white/15 bg-dark px-3 font-dm text-[16px] text-offwhite"
            >
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="font-dm text-[11px] uppercase tracking-wider text-muted">
              Why (only you see this)
            </span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Lent to Marco · service · booked by phone"
              className="mt-1 min-h-12 w-full rounded-xl border border-white/15 bg-dark px-3 font-dm text-[16px] text-offwhite placeholder:text-muted/60"
            />
          </label>

          <label className="block">
            <span className="font-dm text-[11px] uppercase tracking-wider text-muted">
              First day gone
            </span>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="mt-1 min-h-12 w-full rounded-xl border border-white/15 bg-dark px-3 font-dm text-[16px] text-offwhite"
            />
          </label>

          <label className="block">
            <span className="font-dm text-[11px] uppercase tracking-wider text-muted">
              Last day gone
            </span>
            <input
              type="date"
              value={end}
              min={start}
              onChange={(e) => setEnd(e.target.value)}
              className="mt-1 min-h-12 w-full rounded-xl border border-white/15 bg-dark px-3 font-dm text-[16px] text-offwhite"
            />
          </label>
        </div>

        {/* Both days are INCLUSIVE, and saying so prevents the classic mistake:
            a scooter handed back on the 14th being blocked, or offered, on the
            wrong day. */}
        <p className="mt-2 font-dm text-[11px] text-muted">
          Both days included. If it comes back on the 15th, put the 14th as the
          last day gone.
        </p>

        {error && (
          <p role="alert" className="mt-2 font-dm text-sm text-red-400">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={() => void add()}
          disabled={busy || !scooter}
          className="mt-3 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-yellow px-5 font-dm text-sm font-bold text-dark disabled:opacity-50"
        >
          {busy ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Plus size={16} />
          )}
          Take it off the calendar
        </button>
      </div>

      <div className="mt-4">
        {blocks === null && (
          <p className="flex items-center gap-2 font-dm text-sm text-muted">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </p>
        )}
        {blocks !== null && blocks.length === 0 && (
          <p className="rounded-2xl border border-white/10 bg-dark-card px-5 py-6 text-center font-dm text-sm text-muted">
            Nothing is off the calendar. Every vehicle is being offered for
            every date it is not already booked.
          </p>
        )}
        {blocks !== null && blocks.length > 0 && (
          <ul className="space-y-2">
            {blocks.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-dark-card px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-dm text-sm text-offwhite">
                    {nameOf(b.scooter)}
                  </p>
                  <p className="font-dm text-xs tabular-nums text-muted">
                    {b.start_date} → {b.end_date}
                    {b.reason ? ` · ${b.reason}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void remove(b.id)}
                  aria-label={`Put ${nameOf(b.scooter)} back on sale for ${b.start_date} to ${b.end_date}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/15 text-muted hover:border-red-400/50 hover:text-red-400"
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
