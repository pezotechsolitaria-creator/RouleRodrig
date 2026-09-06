"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// Rows, not tiles. Every row is a full-width 56px target reachable with one
// thumb, and the labels are long enough to say what they are — "Opening hours"
// rather than "Hours" — because this is the screen someone reaches when they
// are looking for something they cannot find.
//
// Sign out lives at the bottom, separated, and is the ONLY destructive control
// on the page. It used to be a 36px icon in the header, in the worst corner of
// a phone screen for a thumb.
export default function MoreList({
  links,
}: {
  links: { href: string; label: string }[];
}) {
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/merchant/login");
  }

  return (
    <div className="mt-6 max-w-lg">
      <ul className="overflow-hidden rounded-2xl border border-white/10 bg-dark-card">
        {links.map((l) => (
          <li key={l.href} className="border-b border-white/5 last:border-b-0">
            <Link
              href={l.href}
              className="flex min-h-[56px] items-center justify-between gap-3 px-4 font-dm text-sm text-offwhite transition-colors hover:bg-white/[0.04]"
            >
              {l.label}
              <ChevronRight size={16} className="shrink-0 text-muted" />
            </Link>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={signOut}
        className="mt-4 flex min-h-[56px] w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-dark-card px-4 font-dm text-sm text-muted transition-colors hover:border-red-400/30 hover:text-red-300"
      >
        Sign out
        <LogOut size={16} className="shrink-0" />
      </button>
    </div>
  );
}
