"use client";

import { useEffect, useState } from "react";

// ── The PayPal Client ID, for browser code ──────────────────────────────────
//
// Asked of /api/paypal/client-id at run time instead of baked into the build
// from NEXT_PUBLIC_PAYPAL_CLIENT_ID (see lib/paypal.ts for why). One request
// per page, shared by every PayPal button on it.

let pending: Promise<string> | null = null;

export function fetchPayPalClientId(): Promise<string> {
  if (!pending) {
    pending = fetch("/api/paypal/client-id")
      .then((r) => (r.ok ? r.json() : {}))
      .then((j: { clientId?: unknown }) => (typeof j.clientId === "string" ? j.clientId : ""))
      .catch(() => {
        pending = null; // a failed read is retried by the next button
        return "";
      });
  }
  return pending;
}

/** null while asking; "" when PayPal is not available; else the Client ID. */
export function usePayPalClientId(): string | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    void fetchPayPalClientId().then((v) => {
      if (on) setId(v);
    });
    return () => {
      on = false;
    };
  }, []);
  return id;
}
