"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, ClipboardList, CreditCard } from "lucide-react";
import { useOrders } from "@/lib/merchant/orders";
import { STATUS_LABEL, type OrderStatus } from "@/lib/orders/status";
import { centsToDecimalString } from "@/lib/money";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUS_BADGE: Record<OrderStatus, string> = {
  pending_payment: "bg-white/10 text-muted border-white/15",
  paid: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  preparing: "bg-yellow/15 text-yellow border-yellow/30",
  ready_for_pickup: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  collected: "bg-green-500/15 text-green-400 border-green-500/30",
  cancelled: "bg-red-500/10 text-red-400/80 border-red-500/20",
  refunded: "bg-red-500/10 text-red-400/80 border-red-500/20",
};

function statusBadge(status: OrderStatus) {
  return <Badge variant="outline" className={STATUS_BADGE[status] ?? STATUS_BADGE.pending_payment}>{STATUS_LABEL[status] ?? status}</Badge>;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function OrdersTable() {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error, isPlaceholderData } = useOrders({ q, status, page });

  // Debounced search-on-enter/blur pattern kept simple: only fire the query
  // when the user commits (Enter) rather than on every keystroke, since this
  // hits the network (unlike the client-side product filter).
  function commitSearch() {
    setQ(search.trim());
    setPage(1);
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl bg-white/[0.04]" />)}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.04] p-6 text-center">
        <p className="font-dm text-sm text-red-400">{error instanceof Error ? error.message : "Failed to load orders."}</p>
      </div>
    );
  }

  const orders = data?.orders ?? [];
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 20)));
  const noOrdersAtAll = orders.length === 0 && page === 1 && q === "" && status === "all";

  if (noOrdersAtAll) {
    return (
      <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-10 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-yellow/10 text-yellow ring-1 ring-inset ring-yellow/20">
          <ClipboardList size={22} />
        </span>
        <h3 className="mt-4 font-syne text-lg font-bold text-offwhite">No orders yet</h3>
        <p className="mx-auto mt-1 max-w-xs font-dm text-sm text-muted">
          Orders placed against your shop will show up here.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && commitSearch()}
            onBlur={commitSearch}
            placeholder="Search order # or customer…"
            className="pl-8"
            aria-label="Search orders"
          />
        </div>
        <Select value={status} onValueChange={(v) => { setStatus(v ?? "all"); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Filter by status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {(Object.keys(STATUS_LABEL) as OrderStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {orders.length === 0 ? (
        <p className="mt-8 text-center font-dm text-sm text-muted">No orders match your filters.</p>
      ) : (
        <div className={isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"}>
          {/* Desktop table */}
          <div className="mt-4 hidden overflow-hidden rounded-2xl border border-white/10 sm:block">
            <table className="w-full text-left">
              <thead className="bg-white/[0.03]">
                <tr className="font-dm text-xs text-muted">
                  <th className="px-4 py-3 font-medium">Order</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Items</th>
                  <th className="px-4 py-3 font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Payment</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Placed</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr
                    key={o.id}
                    className="cursor-pointer border-t border-white/10 font-dm text-sm text-offwhite transition-colors hover:bg-white/[0.03]"
                  >
                    <td className="px-4 py-3">
                      <Link href={`/merchant/orders/${o.id}`} className="font-medium hover:text-yellow">
                        {o.order_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted">{o.customer_name ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">{o.order_items[0]?.count ?? 0}</td>
                    <td className="px-4 py-3">Rs {centsToDecimalString(o.total)}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-xs text-muted">
                        <CreditCard size={12} /> {o.payments[0]?.status ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">{statusBadge(o.status)}</td>
                    <td className="px-4 py-3 text-muted">{o.placed_at ? fmtDate(o.placed_at) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="mt-4 space-y-2 sm:hidden">
            {orders.map((o) => (
              <Link
                key={o.id}
                href={`/merchant/orders/${o.id}`}
                className="block rounded-xl border border-white/10 bg-dark-card p-3 transition-colors hover:border-yellow/30"
              >
                <div className="flex items-center justify-between">
                  <span className="font-dm text-sm font-medium text-offwhite">{o.order_number}</span>
                  {statusBadge(o.status)}
                </div>
                <p className="mt-1 font-dm text-xs text-muted">
                  {o.customer_name ?? "—"} · {o.order_items[0]?.count ?? 0} item(s) · Rs {centsToDecimalString(o.total)}
                </p>
                <p className="mt-0.5 font-dm text-[11px] text-muted/70">{o.placed_at ? fmtDate(o.placed_at) : "—"}</p>
              </Link>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between font-dm text-xs text-muted">
              <span>Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
