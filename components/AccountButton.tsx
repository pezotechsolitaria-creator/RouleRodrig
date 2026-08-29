"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleUser } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { loc } from "@/lib/localize";

// ── The account control, top-right, where people look for it ─────────────────
//
// It was a tab in the bottom bar. The owner's instruction: move it up beside the
// language toggle and the saved-items heart, "to be more professional".
//
// He is right, and the reason is worth writing down: the bottom bar is for
// WHERE YOU ARE GOING — Home, Order, Explore, Ti Roulé, More. An account is not
// a destination in that sense; it is WHO YOU ARE, which is why every app of this
// shape puts it in the top-right corner next to the other identity controls
// (language, saved). Keeping it as a sixth tab also crowded the bar: six tabs at
// 375px left 50px each, and a 50px target with a word under it is the smallest
// thing on the screen for the elderly customers this has to serve.
//
// Same component in all three app headers so the corner never moves between
// pages — that consistency is most of what "professional" means here.
export default function AccountButton({ className = "" }: { className?: string }) {
  const pathname = usePathname() || "/";
  const { language } = useLanguage();
  const label = loc(language, "My account", "Mon compte", "Mo Kont");
  // Lit when you are already inside your own area, so the corner tells you where
  // you are rather than only where you could go.
  const active =
    pathname.startsWith("/account") ||
    pathname.startsWith("/orders") ||
    pathname.startsWith("/track") ||
    pathname.startsWith("/manage-booking");

  return (
    <Link
      href="/account"
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors after:absolute after:-inset-1 after:content-[''] ${
        active
          ? "border-yellow/50 bg-yellow/10 text-yellow"
          : "border-white/10 text-muted hover:border-yellow/50 hover:text-yellow"
      } ${className}`}
    >
      <CircleUser size={17} />
    </Link>
  );
}
