"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { pickupScanUrl } from "@/lib/orders/pickup";
import { SITE_URL } from "@/lib/site";
import type { PickupQrGeometry } from "@/lib/orders/pickup-qr";

// The scannable half of the pickup handoff.
//
// WHY A CLIENT COMPONENT, AND LAZY
// Both screens that show a pickup code render this: /orders/[id] (a server
// component) and /orders/track (a client one, because a guest's order arrives
// from a fetch). One client component serves both. The encoder is imported
// dynamically inside the effect, so a customer downloads it only in the one
// state where a code exists — an order that is ready to collect. Measured:
// it lands in its own 19.9 KB chunk, reached by nothing else.
//
// WHY IT ENCODES A URL
// So the merchant's own camera app does the scanning: no scanner in our app,
// no camera permission, and no dependence on BarcodeDetector, which iOS Safari
// still does not have. See pickupScanUrl().
export default function PickupQr({ code, size = 176 }: { code: string; size?: number }) {
  const { t } = useLanguage();
  const [qr, setQr] = useState<PickupQrGeometry | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { buildPickupQr } = await import("@/lib/orders/pickup-qr");
        // SITE_URL, not window.location.origin. A customer who reached the site
        // on the old roule-rodrig.vercel.app host would otherwise be handed a
        // QR pointing there, and the merchant's scan would spend a redirect —
        // or land somewhere their session cookie is not. The canonical host is
        // the one every other link in this product uses.
        const built = buildPickupQr(pickupScanUrl(code, SITE_URL || window.location.origin));
        if (!cancelled) setQr(built);
      } catch (err) {
        // Degrade quietly for the customer — the typed code below this IS the
        // handoff and still works — but never silently for us. Swallowing this
        // outright once hid a chunk that simply had not been built yet, and
        // "the QR just doesn't appear" is not a debuggable report.
        console.error("pickup QR failed to render", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  // Reserve the box up front so the card does not jump when the QR arrives.
  if (!qr) return <div style={{ width: size, height: size }} aria-hidden className="rounded-xl bg-white/[0.06]" />;

  // Light, in both themes, always: a camera cannot read dark-on-dark, and the
  // white quiet zone is what lets it find the code's edge against this page.
  return (
    <svg
      viewBox={`0 0 ${qr.span} ${qr.span}`}
      width={size}
      height={size}
      role="img"
      aria-label={t.a11yMore.pickupQr}
      className="rounded-xl bg-white shadow-[0_6px_20px_-8px_rgba(0,0,0,0.6)]"
      shapeRendering="crispEdges"
    >
      <rect width={qr.span} height={qr.span} fill="#ffffff" />
      <g transform={`translate(${qr.quiet} ${qr.quiet})`} fill="#0B0B0F">
        <path d={qr.path} />
      </g>
    </svg>
  );
}
