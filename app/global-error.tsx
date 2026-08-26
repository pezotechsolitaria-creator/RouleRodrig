"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// Last-resort boundary that catches errors in the root layout itself.
// Must render its own <html>/<body>.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Sentry, not PostHog: it is the one error tracker here that scrubs PII on
    // the way out (lib/sentry-scrub.ts). React swallows errors caught by a
    // boundary, so this boundary has to report the error itself or nothing will.
    Sentry.captureException(error);

    console.error(
      JSON.stringify({
        level: "fatal",
        scope: "global-error-boundary",
        message: error.message,
        digest: error.digest,
        at: new Date().toISOString(),
      }),
    );
  }, [error]);

  // The root layout is what threw, so its pre-paint language script never ran
  // and this <html lang="en"> below would stand. Someone whose site is in Kreol
  // should not be read an English apology in an English voice because the page
  // that failed was the one that sets the language.
  //
  // The mapping is inline rather than imported from lib/i18n: this boundary is
  // the last thing standing when everything else has broken, and importing the
  // whole translation dictionary into it to read three letters is a dependency
  // it should not have. lib/i18n.test.ts asserts this copy still agrees.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("rr_language");
      document.documentElement.lang =
        saved === "cr" ? "mfe" : saved === "fr" ? "fr" : "en";
    } catch {
      /* localStorage unavailable — the served lang="en" stands */
    }
  }, []);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
          color: "#f5f5f0",
          fontFamily: "system-ui, sans-serif",
          padding: "1.5rem",
          textAlign: "center",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800 }}>
            Service temporarily unavailable
          </h1>
          <p
            style={{
              color: "#9a9a93",
              marginTop: "0.75rem",
              fontSize: "0.9rem",
            }}
          >
            We hit an unexpected error. Please refresh in a moment.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              background: "#F5C842",
              color: "#0a0a0a",
              border: "none",
              padding: "0.75rem 1.5rem",
              borderRadius: "999px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
