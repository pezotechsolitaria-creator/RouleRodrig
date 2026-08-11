import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// The organiser area.
//
// ── THE GATE ────────────────────────────────────────────────────────────────
// Two checks, and neither is the real security boundary: `is_event_organizer()`
// is a SECURITY DEFINER function reading auth.uid() and live status, and every
// page beneath re-derives its own data through can_manage_event(). This layout
// only decides WHERE to send somebody who does not belong, so they get a login
// page instead of an empty dashboard.
//
// ── WHY THIS IS NOT /merchant ───────────────────────────────────────────────
// An organiser is not a merchant (M43). They never see stores, products,
// subscriptions or marketplace orders — sharing that shell would give them a
// sidebar full of things they cannot open, and a single mistake in a shared
// layout would leak the marketplace to them.
export default async function OrganizerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/organizer");

  // Claim an invitation on first arrival, so an organiser who signed up before
  // being invited — or who was invited after signing up — is linked without
  // anyone having to notice. Idempotent; matched on their own confirmed
  // address, never a parameter.
  try {
    await supabase.rpc("claim_organizer_invite");
  } catch (err) {
    console.error("claim_organizer_invite failed", err);
  }

  const { data: isOrganizer } = await supabase.rpc("is_event_organizer");
  if (!isOrganizer) {
    // Deliberately NOT an error page. Somebody landing here is either a
    // customer who followed a stale link or an organiser whose access was
    // revoked; both are better served by their own area than by a refusal.
    redirect("/orders");
  }

  return (
    <div className="min-h-screen bg-dark text-offwhite">
      <header className="border-b border-white/10 bg-dark/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/organizer" className="flex items-center gap-2">
            <CalendarDays size={17} className="text-yellow" />
            <span className="font-syne text-sm font-extrabold text-offwhite">
              Roulé <span className="text-yellow">Organiser</span>
            </span>
          </Link>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 font-dm text-xs text-muted transition-colors hover:border-yellow/40 hover:text-yellow"
            >
              <LogOut size={13} /> Sign out
            </button>
          </form>
        </div>
      </header>
      {children}
    </div>
  );
}
