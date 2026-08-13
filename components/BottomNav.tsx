"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/context/LanguageContext";
import { NAV_TABS, isTabActive, tabLabel, openTiRoule, type NavTab } from "@/lib/nav-tabs";
import { showsVisitorNav } from "@/lib/nav-scope";

// Premium floating bottom navigation (mobile only). A rounded glass pill with a
// blurred background, soft shadow and safe-area padding; the active tab gets an
// orange pill and its icon enlarges. Ti Roulé sits in the centre (gold), opening
// the site-wide chat; Saved lives in the top-right heart.
//
// "In the centre" is enforced by a test in lib/nav-tabs.test.ts, not by this
// comment — it stayed here and stayed wrong for a while after a new tab pushed
// Ti Roulé to fourth of five.
//
// The TABS themselves come from lib/nav-tabs.ts — the same list AppHome renders
// with its own chrome. This file owns the look, never the labels or the routes.
export default function BottomNav() {
  const pathname = usePathname() || "/";
  const { language } = useLanguage();

  // WHERE this bar belongs is decided in lib/nav-scope.ts, not here.
  //
  // It used to be `pathname === "/" || pathname.startsWith("/merchant")` — two
  // exceptions added as each was noticed — so the customer's tabs also rendered
  // on /admin, /driver, /organizer, /partner and /checkout. The operator running
  // the order queue was offered "Order food" and "Ti Roulé" underneath it, and a
  // floating bar sat beside the pay button competing for the same thumb.
  if (!showsVisitorNav(pathname)) return null;

  const itemCls = (active: boolean) =>
    `relative flex min-w-[50px] flex-col items-center gap-1 rounded-xl px-2 py-1.5 transition-colors ${
      active ? "text-dark" : "text-muted hover:text-offwhite"
    }`;
  const pill = (
    <span className="absolute inset-0 -z-10 rounded-xl bg-gradient-to-b from-yellow to-yellow-dark shadow-[0_4px_14px_-3px_rgba(245,200,66,0.55)]" />
  );

  const item = (tab: NavTab) => {
    const label = tabLabel(tab, language);
    if (tab.action === "tiroule") {
      return (
        <button
          key={tab.key}
          type="button"
          onClick={openTiRoule}
          aria-label={label}
          className="flex min-w-[52px] flex-col items-center gap-1 rounded-2xl bg-gradient-to-b from-yellow to-yellow-dark px-2 py-1.5 shadow-[0_6px_18px_-4px_rgba(245,200,66,0.55)]"
        >
          <tab.icon size={22} className="text-dark" />
          <span className="font-dm text-[10px] font-medium leading-none text-dark">{label}</span>
        </button>
      );
    }
    const active = isTabActive(tab, pathname);
    return (
      <Link
        key={tab.key}
        href={tab.href ?? "/"}
        aria-current={active ? "page" : undefined}
        className={itemCls(active)}
      >
        {active && pill}
        <tab.icon size={20} className={`transition-transform ${active ? "scale-110" : ""}`} />
        <span className="font-dm text-[10px] font-medium leading-none">{label}</span>
      </Link>
    );
  };

  // z-40, above the food cart bar's z-30. They share the bottom strip of
  // the screen, so the ordering is stated here rather than left to DOM order.
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden">
      <nav
        aria-label="Primary"
        className="pointer-events-auto flex w-full max-w-sm items-center justify-around rounded-2xl border border-white/12 bg-dark/80 px-1.5 py-1.5 shadow-[0_16px_44px_-12px_rgba(0,0,0,0.75)] backdrop-blur-xl"
      >
        {NAV_TABS.map(item)}
      </nav>
    </div>
  );
}
