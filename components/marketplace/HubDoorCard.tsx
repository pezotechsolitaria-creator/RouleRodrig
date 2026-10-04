import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { HubAction } from "@/lib/marketplace/hub";

// One door on the /marketplace hub. Moved out of app/marketplace/page.tsx
// unchanged in look when the hub grew from one grid into five branches
// (architecture review 2026-09-30, item 1), so every branch draws the same card.

/**
 * A real anchor when there is somewhere to go, and a plain div when there is
 * not — never a disabled link. A link that goes nowhere is still focusable,
 * still announced as a link, and still tapped.
 */
export default function HubDoorCard({
  action: a,
  icon: Icon,
}: {
  action: Pick<HubAction, "key" | "title" | "blurb" | "href">;
  icon: React.ElementType;
}) {
  const open = a.href !== null;

  const inner = (
    <>
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
          open ? "bg-yellow text-dark" : "bg-white/[0.06] text-muted"
        }`}
      >
        <Icon size={20} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span
            className={`font-syne text-[17px] font-extrabold ${
              open ? "text-offwhite" : "text-muted"
            }`}
          >
            {a.title}
          </span>
          {!open && (
            // The word, not a colour. A greyed card alone is a guess; this
            // says which it is.
            <span className="rounded-full border border-white/15 px-2 py-0.5 font-dm text-[10px] uppercase tracking-wider text-muted">
              Soon
            </span>
          )}
        </span>
        <span className="mt-0.5 block font-dm text-[13px] leading-relaxed text-muted">
          {a.blurb}
        </span>
      </span>
      {open && <ArrowRight size={17} className="mt-1 shrink-0 text-yellow" aria-hidden />}
    </>
  );

  return open ? (
    <Link
      href={a.href!}
      className="flex min-h-[88px] items-start gap-3 rounded-2xl border border-white/10 bg-dark-card p-4 transition-colors hover:border-yellow/45"
    >
      {inner}
    </Link>
  ) : (
    <div className="flex min-h-[88px] items-start gap-3 rounded-2xl border border-white/[0.06] bg-dark-card/40 p-4">
      {inner}
    </div>
  );
}
