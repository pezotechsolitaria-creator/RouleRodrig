import Link from "next/link";
import { CircleUser } from "lucide-react";

// ── The way back out of a console ────────────────────────────────────────────
//
// Every console — /merchant, /driver, /organizer, /partner — is a one-way street
// today: you arrive by typing its address and there is nothing on screen that
// leads to the rest of your account. So a shop owner who is also a customer, or
// a driver who also organises an event, has no route between their own doors
// except retyping URLs. Those URLs are the slashes the owner keeps meeting.
//
// One small link, the same in every console, pointing at the one page that lists
// all of them. Deliberately not a full navigation: a console's own nav is for its
// own job, and this is the exit.
export default function ConsoleAccountLink({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/account"
      className={`inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 font-dm text-xs text-muted transition-colors hover:border-yellow/40 hover:text-yellow ${className}`}
    >
      <CircleUser size={13} /> My account
    </Link>
  );
}
