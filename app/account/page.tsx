import type { Metadata } from "next";
import Link from "next/link";
import {
  ChevronRight, Search, Store, Truck, Ticket, ClipboardList, LogIn, UserPlus,
  Bell, Globe, KeyRound, LogOut, ShoppingBag, CircleUser,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { rolesForUser, type AccountRole } from "@/lib/account/roles";
import Navbar from "@/components/Navbar";

// ── ONE PAGE THAT KNOWS WHO YOU ARE ─────────────────────────────────────────
//
// The owner: "I want everyone to be able to have their account everytime on their
// website if they have an account — for everyone like clients, merchants,
// restaurants, drivers, etc. It will be found on settings. It can fix the problem
// of '/'."
//
// That diagnosis is right, and worth stating plainly: the platform grew a console
// per role — /merchant, /driver, /organizer, /partner — and the only way to reach
// yours was to already know its address. Nothing on the site listed them. A shop
// owner who forgot the word "merchant" had no route back into their own shop.
// Those addresses are the slashes he keeps hitting.
//
// So this page does not tidy the URLs. It removes the need to know them. It reads
// your account and shows the doors you actually have — and for a visitor with no
// account, it leads with the one thing they came for, which is almost never
// "sign in" but "where is my order".
//
// Deliberately NOT here: /admin. That is not an account — it is one shared
// password behind a signed cookie with no Supabase user, so nothing about a
// signed-in person could reveal it.

export const metadata: Metadata = {
  title: "My account | Roulé Rodrigues",
  description: "Your orders, bookings and tickets, your shop or driver dashboard, and your settings — all in one place.",
  robots: { index: false, follow: false },
};

const ROLE_ICON: Record<AccountRole["key"], React.ElementType> = {
  merchant: Store,
  driver: Truck,
  organizer: Ticket,
};

const STATUS_STYLE: Record<AccountRole["status"], string> = {
  active: "border-green-500/30 bg-green-500/10 text-green-400",
  pending: "border-yellow/30 bg-yellow/10 text-yellow",
  blocked: "border-red-500/25 bg-red-500/10 text-red-300",
};

const STATUS_WORD: Record<AccountRole["status"], string> = {
  active: "Open",
  pending: "Waiting",
  blocked: "Paused",
};

function Row({
  href, icon: Icon, title, note, external,
}: {
  href: string; icon: React.ElementType; title: string; note?: string; external?: boolean;
}) {
  return (
    <Link
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      className="flex items-center gap-3.5 border-b border-white/[0.06] px-4 py-3.5 transition-colors last:border-0 hover:bg-white/[0.04]"
    >
      <Icon size={18} className="shrink-0 text-yellow" />
      <span className="min-w-0 flex-1">
        <span className="block font-dm text-sm text-offwhite">{title}</span>
        {note && <span className="block font-dm text-xs text-muted">{note}</span>}
      </span>
      <ChevronRight size={17} className="shrink-0 text-muted" />
    </Link>
  );
}

export default async function AccountPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // Read on the USER's own client, so RLS is the filter — a person can only ever
  // discover their own doors.
  const roles = user ? await rolesForUser(supabase, user.id) : [];

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-dark px-4 pb-28 pt-24 text-offwhite">
        <div className="mx-auto max-w-2xl">
          <h1 className="font-syne text-3xl font-extrabold leading-tight">
            {user ? "My account" : "Your orders & account"}
          </h1>
          {user ? (
            <p className="mt-1.5 flex items-center gap-2 font-dm text-sm text-muted">
              <CircleUser size={15} className="text-yellow" /> {user.email}
            </p>
          ) : (
            <p className="mt-1.5 font-dm text-sm text-muted">
              You don&apos;t need an account to order or to check where something is.
            </p>
          )}

          {/* ── First, the thing people actually came for ────────────────────
              Signed in or not. "Where is my order" is the most common reason
              anyone opens this page, and it used to live on a separate tab that
              a guest had no reason to connect with their account. */}
          <section className="mt-6">
            <h2 className="mb-2 font-bebas text-[11px] tracking-[0.28em] text-yellow">
              WHERE IS MY ORDER?
            </h2>
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-dark-card">
              <Row
                href="/track"
                icon={Search}
                title="Find an order or booking"
                note="Food, shopping, tickets, scooters, trips — no account needed"
              />
              {user && (
                <Row
                  href="/orders"
                  icon={ClipboardList}
                  title="Everything I've ordered"
                  note="The full history on this account"
                />
              )}
              <Row href="/cart" icon={ShoppingBag} title="My basket" />
            </div>
          </section>

          {/* ── The doors this account has ───────────────────────────────────── */}
          {user && roles.length > 0 && (
            <section className="mt-7">
              <h2 className="mb-2 font-bebas text-[11px] tracking-[0.28em] text-yellow">
                MY DASHBOARDS
              </h2>
              <div className="space-y-2.5">
                {roles.map((r) => {
                  const Icon = ROLE_ICON[r.key];
                  return (
                    <Link
                      key={`${r.key}-${r.label ?? ""}`}
                      href={r.href}
                      className="group flex items-start gap-4 rounded-2xl border border-white/10 bg-dark-card p-4 transition-colors hover:border-yellow/50"
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-yellow/10 text-yellow ring-1 ring-inset ring-yellow/20">
                        <Icon size={20} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-syne text-base font-bold text-offwhite group-hover:text-yellow">
                            {r.title}
                          </span>
                          <span className={`rounded-full border px-2 py-0.5 font-bebas text-[9px] tracking-[0.15em] ${STATUS_STYLE[r.status]}`}>
                            {STATUS_WORD[r.status]}
                          </span>
                        </span>
                        {r.label && <span className="block font-dm text-sm text-offwhite/80">{r.label}</span>}
                        <span className="mt-0.5 block font-dm text-xs text-muted">{r.blurb}</span>
                        {/* A pending driver HAS the role and cannot work yet.
                            Saying so is the whole point of listing it. */}
                        {r.statusNote && (
                          <span className="mt-1.5 block font-dm text-xs text-yellow/90">{r.statusNote}</span>
                        )}
                      </span>
                      <ChevronRight size={18} className="mt-1 shrink-0 text-muted group-hover:text-yellow" />
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── Settings ─────────────────────────────────────────────────────── */}
          {user ? (
            <section className="mt-7">
              <h2 className="mb-2 font-bebas text-[11px] tracking-[0.28em] text-yellow">SETTINGS</h2>
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-dark-card">
                <Row
                  href="/orders#notifications"
                  icon={Bell}
                  title="Notifications"
                  note="Which updates reach you, and how"
                />
                {/* /login?reset=1, not /auth/reset-password. The latter only
                    works when you arrive on it from the emailed link — it needs
                    the recovery token in the URL fragment — so linking there
                    directly showed "this link is invalid". ?reset=1 opens the
                    panel that SENDS the email, which is the actual first step. */}
                <Row
                  href="/login?reset=1"
                  icon={KeyRound}
                  title="Change my password"
                  note="We email you a link to set a new one"
                />
                <Row href="/more" icon={Globe} title="Help, guides & language" />
              </div>
              <form action="/auth/signout" method="post" className="mt-3">
                <button
                  type="submit"
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/12 px-4 py-3.5 font-dm text-sm text-muted transition-colors hover:border-red-500/40 hover:text-red-300"
                >
                  <LogOut size={16} /> Sign out
                </button>
              </form>
            </section>
          ) : (
            <section className="mt-7">
              <h2 className="mb-2 font-bebas text-[11px] tracking-[0.28em] text-yellow">
                HAVE AN ACCOUNT?
              </h2>
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-dark-card">
                <Row
                  href="/login?next=/account"
                  icon={LogIn}
                  title="Sign in"
                  note="Shop owners, drivers and event organisers sign in here too"
                />
                <Row
                  href="/login?next=/account"
                  icon={UserPlus}
                  title="Create an account"
                  note="Keeps your order history in one place"
                />
              </div>
              <p className="mt-3 font-dm text-xs text-muted">
                Sell on the marketplace, drive for us, or run an event?{" "}
                <Link href="/list-your-scooter" className="text-yellow underline">
                  Start here
                </Link>
                .
              </p>
            </section>
          )}
        </div>
      </main>
    </>
  );
}
