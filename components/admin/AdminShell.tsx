"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Gauge, UtensilsCrossed, Truck, Clock, Store, Users, Ticket, UserCog,
  PenSquare, MapPinned, Wallet, MessageCircle, ScrollText, Search, Menu, X,
  ExternalLink, LogOut, Waves, Bike, Activity, Receipt, ChefHat, ShoppingBag, Car } from "lucide-react";
import CommandPalette from "./CommandPalette";

// ── The control plane's frame ───────────────────────────────────────────────
//
// One navigation for the whole admin, so operating the platform stops being a
// memory test of URLs. The dedicated screens (food, deliveries, stores…) keep
// their proven internals; this shell gives them a shared spine: a sidebar with
// the real information architecture, global search, and Ctrl+K everywhere.
//
// TWO ROUTES OPT OUT, deliberately:
//  · /admin/login — chrome around a login form is decoration for attackers.
//  · /admin/content — the content studio is the old monolith, which carries
//    its own full-height nav for 80+ sections. Wrapping one sidebar in
//    another would leave less room for the actual work than for chrome; the
//    studio instead links back to the Command Center from its own nav.

type NavItem = { href: string; label: string; icon: React.ElementType };
type NavGroup = { title: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    title: "Overview",
    items: [
      { href: "/admin", label: "Command Center", icon: Gauge },
      { href: "/admin/audit", label: "Audit trail", icon: ScrollText },
    ],
  },
  {
    title: "Operations",
    items: [
      // First in the group on purpose: this is the page that answers "is
      // anything wrong right now", so it is the one to open first.
      { href: "/admin/operations", label: "What needs you", icon: Activity },
      { href: "/admin/statement", label: "Order statement", icon: Receipt },
      { href: "/admin/kitchen-staff", label: "Kitchen teams", icon: ChefHat },
      { href: "/admin/food", label: "Food orders", icon: UtensilsCrossed },
      { href: "/admin/marketplace", label: "Shop orders", icon: ShoppingBag },
      { href: "/admin/rides", label: "Taxi & transfers", icon: Car },
      { href: "/admin/deliveries", label: "Deliveries & drivers", icon: Truck },
      { href: "/admin/content#bookings", label: "Rental bookings", icon: Clock },
      { href: "/admin/content#place_bookings", label: "Experience bookings", icon: MapPinned },
    ],
  },
  {
    title: "People",
    items: [
      { href: "/admin/customers", label: "Customers", icon: Users },
      { href: "/admin/subscriptions", label: "Merchants", icon: Store },
      { href: "/admin/organizers", label: "Organisers", icon: UserCog },
    ],
  },
  {
    title: "What you sell",
    items: [
      // Straight to the massage / fishing / sea-trip editor. It was reachable
      // only by opening "Accommodations & Activities" and flipping a category
      // dropdown, which is why the owner reported it as impossible.
      { href: "/admin/content#services", label: "Massage · Fishing · Boats", icon: Waves },
      { href: "/admin/content#fleet", label: "Scooters & cars", icon: Bike },
      { href: "/admin/stores", label: "Shops & hours", icon: Clock },
      { href: "/admin/events", label: "Events & tickets", icon: Ticket },
      { href: "/admin/managed-ticketing", label: "Ticketing fees", icon: Wallet },
      { href: "/admin/delivery-zones", label: "Delivery areas", icon: Truck },
    ],
  },
  {
    title: "Website & money",
    items: [
      { href: "/admin/content", label: "Content studio", icon: PenSquare },
      { href: "/admin/monetization", label: "Monetization", icon: Wallet },
      { href: "/admin/notifications", label: "WhatsApp alerts", icon: MessageCircle },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  const base = href.split("#")[0];
  if (base === "/admin") return pathname === "/admin";
  return pathname.startsWith(base) && !href.includes("#");
}

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Ctrl+K / Cmd+K everywhere in the admin — including the opted-out studio
  // would be nice, but the listener lives in this shell, so it applies where
  // the shell renders. The studio has its own section search already.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => setDrawerOpen(false), [pathname]);

  const bare = pathname === "/admin/login" || pathname === "/admin/content";
  if (bare) return <>{children}</>;

  async function signOut() {
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } finally {
      router.push("/admin/login");
      router.refresh();
    }
  }

  const nav = (
    <nav className="flex h-full flex-col overflow-y-auto px-3 pb-4">
      <div className="space-y-5 pt-2">
        {NAV.map((g) => (
          <div key={g.title}>
            <p className="px-2 pb-1.5 font-bebas text-[10px] tracking-[0.28em] text-yellow/70">
              {g.title.toUpperCase()}
            </p>
            <div className="space-y-0.5">
              {g.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href + item.label}
                    href={item.href}
                    className={`flex items-center gap-2.5 rounded-lg px-2 py-2 font-dm text-[13px] transition-colors ${
                      active
                        ? "bg-yellow/12 font-semibold text-yellow"
                        : "text-offwhite/75 hover:bg-white/[0.05] hover:text-offwhite"
                    }`}
                  >
                    <Icon size={15} className={active ? "text-yellow" : "text-muted"} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-auto space-y-0.5 border-t border-white/10 pt-3">
        <Link
          href="/"
          target="_blank"
          className="flex items-center gap-2.5 rounded-lg px-2 py-2 font-dm text-[13px] text-offwhite/75 hover:bg-white/[0.05] hover:text-offwhite"
        >
          <ExternalLink size={15} className="text-muted" /> View the site
        </Link>
        <button
          onClick={signOut}
          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left font-dm text-[13px] text-offwhite/75 hover:bg-white/[0.05] hover:text-offwhite"
        >
          <LogOut size={15} className="text-muted" /> Sign out
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen bg-dark">
      {/* ── Desktop sidebar ── */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-white/10 bg-[#0e0e0e] lg:flex">
        <div className="flex items-center justify-between px-4 py-4">
          <Link href="/admin" className="font-syne text-sm font-extrabold tracking-wide text-offwhite">
            RR <span className="text-yellow">OPERATIONS</span>
          </Link>
        </div>
        <button
          onClick={() => setPaletteOpen(true)}
          className="mx-3 mb-3 flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2 font-dm text-xs text-muted hover:border-yellow/40 hover:text-offwhite"
        >
          <Search size={13} /> Search everything…
          <kbd className="ml-auto rounded border border-white/15 px-1 py-0.5 text-[9px]">Ctrl K</kbd>
        </button>
        {nav}
      </aside>

      {/* ── Mobile top bar ── */}
      <header className="sticky top-0 z-40 flex items-center gap-2 border-b border-white/10 bg-[#0e0e0e]/95 px-3 py-2.5 backdrop-blur lg:hidden">
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Open admin navigation"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-offwhite"
        >
          <Menu size={17} />
        </button>
        <Link href="/admin" className="font-syne text-sm font-extrabold text-offwhite">
          RR <span className="text-yellow">OPS</span>
        </Link>
        <button
          onClick={() => setPaletteOpen(true)}
          aria-label="Search everything"
          className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-offwhite"
        >
          <Search size={16} />
        </button>
      </header>

      {/* ── Mobile drawer ── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setDrawerOpen(false)}>
          <div className="absolute inset-0 bg-black/70" />
          <div
            className="absolute inset-y-0 left-0 flex w-72 flex-col bg-[#0e0e0e] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-4">
              <span className="font-syne text-sm font-extrabold text-offwhite">
                RR <span className="text-yellow">OPERATIONS</span>
              </span>
              <button onClick={() => setDrawerOpen(false)} aria-label="Close navigation" className="text-muted">
                <X size={18} />
              </button>
            </div>
            {nav}
          </div>
        </div>
      )}

      <div className="lg:pl-60">{children}</div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
