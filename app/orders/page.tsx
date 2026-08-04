import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { STATUS_LABEL, type OrderStatus } from "@/lib/orders/status";
import { centsToDecimalString } from "@/lib/money";
import OrdersFilterBar from "@/components/orders/OrdersFilterBar";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { robots: { index: false, follow: false } };

const PAGE_SIZE = 20;
const VALID_STATUSES = new Set(Object.keys(STATUS_LABEL));

const STATUS_BADGE: Record<OrderStatus, string> = {
  pending_payment: "bg-white/10 text-muted border-white/15",
  paid: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  preparing: "bg-yellow/15 text-yellow border-yellow/30",
  ready_for_pickup: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  collected: "bg-green-500/15 text-green-400 border-green-500/30",
  cancelled: "bg-red-500/10 text-red-400/80 border-red-500/20",
  refunded: "bg-red-500/10 text-red-400/80 border-red-500/20",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default async function CustomerOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const { q, status, page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/orders");

  let query = supabase
    .from("orders")
    .select(
      "id, order_number, status, total, currency, created_at, placed_at, stores(name), order_items(count)",
      { count: "exact" },
    )
    .eq("customer_id", user.id)
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (status && VALID_STATUSES.has(status)) query = query.eq("status", status);
  if (q?.trim()) {
    const safe = q.trim().replace(/[,()%]/g, " ").trim();
    if (safe) query = query.ilike("order_number", `%${safe}%`);
  }

  const { data, count } = await query;
  const orders = data ?? [];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  return (
    <main className="min-h-screen bg-dark px-4 pb-16 pt-10 text-offwhite">
      <div className="mx-auto max-w-3xl">
        <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">MY ACCOUNT</p>
        <h1 className="mt-1 font-syne text-2xl font-extrabold text-offwhite">Orders</h1>
        <p className="mt-1.5 font-dm text-sm text-muted">Everything you&apos;ve bought from shops on Roulé Rodrigues.</p>

        <div className="mt-6">
          <OrdersFilterBar />
        </div>

        {orders.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-10 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-yellow/10 text-yellow ring-1 ring-inset ring-yellow/20">
              <ClipboardList size={22} />
            </span>
            <h2 className="mt-4 font-syne text-lg font-bold text-offwhite">No orders found</h2>
            <p className="mx-auto mt-1 max-w-xs font-dm text-sm text-muted">
              {q || status ? "Try a different search or filter." : "Orders you place with shops will show up here."}
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {orders.map((o) => {
              const store = Array.isArray(o.stores) ? o.stores[0] : o.stores;
              const itemCount = Array.isArray(o.order_items) ? o.order_items[0]?.count ?? 0 : 0;
              return (
                <Link
                  key={o.id}
                  href={`/orders/${o.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-dark-card p-4 transition-colors hover:border-yellow/30"
                >
                  <div className="min-w-0">
                    <p className="font-dm text-sm font-medium text-offwhite">{o.order_number}</p>
                    <p className="mt-0.5 truncate font-dm text-xs text-muted">
                      {(store as { name?: string } | null)?.name ?? "Shop"} · {itemCount} item(s) · {fmtDate(o.created_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="font-dm text-sm font-semibold text-offwhite">Rs {centsToDecimalString(o.total)}</span>
                    <Badge variant="outline" className={STATUS_BADGE[o.status as OrderStatus]}>
                      {STATUS_LABEL[o.status as OrderStatus] ?? o.status}
                    </Badge>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-5 flex items-center justify-between font-dm text-xs text-muted">
            <span>Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={{ pathname: "/orders", query: { q, status, page: page - 1 } }}
                  className="rounded-full border border-white/15 px-3 py-1.5 transition-colors hover:border-yellow/40 hover:text-yellow"
                >
                  Previous
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={{ pathname: "/orders", query: { q, status, page: page + 1 } }}
                  className="rounded-full border border-white/15 px-3 py-1.5 transition-colors hover:border-yellow/40 hover:text-yellow"
                >
                  Next
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
