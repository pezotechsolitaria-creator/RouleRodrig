import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import Link from "next/link";
import BackLink from "@/components/BackLink";
import { redirect } from "next/navigation";
import { listActivitiesForCustomer } from "@/lib/activity-server";
import { groupActivities, type Activity } from "@/lib/activity";
import { ClipboardList } from "lucide-react";
import NotificationCenter from "@/components/NotificationCenter";
import NotificationPreferences from "@/components/orders/NotificationPreferences";
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
  awaiting_payment_confirmation: "bg-yellow/15 text-yellow border-yellow/30",
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
  const t = await getT();
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

  const { data, count, error } = await query;
  // Same reasoning as the detail page: without this, a database fault renders
  // the "no orders yet" empty state to a customer who does have orders.
  if (error) {
    console.error("list customer orders failed", error);
    throw new Error("Could not load your orders.");
  }
  const orders = data ?? [];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  // ── The other two thirds of "Suivi" ──────────────────────────────────────
  // This page listed marketplace orders only, so a customer who had rented a
  // scooter and booked a boat trip saw neither. Rentals and place bookings are
  // keyed by EMAIL (they predate Supabase Auth here and have no customer_id),
  // and the session's verified address is what scopes them — never anything
  // from the request. See lib/activity-server.ts.
  //
  // They are shown as their own section rather than merged into the list below
  // because that list is paginated and searchable over `orders` specifically;
  // interleaving a second source would break both. Bookings are few, so they
  // need neither.
  const { activities, partial } = await listActivitiesForCustomer({
    verifiedEmail: user.email ?? null,
    userId: user.id,
  });
  const bookings = activities.filter((a) => a.kind !== "order");
  const grouped = groupActivities(bookings);

  return (
    <main className="min-h-screen bg-dark px-4 pb-28 pt-10 text-offwhite md:pb-16">
      <div className="mx-auto max-w-3xl">
        {/* This page was a complete dead end: the root layout renders no header
            and BottomNav is md:hidden, so on desktop there was literally no way
            out. Its own child (/orders/[id]) and both siblings (/login,
            /manage-booking) all carry this exact affordance. */}
        {/* Back goes BACK. This was href="/", so opening Orders from the
            account page and pressing it landed on the homepage rather than
            /account — the owner's report. /account is the fallback because it
            is this page's parent for anyone who arrived by a shared link and
            has no in-app history to return to. */}
        <BackLink
          fallback="/account"
          className="mb-4 inline-flex items-center gap-1.5 font-dm text-sm text-muted transition-colors hover:text-yellow"
        >
          {" "}Back
        </BackLink>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">{t.ordersPage.myAccount}</p>
            <h1 className="mt-1 font-syne text-2xl font-extrabold text-offwhite">{t.ordersPage.yourActivity}</h1>
          </div>
          {/* The customer's notification feed. Renders nothing at all when there
              is nothing to show, so a first-time visitor sees no empty bell. */}
          <NotificationCenter className="-mr-2 shrink-0" />
        </div>
        <p className="mt-1.5 font-dm text-sm text-muted">
          {t.ordersPage.everythingBooked}
        </p>

        {partial && (
          <p className="mt-4 rounded-xl border border-orange-400/30 bg-orange-400/5 px-4 py-3 font-dm text-xs text-orange-200">
            {t.ordersPage.partialError}
          </p>
        )}

        {/* Rentals, boat trips, massages and other reservations. Shown before
            orders because they are dated commitments — a rental starting
            tomorrow matters more than an order that already arrived. */}
        {bookings.length > 0 && (
          <section className="mt-6">
            <h2 className="font-bebas text-[11px] tracking-[0.3em] text-yellow">BOOKINGS</h2>
            <div className="mt-2.5 space-y-4">
              {grouped.now.length > 0 && <ActivityGroup title={t.ordersPage.happeningNow} items={grouped.now} />}
              {grouped.upcoming.length > 0 && <ActivityGroup title={t.ordersPage.comingUp} items={grouped.upcoming} />}
              {grouped.past.length > 0 && <ActivityGroup title="Past" items={grouped.past} dim />}
            </div>
          </section>
        )}

        <h2 className="mt-8 font-bebas text-[11px] tracking-[0.3em] text-yellow">ORDERS</h2>
        <div className="mt-2.5">
          <OrdersFilterBar />
        </div>

        {orders.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-10 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-yellow/10 text-yellow ring-1 ring-inset ring-yellow/20">
              <ClipboardList size={22} />
            </span>
            <h2 className="mt-4 font-syne text-lg font-bold text-offwhite">{t.ordersPage.noOrders}</h2>
            <p className="mx-auto mt-1 max-w-xs font-dm text-sm text-muted">
              {q || status ? "Try a different search or filter." : "Orders you place with shops and kitchens will show up here."}
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
                      {(store as { name?: string } | null)?.name ?? "Order"} · {itemCount} item(s) · {fmtDate(o.created_at)}
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
        {/* Anchor target for the Notifications row in /account settings. It had
            none, so the link landed at the top of a long order history and the
            visitor had to hunt for the controls they asked for. */}
        <div id="notifications" className="scroll-mt-24">
          <NotificationPreferences className="mt-10" />
        </div>
      </div>
    </main>
  );
}

/**
 * One stage-group of bookings.
 *
 * Deliberately the same visual language as the order rows below it — the point
 * of unifying tracking is that the customer stops having to notice which
 * backend produced a thing.
 */
function ActivityGroup({
  title, items, dim = false,
}: {
  title: string;
  items: Activity[];
  dim?: boolean;
}) {
  return (
    <div className={dim ? "opacity-70" : ""}>
      <p className="font-dm text-xs text-muted">{title}</p>
      <div className="mt-1.5 space-y-2">
        {items.map((a) => (
          <Link
            key={`${a.kind}-${a.id}`}
            href={a.href}
            className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-dark-card p-4 transition-colors hover:border-yellow/30"
          >
            <div className="min-w-0">
              <p className="truncate font-dm text-sm font-medium text-offwhite">{a.title}</p>
              <p className="mt-0.5 truncate font-dm text-xs text-muted">
                {a.reference}
                {a.date && (
                  <> · {new Date(a.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</>
                )}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              {a.amount != null && a.amount > 0 && (
                <span className="font-dm text-sm font-semibold text-offwhite">
                  {/* ── RUPEES ARE NOT CENTS (M165) ──────────────────────────
                      Same fault as /track carried until yesterday, on the page
                      a signed-in customer sees FIRST. A rental deposit of
                      Rs 524 read as "Rs 5.24" and a Rs 12,942 car booking as
                      "Rs 129.42" — four bookings on one screen, every one of
                      them a hundredth of the truth.

                      Shop orders a few lines up really are stored in cents and
                      keep centsToDecimalString. Bookings carry whole rupees,
                      so they are printed as integers — which is also what the
                      owner asked for: no decimal point on a rupee figure. */}
                  Rs {a.kind === "order"
                    ? centsToDecimalString(a.amount)
                    : Math.round(a.amount).toLocaleString("en-US")}
                </span>
              )}
              <Badge variant="outline" className="border-white/15 text-muted">
                {a.statusLabel}
              </Badge>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
