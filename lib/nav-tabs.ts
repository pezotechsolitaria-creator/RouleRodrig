import { Home, Compass, Bot, Menu, ShoppingBag } from "lucide-react";
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

// ── FIVE TABS, AND NO ACCOUNT AMONG THEM ────────────────────────────────────
//
// This bar answers WHERE YOU ARE GOING. An account is WHO YOU ARE, so it lives
// top-right beside the language toggle and the saved heart — components/
// AccountButton.tsx, in all three app headers. It was briefly a sixth tab here,
// which crowded the bar (six targets share 343px at 375px wide) and put an
// identity control in a list of destinations.
//
// Nothing lights on /account, /orders or /track as a result, and that is
// correct: the control that took you there is in the corner, not in this bar.
// Lighting an unrelated tab would tell the visitor they are somewhere they are
// not. /more still carries "My account" and "Track an order" rows for anyone who
// looks there first.
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
    // ── DEAD CENTRE, AND IT HAS TO STAY THERE ────────────────────────────────
    // Ti Roulé is the only tab rendered as a raised gold button rather than an
    // icon and a word, and that treatment only reads as "this is the special
    // one" from the middle of the row. It WAS third of five — then the Order tab
    // was added ahead of it and pushed it to fourth, where a gold button just
    // looks like a tab someone got wrong. The comment in BottomNav.tsx still
    // claimed it sat in the centre, which is how the drift went unnoticed.
    //
    // A test now asserts the centre position, so the next tab added cannot
    // quietly displace it again.
    key: "tiroule",
    icon: Bot,
    action: "tiroule",
    // Ti Roulé is a name, so it is the same word in all three languages.
    label: ["Ti Roulé", "Ti Roulé", "Ti Roulé"],
  },
  {
    key: "explore",
    icon: Compass,
    href: "/explore",
    label: ["Explore", "Explorer", "Explor"],
    match: (p) => p.startsWith("/explore"),
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
