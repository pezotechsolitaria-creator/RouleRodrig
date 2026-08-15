import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft, ChevronRight, Compass, Map as MapIcon, BookOpen, Calendar,
  HelpCircle, Phone, Siren, FileText, Shield, RefreshCw, Store, CalendarCheck, ClipboardList,
  UtensilsCrossed, Ticket, ShoppingBag, CircleUser, Car,
} from "lucide-react";
import { getContent } from "@/lib/content";
import ThemeToggle from "@/components/ThemeToggle";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import Navbar from "@/components/Navbar";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "More — guides, help & info | Roule Rodrigues",
  description: "Everything else: the Rodrigues island guide, interactive map, trip planner, FAQ, emergency numbers, contact and legal — all in one place.",
  alternates: { canonical: `${SITE_URL}/more` },
};

type Row = { icon: React.ElementType; label: string; href: string; note?: string };
const GROUPS: { title: string; rows: Row[] }[] = [
  {
    // First group, because buying is what most visitors came to do — and
    // because none of these three had a link anywhere outside the homepage.
    title: "Order & buy",
    rows: [
      { icon: UtensilsCrossed, label: "Order food", href: "/food", note: "Home-cooked Rodriguan dishes" },
      { icon: Store, label: "Shop local", href: "/shop", note: "Honey, piment, crafts" },
      { icon: Ticket, label: "Event tickets", href: "/events", note: "Concerts & séga nights" },
      { icon: ShoppingBag, label: "My basket", href: "/cart" },
      { icon: Car, label: "Book a taxi or transfer", href: "/taxi/book", note: "See the fare first, no account" },
    ],
  },
  {
    title: "Discover",
    rows: [
      { icon: Compass, label: "Rodrigues island guide", href: "/guide/rodrigues", note: "Beaches, tortoises, tips" },
      { icon: MapIcon, label: "Interactive island map", href: "/map" },
      { icon: BookOpen, label: "Travel blog", href: "/blog" },
      { icon: Calendar, label: "Trip planner", href: "/trip-planner" },
    ],
  },
  {
    title: "Bookings & help",
    rows: [
      { icon: CalendarCheck, label: "Manage a booking", href: "/manage-booking", note: "No account needed" },
      { icon: CircleUser, label: "My account", href: "/account", note: "Orders, bookings, my shop or driver dashboard, settings" },
      { icon: ClipboardList, label: "Track an order", href: "/track", note: "No account needed" },
      { icon: HelpCircle, label: "FAQ", href: "/faq" },
      { icon: Phone, label: "Contact us", href: "/#contact" },
      { icon: Siren, label: "Emergency numbers", href: "/emergency" },
    ],
  },
  {
    title: "Business & legal",
    rows: [
      { icon: Store, label: "List your business", href: "/list-your-scooter" },
      { icon: FileText, label: "Terms & rental policy", href: "/legal/terms" },
      { icon: Shield, label: "Privacy policy", href: "/legal/privacy" },
      { icon: RefreshCw, label: "Refunds & cancellations", href: "/legal/refunds" },
    ],
  },
];

export default async function MorePage() {
  const content = await getContent();
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [breadcrumbLd([{ name: "Roule Rodrigues", url: SITE_URL }, { name: "More", url: `${SITE_URL}/more` }])],
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <Navbar
        branding={content.branding}
        announcementActive={false}
        showStayEatDo={content.recommended.enabled && content.recommended.items.length > 0}
        showRoutes={content.rideRoutes.length > 0}
        showEvents={content.events.some((e) => e.title)}
      />
      <main className="bg-dark min-h-screen">
        <div className="mx-auto max-w-2xl px-5 pt-28 md:pt-32">
          <Link href="/" className="inline-flex items-center gap-2 text-muted hover:text-yellow text-sm transition-colors">
            <ArrowLeft size={15} /> Roule Rodrigues
          </Link>
          <h1 className="mt-5 font-syne text-3xl font-extrabold text-offwhite md:text-4xl">More</h1>
          <p className="mt-1 font-dm text-sm text-muted">Guides, help and everything else about Rodrigues.</p>

          {/* Appearance first, because it changes everything below it — and
              "where do I turn the lights on" is exactly the kind of question
              this page exists to answer. */}
          <section className="mt-8">
            <p className="mb-2 px-1 font-bebas text-[11px] tracking-[0.3em] text-yellow">APPEARANCE</p>
            <ThemeToggle />
            <p className="mt-2 px-1 font-dm text-xs text-muted">
              Auto follows the time in Rodrigues — light by day, dark after sunset.
            </p>
          </section>

          <div className="mt-8 space-y-7">
            {GROUPS.map((g) => (
              <section key={g.title}>
                <p className="mb-2 px-1 font-bebas text-[11px] tracking-[0.3em] text-yellow">{g.title}</p>
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01]">
                  {g.rows.map((r, i) => (
                    <Link
                      key={r.href + r.label}
                      href={r.href}
                      className={`flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-white/[0.03] ${i > 0 ? "border-t border-white/[0.06]" : ""}`}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-yellow/10 text-yellow ring-1 ring-inset ring-yellow/15">
                        <r.icon size={17} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-dm text-sm font-medium text-offwhite">{r.label}</span>
                        {r.note && <span className="block font-dm text-[11px] text-muted">{r.note}</span>}
                      </span>
                      <ChevronRight size={16} className="shrink-0 text-muted/50" />
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
        <div className="h-24" />
      </main>
    </>
  );
}
