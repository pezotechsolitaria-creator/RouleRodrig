import { Home, Compass, Bot, CalendarCheck, Menu } from "lucide-react";
import type { Language } from "@/lib/i18n";

// ── The bottom navigation, defined once ─────────────────────────────────────
//
// This exists because the same five tabs are rendered by TWO components with
// two different chrome designs: components/BottomNav.tsx (the floating pill on
// every page except the homepage) and components/AppHome.tsx (the wider bar
// that ships with the app-style homepage, which is why BottomNav returns null
// on "/"). They were maintained separately, and they drifted: the same tab was
// labelled "Track / Suivi / Swiv" in one and "Bookings / Réserv. / Rezerv." in
// the other, so its name changed depending on which page you were standing on.
//
// Labels, destinations and active-state rules now live here and nowhere else.
// A tab is added or renamed in ONE place; the two components only decide how it
// LOOKS. Do not re-inline a tab list in a component — that is the bug this
// module exists to prevent.

/** en / fr / cr, in that order — the tuple every label in this app uses. */
export type Tri = readonly [string, string, string];

export type NavTab = {
  key: string;
  icon: React.ElementType;
  label: Tri;
  /** A destination, or undefined for a tab that performs an action instead. */
  href?: string;
  /** Opens the site-wide Ti Roulé chat rather than navigating. */
  action?: "tiroule";
  /** Which paths light this tab up. Absent for action tabs — they never do. */
  match?: (pathname: string) => boolean;
};

export const NAV_TABS: readonly NavTab[] = [
  {
    key: "home",
    icon: Home,
    href: "/",
    label: ["Home", "Accueil", "Lakaz"],
    // Exact, not startsWith: "/" prefixes every path in the app.
    match: (p) => p === "/",
  },
  {
    key: "explore",
    icon: Compass,
    href: "/explore",
    label: ["Explore", "Explorer", "Explor"],
    match: (p) => p.startsWith("/explore"),
  },
  {
    key: "tiroule",
    icon: Bot,
    action: "tiroule",
    // Ti Roulé is a name, so it is the same word in all three languages.
    label: ["Ti Roulé", "Ti Roulé", "Ti Roulé"],
  },
  {
    key: "track",
    icon: CalendarCheck,
    // /track, not /manage-booking. The tab said "Suivi" and led to the VEHICLE
    // lookup, so a customer tracking food, a shop order, an event ticket or a
    // boat trip found a form that could not help them — and place bookings had
    // no customer-facing tracking at all. /track takes any reference.
    href: "/track",
    label: ["Track", "Suivi", "Swiv"],
    // Every surface a customer can land on from here keeps the tab lit, rather
    // than leaving them on a screen no tab claims.
    match: (p) =>
      p.startsWith("/track") || p.startsWith("/manage-booking") || p.startsWith("/orders"),
  },
  {
    key: "more",
    icon: Menu,
    href: "/more",
    label: ["More", "Plus", "Plis"],
    match: (p) => p.startsWith("/more"),
  },
];

/** The tab currently lit, if any. Pure — safe to unit test. */
export function isTabActive(tab: NavTab, pathname: string): boolean {
  return tab.match ? tab.match(pathname) : false;
}

/** Pick a tab's label for the visitor's language. */
export function tabLabel(tab: NavTab, language: Language): string {
  return language === "fr" ? tab.label[1] : language === "cr" ? tab.label[2] : tab.label[0];
}

/** Every renderer opens the chat the same way — one event name, defined once. */
export function openTiRoule(): void {
  window.dispatchEvent(new CustomEvent("tiroule:open"));
}
