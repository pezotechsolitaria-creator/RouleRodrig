"use client";

import { useEffect } from "react";

// Captures a hotel/partner referral code from the URL (?ref=CODE) and stores
// it so the booking form can attribute the booking automatically — no code to
// remember or type. Renders nothing.
export default function RefCapture() {
  useEffect(() => {
    try {
      const ref = new URLSearchParams(window.location.search).get("ref");
      if (ref) {
        const clean = ref.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 30);
        if (clean) localStorage.setItem("rr_ref", clean);
      }
    } catch {
      /* ignore */
    }
  }, []);
  return null;
}
