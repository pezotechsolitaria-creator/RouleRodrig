"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { SlidersHorizontal, X } from "lucide-react";

// The mobile filter sheet.
//
// On a phone a sidebar is not an option and a dropdown per filter is four taps
// to answer one question, so the whole panel arrives as a bottom sheet — the
// pattern every commerce app on the shopper's phone already uses.
//
// ── THE PORTAL RULE THIS OBEYS ─────────────────────────────────────────────
// The sheet is portalled to document.body so no ancestor's `overflow` or
// `transform` can clip it, and it is mounted ONLY after the client has hydrated
// (`mounted`), because React deletes DOM it did not render and a server-rendered
// portal target vanishes on hydration. It is deliberately NOT wrapped in
// AnimatePresence: AnimatePresence around createPortal renders nothing at all,
// which is exactly how the Install-app button was lost once already.
//
// The CONTENT is a server-rendered child passed in, so the filter links inside
// are real hrefs that work with JS disabled once the sheet is open, and there
// is only one definition of the filter list (components/shop/FilterPanel.tsx).
export default function FilterSheet({
  activeCount, children,
}: {
  activeCount: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // A sheet that leaves the page scrolling behind it feels broken, and Escape
  // has to close it for anyone on a keyboard.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-dark-card px-4 py-2.5 font-dm text-sm font-medium text-offwhite transition-colors hover:border-yellow/40 lg:hidden"
      >
        <SlidersHorizontal size={15} />
        Filters
        {activeCount > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-yellow px-1.5 font-dm text-[11px] font-bold text-dark">
            {activeCount}
          </span>
        )}
      </button>

      {mounted && open
        ? createPortal(
            <div className="fixed inset-0 z-[100] lg:hidden" role="dialog" aria-modal="true" aria-label="Filters">
              <button
                type="button"
                aria-label="Close filters"
                onClick={() => setOpen(false)}
                className="absolute inset-0 h-full w-full bg-black/70 backdrop-blur-sm"
              />
              <div className="absolute inset-x-0 bottom-0 max-h-[82vh] overflow-y-auto rounded-t-3xl border-t border-white/10 bg-dark pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-[0_-20px_60px_rgba(0,0,0,0.6)]">
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-dark/95 px-5 py-4 backdrop-blur-xl">
                  <span className="font-syne text-lg font-extrabold text-offwhite">Filters</span>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close filters"
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-offwhite"
                  >
                    <X size={17} />
                  </button>
                </div>
                {/* Tapping any filter navigates, which unmounts this sheet — so
                    there is no "Apply" button to forget to press. */}
                <div className="px-2 py-4">{children}</div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
