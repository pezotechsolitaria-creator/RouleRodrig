"use client";

import { useEffect, useState } from "react";
import { Bell, BellRing, Loader2, Info } from "lucide-react";
import { pushSupported, currentPushState, type PushState } from "@/lib/push/subscribe";

// "Tell me when this changes." One tap, no account.
//
// Deliberately not the driver's toggle reused: a driver subscribes as a person
// and keeps it forever, a customer subscribes for THIS order and proves they
// own it with the order's email. Different credential, different lifetime.
export default function OrderAlerts({
  orderId,
  bookingRef,
  email,
  className = "",
}: {
  /** A marketplace/food/event order. Mutually exclusive with bookingRef. */
  orderId?: string;
  /** A vehicle or place booking, identified as the customer sees it (RR-XXXXXX). */
  bookingRef?: string;
  email?: string | null;
  className?: string;
}) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void currentPushState().then(setState);
  }, []);

  async function enable() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: toBytes(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""),
        }));

      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      // Two transaction kinds, two credentials: an order proves itself with its
      // id, a booking with the reference the customer was given. Each route
      // verifies its own against the matching email.
      const res = bookingRef
        ? await fetch("/api/bookings/push", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ref: bookingRef, email, endpoint: json.endpoint, keys: json.keys }),
          })
        : await fetch("/api/orders/push", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId, email: email || undefined, endpoint: json.endpoint, keys: json.keys }),
          });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Could not turn alerts on.");
        return;
      }
      setState("on");
    } catch (err) {
      console.error("order alerts failed", err);
      setError("Could not turn alerts on.");
    } finally {
      setBusy(false);
    }
  }

  // A browser that cannot receive push gets no dead switch.
  if (state === null || state === "unsupported" || !pushSupported()) return null;

  if (state === "on") {
    return (
      <p className={`flex items-center gap-1.5 font-dm text-xs text-green-400 ${className}`}>
        <BellRing size={13} /> You&apos;ll get a notification when this{" "}
        {bookingRef ? "booking" : "order"} changes.
      </p>
    );
  }

  if (state === "denied") {
    return (
      <p className={`flex items-start gap-2 font-dm text-xs text-muted ${className}`}>
        <Info size={13} className="mt-0.5 shrink-0" />
        Notifications are blocked for this site in your browser settings.
      </p>
    );
  }

  return (
    <div className={className}>
      <button
        onClick={() => void enable()}
        disabled={busy}
        className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full border border-white/20 px-5 font-syne text-sm font-bold text-offwhite disabled:opacity-50"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Bell size={15} />}
        Notify me when this {bookingRef ? "booking" : "order"} changes
      </button>
      <p className="mt-1.5 text-center font-dm text-[11px] text-muted">
        No account needed. Works even with this page closed.
      </p>
      {error && <p className="mt-2 text-center font-dm text-xs text-red-400">{error}</p>}
    </div>
  );
}

// Duplicated from lib/push/subscribe rather than exported from it, because the
// VAPID key must be read in this component's own module scope for Next to
// inline the NEXT_PUBLIC_ value at build time.
function toBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = (base64Url + "=".repeat((4 - (base64Url.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}
