import type { Metadata } from "next";
import Link from "next/link";
import { UtensilsCrossed, Store, Ticket, ChevronRight, ClipboardList } from "lucide-react";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import Navbar from "@/components/Navbar";
import OrderHubBaskets from "./OrderHubBaskets";

// ── "What would you like to order?" ─────────────────────────────────────────
//
// The gap this fills, found by walking the navigation rather than the code:
// every piece of persistent navigation — the bottom tab bar, the marketing
// navbar, the footer, /more, /explore — omitted all three commerce products.
// Food, the marketplace and tickets were reachable ONLY from the homepage. Leave
// the homepage and there was no way back except starting over at Home, which is
// why testing it felt like a maze.
//
// One page, three doors, in the words a customer would use. Deliberately plain:
// this is the screen an 80-year-old lands on, so the tap targets are large, each
// card says what it IS rather than what the platform calls it, and there is
// nothing else on the page competing for attention.
//
// It also shows any basket that already has something in it — because "where did
// my order go?" is the other half of the same problem.

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Order food, shopping or tickets | Roule Rodrigues",
  description:
    "Order local food for pickup or delivery, shop from Rodrigues shops, or buy tickets for island events — all in one place.",
  alternates: { canonical: `${SITE_URL}/order` },
};

const DOORS = [
  {
    href: "/food",
    icon: UtensilsCrossed,
    title: "Food",
    line: "Home-cooked Rodriguan dishes",
    detail: "Order ahead, then collect it or have it delivered.",
    accent: "from-orange-500/20",
  },
  {
    href: "/shop",
    icon: Store,
    title: "Shops",
    line: "Honey, piment, crafts and more",
    detail: "Buy from the island's own shops and producers.",
    accent: "from-emerald-500/20",
  },
  {
    href: "/events",
    icon: Ticket,
    title: "Tickets",
    line: "Concerts, séga nights, festivals",
    detail: "Pay online or in cash, then show the code at the gate.",
    accent: "from-purple-500/20",
  },
];

export default function OrderHubPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      breadcrumbLd([
        { name: "Roule Rodrigues", url: SITE_URL },
        { name: "Order", url: `${SITE_URL}/order` },
      ]),
    ],
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <Navbar />
      <main className="min-h-screen bg-dark px-4 pb-28 pt-24 text-offwhite">
        <div className="mx-auto max-w-2xl">
          <h1 className="font-syne text-3xl font-extrabold leading-tight sm:text-4xl">
            What would you like to order?
          </h1>
          <p className="mt-2 font-dm text-sm text-muted">
            Three ways to buy from Rodrigues. Pick one — you can pay in cash on collection if you prefer.
          </p>

          <OrderHubBaskets />

          <div className="mt-6 space-y-3">
            {DOORS.map((d) => {
              const Icon = d.icon;
              return (
                <Link
                  key={d.href}
                  href={d.href}
                  className={`group flex items-center gap-4 rounded-2xl border border-white/10 bg-gradient-to-r ${d.accent} to-transparent p-5 transition-colors hover:border-yellow/50 active:scale-[0.99]`}
                >
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-dark/60 text-yellow ring-1 ring-inset ring-white/10">
                    <Icon size={26} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-syne text-xl font-bold text-offwhite group-hover:text-yellow">
                      {d.title}
                    </span>
                    <span className="block font-dm text-sm text-offwhite/80">{d.line}</span>
                    <span className="mt-0.5 block font-dm text-xs text-muted">{d.detail}</span>
                  </span>
                  <ChevronRight size={20} className="shrink-0 text-muted group-hover:text-yellow" />
                </Link>
              );
            })}
          </div>

          <Link
            href="/track"
            className="mt-6 flex items-center gap-3 rounded-2xl border border-white/10 bg-dark-card px-5 py-4 transition-colors hover:border-yellow/40"
          >
            <ClipboardList size={19} className="shrink-0 text-yellow" />
            <span className="min-w-0 flex-1">
              <span className="block font-dm text-sm font-medium text-offwhite">
                Already ordered something?
              </span>
              <span className="block font-dm text-xs text-muted">
                Check where it is — food, shopping, tickets, rentals and trips.
              </span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-muted" />
          </Link>
        </div>
      </main>
    </>
  );
}
