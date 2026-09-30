"use client";

import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { scrollToSection } from "./scroll";

// ── The price bar that follows you down the page ─────────────────────────────
//
// Once the hero has scrolled away and the plans are out of view, the page's
// one action would otherwise be a long scroll back up. This bar keeps it one
// tap away: the real "from" price, WhatsApp help, and "See plans".
//
// Docked ABOVE the floating bottom nav on phones (the nav is 3.875rem plus the
// safe area, see components/BottomNav.tsx), never over it; on desktop, where
// the nav is hidden, it sits near the bottom edge. It hides whenever the plans
// are on screen — two identical calls to action in one view is one too many.

export default function StickyBar({
  from,
  sub,
  cta,
  helpHref,
  helpLabel,
  hidden,
}: {
  from: string;
  sub: string;
  cta: string;
  helpHref: string | null;
  helpLabel: string;
  /** Forced hidden (e.g. while the checkout sheet is open). */
  hidden?: boolean;
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const hero = document.getElementById("esim-hero");
    const plans = document.getElementById("esim-plans");
    if (!hero || !plans || !("IntersectionObserver" in window)) return;
    let heroGone = false;
    let plansVisible = true;
    const apply = () => setShow(heroGone && !plansVisible);
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.target === hero) heroGone = !e.isIntersecting;
        if (e.target === plans) plansVisible = e.isIntersecting;
      }
      apply();
    });
    io.observe(hero);
    io.observe(plans);
    return () => io.disconnect();
  }, []);

  const visible = show && !hidden;

  return (
    <div
      aria-hidden={!visible}
      className={`pointer-events-none fixed inset-x-0 z-30 flex justify-center px-4 transition-[opacity,transform] duration-300 ease-out bottom-[calc(3.875rem+max(0.75rem,env(safe-area-inset-bottom))+0.5rem)] md:bottom-6 ${
        visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
      }`}
    >
      <div
        className={`flex w-full max-w-sm items-center gap-3 rounded-2xl border border-white/12 bg-dark/85 py-2 pl-4 pr-2 shadow-[0_16px_44px_-12px_rgba(0,0,0,0.75)] backdrop-blur-xl ${
          visible ? "pointer-events-auto" : ""
        }`}
      >
        <div className="min-w-0 flex-1">
          <p className="font-syne text-[15px] font-bold leading-tight text-offwhite">{from}</p>
          <p className="truncate font-dm text-[11px] text-muted">{sub}</p>
        </div>
        {helpHref && (
          <a
            href={helpHref}
            target="_blank"
            rel="noopener noreferrer"
            tabIndex={visible ? 0 : -1}
            aria-label={helpLabel}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/12 text-offwhite/85 transition-colors hover:bg-white/5"
          >
            <MessageCircle size={18} aria-hidden />
          </a>
        )}
        <button
          type="button"
          tabIndex={visible ? 0 : -1}
          onClick={() => scrollToSection("esim-plans")}
          className="min-h-11 shrink-0 rounded-full bg-yellow px-5 font-syne text-sm font-bold text-dark transition-colors hover:bg-yellow-dark"
        >
          {cta}
        </button>
      </div>
    </div>
  );
}
