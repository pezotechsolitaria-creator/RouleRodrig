"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { useLanguage } from "@/context/LanguageContext";
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
  const { t } = useLanguage();
  useEffect(() => {
    // ── OR NOTHING WILL ─────────────────────────────────────────────────
    // This said "hook for an error tracker (Sentry, etc.)" and never called
    // one, while app/global-error.tsx four files away does — with the comment
    // explaining exactly why it must: "React swallows errors caught by a
    // boundary, so this boundary has to report the error itself or nothing
    // will."
    //
    // global-error only catches failures in the ROOT LAYOUT. Everything else —
    // every route-level crash in the delivery journey, on every phone —
    // rendered this screen and was never recorded. Sentry has thirteen
    // unresolved issues for this project and not one is on /deliver, which was
    // read as "that flow is fine". It meant nobody was looking.
    //
    // Sentry rather than PostHog for the same reason global-error picks it:
    // it is the one tracker here that scrubs PII on the way out
    // (lib/sentry-scrub.ts), and these pages carry addresses and phone numbers.
    Sentry.captureException(error);

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
        <h1 className="font-syne font-extrabold text-2xl mb-3">{t.common.somethingWrong}</h1>
        <p className="text-muted text-sm mb-8">
          A temporary problem stopped this page from loading. Please try again — your data is safe.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="flex items-center gap-2 bg-yellow text-dark font-syne font-bold text-sm px-5 py-3 rounded-full hover:bg-yellow-dark transition-colors"
          >
            <RotateCcw size={15} /> {t.common.tryAgain}
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
