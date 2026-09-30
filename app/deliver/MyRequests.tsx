"use client";

import { useEffect, useState } from "react";
import { toRequestKind, type RequestKind } from "@/lib/delivery/kind";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronRight, ClipboardCheck, ListChecks, Package, ShoppingBasket } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";
import { clearRequest, forgetRequest, readCleared, readSaved, unclearRequest } from "@/lib/delivery/my-requests";
import { canClear } from "@/lib/delivery/clear";
import { DELIVER_COPY } from "@/lib/delivery/copy.i18n";
import { requestStatusCopy, formatFee } from "@/lib/delivery/request-status";
import { type as t } from "@/lib/delivery/tokens";

// ── The way back in ─────────────────────────────────────────────────────────
//
// A guest has no account and no order history, so without this the only route
// back to a posted request is a link they still have open. Somebody who closed
// the tab had lost it — which, on a surface whose whole value arrives MINUTES
// LATER as quotes, meant the wait was the end of the journey.
//
// ── ONE LINE UNTIL TAPPED (M227) ────────────────────────────────────────────
// MEASURED at 375×812: two requests put the list at 172px plus a 36px margin,
// and the first question of the form dropped from 232px to 440px — about 496px
// with an "Earlier" row, leaving one of the three answers above the pinned
// Continue bar. The owner asked for the list to fold into "Your requests · 2
// open ›". It does, in a native <details> (no state, keyboard and screen
// reader for free), and the one thing collapsing must never hide is kept ON
// the line: when a driver's price is waiting on the customer, the summary says
// "1 needs you" in the accent.
//
// ── CLEAR, WHICH HIDES AND NEVER DELETES ────────────────────────────────────
// Each row can be cleared from THIS list (set_delivery_request_hidden, M227):
// the admin board and every record keep the untouched request. A job with a
// driver on it cannot be cleared (lib/delivery/clear.ts). Undo is offered in
// the toast, because a hide nobody meant is only a tap away from a hide
// somebody regrets.
//
// ── Two sources, on purpose ────────────────────────────────────────────────
// SERVER (my_delivery_requests, signed-in only) is authoritative and crosses
// devices. It carries live status and a quote count, so the row can say "2
// prices in" instead of just naming the thing.
//
// DEVICE (localStorage) is the only thing a guest has. It is a HINT, never a
// claim: the server re-checks ownership on every load, so the worst a tampered
// entry can do is lead to "we couldn't find that". It also covers the case an
// account alone would miss — a request posted as a guest on this phone, before
// the person ever signed in.
//
// Merged with the server winning on id, because a stored `what` from three
// weeks ago should never overwrite the live row.
//
// Mounted only after hydration: reading localStorage during render makes the
// server and client markup disagree and React throws away the whole tree — on
// the page whose job is to be reassuring.

type ServerRow = {
  id: string;
  kind: string;
  what: string;
  status: string;
  pickupText: string;
  dropoffText: string;
  createdAt: string;
  expiresAt: string | null;
  quoteCount: number;
  bestQuote: number | null;
  /** The live delivery, once one exists. Without it this list said "Driver
   *  booked" for ever -- including for jobs already delivered, cancelled, or
   *  whose driver had walked away. The same defect M141 fixed on the tracker,
   *  which this list quietly reproduced. */
  deliveryStatus: string | null;
};

type Row = {
  id: string;
  what: string;
  kind?: string;
  /** Absent for a device-only row: nothing local knows the live status. */
  live?: {
    status: string;
    quoteCount: number;
    bestQuote: number | null;
    expiresAt: string | null;
    deliveryStatus: string | null;
  };
};

const dead = new Set(["cancelled", "expired"]);
const finished = new Set([
  "delivered", "cancelled", "failed_delivery", "returned_to_merchant",
]);
const isDone = (r: Row) =>
  !!r.live && (dead.has(r.live.status) || finished.has(r.live.deliveryStatus ?? ""));

/** Whoever is waiting on the CUSTOMER comes first. A device-only row (no live
 *  status) sorts last: it is a hint, not news. */
const byUrgency = (a: Row, b: Row) => {
  const wants = (r: Row) =>
    r.live && r.live.status === "open" && r.live.quoteCount > 0 ? 0 : 1;
  return wants(a) - wants(b);
};

