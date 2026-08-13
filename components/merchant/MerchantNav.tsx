"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, Wallet, Clock, BadgeCheck, LayoutDashboard, Package, UtensilsCrossed } from "lucide-react";

// The merchant dashboard's navigation, defined ONCE and rendered at both
// breakpoints from the same list.
//
// Why this exists: the header links were `hidden ... sm:flex`, so below 640px a
// merchant had NO navigation whatsoever — they landed on the dashboard and were
// stranded, unable to reach Orders, Payments, Hours or Plan. Rodrigues merchants
// run their shop from a phone, so that was the whole dashboard being unreachable
// for most of the people it is for.
//
// Mobile gets a bottom tab bar because that is where a thumb is, and it matches
// the app-like feel the rest of the product goes for. Desktop keeps the inline
// header links it already had.
// A second dead end, of the same shape as the one above: this list had no Home
// and no Products entry, and the header wordmark was a plain <span>. So once a
// merchant tapped any tab, /merchant (the dashboard) and /merchant/products
// (their entire catalogue, reachable only from dashboard tiles) were both
// unreachable in-page — and in the installed PWA there is no browser chrome to
// fall back on. Products also never showed an active state.
type NavLink = { href: string; label: string; icon: React.ElementType; exact?: boolean };

const LINKS: NavLink[] = [
  { href: "/merchant", label: "Home", icon: LayoutDashboard, exact: true },
  { href: "/merchant/orders", label: "Orders", icon: ClipboardList },
  { href: "/merchant/products", label: "Products", icon: Package },
  { href: "/merchant/payments", label: "Payments", icon: Wallet },
  { href: "/merchant/hours", label: "Hours", icon: Clock },
  { href: "/merchant/subscription", label: "Plan", icon: BadgeCheck },
];

// Restaurants only. A shop has a catalogue, not a menu du jour, and showing a
// marketplace seller a "Menu" tab is a promise the page cannot keep. Slotted
// after Products because it answers the same question in food terms — what am I
// selling today — rather than appended at the end where nobody looks.
function linksFor(isKitchen: boolean): NavLink[] {
  if (!isKitchen) return LINKS;
  const out = [...LINKS];
  out.splice(3, 0, { href: "/merchant/menu", label: "Menu", icon: UtensilsCrossed });
  return out;
}

function useActive() {
  const pathname = usePathname();
  // "Home" is /merchant, a prefix of every other route, so it must match
  // exactly or it would light up on every page at once.
  return (href: string, exact = false) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

/** Inline links inside the header. Hidden on phones, where the tab bar takes over. */
export function MerchantNavDesktop({ isKitchen = false }: { isKitchen?: boolean }) {
  const isActive = useActive();
  const links = linksFor(isKitchen);
  return (
    <nav aria-label="Merchant sections" className="ml-4 hidden items-center gap-3 sm:flex">
      {links.map(({ href, label, icon: Icon, ...rest }) => {
        const active = isActive(href, "exact" in rest && rest.exact);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-1.5 font-dm text-sm transition-colors ${
              active ? "text-yellow" : "text-muted hover:text-yellow"
            }`}
          >
            <Icon size={14} /> {label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Bottom tab bar for phones. Sits above the safe-area inset so it clears the
 * iOS home indicator; the layout adds matching bottom padding so nothing is
 * ever hidden underneath it.
 */
export function MerchantNavMobile({ isKitchen = false }: { isKitchen?: boolean }) {
  const links = linksFor(isKitchen);
  const isActive = useActive();
  return (
    <nav
      aria-label="Merchant sections"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-dark/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      <ul className="mx-auto flex max-w-md">
        {links.map(({ href, label, icon: Icon, ...rest }) => {
          const active = isActive(href, "exact" in rest && rest.exact);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                // 56px min touch target — comfortably above the 44px floor.
                className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 py-2 font-dm text-[11px] transition-colors ${
                  active ? "text-yellow" : "text-muted active:text-offwhite"
                }`}
              >
                <Icon size={18} aria-hidden="true" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
