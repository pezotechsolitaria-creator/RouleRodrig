"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, Wallet, Clock, BadgeCheck } from "lucide-react";

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
const LINKS = [
  { href: "/merchant/orders", label: "Orders", icon: ClipboardList },
  { href: "/merchant/payments", label: "Payments", icon: Wallet },
  { href: "/merchant/hours", label: "Hours", icon: Clock },
  { href: "/merchant/subscription", label: "Plan", icon: BadgeCheck },
] as const;

function useActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

/** Inline links inside the header. Hidden on phones, where the tab bar takes over. */
export function MerchantNavDesktop() {
  const isActive = useActive();
  return (
    <nav aria-label="Merchant sections" className="ml-4 hidden items-center gap-3 sm:flex">
      {LINKS.map(({ href, label, icon: Icon }) => {
        const active = isActive(href);
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
export function MerchantNavMobile() {
  const isActive = useActive();
  return (
    <nav
      aria-label="Merchant sections"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-dark/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      <ul className="mx-auto flex max-w-md">
        {LINKS.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
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
