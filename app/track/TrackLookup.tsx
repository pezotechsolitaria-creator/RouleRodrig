"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Search, Loader2, Bike, UtensilsCrossed, Ticket, Store, MapPin,
  ArrowRight, AlertTriangle, CalendarCheck,
} from "lucide-react";
import { centsToDecimalString } from "@/lib/money";
import type { Activity, ActivityKind, ActivityStage } from "@/lib/activity";

// ── ONE BOX FOR EVERYTHING ─────────────────────────────────────────────────
//
// The customer used to have to know which page held their thing — and which of
// three reference formats belonged to which page. Now they type whatever is on
// their confirmation and the platform works it out.
//
// The two-factor property is unchanged and deliberate: reference AND email.
// "Show me everything for this email" would be a nicer form and a genuinely bad
// idea — an email address is not a secret, and the result would include home
// addresses on delivery orders.

const KIND_ICON: Record<ActivityKind, React.ElementType> = {
  vehicle: Bike,
  place: MapPin,
  order: Store,
};

const STAGE_STYLE: Record<ActivityStage, string> = {
  pending: "border-orange-400/40 bg-orange-400/10 text-orange-200",
  confirmed: "border-green-500/40 bg-green-500/10 text-green-200",
  active: "border-yellow/50 bg-yellow/15 text-yellow",
  done: "border-white/15 bg-white/5 text-muted",
  cancelled: "border-red-500/30 bg-red-500/10 text-red-200",
};

export default function TrackLookup({ initialRef = "" }: { initialRef?: string }) {
  const [ref, setRef] = useState(initialRef);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);

  const ready = ref.trim().length >= 4 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    setActivity(null);
    try {
      const res = await fetch("/api/activity/lookup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ref: ref.trim(), email: email.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "We couldn't find that.");
      setActivity(body.activity as Activity);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "mt-1 w-full rounded-xl border border-white/10 bg-dark-card px-3.5 py-3 font-dm text-sm text-offwhite placeholder:text-muted focus:border-yellow/50 focus:outline-none";
  const label = "block font-bebas text-[11px] tracking-[0.2em] text-muted";

  return (
    <>
      <form onSubmit={submit} className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-5">
        <div>
          <span className={label}>REFERENCE</span>
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 mt-0.5 -translate-y-1/2 text-muted" />
            <input
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="RR-A1B2C3 or RR260811-D9220F"
              className={`${field} pl-9`}
            />
          </div>
          {/* Says plainly that ONE box takes all of them — otherwise a customer
              holding an order number assumes this is the rentals page. */}
          <p className="mt-1.5 font-dm text-[11px] text-muted">
            Rentals, boat trips, massages, shop orders, food and tickets — all of them.
          </p>
        </div>

        <div className="mt-4">
          <span className={label}>THE EMAIL YOU USED</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="you@example.com"
            className={field}
          />
        </div>

        <button
          type="submit"
          disabled={!ready || busy}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-yellow px-5 py-4 font-dm text-base font-bold text-dark transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {busy ? <Loader2 size={17} className="animate-spin" /> : <Search size={17} />}
          Find it
        </button>
      </form>

      {error && (
        <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-4">
          <p className="flex items-center gap-2 font-syne text-base font-bold text-red-200">
            <AlertTriangle size={17} /> Not found
          </p>
          <p className="mt-1 font-dm text-sm text-red-200/90">{error}</p>
        </div>
      )}

      {activity && <ActivityCard activity={activity} />}
    </>
  );
}

function ActivityCard({ activity }: { activity: Activity }) {
  const Icon = KIND_ICON[activity.kind];
  const KIND_WORD: Record<ActivityKind, string> = {
    vehicle: "Rental",
    place: "Booking",
    order: "Order",
  };

  return (
    <article className="mt-4 rounded-2xl border border-white/10 bg-dark-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-bebas text-[11px] tracking-[0.25em] text-yellow">
            <Icon size={13} /> {KIND_WORD[activity.kind].toUpperCase()}
          </p>
          <h2 className="mt-1 font-syne text-xl font-extrabold text-offwhite">{activity.title}</h2>
          <p className="mt-0.5 font-dm text-sm text-muted">{activity.reference}</p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-3 py-1.5 font-dm text-xs font-semibold ${STAGE_STYLE[activity.stage]}`}
        >
          {activity.statusLabel}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/5 pt-3.5 font-dm text-sm">
        {activity.date && (
          <span className="inline-flex items-center gap-1.5 text-muted">
            <CalendarCheck size={14} />
            {new Date(activity.date).toLocaleDateString("en-GB", {
              day: "numeric", month: "short", year: "numeric",
            })}
          </span>
        )}
        {activity.amount != null && activity.amount > 0 && (
          <span className="font-syne font-extrabold text-yellow">
            Rs {centsToDecimalString(activity.amount)}
          </span>
        )}
      </div>

      {/* Straight to the surface that owns this kind, which is where the real
          detail lives — the QR code, the bank details, the pickup address. */}
      <Link
        href={activity.href}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-yellow px-5 py-3.5 font-dm text-sm font-bold text-dark transition-opacity hover:opacity-90"
      >
        See the full details <ArrowRight size={15} />
      </Link>
    </article>
  );
}
