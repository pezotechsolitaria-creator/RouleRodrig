import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Users, Search } from "lucide-react";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { centsToDecimalString } from "@/lib/money";

// ── Customers ───────────────────────────────────────────────────────────────
//
// The one view the platform never had: a person, and everything they have done
// across all three transaction systems. Orders join on customer_id; rentals
// and experience bookings predate Supabase Auth here and join on EMAIL — which
// is also why this page needs the service role (those tables have no SELECT
// policy at all, by design).
//
// Deliberately restrained: name, when they joined, what they have spent, what
// they have booked. No addresses, no payment details, no browsing trail — an
// operator resolving an issue needs to FIND the person and their transactions,
// not to profile them.
export const dynamic = "force-dynamic";

type CustomerRow = {
  id: string;
  email: string;
  createdAt: string;
  orders: number;
  orderTotal: number;
  rentals: number;
  experiences: number;
  lastSeen: string | null;
};

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const cookieStore = await cookies();
  if (!verifySession(cookieStore.get(COOKIE_NAME)?.value)) redirect("/admin/login");

  const { q } = await searchParams;
  const needle = (q ?? "").trim().toLowerCase();

  if (!hasServiceRole()) {
    return (
      <main className="min-h-screen bg-dark px-4 pb-16 pt-10 text-offwhite">
        <p className="mx-auto max-w-3xl rounded-2xl border border-orange-400/30 bg-orange-400/5 p-6 font-dm text-sm text-muted">
          Customer lookups need SUPABASE_SERVICE_ROLE_KEY, which is unset here.
        </p>
      </main>
    );
  }

  const admin = await getPrivileged();

  // Ten users today; one page of 200 covers the next year of growth. When it
  // stops covering it, this needs pagination — not a different design.
  const [{ data: userList }, orders, bookings, places] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 200 }),
    admin.from("orders").select("customer_id, customer_email, total, status, created_at").limit(2000),
    admin.from("bookings").select("email, created_at").limit(2000),
    admin.from("place_bookings").select("email, created_at").limit(2000),
  ]);

  const rows: CustomerRow[] = (userList?.users ?? []).map((u) => {
    const email = (u.email ?? "").toLowerCase();
    const mine = ((orders.data ?? []) as Record<string, unknown>[]).filter(
      (o) => o.customer_id === u.id || String(o.customer_email ?? "").toLowerCase() === email,
    );
    const rentals = ((bookings.data ?? []) as Record<string, string>[]).filter(
      (b) => (b.email ?? "").toLowerCase() === email,
    );
    const exps = ((places.data ?? []) as Record<string, string>[]).filter(
      (b) => (b.email ?? "").toLowerCase() === email,
    );
    const stamps = [
      ...mine.map((o) => String(o.created_at)),
      ...rentals.map((b) => b.created_at),
      ...exps.map((b) => b.created_at),
    ].filter(Boolean).sort();

    return {
      id: u.id,
      email: u.email ?? u.id,
      createdAt: u.created_at,
      orders: mine.length,
      orderTotal: mine
        .filter((o) => !["cancelled", "refunded", "pending_payment"].includes(String(o.status)))
        .reduce((s, o) => s + Number(o.total ?? 0), 0),
      rentals: rentals.length,
      experiences: exps.length,
      lastSeen: stamps.at(-1) ?? null,
    };
  });

  // Guest activity is real activity: orders and bookings whose email matches
  // no account. Shown as one honest line rather than pretending guests are
  // accounts or hiding that most customers never register.
  const accountEmails = new Set(rows.map((r) => r.email.toLowerCase()));
  const guestOrders = ((orders.data ?? []) as Record<string, unknown>[]).filter(
    (o) => !o.customer_id && !accountEmails.has(String(o.customer_email ?? "").toLowerCase()),
  ).length;
  const guestBookings = ((bookings.data ?? []) as Record<string, string>[]).filter(
    (b) => !accountEmails.has((b.email ?? "").toLowerCase()),
  ).length;

  const visible = (needle ? rows.filter((r) => r.email.toLowerCase().includes(needle)) : rows)
    .sort((a, b) => (b.lastSeen ?? "").localeCompare(a.lastSeen ?? ""));

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

  return (
    <main className="min-h-screen bg-dark px-4 pb-20 pt-8 text-offwhite lg:px-8">
      <div className="mx-auto max-w-5xl">
        <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">PEOPLE</p>
        <h1 className="mt-1 flex items-center gap-2 font-syne text-2xl font-extrabold">
          <Users size={20} className="text-yellow" /> Customers
        </h1>
        <p className="mt-1.5 font-dm text-sm text-muted">
          Every account, with its orders, rentals and experience bookings in one place.
        </p>

        <form action="/admin/customers" method="get" className="mt-5 flex max-w-md gap-2" role="search">
          <div className="relative flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="search"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search by email…"
              className="w-full rounded-xl border border-white/10 bg-dark-card py-2.5 pl-9 pr-3 font-dm text-sm text-offwhite placeholder:text-muted focus:border-yellow/50 focus:outline-none"
            />
          </div>
          <button className="rounded-xl bg-yellow px-4 font-dm text-sm font-bold text-dark">Search</button>
        </form>

        {visible.length === 0 ? (
          <p className="mt-8 rounded-2xl border border-white/10 bg-dark-card px-6 py-10 text-center font-dm text-sm text-muted">
            {needle ? "No account matches that email." : "No customer accounts yet."}
          </p>
        ) : (
          <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full min-w-[680px] text-left">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.03]">
                  {["Customer", "Joined", "Orders", "Spent", "Rentals", "Experiences", "Last activity"].map((h) => (
                    <th key={h} className="px-4 py-2.5 font-bebas text-[10px] tracking-[0.2em] text-muted">
                      {h.toUpperCase()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                    <td className="px-4 py-3 font-dm text-sm text-offwhite">{r.email}</td>
                    <td className="px-4 py-3 font-dm text-xs text-muted">{fmt(r.createdAt)}</td>
                    <td className="px-4 py-3 font-dm text-sm tabular-nums">{r.orders}</td>
                    <td className="px-4 py-3 font-dm text-sm tabular-nums text-yellow">
                      {r.orderTotal > 0 ? `Rs ${centsToDecimalString(r.orderTotal)}` : "—"}
                    </td>
                    <td className="px-4 py-3 font-dm text-sm tabular-nums">{r.rentals}</td>
                    <td className="px-4 py-3 font-dm text-sm tabular-nums">{r.experiences}</td>
                    <td className="px-4 py-3 font-dm text-xs text-muted">{fmt(r.lastSeen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 font-dm text-xs text-muted">
          Plus <span className="text-offwhite">{guestOrders}</span> guest order{guestOrders === 1 ? "" : "s"} and{" "}
          <span className="text-offwhite">{guestBookings}</span> guest booking{guestBookings === 1 ? "" : "s"} from
          people without an account — guest checkout is the default path, so most customers appear there, not here.
          Find any specific one with{" "}
          <Link href="/admin" className="text-yellow underline">Ctrl K</Link> by name, email or reference.
        </p>
      </div>
    </main>
  );
}
