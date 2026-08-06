"use client";

import { useEffect, useState } from "react";

// The sticky category rail every serious storefront pins under its header
// (Wolt's is 68px and never leaves): one glance tells you what the shop sells,
// one tap jumps to it, and the highlight follows as you scroll. Pure anchor
// links underneath — works without JS, the scrollspy is progressive polish.
export default function CategoryRail({ sections }: { sections: { id: string; name: string }[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        // Topmost intersecting section wins — stable while scrolling both ways.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-120px 0px -55% 0px" },
    );
    for (const s of sections) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sections]);

  function jump(e: React.MouseEvent, id: string) {
    e.preventDefault();
    setActive(id);
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    document.getElementById(id)?.scrollIntoView({ behavior, block: "start" });
  }

  if (sections.length < 2) return null;

  return (
    <nav
      aria-label="Product categories"
      className="sticky top-14 z-20 -mx-4 border-b border-white/5 bg-dark/85 px-4 backdrop-blur-xl"
    >
      <div className="mx-auto flex max-w-4xl gap-2 overflow-x-auto py-2.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {sections.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            onClick={(e) => jump(e, s.id)}
            className={
              active === s.id
                ? "shrink-0 rounded-full bg-yellow px-3.5 py-1.5 font-dm text-xs font-bold text-dark"
                : "shrink-0 rounded-full border border-white/10 px-3.5 py-1.5 font-dm text-xs font-medium text-muted transition-colors hover:text-offwhite"
            }
          >
            {s.name}
          </a>
        ))}
      </div>
    </nav>
  );
}
