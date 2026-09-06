"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CarFront,
  Clock,
  Camera,
  Loader2,
  MapPin,
  Phone,
  RefreshCw,
} from "lucide-react";

// ── Whose cars are out, and who has them ────────────────────────────────────
//
// The owner: "if someone takes a user car can I be able to track it? if yes, I
// want u to add a option for this in admin dashboard."
//
// The honest answer before this was NO. There was no car-collection job, and a
// search of every column in the database for a plate or a registration returned
// nothing — so a driver could take somebody's car and the platform held no
// record of which car, whose, or what state it was in. /admin/live showed a
// moving dot for the person and nothing about the vehicle.
//
// ── WHY "HELD" IS DERIVED AND NOT A STATUS ────────────────────────────────
// A car is out when it has been COLLECTED and not yet RETURNED. That is read
// from the two handover rows rather than from a status somebody has to remember
// to set, so this list cannot drift away from what actually happened. There is
// no button here that marks a car returned: the only thing that does is a
// driver standing at the car taking a photograph of it.
//
// ── THE NUMBER THAT EARNS COLOUR ──────────────────────────────────────────
// How long it has been gone. Everything else on this panel is context; a car
// that has been out since yesterday is the one to ring about, and on a screen
// that is otherwise calm it has to be the thing the eye lands on.

type Held = {
  requestId: string;
  plate: string;
  vehicle: string | null;
  what: string;
  customerName: string;
  customerPhone: string;
  from: string;
  to: string;
  collectedAt: string;
  heldMinutes: number;
  collectedPhotos: number;
  driverName: string | null;
  driverPhone: string | null;
  lat: number | null;
  lng: number | null;
};

type Totals = {
  jobs: number;
  heldNow: number;
  returned: number;
  neverCollected: number;
};

type Board = { days: number; held: Held[]; totals: Totals | null };

/** "3 h 20" rather than "200 minutes" — nobody counts in minutes past an hour. */
function held(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  if (h < 24) {
    const m = minutes % 60;
    return m === 0 ? `${h} h` : `${h} h ${m}`;
  }
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ${h % 24} h`;
}

export default function VehicleCustody() {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/deliveries?vehicles=1&days=30", {
        cache: "no-store",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not load the vehicles.");
      setBoard(body as Board);
      setError(null);
    } catch (e) {
      // Named, never swallowed. "No cars are out" and "the request failed" look
      // identical here, and the first is the one you must not say by accident
      // about somebody else's car.
      setError(e instanceof Error ? e.message : "Could not load the vehicles.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const t = board?.totals;

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-syne text-base font-bold text-offwhite">
          <CarFront size={17} className="text-yellow" /> Customer cars
          {(t?.heldNow ?? 0) > 0 && (
            <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-0.5 font-dm text-xs text-amber-300">
              {t?.heldNow} out now
            </span>
          )}
        </h2>
        <button
          onClick={() => void load()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 font-dm text-xs text-muted hover:border-yellow/40 hover:text-yellow disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          Refresh
        </button>
      </div>

      {error && (
        <div className="mt-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3">
          <p className="font-dm text-sm text-red-200">{error}</p>
        </div>
      )}

      {busy && !board && (
        <p className="mt-2 flex items-center gap-2 font-dm text-sm text-muted">
          <Loader2 size={15} className="animate-spin" /> Loading…
        </p>
      )}

      {board && !error && board.held.length === 0 && (
        <p className="mt-2 rounded-2xl border border-white/10 bg-dark-card px-4 py-6 text-center font-dm text-sm text-muted">
          {(t?.jobs ?? 0) === 0
            ? "Nobody has asked for a car collection yet."
            : "No customer cars are out right now."}
        </p>
      )}

      {board && !error && board.held.length > 0 && (
        <ul className="mt-2 space-y-2">
          {board.held.map((v) => (
            <li
              key={v.requestId}
              className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.05] px-4 py-3.5"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  {/* The plate first and biggest. It is the one thing that
                      identifies the car in a phone call. */}
                  <p className="font-syne text-lg font-extrabold tracking-wide text-offwhite">
                    {v.plate}
                  </p>
                  <p className="font-dm text-xs text-muted">
                    {v.vehicle ?? v.what}
                  </p>
                </div>
                <span className="shrink-0 text-right">
                  <span className="flex items-center gap-1.5 font-syne text-sm font-bold text-amber-300">
                    <Clock size={13} /> {held(v.heldMinutes)}
                  </span>
                  <span className="mt-0.5 block font-dm text-[11px] text-muted">
                    out of the owner&apos;s hands
                  </span>
                </span>
              </div>

              <p className="mt-2 font-dm text-xs text-muted">
                {v.from} → {v.to}
              </p>

              {/* Both phone numbers, because the two calls an operator makes
                  from this row are to the person who has the car and the person
                  who owns it. */}
              <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 font-dm text-xs">
                {v.driverPhone && (
                  <a
                    href={`tel:${v.driverPhone}`}
                    className="inline-flex items-center gap-1 text-yellow hover:underline"
                  >
                    <Phone size={12} /> {v.driverName ?? "Driver"} · {v.driverPhone}
                  </a>
                )}
                <a
                  href={`tel:${v.customerPhone}`}
                  className="inline-flex items-center gap-1 text-muted hover:text-yellow hover:underline"
                >
                  <Phone size={12} /> {v.customerName} (owner)
                </a>
                <span
                  className={`inline-flex items-center gap-1 ${
                    v.collectedPhotos > 0 ? "text-muted" : "text-red-300"
                  }`}
                >
                  <Camera size={12} />
                  {v.collectedPhotos > 0
                    ? `${v.collectedPhotos} photo${v.collectedPhotos === 1 ? "" : "s"} at pickup`
                    : "no pickup photo"}
                </span>
                {v.lat != null && v.lng != null && (
                  <a
                    href={`https://www.google.com/maps?q=${v.lat},${v.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-muted hover:text-yellow hover:underline"
                  >
                    <MapPin size={12} /> where it was collected
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Booked and never collected: a job that quietly did not happen. The
          customer may still be waiting by their car. */}
      {(t?.neverCollected ?? 0) > 0 && (
        <p className="mt-2 flex items-start gap-2 rounded-xl border border-orange-400/25 bg-orange-400/[0.06] px-4 py-2.5 font-dm text-xs text-orange-200">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          {t?.neverCollected} car collection
          {(t?.neverCollected ?? 0) === 1 ? " was" : "s were"} booked and never
          collected in the last {board?.days} days.
        </p>
      )}
    </section>
  );
}
