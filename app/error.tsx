"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";

// Route-level error boundary. Catches render/runtime errors in the page tree
// so a single component failure never blanks the whole site.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Hook for an error tracker (Sentry, etc.) — structured for easy parsing.
    console.error(
      JSON.stringify({
        level: "error",
        scope: "react-error-boundary",
        message: error.message,
        digest: error.digest,
        at: new Date().toISOString(),
      }),
    );
  }, [error]);

  return (
    <main className="min-h-screen bg-dark text-offwhite font-dm flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <div className="w-14 h-14 rounded-2xl bg-yellow/10 flex items-center justify-center mx-auto mb-6">
          <AlertTriangle size={26} className="text-yellow" />
        </div>
        <h1 className="font-syne font-extrabold text-2xl mb-3">Something went wrong</h1>
        <p className="text-muted text-sm mb-8">
          A temporary problem stopped this page from loading. Please try again — your data is safe.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="flex items-center gap-2 bg-yellow text-dark font-syne font-bold text-sm px-5 py-3 rounded-full hover:bg-yellow-dark transition-colors"
          >
            <RotateCcw size={15} /> Try again
          </button>
          <Link
            href="/"
            className="flex items-center gap-2 border border-dark-border text-muted hover:text-yellow hover:border-yellow/40 text-sm px-5 py-3 rounded-full transition-colors"
          >
            <Home size={15} /> Home
          </Link>
        </div>
      </div>
    </main>
  );
}
