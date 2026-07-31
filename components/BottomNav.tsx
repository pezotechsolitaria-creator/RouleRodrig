"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Compass, Bot, CalendarCheck, Menu } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

// Premium floating bottom navigation (mobile only). A rounded glass pill with a
// blurred background, soft shadow and safe-area padding; the active tab gets an
// orange pill and its icon enlarges. Ti Roulé sits in the centre (gold), opening
// the site-wide chat; Saved lives in the top-right heart. Matches the homepage
// app bar so navigation is consistent everywhere.
export default function BottomNav() {
  const pathname = usePathname() || "/";
  const { language } = useLanguage();
  const L = (en: string, fr: string, cr: string) => (language === "fr" ? fr : language === "cr" ? cr : en);

  // The app-style homepage renders its own bottom bar (travel tools + nav with
  // Ti Roulé), so the global floating nav steps aside there.
  if (pathname === "/" || pathname.startsWith("/v2") || pathname.startsWith("/merchant")) return null;

  const links = [
    { key: "home", icon: Home, href: "/", label: L("Home", "Accueil", "Lakaz"), active: pathname === "/" },
    { key: "explore", icon: Compass, href: "/explore", label: L("Explore", "Explorer", "Explor"), active: pathname.startsWith("/explore") },
  ];
  const rightLinks = [
    { key: "bookings", icon: CalendarCheck, href: "/manage-booking", label: L("Bookings", "Réservations", "Rezervasion"), active: pathname.startsWith("/manage-booking") },
    { key: "more", icon: Menu, href: "/more", label: L("More", "Plus", "Plis"), active: pathname.startsWith("/more") },
  ];

  const itemCls = (active: boolean) =>
    `relative flex min-w-[50px] flex-col items-center gap-1 rounded-xl px-2 py-1.5 transition-colors ${
      active ? "text-dark" : "text-muted hover:text-offwhite"
    }`;
  const pill = (
    <span className="absolute inset-0 -z-10 rounded-xl bg-gradient-to-b from-yellow to-yellow-dark shadow-[0_4px_14px_-3px_rgba(245,200,66,0.55)]" />
  );

  const item = (it: (typeof links)[number]) => (
    <Link key={it.key} href={it.href} aria-current={it.active ? "page" : undefined} className={itemCls(it.active)}>
      {it.active && pill}
      <it.icon size={20} className={`transition-transform ${it.active ? "scale-110" : ""}`} />
      <span className="font-dm text-[10px] font-medium leading-none">{it.label}</span>
    </Link>
  );

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden">
      <nav
        aria-label="Primary"
        className="pointer-events-auto flex w-full max-w-sm items-center justify-around rounded-2xl border border-white/12 bg-dark/80 px-1.5 py-1.5 shadow-[0_16px_44px_-12px_rgba(0,0,0,0.75)] backdrop-blur-xl"
      >
        {links.map(item)}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("tiroule:open"))}
          aria-label="Ti Roulé"
          className="flex min-w-[52px] flex-col items-center gap-1 rounded-2xl bg-gradient-to-b from-yellow to-yellow-dark px-2 py-1.5 shadow-[0_6px_18px_-4px_rgba(245,200,66,0.55)]"
        >
          <Bot size={22} className="text-dark" />
          <span className="font-dm text-[10px] font-medium leading-none text-dark">Ti Roulé</span>
        </button>
        {rightLinks.map(item)}
      </nav>
    </div>
  );
}
