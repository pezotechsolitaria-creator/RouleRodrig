"use client";

import { useEffect } from "react";

/**
 * Registers the service worker (required for installability + offline).
 * The install UI lives in InstallAppButton (persistent, in the navbar) so it's
 * always discoverable — this component is now registration-only.
 */
export default function PWARegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  return null;
}
