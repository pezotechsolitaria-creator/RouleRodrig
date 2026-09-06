"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ClipboardCheck,
  Clock,
  ExternalLink,
  Loader2,
  Phone,
  RefreshCw,
} from "lucide-react";
import { centsToDecimalString } from "@/lib/money";
import { ERRAND_LABEL, isErrandKind } from "@/lib/delivery/kind";

// ── The Do It For Me desk ───────────────────────────────────────────────────
//
// WHAT THIS DELIBERATELY IS NOT. /admin/deliveries already triages individual
// jobs — who is late, who is stuck, which driver to ring — and an errand flows
// through it like any other request. A second list of the same rows would have
// been a third screen showing the same thing, which this codebase has done
// before.
//
// This answers what that board structurally cannot: IS THE SERVICE WORKING. A
// new service line does not fail loudly. Requests arrive, no driver answers,
// the customer waits out the expiry and never comes back — and on the
// operations board every one of those jobs looked merely "open" while the line
// quietly died. So the top of this screen is a funnel and a silence count, not
// a queue.
//
// The one number that earns colour is jobs that got NO PRICE AT ALL. That is
// the only failure here nobody is told about: the customer sees an empty
// tracker, the driver never saw a job worth opening, and neither of them
// reports anything.

type Live = {
  id: string;
  what: string;
  /** What SORT of errand. Always set here, since every row is one. */
  errandKind: string | null;
  status: string;
  pickupText: string;
  dropoffText: string;
  contactName: string;
  contactPhone: string;
  spendCap: number | null;
  createdAt: string;
  expiresAt: string | null;
  waitingMinutes: number;
  quoteCount: number;
  bestQuote: number | null;
};

type Totals = {
  posted: number;
  open: number;
  booked: number;
  expired: number;
  cancelled: number;
  settled: number;
  neverQuoted: number;
  medianFirstQuoteMinutes: number | null;
  moneyLaidOut: number;
};

type Ask = { ask: string; n: number; booked: number };

type KindRow = {
  errandKind: string;
  n: number;
  booked: number;
  neverQuoted: number;
};

type Board = {
  days: number;
  live: Live[];
  totals: Totals | null;
  kinds: KindRow[];
  asks: Ask[];
};

const RANGES = [7, 30, 90] as const;

