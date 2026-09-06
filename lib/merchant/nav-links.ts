import { ClipboardList, Wallet, Clock, BadgeCheck, LayoutDashboard, Package, UtensilsCrossed, Store, MoreHorizontal, QrCode, ChefHat, Truck, CalendarDays, Wrench } from "lucide-react";
import { KIND_VOCAB, type MerchantKind } from "@/lib/merchant/kind";

// ── THE MERCHANT NAVIGATION, DEFINED WHERE A SERVER COMPONENT CAN READ IT ──
//
// This lived inside components/merchant/MerchantNav.tsx, which is "use client".
// /merchant/more is a SERVER component and imported secondaryFor() from it — a
// server component importing from a client module, which this codebase has been
// caught by before. It builds locally and throws in production: the owner got
// "Something went wrong" on the More tab.
//
// So the tables move here, to a plain module with no directive, and BOTH the
// client dock and the server More page import from it. That also keeps the
// property the More page exists to have: one source, so the two can never
// disagree about where a merchant can go.

export type NavLink = { href: string; label: string; icon: React.ElementType; exact?: boolean };

/**
 * The five that live in the dock. Slot three is filled per kind, and for a
 * trade so is slot two.
 *
 * ── WHY A TRADE GETS A DIARY WHERE A SHOP GETS ORDERS ─────────────────────
 * A car wash sells an appointment. Almost nothing reaches it through the order
 * queue, so a provider docked to Orders would tap an empty screen every morning
 * while the one thing their business runs on sat behind More. It is the same
 * substitution a kitchen already makes at slot three, for the same reason, and
 * the slot COUNT and ORDER stay identical so muscle memory survives switching
 * between two of your own businesses.
 *
 * Nothing is lost: whatever a kind displaces reappears in secondaryFor below,
 * which /merchant/more renders from this same file.
 */
export function primaryFor(kind: MerchantKind): NavLink[] {
  const v = KIND_VOCAB[kind];
  const work: NavLink =
    kind === "service"
      ? { href: "/merchant/diary", label: "Diary", icon: CalendarDays }
      : { href: "/merchant/orders", label: "Orders", icon: ClipboardList };
  return [
    { href: "/merchant", label: "Home", icon: LayoutDashboard, exact: true },
    work,
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
    { href: "/merchant/delivery", label: "Your own delivery", icon: Truck },
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
  // The diary took slot two from Orders for a trade, so Orders is still
  // reachable here rather than lost — a car wash may yet sell a bottle of wax.
  if (kind === "service") {
    out.splice(1, 0, { href: "/merchant/orders", label: "Orders", icon: ClipboardList });
  }
  if (hasPlan) out.push({ href: "/merchant/subscription", label: "Plan", icon: BadgeCheck });
  return out;
}

const CATALOGUE_ICON: Record<MerchantKind, React.ElementType> = {
  shop: Package,
  kitchen: UtensilsCrossed,
  events: Package,
  // A box, for a business that sells no boxes. A spanner says trade at a
  // glance, and slot three is the one cell whose meaning changes per kind.
  service: Wrench,
};

function catalogueIcon(kind: MerchantKind) {
  return CATALOGUE_ICON[kind];
}

