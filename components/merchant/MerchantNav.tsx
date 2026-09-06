"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { KIND_VOCAB, type MerchantKind } from "@/lib/merchant/kind";
import { ClipboardList, Wallet, Clock, BadgeCheck, LayoutDashboard, Package, UtensilsCrossed, Store, MoreHorizontal, QrCode, ChefHat } from "lucide-react";

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

// ── FIVE SLOTS, AND THE SAME FIVE FOR EVERY KIND ───────────────────────────
//
// This shipped SEVEN primary destinations, and EIGHT for a kitchen once the
// Menu tab was spliced in. At 375px that puts six of a kitchen's eight cells
// under the 44px touch minimum — the very floor the comment above claims to
// clear, because it measures min-h-[56px], the height, not the width. Five
// cells at 375px are 75px each.
//
// The slot COUNT and ORDER are identical for every kind. Only slot three
// changes its word, icon and destination, read from KIND_VOCAB. That is what
// lets muscle memory survive switching between a shop and a kitchen, and what
// makes a future service provider a lookup rather than a new navigation.
//
// Everything demoted goes to /merchant/more, which is GENERATED FROM THE SAME
// SOURCE as this dock — so the two can never disagree about where a merchant
// can go. That was the defect in the old home screen's hand-copied tile grid.

/** The five that live in the dock. Slot three is filled per kind. */
function primaryFor(kind: MerchantKind): NavLink[] {
  const v = KIND_VOCAB[kind];
  return [
    { href: "/merchant", label: "Home", icon: LayoutDashboard, exact: true },
    { href: "/merchant/orders", label: "Orders", icon: ClipboardList },
    { href: v.catalogue.href, label: v.catalogue.label, icon: catalogueIcon(kind) },
    { href: "/merchant/payments", label: "Money", icon: Wallet },
    { href: "/merchant/more", label: "More", icon: MoreHorizontal, exact: true },
  ];
}

/**
 * Everything reachable but not in the dock.
 *
 * Exported so /merchant/more renders exactly this list. Pickup is in here for
 * the first time: it is currently linked from NO merchant screen at all.
 */
export function secondaryFor(kind: MerchantKind, hasPlan: boolean): NavLink[] {
  const v = KIND_VOCAB[kind];
  const out: NavLink[] = [
    { href: "/merchant/profile", label: "Shop details", icon: Store },
    { href: "/merchant/hours", label: "Opening hours", icon: Clock },
    { href: "/merchant/pickup", label: "Pickup desk", icon: QrCode },
  ];
  // A kitchen's catalogue is its Menu, which took slot three — so its products
  // are still reachable here rather than lost.
  if (v.catalogue.href !== "/merchant/products") {
    out.splice(1, 0, { href: "/merchant/products", label: "Products", icon: Package });
  }
  // The cook's board. It was a header link with `hidden ... sm:inline-flex`,
  // so it was invisible on exactly the device a cook holds — a complaint the
  // owner has made repeatedly. Here it is reachable at every width.
  if (kind === "kitchen") {
    out.push({ href: "/kitchen", label: "Cook's screen", icon: ChefHat });
  }
  if (hasPlan) out.push({ href: "/merchant/subscription", label: "Plan", icon: BadgeCheck });
  return out;
}

function linksFor(kind: MerchantKind, hasPlan = true): NavLink[] {
  void hasPlan;
  return primaryFor(kind);
}

function catalogueIcon(kind: MerchantKind) {
  return kind === "kitchen" ? UtensilsCrossed : Package;
}

function useActive() {
  const pathname = usePathname();
  // "Home" is /merchant, a prefix of every other route, so it must match
  // exactly or it would light up on every page at once.
  return (href: string, exact = false) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

/** Inline links inside the header. Hidden on phones, where the tab bar takes over. */
export function MerchantNavDesktop({ kind = "shop", hasPlan = true }: { kind?: MerchantKind; hasPlan?: boolean }) {
  const isActive = useActive();
  const links = linksFor(kind, hasPlan);
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
export function MerchantNavMobile({ kind = "shop", hasPlan = true }: { kind?: MerchantKind; hasPlan?: boolean }) {
  const links = linksFor(kind, hasPlan);
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
