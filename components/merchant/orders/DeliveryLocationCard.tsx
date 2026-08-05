"use client";

import { useState } from "react";
import { MapPin, Copy, Check, ExternalLink, MessageCircle, Truck } from "lucide-react";
import { formatCoords, googleMapsLink, openStreetMapLink, whatsappShareLink, FULFILLMENT_LABEL } from "@/lib/orders/location";

// GPS is the delivery address for this marketplace, so this card's whole job is
// to get a merchant (or, later, a driver) from "an order exists" to "navigation
// is open" in one tap.
export default function DeliveryLocationCard({
  fulfillmentMethod, lat, lng, orderNumber, customerName, instructions, deliveryFee, zoneName,
}: {
  fulfillmentMethod: string | null;
  lat: number | null;
  lng: number | null;
  orderNumber: string;
  customerName: string | null;
  instructions: string | null;
  deliveryFee: number;
  zoneName: string | null;
}) {
  const [copied, setCopied] = useState(false);
  if (!fulfillmentMethod) return null;

  const hasGps = lat != null && lng != null;
  const coords = hasGps ? formatCoords(lat, lng) : null;

  return (
    <div className="rounded-2xl border border-white/10 bg-dark-card p-4">
      <h2 className="flex items-center gap-1.5 font-syne text-sm font-bold text-offwhite">
        <Truck size={14} className="text-yellow" /> Delivery
      </h2>
      <p className="mt-2 font-dm text-sm text-offwhite">
        {FULFILLMENT_LABEL[fulfillmentMethod] ?? fulfillmentMethod}
      </p>
      {/* The zone the customer picked is what set the fee. Showing it next to
          the GPS pin is deliberate: if the pin is nowhere near the zone, the
          order was under-priced and the merchant can see that before driving. */}
      {zoneName && (
        <p className="font-dm text-xs text-muted">
          Area chosen: <span className="text-offwhite">{zoneName}</span>
        </p>
      )}
      {deliveryFee > 0 && (
        <p className="font-dm text-xs text-muted">Delivery fee collected: Rs {(deliveryFee / 100).toFixed(2)}</p>
      )}

      {hasGps ? (
        <>
          <p className="mt-3 flex items-center gap-1.5 font-dm text-xs text-muted">
            <MapPin size={12} /> {coords}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <a
              href={googleMapsLink(lat, lng)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-yellow px-3 py-1.5 font-dm text-xs font-medium text-dark transition-colors hover:bg-yellow-dark"
            >
              <ExternalLink size={12} /> Open in Maps
            </a>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(coords!);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                } catch { /* clipboard blocked; coordinates are on screen */ }
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 font-dm text-xs text-offwhite transition-colors hover:border-yellow/50 hover:text-yellow"
            >
              {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
              {copied ? "Copied" : "Copy coordinates"}
            </button>
            <a
              href={whatsappShareLink({ lat, lng, orderNumber, customerName, instructions })}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 font-dm text-xs text-offwhite transition-colors hover:border-yellow/50 hover:text-yellow"
            >
              <MessageCircle size={12} /> Share on WhatsApp
            </a>
            <a
              href={openStreetMapLink(lat, lng)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 font-dm text-xs text-muted transition-colors hover:text-yellow"
            >
              OpenStreetMap
            </a>
          </div>
          <span className="sr-only" aria-live="polite">{copied ? "Coordinates copied" : ""}</span>
        </>
      ) : (
        <p className="mt-2 font-dm text-xs text-muted">No GPS location on this order (pickup).</p>
      )}

      {instructions && (
        <p className="mt-3 rounded-lg bg-white/[0.03] px-3 py-2 font-dm text-xs text-muted">{instructions}</p>
      )}
    </div>
  );
}
