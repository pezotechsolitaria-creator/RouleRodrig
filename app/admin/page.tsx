import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  AlertTriangle, ArrowRight, Activity as ActivityIcon, Banknote, ClipboardList,
  CalendarCheck, Inbox, Zap,
} from "lucide-react";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { centsToDecimalString } from "@/lib/money";
import {
  attentionItems, mergeActivity, type ActivityEvent, type AttentionItem, type OrderQueues,
} from "@/lib/admin/ops";

// ── The Command Center ──────────────────────────────────────────────────────
//
// /admin used to open on the content editor — a FORM, when the first question
// an operator has is never "which form" but "what is happening and what needs
// me". This page answers exactly that, in three blocks: today's numbers, the
// attention queue, and a live feed. The content editor moved to /admin/content
// with everything it had.
//
// Always dynamic: a command centre cached for even a minute reports a calm
// morning that ended fifty seconds ago.
export const dynamic = "force-dynamic";

const OPEN_ORDER_STATUSES = [
  "pending_payment", "awaiting_payment_confirmation", "paid", "preparing", "ready_for_pickup",
];

/** Midnight today in Rodrigues (UTC+4, no DST), as an ISO instant. */
function islandMidnightIso(): string {
  const island = new Date(Date.now() + 4 * 3600_000).toISOString().slice(0, 10);
  return new Date(`${island}T00:00:00+04:00`).toISOString();
}

