import { Home, Compass, Bot, CircleUser, Menu, ShoppingBag } from "lucide-react";
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
    key: "order",
    icon: ShoppingBag,
    // Food, the marketplace and tickets were reachable only from the homepage —
    // no tab, no navbar link, no footer link, no row in /more. Leaving the
    // homepage meant losing the shop. This is the door back, and it leads to a
    // three-card chooser rather than to one of the three, because a customer
    // should not have to know whether a curry is "food" or "marketplace".
    href: "/order",
    label: ["Order", "Commander", "Komann"],
    // `/order` EXACTLY — "/orders" is the Track tab's own page and startsWith
    // would have stolen it, lighting two tabs at once.
    match: (p) =>
      p === "/order" || p.startsWith("/food") || p.startsWith("/shop") ||
      p.startsWith("/events") || p.startsWith("/cart") || p.startsWith("/checkout"),
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
    key: "account",
    icon: CircleUser,
    // ── Was "Track" ──────────────────────────────────────────────────────────
    // Tracking is one thing you do about YOUR stuff, and it now lives at the top
    // of the page that holds all of it. That page is also the answer to a
    // separate problem: the platform grew a console per role (/merchant,
    // /driver, /organizer, /partner) and the only way to reach yours was to know
    // its address. Nothing listed them. /account reads your account and shows
    // the doors you actually have.
    //
    // Guests are not shut out — /account leads with "Find an order or booking",
    // no account needed, and /track still works on its own (it is in emails).
    href: "/account",
    label: ["Account", "Compte", "Kont"],
    match: (p) =>
      p.startsWith("/account") || p.startsWith("/track") ||
      p.startsWith("/manage-booking") || p.startsWith("/orders") || p.startsWith("/login"),
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