/** "3 h 20" rather than "200 minutes" — nobody counts in minutes past an hour. */
function waited(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m}`;
}

export default function ServicesPanel() {
  const [days, setDays] = useState<number>(30);
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (d: number) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/marketplace-ops/services?days=${d}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not load the services desk.");
      setBoard(body as Board);
      setError(null);
    } catch (e) {
      // Named, never swallowed. A silent catch renders an empty desk that reads
      // as "nobody has used this", which is the one wrong answer here — it is
      // exactly the state the owner is watching for.
      setError(e instanceof Error ? e.message : "Could not load the services desk.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!cancelled) await load(days);
    })();
    return () => {
      cancelled = true;
    };
  }, [load, days]);

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-4">
        <p className="font-dm text-sm text-red-200">{error}</p>
        <button
          onClick={() => void load(days)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 font-dm text-xs text-offwhite hover:border-yellow/40"
        >
          <RefreshCw size={13} /> Try again
        </button>
      </div>
    );
  }

  if (!board) {
    return (
      <p className="flex items-center gap-2 font-dm text-sm text-muted">
        <Loader2 size={15} className="animate-spin" /> Loading the services desk…
      </p>
    );
  }

  const t = board.totals;
  const posted = t?.posted ?? 0;
  // Of the jobs that have had a fair chance, how many nobody priced. Anything
  // posted in the last hour is excluded by the RPC — it has not yet failed.
  const silent = t?.neverQuoted ?? 0;
  const settled = t?.settled ?? 0;

  return (
    <div className="space-y-4">
      {/* ── The range ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1.5">
          {RANGES.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`min-h-[36px] rounded-full px-3.5 font-dm text-xs transition-colors ${
                days === d
                  ? "bg-yellow font-bold text-dark"
                  : "border border-white/15 text-muted hover:border-yellow/40"
              }`}
            >
              {d} days
            </button>
          ))}
        </div>
        <button
          onClick={() => void load(days)}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 font-dm text-xs text-muted hover:border-yellow/40 hover:text-yellow disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          Refresh
        </button>
      </div>

      {posted === 0 ? (
        // Zero is the honest answer for a service that has just opened, and it
        // must not look like a broken screen. It says what the thing IS and
        // where to go and see it, because at this point the owner's only real
        // question is whether it is actually live.
        <div className="rounded-2xl border border-white/10 bg-dark-card px-6 py-10 text-center">
          <ClipboardCheck size={26} className="mx-auto text-yellow" />
          <p className="mt-3 font-syne text-lg font-bold text-offwhite">
            Nobody has asked yet
          </p>
          <p className="mx-auto mt-1.5 max-w-md font-dm text-sm text-muted">
            &ldquo;Do it for me&rdquo; is live on the request form — paying a bill, queuing at
            the bank, filling a gas bottle. Nothing has been posted in the last{" "}
            {board.days} days.
          </p>
          <Link
            href="/deliver"
            target="_blank"
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3.5 py-2 font-dm text-sm text-muted hover:border-yellow/40 hover:text-yellow"
          >
            See the form <ExternalLink size={13} />
          </Link>
        </div>
      ) : (
        <>
          {/* ── The funnel ───────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "Asked for", value: posted },
              { label: "Booked", value: t?.booked ?? 0 },
              { label: "Still open", value: t?.open ?? 0 },
              {
                label: "Gave up / expired",
                value: (t?.expired ?? 0) + (t?.cancelled ?? 0),
              },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-2xl border border-white/10 bg-dark-card px-4 py-3.5"
              >
                <p className="font-syne text-2xl font-extrabold tabular-nums text-offwhite">
                  {s.value}
                </p>
                <p className="mt-0.5 font-dm text-xs text-muted">{s.label}</p>
              </div>
            ))}
          </div>

          {/* ── The silence ──────────────────────────────────────────────── */}
          {silent > 0 && (
            <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.07] px-4 py-3.5">
              <p className="flex items-start gap-2 font-dm text-sm text-amber-300">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                <span>
                  <span className="font-bold">
                    {silent} of {settled} got no price at all.
                  </span>{" "}
                  Nobody is told when this happens — the customer watches an empty
                  tracker and the job quietly expires. If this number keeps
                  climbing, the drivers on the board cannot or will not take
                  errands, and the fix is a person, not the software.
                </span>
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-x-6 gap-y-1.5 px-1 font-dm text-xs text-muted">
            <span>
              First price after{" "}
              <span className="text-offwhite">
                {t?.medianFirstQuoteMinutes == null
                  ? "—"
                  : waited(t.medianFirstQuoteMinutes)}
              </span>{" "}
              (median)
            </span>
            {(t?.moneyLaidOut ?? 0) > 0 && (
              <span>
                Drivers fronted up to{" "}
                <span className="text-offwhite">
                  Rs {centsToDecimalString(t?.moneyLaidOut ?? 0)}
                </span>{" "}
                on booked jobs
              </span>
            )}
          </div>

          {/* ── Waiting right now ────────────────────────────────────────── */}
          {board.live.length > 0 && (
            <section>
              <h3 className="px-1 font-syne text-sm font-bold text-offwhite">
                Waiting for a price
              </h3>
              <ul className="mt-2 space-y-2">
                {board.live.map((r) => (
                  <li
                    key={r.id}
                    className={`rounded-2xl border px-4 py-3.5 ${
                      r.quoteCount === 0
                        ? "border-amber-400/30 bg-amber-400/[0.05]"
                        : "border-white/10 bg-dark-card"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="min-w-0 font-syne text-base font-bold text-offwhite">
                        {r.what}
                      </p>
                      <span
                        className={`shrink-0 font-dm text-xs tabular-nums ${
                          r.quoteCount === 0 ? "text-amber-300" : "text-muted"
                        }`}
                      >
                        {r.quoteCount === 0
                          ? "No price yet"
                          : `${r.quoteCount} price${r.quoteCount === 1 ? "" : "s"}`}
                        {r.bestQuote != null &&
                          ` · from Rs ${centsToDecimalString(r.bestQuote)}`}
                      </span>
                    </div>
                    <p className="mt-1 font-dm text-xs text-muted">
                      {isErrandKind(r.errandKind) && (
                        <>{ERRAND_LABEL[r.errandKind]} · </>
                      )}
                      {r.pickupText} → {r.dropoffText}
                      {r.spendCap != null && (
                        <> · up to Rs {centsToDecimalString(r.spendCap)} to spend</>
                      )}
                    </p>
                    {/* The phone number is the whole point of this row. When a
                        job has sat unpriced, the useful act is to ring the
                        customer before they give up on the platform. */}
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-dm text-xs">
                      <span className="inline-flex items-center gap-1 text-muted">
                        <Clock size={12} /> waiting {waited(r.waitingMinutes)}
                      </span>
                      <a
                        href={`tel:${r.contactPhone}`}
                        className="inline-flex items-center gap-1 text-yellow hover:underline"
                      >
                        <Phone size={12} /> {r.contactName} · {r.contactPhone}
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ── By category ───────────────────────────────────────────────── */}
          {board.kinds.length > 0 && (
            <section>
              <h3 className="px-1 font-syne text-sm font-bold text-offwhite">
                Which kinds get taken
              </h3>
              {/* Asked against booked, per category. A row with plenty asked
                  and none booked is not a slow week — it is a kind of job
                  nobody on this island will take, and no amount of software
                  fixes that one. */}
              <ul className="mt-2 divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/10 bg-dark-card">
                {board.kinds.map((k) => (
                  <li
                    key={k.errandKind}
                    className="flex items-center justify-between gap-3 px-4 py-2.5"
                  >
                    <span className="min-w-0 truncate font-dm text-sm text-offwhite">
                      {isErrandKind(k.errandKind)
                        ? ERRAND_LABEL[k.errandKind]
                        : k.errandKind}
                    </span>
                    <span className="shrink-0 font-dm text-xs tabular-nums text-muted">
                      {k.n} asked · {k.booked} booked
                      {k.neverQuoted > 0 && (
                        <span className="text-amber-300">
                          {" "}
                          · {k.neverQuoted} unpriced
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ── What the island actually wants doing ──────────────────────── */}
          {board.asks.length > 0 && (
            <section>
              <h3 className="px-1 font-syne text-sm font-bold text-offwhite">
                What people ask for
              </h3>
              {/* The reason this table is on the screen. Nobody knew in advance
                  what an island would want done for it, and this is the list
                  that says whether to go and find somebody who can queue at a
                  bank counter or somebody licensed to carry gas. */}
              <ul className="mt-2 divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/10 bg-dark-card">
                {board.asks.map((a) => (
                  <li
                    key={a.ask}
                    className="flex items-center justify-between gap-3 px-4 py-2.5"
                  >
                    <span className="min-w-0 truncate font-dm text-sm text-offwhite">
                      {a.ask}
                    </span>
                    <span className="shrink-0 font-dm text-xs tabular-nums text-muted">
                      {a.n} asked · {a.booked} booked
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
