"use client";

import Link from "next/link";
import { useShopCopy } from "@/components/shop/ShopCopy";

// Route-level error boundary for /shop. A failed browse_stores() call throws
// in the page; this keeps the failure honest — a retry button, not a fake
// "no shops yet" state that would read as an empty marketplace.
export default function ShopDirectoryError({ reset }: { error: Error; reset: () => void }) {
  const copy = useShopCopy();

  return (
    <main className="min-h-screen bg-dark px-4 pb-16 pt-10 text-offwhite">
      <div className="mx-auto max-w-4xl">
        <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">{copy.error.eyebrow}</p>
        <div className="mt-10 rounded-2xl border border-white/10 bg-dark-card px-6 py-12 text-center">
          <p className="font-syne text-xl font-bold text-offwhite">{copy.error.title}</p>
          <p className="mx-auto mt-2 max-w-sm font-dm text-sm text-muted">
            {copy.error.body}
          </p>
          <div className="mt-5 flex items-center justify-center gap-3">
            <button
              onClick={reset}
              className="rounded-xl bg-yellow px-5 py-2.5 font-dm text-sm font-bold text-dark transition-opacity hover:opacity-90"
            >
              {copy.error.retry}
            </button>
            <Link
              href="/"
              className="rounded-xl border border-white/15 px-5 py-2.5 font-dm text-sm font-semibold text-offwhite transition-colors hover:border-white/30"
            >
              {copy.error.backHome}
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
