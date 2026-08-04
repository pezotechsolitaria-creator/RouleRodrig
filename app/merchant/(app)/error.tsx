"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function MerchantError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Merchant area error", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 py-8 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 text-red-400 ring-1 ring-inset ring-red-500/20">
        <AlertTriangle size={20} />
      </span>
      <div>
        <h1 className="font-syne text-lg font-bold text-offwhite">Something went wrong</h1>
        <p className="mt-1 font-dm text-sm text-muted">Please try again — your data hasn&apos;t been affected.</p>
      </div>
      <button
        type="button"
        onClick={reset}
        className="flex items-center gap-2 rounded-full bg-yellow px-5 py-2.5 font-syne text-sm font-bold text-dark transition-colors hover:bg-yellow-dark"
      >
        <RotateCcw size={14} /> Try again
      </button>
    </div>
  );
}
