import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Users, Search, UserCheck } from "lucide-react";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { centsToDecimalString } from "@/lib/money";
import {
  buildPeople,
  dormantAccounts,
  matchesQuery,
  displayName,
  isReservedEmail,
  type Account,
  type Txn,
} from "@/lib/admin/customers";

// ── Customers ───────────────────────────────────────────────────────────────
//
// This page used to list auth.users, which on this platform is barely related to
// customers. Of twelve accounts, three were real people; the rest were test
// merchants on reserved domains, test organisers, M4 fixtures and the Food
// platform's own service account. Meanwhile the people who actually spent money
// — guests, who are the default checkout path — appeared nowhere except as a
// number in a footnote.
//
// So the list is built from TRANSACTIONS. A customer is someone who ordered,
// rented or booked. Having an account is something they might also have.
//
// The identity merging and the search live in lib/admin/customers.ts, tested,
// because "can the owner find the person currently on the phone to them" is the
// only thing this page is for.
//
// Still deliberately restrained: who they are, what they bought, when. No
// addresses, no payment details, no browsing trail.
export const dynamic = "force-dynamic";

const SPENT_EXCLUDED = ["cancelled", "refunded", "pending_payment"];

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const cookieStore = await cookies();
  if (!verifySession(cookieStore.get(COOKIE_NAME)?.value)) redirect("/admin/login");

  const { q } = await searchParams;
  const needle = (q ?? "").trim();

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

  const [users, orders, bookings, places] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 200 }),
    admin
      .from("orders")
      .select("id, order_number, customer_id, customer_name, customer_email, customer_phone, total, status, created_at")
      .limit(2000),
    admin.from("bookings").select("id, name, email, phone, created_at").limit(2000),
    admin.from("place_bookings").select("id, name, email, phone, created_at").limit(2000),
  ]);

  // A failed read must not quietly become "this customer has no orders". Say it.
  const readErrors = [
    orders.error && "orders",
    bookings.error && "rentals",
    places.error && "experiences",
    users.error && "accounts",
  ].filter(Boolean) as string[];

  const accounts: Account[] = (users.data?.users ?? []).map((u) => ({
    id: u.id,
    email: u.email ?? null,
    createdAt: u.created_at,
  }));

  const ref = (id: string) => `RR-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;

  const txns: Txn[] = [
    ...((orders.data ?? []) as Record<string, unknown>[]).map((o): Txn => ({
      kind: "order",
      name: (o.customer_name as string) ?? null,
      email: (o.customer_email as string) ?? null,
      phone: (o.customer_phone as string) ?? null,
      accountId: (o.customer_id as string) ?? null,
      amountMinor: Number(o.total ?? 0),
      countsToSpend: !SPENT_EXCLUDED.includes(String(o.status)),
      at: String(o.created_at ?? ""),
      ref: (o.order_number as string) ?? null,
    })),
    ...((bookings.data ?? []) as Record<string, string>[]).map((b): Txn => ({
      kind: "rental",
      name: b.name ?? null,
      email: b.email ?? null,
      phone: b.phone ?? null,
      accountId: null,
      // Rental money lives in a different column and a different unit from order
      // money. Rather than silently add rupees to cents, Spent counts orders and
      // the column says so.
      amountMinor: 0,
      countsToSpend: false,
      at: String(b.created_at ?? ""),
      ref: b.id ? ref(b.id) : null,
    })),
    ...((places.data ?? []) as Record<string, string>[]).map((b): Txn => ({
      kind: "experience",
      name: b.name ?? null,
      email: b.email ?? null,
      phone: b.phone ?? null,
      accountId: null,
      amountMinor: 0,
      countsToSpend: false,
      at: String(b.created_at ?? ""),
      ref: b.id ? ref(b.id) : null,
    })),
  ];

  const everyone = buildPeople(accounts, txns);

  // Seeded fixtures transact too — there is a ZZTEST order in here on a
  // .invalid address. A reserved domain can never receive mail, so it is never
  // a person the owner will need to ring. Counted, not listed.
  const people = everyone.filter((p) => !isReservedEmail(p.email));
  const dormant = dormantAccounts(accounts, everyone);
  const visible = needle ? people.filter((p) => matchesQuery(p, needle)) : people;

  const realDormant = dormant.filter((a) => !isReservedEmail(a.email));
  const fixtures = dormant.length - realDormant.length + (everyone.length - people.length);

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
          Everyone who has ordered, rented or booked — whether or not they made an account.
        </p>

        {readErrors.length > 0 && (
          <p className="mt-4 rounded-2xl border border-orange-400/30 bg-orange-400/5 px-4 py-3 font-dm text-sm text-orange-200">
            Could not read {readErrors.join(", ")}. The numbers below are incomplete.
          </p>
        )}

        <form action="/admin/customers" method="get" className="mt-5 flex max-w-xl gap-2" role="search">
          <div className="relative flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="search"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search by name, phone, email or reference…"
              className="w-full rounded-xl border border-white/10 bg-dark-card py-2.5 pl-9 pr-3 font-dm text-sm text-offwhite placeholder:text-muted focus:border-yellow/50 focus:outline-none"
            />
          </div>
          <button className="rounded-xl bg-yellow px-4 font-dm text-sm font-bold text-dark">Search</button>
        </form>

        {visible.length === 0 ? (
          <p className="mt-8 rounded-2xl border border-white/10 bg-dark-card px-6 py-10 text-center font-dm text-sm text-muted">
            {needle
              ? `Nobody matches “${needle}”. Try part of a name, a phone number, or an order reference.`
              : "Nobody has ordered, rented or booked yet."}
          </p>
        ) : (
          <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.03]">
                  {["Customer", "Phone", "Orders", "Spent on orders", "Rentals", "Experiences", "Last activity"].map(
                    (h) => (
                      <th key={h} className="px-4 py-2.5 font-bebas text-[10px] tracking-[0.2em] text-muted">
                        {h.toUpperCase()}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => (
                  <tr key={p.key} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5 font-dm text-sm text-offwhite">
                        {displayName(p)}
                        {p.hasAccount && (
                          <UserCheck size={13} className="shrink-0 text-emerald-400" aria-label="Has an account" />
                        )}
                      </span>
                      {p.email && p.name && <span className="font-dm text-xs text-muted">{p.email}</span>}
                      {p.joined && (
                        <span className="block font-dm text-[11px] text-muted">Joined {fmt(p.joined)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-dm text-xs text-muted">{p.phone ?? "—"}</td>
                    <td className="px-4 py-3 font-dm text-sm tabular-nums">{p.orders}</td>
                    <td className="px-4 py-3 font-dm text-sm tabular-nums text-yellow">
                      {p.spentMinor > 0 ? `Rs ${centsToDecimalString(p.spentMinor)}` : "—"}
                    </td>
                    <td className="px-4 py-3 font-dm text-sm tabular-nums">{p.rentals}</td>
                    <td className="px-4 py-3 font-dm text-sm tabular-nums">{p.experiences}</td>
                    <td className="px-4 py-3 font-dm text-xs text-muted">{fmt(p.lastSeen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 font-dm text-xs text-muted">
          <UserCheck size={12} className="inline text-emerald-400" /> means they also have an account. Guests are the
          default checkout path, so most customers here never registered — that is normal, and they are still findable
          by name, phone or reference.
          {realDormant.length > 0 && (
            <>
              {" "}
              <span className="text-offwhite">{realDormant.length}</span> account
              {realDormant.length === 1 ? " has" : "s have"} registered without buying anything yet.
            </>
          )}
          {fixtures > 0 && (
            <>
              {" "}
              <span className="text-offwhite">{fixtures}</span> seeded test account
              {fixtures === 1 ? " is" : "s are"} hidden from this list.
            </>
          )}{" "}
          Search anything else with{" "}
          <Link href="/admin" className="text-yellow underline">
            Ctrl K
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
