"use client";

import { useCallback, useEffect, useState } from "react";
import { Bike, Phone, ShieldCheck, CheckCircle2 } from "lucide-react";

// What the customer sees while a driver is bringing their order — and, when it
// matters, the four digits the driver will ask for at the door.
//
// Without this card the delivery literally cannot be completed:
// complete_delivery_with_pin() is the only route to `delivered`, and the PIN
// existed nowhere the customer could reach.

type Delivery = {
  status: string;
  pin: string | null;
  driverName: string | null;
  driverPhone: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
};

// Written from the customer's point of view, not the system's. They do not care
// what `searching_driver` means; they care whether someone is coming.
const SAYS: Record<string, string> = {
  searching_driver: "Finding you a driver",
  assigned: "A driver is on the way to the shop",
  going_to_pickup: "A driver is on the way to the shop",
  arrived_at_pickup: "Your driver is collecting your order",
  picked_up: "Your driver has your order",
  out_for_delivery: "On the way to you",
  arrived: "Your driver is outside",
  delivered: "Delivered",
  cancelled: "Delivery cancelled",
  failed_delivery: "Delivery could not be completed",
  returned_to_merchant: "Returned to the shop",
  requires_admin: "We're sorting this out",
  driver_unresponsive: "Finding you another driver",
  driver_unavailable: "Finding you another driver",
};

export default function DeliveryStatusCard({
  orderId,
  email,
  className = "",
}: {
  orderId: string;
  email?: string | null;
  className?: string;
}) {
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ orderId });
      if (email) qs.set("email", email);
      const res = await fetch(`/api/orders/delivery?${qs.toString()}`, { cache: "no-store" });
      const body = await res.json().catch(() => null);
      setDelivery((body?.delivery as Delivery | null) ?? null);
    } catch {
      // A tracking card that cannot load must stay silent, not shout an error
      // over the rest of a perfectly good order page.
    } finally {
      setLoaded(true);
    }
  }, [orderId, email]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 20_000);
    return () => clearInterval(t);
  }, [load]);

  // Nothing to say for a pickup order, or before a delivery exists.
  if (!loaded || !delivery) return null;

  const done = delivery.status === "delivered";
  // The PIN is only useful once someone is actually carrying the order. Showing
  // it while the shop is still packing invites the customer to read it out to
  // the wrong person on the phone.
  const showPin =
    Boolean(delivery.pin) &&
    ["picked_up", "out_for_delivery", "arrived"].includes(delivery.status);

  return (
    <div className={`rounded-2xl border border-white/10 bg-dark-card p-5 ${className}`}>
      <p className="flex items-center gap-2 font-bebas text-[11px] tracking-[0.3em] text-yellow">
        {done ? <CheckCircle2 size={13} /> : <Bike size={13} />} DELIVERY
      </p>
      <h2 className="mt-1.5 font-syne text-lg font-bold">
        {SAYS[delivery.status] ?? "On its way"}
      </h2>

      {delivery.driverName && !done && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-dark p-3">
          <p className="font-dm text-sm">
            <span className="text-muted">Your driver:</span>{" "}
            <span className="font-semibold">{delivery.driverName}</span>
          </p>
          {delivery.driverPhone && (
            <a
              href={`tel:${delivery.driverPhone}`}
              className="flex min-h-[40px] items-center gap-1.5 rounded-full border border-white/20 px-4 font-syne text-sm font-bold"
            >
              <Phone size={14} /> Call
            </a>
          )}
        </div>
      )}

      {showPin && (
        <div className="mt-3 rounded-xl border border-yellow/30 bg-yellow/10 p-4 text-center">
          <p className="flex items-center justify-center gap-1.5 font-dm text-xs text-muted">
            <ShieldCheck size={13} className="text-yellow" />
            Give this to your driver when your order arrives
          </p>
          <p className="mt-2 font-bebas text-4xl tracking-[0.35em] text-yellow">{delivery.pin}</p>
          <p className="mt-1.5 font-dm text-[11px] text-muted">
            Only share it once you have your order in your hands.
          </p>
        </div>
      )}

      {done && (
        <p className="mt-2 font-dm text-sm text-muted">
          Confirmed with your PIN. Thanks for using Roulé Rodrigues.
        </p>
      )}
    </div>
  );
}
