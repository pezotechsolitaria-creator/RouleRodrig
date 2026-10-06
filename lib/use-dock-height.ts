import { useEffect, type RefObject } from "react";

// ── How tall the bottom dock is, for whatever floats above it ───────────────
//
// Two docks exist — BottomNav, and the homepage's taller one with its tools
// row — and their height depends on the safe area of the phone. Anything that
// sits above the dock (the "finish your booking" bar) reads --rr-dock-h
// instead of copying either one's arithmetic. A dock hidden by md:hidden
// measures 0, which is exactly right on a desktop.

export function useDockHeight(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const set = () => root.style.setProperty("--rr-dock-h", `${Math.round(el.getBoundingClientRect().height)}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--rr-dock-h");
    };
  }, [ref]);
}
