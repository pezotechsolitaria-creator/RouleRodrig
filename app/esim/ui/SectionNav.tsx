"use client";

import { useEffect, useRef, useState } from "react";
import { scrollToSection } from "./scroll";

// ── Sticky section chips, with scrollspy and a reading-progress line ────────
//
// The store is one long page read on a phone. This rail docks under the site
// header, names every section, lights the one you are in, and lets you jump.
// The hairline under it fills with your progress through the page — a quiet
// answer to "how much more is there?".
//
// Docked by measurement, not a hard-coded offset: the header's height is read
// on mount, so the rail can never slide under it or leave a gap.

export type SectionLink = { id: string; label: string };

export default function SectionNav({ sections, label }: { sections: SectionLink[]; label: string }) {
  const [active, setActive] = useState<string>(sections[0]?.id ?? "");
  const [top, setTop] = useState(56);
  const rail = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);

  // Dock under the sticky site header.
  useEffect(() => {
    const header = document.querySelector<HTMLElement>("header.sticky");
    const measure = () => setTop(header ? Math.round(header.getBoundingClientRect().height) : 56);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Scrollspy: the section crossing the upper-middle of the screen is active.
  useEffect(() => {
    const els = sections.map((s) => document.getElementById(s.id)).filter((e): e is HTMLElement => !!e);
    if (!els.length || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setActive(hit.target.id);
      },
      { rootMargin: "-38% 0px -55% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [sections]);

  // Keep the active chip visible inside the rail (horizontal only — never
  // scrollIntoView, which would also scroll the page).
  useEffect(() => {
    const r = rail.current;
    const chip = r?.querySelector<HTMLElement>(`[data-id="${active}"]`);
    if (!r || !chip) return;
    const left = chip.offsetLeft - r.clientWidth / 2 + chip.clientWidth / 2;
    r.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [active]);

  // Reading progress, on a transform (compositor only), throttled to frames.
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      if (bar.current) bar.current.style.transform = `scaleX(${p})`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <nav
      aria-label={label}
      className="sticky z-40 border-b border-white/10 bg-dark/90 backdrop-blur-xl"
      style={{ top }}
    >
      <div ref={rail} className="rr-esim-rail mx-auto flex max-w-2xl gap-1.5 overflow-x-auto px-5 py-2.5">
        {sections.map((s) => {
          const on = s.id === active;
          return (
            <button
              key={s.id}
              type="button"
              data-id={s.id}
              aria-current={on ? "true" : undefined}
              onClick={() => scrollToSection(s.id)}
              className={`min-h-9 shrink-0 rounded-full px-3.5 font-dm text-[13px] transition-colors duration-200 ${
                on ? "bg-yellow font-semibold text-dark" : "text-offwhite/75 hover:bg-white/[0.06] hover:text-offwhite"
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </div>
      <div aria-hidden className="absolute inset-x-0 bottom-[-1px] h-[2px] overflow-hidden">
        <div ref={bar} className="h-full origin-left bg-yellow/80" style={{ transform: "scaleX(0)" }} />
      </div>
    </nav>
  );
}
