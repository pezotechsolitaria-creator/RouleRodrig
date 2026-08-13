"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Check, X, RefreshCw, Phone, ExternalLink } from "lucide-react";
import {
  acceptStep,
  canCancel,
  cancelWarning,
  needsAction,
  awaitingOwner,
  formatMoney,
  deskOrder,
  statusFor,
  DOMAIN_LABEL,
  DOMAIN_HOME,
  type DeskOrder,
} from "@/lib/admin/order-desk";

// Which button an order gets, and what it says, is decided in
// lib/admin/order-desk.ts and tested there. This file is the shape of it.

const DOMAIN_STYLE: Record<string, string> = {
  food: "bg-orange-500/15 text-orange-300",
  shop: "bg-sky-500/15 text-sky-300",
  event: "bg-fuchsia-500/15 text-fuchsia-300",
};

function waited(iso: string): string {
  if (!iso) return "";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function OrdersDesk() {
  const [orders, setOrders] = useState<DeskOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<"open" | "all">("open");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders?scope=${scope}`, { cache: "no-store" });
      const body = (await res.json()) as { orders?: DeskOrder[]; error?: string };
      if (!res.ok) {
        setError(body.error ?? `Could not load orders (${res.status}).`);
        return;
      }
      setOrders(body.orders ?? []);
    } catch {
      setError("Could not reach the server.");
    }
  }, [scope]);

  useEffect(() => {
    let stale = false;
    void (async () => {
      if (!stale) await load();
    })();
    return () => {
      stale = true;
    };
  }, [load]);

  const move = useCallback(
    async (o: DeskOrder, status: string) => {
      if (status === "cancelled" && !confirm(cancelWarning(o))) return;
      setBusy(o.id);
      try {
        const res = await fetch("/api/admin/orders", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ orderId: o.id, status }),
        });
        const body = (await res.json()) as { error?: string };
        if (!res.ok) {
          toast.error(body.error ?? "That did not work.");
          // A 409 means somebody moved it first. Reloading is the honest fix.
          if (res.status === 409) await load();
          return;
        }
        toast.success(
          status === "cancelled" ? `${o.orderNumber} cancelled.` : `${o.orderNumber} updated.`,
        );
        await load();
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  const rows = useMemo(() => [...(orders ?? [])].sort(deskOrder), [orders]);
  const waiting = rows.filter(awaitingOwner).length;
  const open = rows.filter(needsAction).length;

  return (
    <div>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {(
          [
            { key: "open", label: "Needs action" },
            { key: "all", label: "All orders · incl. cancelled" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              setScope(t.key);
              setOrders(null);
            }}
            className={`rounded-xl px-4 py-2.5 font-dm text-sm font-bold transition ${
              scope === t.key ? "bg-yellow text-dark" : "border border-white/10 bg-dark-card text-muted hover:text-offwhite"
            }`}
          >
            {t.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void load()}
          className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-dark-card px-3 py-2.5 font-dm text-sm text-muted hover:text-offwhite"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {orders && orders.length > 0 && (
        <p className="mt-3 font-dm text-sm text-muted">
          {waiting > 0 ? (
            <>
              <span className="font-bold text-yellow">{waiting}</span> waiting for you to confirm payment.{" "}
            </>
          ) : null}
          <span className="text-offwhite">{open}</span> still open.
        </p>
      )}

      {error && (
        <p className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3 font-dm text-sm text-red-300">
          {error}
        </p>
      )}

      {!orders && !error && (
        <p className="mt-8 flex items-center justify-center gap-2 font-dm text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading every order…
        </p>
      )}

      {orders && rows.length === 0 && (
        <div className="mt-8 rounded-2xl border border-white/10 bg-dark-card px-6 py-10 text-center">
          <p className="font-syne text-lg font-bold text-offwhite">Nothing waiting</p>
          <p className="mt-1.5 font-dm text-sm text-muted">
            {scope === "open" ? "Every order is finished." : "No orders yet."}
          </p>
        </div>
      )}

      <div className="mt-4 space-y-2.5">
        {rows.map((o) => {
          const step = acceptStep(o);
          const working = busy === o.id;
          return (
            <article
              key={o.id}
              className={`rounded-2xl border p-4 ${
                awaitingOwner(o) ? "border-yellow/40 bg-yellow/[0.06]" : "border-white/10 bg-dark-card"
              } ${needsAction(o) ? "" : "opacity-60"}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-syne text-base font-extrabold text-offwhite">{o.orderNumber}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 font-dm text-[10px] font-semibold ${DOMAIN_STYLE[o.domain]}`}
                    >
                      {DOMAIN_LABEL[o.domain]}
                    </span>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 font-dm text-[10px] font-semibold text-muted">
                      {statusFor(o)}
                    </span>
                  </p>
                  <p className="mt-1 font-dm text-sm text-offwhite">
                    {o.customerName ?? "Guest"}
                    {o.customerPhone && (
                      <a
                        href={`tel:${o.customerPhone.replace(/\s/g, "")}`}
                        className="ml-2 inline-flex items-center gap-1 text-muted underline hover:text-yellow"
                      >
                        <Phone size={11} /> {o.customerPhone}
                      </a>
                    )}
                  </p>
                  <p className="mt-0.5 font-dm text-xs text-muted">
                    {o.storeName} · {o.items} item{o.items === 1 ? "" : "s"} · {waited(o.placedAt)}
                    <Link
                      href={DOMAIN_HOME[o.domain]}
                      className="ml-2 inline-flex items-center gap-0.5 underline hover:text-yellow"
                    >
                      full desk <ExternalLink size={10} />
                    </Link>
                  </p>
                </div>
                <p className="font-syne text-lg font-extrabold text-yellow">
                  {formatMoney(o.total, o.currency)}
                </p>
              </div>

              {(step || canCancel(o)) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {step && (
                    <button
                      type="button"
                      disabled={working}
                      onClick={() => void move(o, step.to)}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-yellow px-4 py-3 font-syne text-sm font-bold text-dark transition hover:brightness-110 disabled:opacity-50 sm:flex-none"
                    >
                      {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check size={15} />}
                      {step.label}
                    </button>
                  )}
                  {canCancel(o) && (
                    <button
                      type="button"
                      disabled={working}
                      onClick={() => void move(o, "cancelled")}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-red-500/30 px-4 py-3 font-syne text-sm font-bold text-red-300 transition hover:border-red-500 hover:bg-red-500/10 disabled:opacity-50"
                    >
                      <X size={15} /> Cancel
                    </button>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
