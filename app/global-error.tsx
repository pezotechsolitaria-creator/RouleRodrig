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

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#050505",
          color: "#f5f5f0",
          fontFamily: "system-ui, sans-serif",
          padding: "1.5rem",
          textAlign: "center",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800 }}>Service temporarily unavailable</h1>
          <p style={{ color: "#9a9a93", marginTop: "0.75rem", fontSize: "0.9rem" }}>
            We hit an unexpected error. Please refresh in a moment.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              background: "#2F80ED",
              color: "#050505",
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
