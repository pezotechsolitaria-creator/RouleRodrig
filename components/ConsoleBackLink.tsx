import Link from "next/link";
import { ArrowLeft } from "lucide-react";

// ── The way out of a console ────────────────────────────────────────────────
//
// The owner: "FOR ALL DASHBOARDS ADD A BACK BUTTON SO THEY CAN GO BACK TO THE
// WEBSITE."
//
// Every working console on this platform was a dead end. /driver, /errands,
// /organizer, /merchant, /kitchen and the taxi driver's /d/<token> had no link
// to the site at all — a driver who opened their bookmark could reach their
// jobs and nothing else, and the only route back was the browser's own button
// or retyping the address.
//
// That is worse than it sounds on a phone saved to the home screen: a page
// opened as a PWA has no address bar and often no back gesture, so the console
// really was the whole app.
//
// ── ONE COMPONENT, NOT SIX LINKS ───────────────────────────────────────────
// Written once so the six consoles cannot drift into six different words for
// the same idea, and so a change of destination is a change in one file. It is
// a plain server component: no state, no client bundle, and it renders on a
// dashboard that has not finished loading its data.
export default function ConsoleBackLink({
  /**
   * Where "back" goes.
   *
   * MY ACCOUNT, not the public home page, on the owner's instruction. Everyone
   * in a console is signed in, and /account is their hub — it lists every other
   * console they can reach, their orders and their bookings, and the site is one
   * more tap from there. Dropping them on the marketing home page threw away
   * the fact that we know who they are, and a merchant who also drives, or an
   * organiser who also runs a kitchen, had no route between their own consoles
   * at all.
   *
   * The exception is a console reached WITHOUT a login — the taxi driver's
   * /d/<token> page — which passes href="/" explicitly, because /account would
   * put a sign-in wall in front of someone who has no account by design.
   */
  href = "/account",
  label = "My account",
  className = "",
  compactOnMobile = false,
}: {
  href?: string;
  label?: string;
  className?: string;
  /** Collapse to the arrow alone on small screens, for headers that are
   *  already full. The link itself never disappears — a phone saved to the
   *  home screen is exactly where the way out matters most. */
  compactOnMobile?: boolean;
}) {
  return (
    <Link
      href={href}
      // min-h-11 rather than a bare text link: this is tapped one-handed, often
      // outdoors, by the same audience the /deliver rebuild sized its targets
      // for.
      className={`inline-flex min-h-11 items-center gap-1.5 font-dm text-sm text-muted transition-colors hover:text-yellow ${className}`}
    >
      <ArrowLeft size={15} className="shrink-0" aria-hidden />
      <span className={compactOnMobile ? "hidden sm:inline" : undefined}>{label}</span>
      {compactOnMobile && <span className="sr-only sm:hidden">{label}</span>}
    </Link>
  );
}