export default function MyRequests() {
  const { language } = useLanguage();
  const c = DELIVER_COPY[language];
  const [rows, setRows] = useState<{ live: Row[]; past: Row[] } | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const device = readSaved();

      let server: ServerRow[] = [];
      let serverHidden: string[] = [];
      try {
        const res = await fetch("/api/delivery-requests/mine", { cache: "no-store" });
        if (res.ok) {
          const json = (await res.json()) as { requests?: ServerRow[]; hidden?: string[] };
          server = json.requests ?? [];
          serverHidden = json.hidden ?? [];
        }
      } catch {
        // Offline, or signed out. The device list still stands on its own —
        // this component must never be the reason /deliver fails to render.
      }
      if (cancelled) return;

      // Cleared here, or cleared on another device by the same account: a
      // copy remembered on this phone must not bring it back.
      const hidden = new Set([...readCleared(), ...serverHidden]);
      for (const id of serverHidden) forgetRequest(id);

      const merged = new Map<string, Row>();
      // Device first, so the server overwrites rather than the other way round.
      for (const d of device) if (!hidden.has(d.id)) merged.set(d.id, { id: d.id, what: d.what });
      for (const s of server) {
        if (hidden.has(s.id)) continue;
        merged.set(s.id, {
          id: s.id,
          what: s.what,
          kind: s.kind,
          live: {
            status: s.status,
            quoteCount: s.quoteCount,
            bestQuote: s.bestQuote,
            expiresAt: s.expiresAt,
            deliveryStatus: s.deliveryStatus,
          },
        });
      }

      // ── FINISHED WORK LEAVES THE LIST ────────────────────────────────────
      //
      // Sorting the dead rows to the bottom was not enough. This list is
      // capped at five, so three finished jobs could push the ONE request
      // holding a quote off the end of it — and a delivered job from last week
      // looks identical in weight to a driver waiting on an answer today.
      //
      // So they are separated, not merely ordered: what is still moving is the
      // list, and what is over is collapsed history underneath it. Kept rather
      // than deleted, because a customer still needs to find what a driver
      // charged them last month — just not while they are waiting on a price.
      const all = [...merged.values()];
      const live = all.filter((r) => !isDone(r));
      const past = all.filter(isDone);
      live.sort(byUrgency);

      setRows({ live, past });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!rows || (rows.live.length === 0 && rows.past.length === 0)) return null;

  const statusOf = (r: Row) =>
    r.live
      ? requestStatusCopy(
          {
            status: r.live.status,
            quoteCount: r.live.quoteCount,
            expiresAt: r.live.expiresAt,
            deliveryStatus: r.live.deliveryStatus,
          },
          language,
        )
      : null;

  const needsYou = rows.live.filter((r) => statusOf(r)?.needsCustomer === true).length;

  function drop(id: string) {
    setRows((prev) => prev && { live: prev.live.filter((x) => x.id !== id), past: prev.past.filter((x) => x.id !== id) });
  }
  /** Put a row back where it was: Undo should undo, not reshuffle. */
  function restore(r: Row, at: number) {
    setRows((prev) => {
      if (!prev || prev.live.some((x) => x.id === r.id) || prev.past.some((x) => x.id === r.id)) return prev;
      const key = isDone(r) ? "past" : "live";
      const list = [...prev[key]];
      list.splice(Math.max(0, Math.min(at, list.length)), 0, r);
      return { ...prev, [key]: list };
    });
  }

  async function hide(id: string, hidden: boolean, email: string | undefined) {
    return fetch("/api/delivery-requests/hide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, hidden, email }),
    });
  }

  async function clear(r: Row) {
    const saved = readSaved().find((s) => s.id === r.id) ?? null;
    const at = rows ? (isDone(r) ? rows.past : rows.live).findIndex((x) => x.id === r.id) : 0;
    // Gone from the screen at once; the server is told behind it.
    clearRequest(r.id);
    drop(r.id);
    try {
      const res = await hide(r.id, true, saved?.email);
      if (res.status === 409) {
        // A driver took it between this list loading and the tap.
        unclearRequest(saved, r.id);
        restore(r, at);
        toast.error(c.mine.inProgress);
        return;
      }
      // 404 is a row this device cannot prove on the server (a request posted
      // while signed in, viewed here signed out): forgetting it HERE was the
      // whole of what could be done, and it is done.
    } catch {
      // Offline: the device has forgotten it; the server is told next time
      // nothing — which only means another device may still list it.
    }
    toast(r.live?.status === "open" ? c.mine.clearedOpen : c.mine.cleared, {
      action: {
        label: c.mine.undo,
        onClick: () => {
          unclearRequest(saved, r.id);
          restore(r, at);
          void hide(r.id, false, saved?.email).catch(() => {});
        },
      },
    });
  }

  // Records, not ternaries — see lib/delivery/kind.ts. With three kinds the
  // ternary form is silently wrong rather than broken, which is worse.
  const ROW_ICON: Record<RequestKind, typeof Package> = {
    package: Package,
    shop_and_deliver: ShoppingBasket,
    errand: ClipboardCheck,
  };

  const row = (r: Row, muted: boolean) => {
    const Icon = ROW_ICON[toRequestKind(r.kind)];
    const copy = statusOf(r);
    // Only the state that is WAITING ON THEM earns the accent, and nothing in
    // history ever does. Everything lit up is nothing lit up.
    const wants = !muted && copy?.needsCustomer === true;

    return (
      <li key={r.id} className="flex items-stretch gap-2">
        <Link
          href={`/deliver/${r.id}`}
          className={cn(
            "group flex min-w-0 flex-1 items-center gap-3 rounded-xl border p-3 transition-colors",
            wants
              ? "border-yellow/45 bg-yellow/[0.06] hover:border-yellow/70"
              : "border-white/10 bg-white/[0.02] hover:border-white/20",
            muted && "opacity-55 hover:opacity-100",
          )}
        >
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
              wants ? "bg-yellow text-dark" : "bg-white/[0.05] text-[#B0B0B0]",
            )}
          >
            <Icon size={15} />
          </span>

          <span className="min-w-0 flex-1">
            <span className={cn(t.bodySm, "block truncate text-offwhite")}>{r.what}</span>
            {copy && (
              <span
                className={cn(t.meta, "block truncate", wants ? "text-yellow" : "text-[#B0B0B0]")}
              >
                {copy.label}
                {r.live?.bestQuote != null && ` · ${c.mine.fromPrice(formatFee(r.live.bestQuote))}`}
              </span>
            )}
          </span>

          <ChevronRight
            size={15}
            className={cn(
              "shrink-0 transition-transform group-hover:translate-x-0.5",
              wants ? "text-yellow" : "text-[#B0B0B0]",
            )}
          />
        </Link>
        {canClear(r.live) && (
          <button
            type="button"
            onClick={() => void clear(r)}
            aria-label={c.mine.clearAria(r.what)}
            className={cn(
              t.meta,
              "min-h-11 shrink-0 rounded-xl border border-white/10 px-3 text-[#B0B0B0] transition-colors hover:border-white/25 hover:text-offwhite",
            )}
          >
            {c.mine.clear}
          </button>
        )}
      </li>
    );
  };

  const count = rows.live.length > 0 ? c.mine.openCount(rows.live.length) : c.mine.earlierCount(rows.past.length);

  return (
    <section className="mb-3">
      {/* ── The whole list is one line until tapped ─────────────────────────
          `group/mine`, named, so the history <details> below keeps its own
          plain `group` and the two chevrons never answer to each other. */}
      <details className="group/mine">
        <summary
          className={cn(
            "flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-xl border px-3.5 py-2 transition-colors [&::-webkit-details-marker]:hidden",
            needsYou > 0 ? "border-yellow/45 bg-yellow/[0.05]" : "border-white/10 bg-white/[0.02] hover:border-white/20",
          )}
        >
          <ListChecks size={17} className={needsYou > 0 ? "shrink-0 text-yellow" : "shrink-0 text-[#B0B0B0]"} aria-hidden />
          {/* When a price is waiting on them, THAT is the line — it replaces
              the count rather than sitting beside it, so the summary stays one
              line at 375px in all three languages. */}
          <span className={cn(t.meta, "min-w-0 flex-1 text-offwhite")}>
            <span className="font-semibold">{c.mine.title}</span>
            {needsYou > 0 ? (
              <span className="font-semibold text-yellow"> · {c.mine.needsYou(needsYou)}</span>
            ) : (
              <span className="text-[#B0B0B0]"> · {count}</span>
            )}
          </span>
          <ChevronRight
            size={16}
            className="shrink-0 text-[#B0B0B0] transition-transform duration-200 group-open/mine:rotate-90"
            aria-hidden
          />
        </summary>

        <div className="pt-2">
          {rows.live.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {rows.live.slice(0, 5).map((r) => row(r, false))}
            </ul>
          ) : (
            // Everything is finished. Saying so is kinder than an empty gap, and
            // it keeps the list from looking like one that failed to load.
            <p className={cn(t.meta, "text-[#B0B0B0]")}>{c.mine.empty}</p>
          )}

          {/* ── History, closed by default ────────────────────────────────────
              <details> rather than a tab or a filter chip: it needs no state, no
              JavaScript and no second render path, it is keyboard-accessible for
              free, and a screen reader announces it as expandable. The cheapest
              correct control is the right one on a screen whose job is to be
              reassuring. */}
          {rows.past.length > 0 && (
            <details className="group mt-3">
              <summary
                className={cn(
                  t.meta,
                  "flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-[#B0B0B0] transition-colors hover:text-offwhite",
                )}
              >
                <ChevronRight
                  size={13}
                  className="shrink-0 transition-transform group-open:rotate-90"
                />
                {c.mine.pastTitle(rows.past.length)}
              </summary>
              <ul className="mt-2 flex flex-col gap-2">
                {rows.past.slice(0, 10).map((r) => row(r, true))}
              </ul>
            </details>
          )}
        </div>
      </details>
    </section>
  );
}