export default async function CommandCenterPage() {
  const cookieStore = await cookies();
  if (!verifySession(cookieStore.get(COOKIE_NAME)?.value)) redirect("/admin/login");

  if (!hasServiceRole()) {
    return (
      <main className="min-h-screen bg-dark px-4 pb-16 pt-10 text-offwhite">
        <div className="mx-auto max-w-3xl rounded-2xl border border-orange-400/30 bg-orange-400/5 p-6">
          <p className="font-syne text-lg font-bold">The Command Center needs the service-role key</p>
          <p className="mt-2 font-dm text-sm text-muted">
            SUPABASE_SERVICE_ROLE_KEY is unset on this environment, so live counts cannot be read.
            The content studio still works: <Link href="/admin/content" className="text-yellow underline">open it here</Link>.
          </p>
        </div>
      </main>
    );
  }

  const admin = await getPrivileged();
  const midnight = islandMidnightIso();
  const count = (v: { count: number | null }) => v.count ?? 0;

  const [
    openOrders, awaiting, todaysOrders, todaysBookings,
    pendingBookings, pendingPlaces, submissions, reviews,
    pendingMerchants, ownerApps, pendingDrivers, deliveriesAdmin,
    variants,
    recentOrders, recentBookings, recentPlaces, recentLeads, recentContacts,
    kitchenStores, eventStores,
  ] = await Promise.all([
    // WITH store_id, not a bare count. These two used to be single numbers that
    // linked to /admin/food — a screen scoped to kitchens — so a shop order or a
    // ticket order was counted in an alert whose destination could never show it.
    admin.from("orders").select("store_id").in("status", OPEN_ORDER_STATUSES).limit(2000),
    admin.from("orders").select("store_id").eq("status", "awaiting_payment_confirmation").limit(2000),
    admin.from("orders").select("total, status").gte("placed_at", midnight),
    admin.from("bookings").select("id", { count: "exact", head: true }).gte("created_at", midnight),
    admin.from("bookings").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("place_bookings").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("contact_submissions").select("id", { count: "exact", head: true }).eq("handled", false),
    admin.from("product_reviews").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("merchants").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("owner_applications").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("delivery_drivers").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("deliveries").select("id", { count: "exact", head: true })
      .in("status", ["requires_admin", "driver_unresponsive", "failed_delivery", "returned_to_merchant"]),
    // Low stock needs a column-to-column comparison PostgREST cannot express,
    // so the few hundred variant rows are compared here instead.
    admin.from("product_variants").select("stock_quantity, low_stock_threshold, is_active").limit(1000),
    admin.from("orders").select("order_number, status, total, created_at")
      .order("created_at", { ascending: false }).limit(8),
    admin.from("bookings").select("id, name, scooter, status, created_at")
      .order("created_at", { ascending: false }).limit(5),
    admin.from("place_bookings").select("id, name, place_name, status, created_at")
      .order("created_at", { ascending: false }).limit(5),
    admin.from("lead_events").select("kind, target_name, created_at")
      .order("created_at", { ascending: false }).limit(6),
    admin.from("contact_submissions").select("name, created_at")
      .order("created_at", { ascending: false }).limit(4),
    // Which stores are kitchens, and which are events. Everything else is a shop.
    admin.from("food_kitchens").select("store_id"),
    admin.from("events").select("store_id"),
  ]);

  const todayRows = (todaysOrders.data ?? []) as { total: number; status: string }[];
  const paidToday = todayRows.filter((o) => !["cancelled", "refunded", "pending_payment"].includes(o.status));
  const revenueToday = paidToday.reduce((sum, o) => sum + (o.total ?? 0), 0);

  const lowStock = ((variants.data ?? []) as { stock_quantity: number; low_stock_threshold: number; is_active: boolean }[])
    .filter((v) => v.is_active && v.low_stock_threshold > 0 && v.stock_quantity <= v.low_stock_threshold).length;

  // Bucket each waiting order by the queue that can actually act on it.
  const kitchenIds = new Set(((kitchenStores.data ?? []) as { store_id: string }[]).map((k) => k.store_id));
  const eventIds = new Set(((eventStores.data ?? []) as { store_id: string }[]).map((e) => e.store_id));
  const byQueue = (rows: { store_id: string | null }[] | null): OrderQueues => {
    const q = { food: 0, shop: 0, events: 0 };
    for (const r of rows ?? []) {
      const id = r.store_id ?? "";
      if (kitchenIds.has(id)) q.food += 1;
      else if (eventIds.has(id)) q.events += 1;
      else q.shop += 1;
    }
    return q;
  };

  const attention: AttentionItem[] = attentionItems({
    openOrders: byQueue(openOrders.data as { store_id: string | null }[] | null),
    awaitingPaymentConfirmation: byQueue(awaiting.data as { store_id: string | null }[] | null),
    pendingVehicleBookings: count(pendingBookings),
    pendingPlaceBookings: count(pendingPlaces),
    unhandledSubmissions: count(submissions),
    pendingReviews: count(reviews),
    pendingMerchants: count(pendingMerchants),
    pendingOwnerApplications: count(ownerApps),
    pendingDrivers: count(pendingDrivers),
    deliveriesNeedingAdmin: count(deliveriesAdmin),
    lowStockVariants: lowStock,
  });

  const feed = mergeActivity([
    ((recentOrders.data ?? []) as Record<string, string | number>[]).map<ActivityEvent>((o) => ({
      at: String(o.created_at),
      line: `Order ${o.order_number} — ${String(o.status).replace(/_/g, " ")} · Rs ${centsToDecimalString(Number(o.total ?? 0))}`,
      href: "/admin/food",
    })),
    ((recentBookings.data ?? []) as Record<string, string>[]).map<ActivityEvent>((b) => ({
      at: b.created_at,
      line: `Rental request — ${b.name ?? "someone"} · ${b.scooter ?? ""} · ${b.status}`,
      href: "/admin/content#bookings",
    })),
    ((recentPlaces.data ?? []) as Record<string, string>[]).map<ActivityEvent>((b) => ({
      at: b.created_at,
      line: `Experience booking — ${b.name ?? "someone"} · ${b.place_name ?? ""} · ${b.status}`,
      href: "/admin/content#place_bookings",
    })),
    ((recentLeads.data ?? []) as Record<string, string>[]).map<ActivityEvent>((l) => ({
      at: l.created_at,
      line: `Lead — ${l.kind.replace(/_/g, " ")} · ${l.target_name}`,
      href: "/admin/content#leads",
    })),
    ((recentContacts.data ?? []) as Record<string, string>[]).map<ActivityEvent>((c) => ({
      at: c.created_at,
      line: `Contact message from ${c.name ?? "someone"}`,
      href: "/admin/content#submissions",
    })),
  ], 14);

  const severityStyle = {
    critical: "border-red-500/35 bg-red-500/[0.07] text-red-200",
    // Red, a shade softer than `critical`. Amber taught the eye to skip these:
    // a real restaurant application sat for a day looking exactly as urgent as
    // a stale product review. Anything with a person waiting on a decision is
    // now unmistakably red; only `info` (reviews, low stock — nobody blocked)
    // stays quiet, so red still means something.
    action: "border-red-400/30 bg-red-500/[0.05] text-red-300",
    info: "border-white/12 bg-white/[0.04] text-offwhite/80",
  } as const;

  const kpis = [
    { icon: Banknote, label: "Revenue today", value: `Rs ${centsToDecimalString(revenueToday)}` },
    { icon: ClipboardList, label: "Orders today", value: String(todayRows.length) },
    { icon: CalendarCheck, label: "Booking requests today", value: String(count(todaysBookings)) },
    { icon: Inbox, label: "Open order queue", value: String(count(openOrders)) },
  ];

  return (
    <main className="min-h-screen bg-dark px-4 pb-20 pt-8 text-offwhite lg:px-8">
      <div className="mx-auto max-w-5xl">
        <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">COMMAND CENTER</p>
        <h1 className="mt-1 font-syne text-2xl font-extrabold">
          {new Date(Date.now() + 4 * 3600_000).toISOString().slice(0, 10)} · Rodrigues
        </h1>

        {/* ── Today ── */}
        <div className="mt-6 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {kpis.map((k) => {
            const Icon = k.icon;
            return (
              <div key={k.label} className="rounded-2xl border border-white/10 bg-dark-card px-4 py-3.5">
                <p className="flex items-center gap-1.5 font-bebas text-[10px] tracking-[0.22em] text-muted">
                  <Icon size={12} className="text-yellow" /> {k.label.toUpperCase()}
                </p>
                <p className="mt-1 font-syne text-xl font-extrabold text-offwhite">{k.value}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1.1fr_1fr]">
          {/* ── Requires attention ── */}
          <section>
            <h2 className="flex items-center gap-2 font-syne text-base font-extrabold">
              <AlertTriangle size={16} className="text-yellow" /> Requires attention
            </h2>
            {attention.length === 0 ? (
              <div className="mt-3 rounded-2xl border border-white/10 bg-dark-card px-5 py-8 text-center">
                <p className="font-syne text-base font-bold text-offwhite">All clear</p>
                <p className="mt-1 font-dm text-xs text-muted">
                  Nothing is waiting on you. New items appear here the moment they need a decision.
                </p>
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {attention.map((a) => (
                  <Link
                    key={a.key}
                    href={a.href}
                    className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-colors hover:border-yellow/50 ${severityStyle[a.severity]}`}
                  >
                    <span className="font-dm text-sm">{a.label}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-syne text-base font-extrabold tabular-nums">{a.count}</span>
                      <ArrowRight size={14} />
                    </span>
                  </Link>
                ))}
              </div>
            )}

            {/* ── Shortcuts ── */}
            <h2 className="mt-8 flex items-center gap-2 font-syne text-base font-extrabold">
              <Zap size={16} className="text-yellow" /> Shortcuts
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[
                { href: "/admin/food", label: "Run food service" },
                { href: "/admin/content", label: "Edit the website" },
                { href: "/admin/customers", label: "Look up a customer" },
                { href: "/admin/audit", label: "Audit trail" },
              ].map((s) => (
                <Link
                  key={s.href}
                  href={s.href}
                  className="rounded-xl border border-white/10 bg-dark-card px-4 py-3 font-dm text-sm text-offwhite/85 transition-colors hover:border-yellow/40 hover:text-yellow"
                >
                  {s.label}
                </Link>
              ))}
            </div>
            <p className="mt-2 font-dm text-[11px] text-muted">
              Press <kbd className="rounded border border-white/15 px-1 py-0.5 text-[10px]">Ctrl K</kbd> anywhere
              to search orders, bookings, customers and products.
            </p>
          </section>

          {/* ── Live activity ── */}
          <section>
            <h2 className="flex items-center gap-2 font-syne text-base font-extrabold">
              <ActivityIcon size={16} className="text-yellow" /> Latest activity
            </h2>
            {feed.length === 0 ? (
              <p className="mt-3 rounded-2xl border border-white/10 bg-dark-card px-5 py-8 text-center font-dm text-sm text-muted">
                Quiet so far. Orders, bookings and leads appear here as they happen.
              </p>
            ) : (
              <ol className="mt-3 space-y-1">
                {feed.map((e, i) => (
                  <li key={`${e.at}-${i}`}>
                    <Link
                      href={e.href}
                      className="flex items-baseline justify-between gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-white/[0.05]"
                    >
                      <span className="min-w-0 truncate font-dm text-[13px] text-offwhite/85">{e.line}</span>
                      <span className="shrink-0 font-dm text-[11px] tabular-nums text-muted">
                        {Number.isFinite(Date.parse(e.at))
                          ? new Date(e.at).toLocaleString("en-GB", {
                              day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                              timeZone: "Indian/Mauritius",
                            })
                          : "—"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
