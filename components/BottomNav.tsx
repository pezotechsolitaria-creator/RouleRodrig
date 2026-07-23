"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Compass, CalendarCheck, Heart, Menu } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useFavorites } from "@/context/FavoritesContext";

// Premium floating bottom navigation (mobile only). A rounded glass pill with a
// blurred background, soft shadow and safe-area padding; the active tab gets an
// orange pill and its icon enlarges. Ti Roulé is NOT here (it's the floating
// orb); Quick Actions stay on the Home page — this never duplicates them.
export default function BottomNav() {
  const pathname = usePathname() || "/";
  const { language } = useLanguage();
  const { count } = useFavorites();
  const L = (en: string, fr: string, cr: string) => (language === "fr" ? fr : language === "cr" ? cr : en);

  const items = [
    { key: "home", icon: Home, href: "/", label: L("Home", "Accueil", "Lakaz"), active: pathname === "/" },
    { key: "explore", icon: Compass, href: "/#explore", label: L("Explore", "Explorer", "Explor"), active: /^\/(browse|map|guide)/.test(pathname) },
    { key: "bookings", icon: CalendarCheck, href: "/manage-booking", label: L("Bookings", "Réservations", "Rezervasion"), active: pathname.startsWith("/manage-booking") },
  ] as const;
  const moreActive = pathname.startsWith("/more");

  const itemCls = (active: boolean) =>
    `relative flex min-w-[52px] flex-col items-center gap-1 rounded-xl px-2.5 py-1.5 transition-colors ${
      active ? "text-dark" : "text-muted hover:text-offwhite"
    }`;
  const pill = (
    <span className="absolute inset-0 -z-10 rounded-xl bg-gradient-to-b from-yellow to-yellow-dark shadow-[0_4px_14px_-3px_rgba(245,200,66,0.55)]" />
  );

  const openSaved = () => window.dispatchEvent(new CustomEvent("rr:open-saved"));

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden">
      <nav
        aria-label="Primary"
        className="pointer-events-auto flex w-full max-w-sm items-center justify-around rounded-2xl border border-white/12 bg-dark/80 px-1.5 py-1.5 shadow-[0_16px_44px_-12px_rgba(0,0,0,0.75)] backdrop-blur-xl"
      >
        {items.map((it) => (
          <Link key={it.key} href={it.href} aria-current={it.active ? "page" : undefined} className={itemCls(it.active)}>
            {it.active && pill}
            <it.icon size={20} className={`transition-transform ${it.active ? "scale-110" : ""}`} />
            <span className="font-dm text-[10px] font-medium leading-none">{it.label}</span>
          </Link>
        ))}

        {/* Saved — opens the wishlist panel (never a "page", so no active pill) */}
        <button type="button" onClick={openSaved} className={itemCls(false)} aria-label={L("Saved", "Favoris", "Sové")}>
          <span className="relative">
            <Heart size={20} className={count > 0 ? "fill-red-500 text-red-500" : ""} />
            {count > 0 && (
              <span className="absolute -right-2 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-yellow px-1 font-syne text-[9px] font-bold text-dark">
                {count}
              </span>
            )}
          </span>
          <span className="font-dm text-[10px] font-medium leading-none">{L("Saved", "Favoris", "Sové")}</span>
        </button>

        {/* More */}
        <Link href="/more" aria-current={moreActive ? "page" : undefined} className={itemCls(moreActive)}>
          {moreActive && pill}
          <Menu size={20} className={`transition-transform ${moreActive ? "scale-110" : ""}`} />
          <span className="font-dm text-[10px] font-medium leading-none">{L("More", "Plus", "Plis")}</span>
        </Link>
      </nav>
    </div>
  );
}
