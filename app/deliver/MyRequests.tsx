"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Package, ShoppingBasket } from "lucide-react";
import { cn } from "@/lib/utils";
import { readSaved } from "@/lib/delivery/my-requests";
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
};

type Row = {
  id: string;
  what: string;
  kind?: string;
  /** Absent for a device-only row: nothing local knows the live status. */
  live?: { status: string; quoteCount: number; bestQuote: number | null; expiresAt: string | null };
};

export default function MyRequests() {
  const [rows, setRows] = useState<Row[] | null>(null);

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
          },
        });
      }

      // A finished request is history, not a task. Keeping cancelled and
      // expired rows at the top of this list would bury the one that is
      // actually waiting on the customer.
      const all = [...merged.values()];
      const dead = new Set(["cancelled", "expired"]);
      all.sort((a, b) => {
        const aDead = a.live ? (dead.has(a.live.status) ? 1 : 0) : 0;
        const bDead = b.live ? (dead.has(b.live.status) ? 1 : 0) : 0;
        if (aDead !== bDead) return aDead - bDead;
        // Then whoever is waiting on the customer.
        const aWants = a.live && a.live.status === "open" && a.live.quoteCount > 0 ? 0 : 1;
        const bWants = b.live && b.live.status === "open" && b.live.quoteCount > 0 ? 0 : 1;
        return aWants - bWants;
      });

      setRows(all);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!rows || rows.length === 0) return null;

  return (
    <section className="mb-9">
      <h2 className={cn(t.heading, "text-offwhite")}>Your requests</h2>
      <ul className="mt-3 flex flex-col gap-2">
        {rows.slice(0, 5).map((r) => {
          const Icon = r.kind === "shop_and_deliver" ? ShoppingBasket : Package;
          const copy = r.live
            ? requestStatusCopy({
                status: r.live.status,
                quoteCount: r.live.quoteCount,
                expiresAt: r.live.expiresAt,
              })
            : null;
          // Only the state that is WAITING ON THEM earns the accent. Everything
          // lit up is nothing lit up.
          const wants = copy?.needsCustomer === true;

          return (
            <li key={r.id}>
              <Link
                href={`/deliver/${r.id}`}
                className={cn(
                  "group flex items-center gap-3 rounded-xl border p-3.5 transition-colors",
                  wants
                    ? "border-yellow/45 bg-yellow/[0.06] hover:border-yellow/70"
                    : "border-white/10 bg-white/[0.02] hover:border-white/20",
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                    wants ? "bg-yellow text-dark" : "bg-white/[0.05] text-white/50",
                  )}
                >
                  <Icon size={15} />
                </span>

                <span className="min-w-0 flex-1">
                  <span className={cn(t.bodySm, "block truncate text-offwhite")}>{r.what}</span>
                  {copy && (
                    <span
                      className={cn(t.meta, "block truncate", wants ? "text-yellow" : "text-muted")}
                    >
                      {copy.label}
                      {r.live?.bestQuote != null && ` · from ${formatFee(r.live.bestQuote)}`}
                    </span>
                  )}
                </span>

                <ChevronRight
                  size={15}
                  className={cn(
                    "shrink-0 transition-transform group-hover:translate-x-0.5",
                    wants ? "text-yellow" : "text-white/25",
                  )}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
