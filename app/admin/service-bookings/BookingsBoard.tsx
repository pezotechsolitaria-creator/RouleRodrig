"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  Globe,
  Loader2,
  Phone,
  Wrench,
} from "lucide-react";
import { STATUS_VOCAB, clockRange, dayLabelAt, type BookingStatus } from "@/lib/services/diary";

type Booking = {
  id: string;
  service: string;
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  customerName: string;
  customerPhone: string;
  note: string | null;
  source: "provider" | "customer" | "admin";
};

type Business = {
  storeId: string;
  name: string;
  slug: string;
  trade: string;
  mobile: boolean;
  online: boolean;
  published: boolean;
  bookableServices: number;
  upcoming: number;
  noShows: number;
  cancelled: number;
  fromCustomers: number;
  bookings: Booking[];
};

// ── Every diary on the island ───────────────────────────────────────────────
//
// Not a copy of the provider's screen. Theirs answers "what does Thursday look
// like"; this one answers "is this working, and is anybody in trouble" — so the
// business is the row and the warnings are the point.
//
// ── THE WARNINGS ARE THE FEATURE ───────────────────────────────────────────
// A trade with no bookable service and a trade nobody has booked look identical
// from the outside: an empty diary. They are completely different problems —
// one is a broken setup the owner can fix in a phone call, the other is
// marketing. So the board says which.

export default function BookingsBoard() {
  const [data, setData] = useState<{ businesses: Business[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/service-bookings?days=30", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not load bookings.");
      setData(body);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load bookings.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(bookingId: string, status: BookingStatus) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/service-bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "status", bookingId, status }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "That did not go through.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not go through.");
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) {
    return (
      <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 font-dm text-sm text-red-200">
        {error}
      </p>
    );
  }
  if (!data) {
    return (
      <p className="flex items-center gap-2 font-dm text-sm text-muted">
        <Loader2 size={15} className="animate-spin" /> Loading…
      </p>
    );
  }
  if (data.businesses.length === 0) {
    return (
      <p className="rounded-2xl border border-white/10 bg-dark-card p-4 font-dm text-sm text-muted">
        No trades are set up yet. A store becomes one when it is given a trade —
        a car wash, a plumber, a mechanic — on the stores desk.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 font-dm text-sm text-red-200">
          {error}
        </p>
      )}

      {data.businesses.map((b) => {
        // A setup that cannot possibly take a booking, said in the words that
        // name the fix. An empty diary caused by this looks exactly like an
        // empty diary caused by nobody wanting a car wash.
        const faults: string[] = [];
        if (b.bookableServices === 0) faults.push("no service has a length set, so nothing can be booked");
        if (!b.published) faults.push("the shop is not published, so nobody can find it");
        if (!b.online) faults.push("online booking is switched off");

        return (
          <section key={b.storeId} className="rounded-2xl border border-white/10 bg-dark-card">
            <button
              onClick={() => setOpen(open === b.storeId ? null : b.storeId)}
              aria-expanded={open === b.storeId}
              className="flex w-full items-start justify-between gap-3 p-4 text-left"
            >
              <span className="min-w-0">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-syne text-sm font-bold text-offwhite">{b.name}</span>
                  <span className="inline-flex items-center gap-1 font-dm text-xs text-muted">
                    <Wrench size={11} /> {b.trade}
                  </span>
                  {b.online && b.published && (
                    <span className="inline-flex items-center gap-1 font-dm text-[11px] text-muted">
                      <Globe size={10} /> takes bookings online
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block font-dm text-xs text-muted">
                  {b.upcoming === 0 ? "Nothing booked ahead" : `${b.upcoming} coming up`}
                  {b.fromCustomers > 0 && ` · ${b.fromCustomers} booked online in 30 days`}
                  {b.noShows > 0 && ` · ${b.noShows} did not turn up`}
                  {b.cancelled > 0 && ` · ${b.cancelled} cancelled`}
                </span>
                {faults.length > 0 && (
                  <span className="mt-1.5 flex items-start gap-1.5 font-dm text-xs text-amber-300">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                    {/* Joined into one sentence rather than a list of badges:
                        these are all the same problem — this business cannot
                        take a booking — and three badges read as three. */}
                    {faults.join("; ")}.
                  </span>
                )}
              </span>
              <ChevronDown
                size={16}
                className={`mt-1 shrink-0 text-muted transition-transform ${open === b.storeId ? "rotate-180" : ""}`}
              />
            </button>

            {open === b.storeId && (
              <div className="border-t border-white/10 p-4">
                {b.bookings.length === 0 ? (
                  <p className="font-dm text-sm text-muted">
                    Nothing in the last 30 days and nothing ahead.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {b.bookings.map((bk) => {
                      const v = STATUS_VOCAB[bk.status];
                      return (
                        <li
                          key={bk.id}
                          className={`rounded-xl border border-white/10 p-3 ${v.holdsTime ? "" : "opacity-60"}`}
                        >
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                            <span className="font-dm text-xs text-muted">{dayLabelAt(bk.startsAt)}</span>
                            <span className="font-syne text-sm font-bold tabular-nums text-yellow">
                              {clockRange(bk.startsAt, bk.endsAt)}
                            </span>
                            <span className="font-dm text-sm text-offwhite">{bk.service}</span>
                            {!v.holdsTime && (
                              <span className="rounded-full border border-white/20 px-2 font-bebas text-[9px] tracking-[0.15em] text-muted">
                                {v.label.toUpperCase()}
                              </span>
                            )}
                            {bk.source === "customer" && (
                              <span className="font-dm text-[11px] text-muted">booked online</span>
                            )}
                          </div>
                          <p className="mt-1 flex flex-wrap items-center gap-x-3 font-dm text-xs text-muted">
                            <span className="text-offwhite/80">{bk.customerName}</span>
                            <a
                              href={`tel:${bk.customerPhone.replace(/\s/g, "")}`}
                              className="inline-flex items-center gap-1 hover:text-yellow"
                            >
                              <Phone size={11} /> {bk.customerPhone}
                            </a>
                          </p>
                          {bk.note && (
                            <p className="mt-0.5 font-dm text-xs text-muted/80">{bk.note}</p>
                          )}
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {(bk.status === "booked"
                              ? (["done", "no_show", "cancelled"] as BookingStatus[])
                              : (["booked"] as BookingStatus[])
                            ).map((next) => (
                              <button
                                key={next}
                                disabled={busy}
                                onClick={() => void setStatus(bk.id, next)}
                                className="min-h-9 rounded-full border border-white/15 px-3 font-dm text-xs text-muted transition-colors hover:border-yellow/50 hover:text-yellow disabled:opacity-40"
                              >
                                {STATUS_VOCAB[next].action}
                              </button>
                            ))}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
