"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Package, ShoppingBasket } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";
import { readSaved } from "@/lib/delivery/my-requests";
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

export default function MyRequests() {
  const { language } = useLanguage();
  const c = DELIVER_COPY[language];
  const [rows, setRows] = useState<{ live: Row[]; past: Row[] } | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const device = readSaved();

      let server: ServerRow[] = [];
      try {
        const res = await fetch("/api/delivery-requests/mine", { cache: "no-store" });
        if (res.ok) {
          const json = (await res.json()) as { requests?: ServerRow[] };
          server = json.requests ?? [];
        }
      } catch {
        // Offline, or signed out. The device list still stands on its own —
        // this component must never be the reason /deliver fails to render.
      }
      if (cancelled) return;

      const merged = new Map<string, Row>();
      // Device first, so the server overwrites rather than the other way round.
      for (const d of device) merged.set(d.id, { id: d.id, what: d.what });
      for (const s of server) {
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
      const dead = new Set(["cancelled", "expired"]);
      const finished = new Set([
        "delivered", "cancelled", "failed_delivery", "returned_to_merchant",
      ]);
      const isDone = (r: Row) =>
        !!r.live && (dead.has(r.live.status) || finished.has(r.live.deliveryStatus ?? ""));

      const live = all.filter((r) => !isDone(r));
      const past = all.filter(isDone);

      // Within the live list, whoever is waiting on the CUSTOMER comes first.
      // A device-only row (no live status) sorts last: it is a hint, not news.
      live.sort((a, b) => {
        const wants = (r: Row) =>
          r.live && r.live.status === "open" && r.live.quoteCount > 0 ? 0 : 1;
        return wants(a) - wants(b);
      });

      setRows({ live, past });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!rows || (rows.live.length === 0 && rows.past.length === 0)) return null;

  const row = (r: Row, muted: boolean) => {
    const Icon = r.kind === "shop_and_deliver" ? ShoppingBasket : Package;
    const copy = r.live
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
    // Only the state that is WAITING ON THEM earns the accent, and nothing in
    // history ever does. Everything lit up is nothing lit up.
    const wants = !muted && copy?.needsCustomer === true;

    return (
      <li key={r.id}>
        <Link
          href={`/deliver/${r.id}`}
          className={cn(
            "group flex items-center gap-3 rounded-xl border p-3.5 transition-colors",
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
      </li>
    );
  };

  return (
    <section className="mb-9">
      <h2 className={cn(t.heading, "text-offwhite")}>{c.mine.title}</h2>

      {rows.live.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2">
          {rows.live.slice(0, 5).map((r) => row(r, false))}
        </ul>
      ) : (
        // Everything is finished. Saying so is kinder than an empty gap, and it
        // keeps the heading from looking like a list that failed to load.
        <p className={cn(t.meta, "mt-3 text-[#B0B0B0]")}>{c.mine.empty}</p>
      )}

      {/* ── History, closed by default ──────────────────────────────────────
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
    </section>
  );
}
