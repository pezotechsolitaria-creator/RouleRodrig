"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  Loader2, MapPin, Navigation, Phone, MessageCircle, CheckCircle2, ArrowRight,
} from "lucide-react";
import { useDriverTracking } from "@/lib/tracking/useDriverTracking";
import type { TrackingStatus } from "@/lib/tracking/model";
import DriverGpsStatus from "./DriverGpsStatus";

const TrackingMap = dynamic(() => import("./TrackingMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-white/[0.04]" />,
});

// ── THE DRIVER'S JOB, AND THE ONE BUTTON THAT MATTERS ───────────────────────
//
// Written for somebody holding a phone at a road junction with the engine
// running. Every decision here follows from that:
//
//   ONE primary action, ever. Not a row of four status buttons to choose
//   between — the next step is the ONLY step, it fills the width, and it is
//   66px tall so it can be hit without looking. The step after it is named
//   underneath in small text so the driver knows what is coming.
//
//   NAVIGATE is separate and equal. It is the other thing they need, and it
//   hands off to the maps app they already know rather than trying to be one.
//
//   THE MAP IS SMALL HERE. The driver does not need to watch themselves move;
//   they need to see they are being SEEN. A 150px strip proves the dot is live
//   and gets out of the way of the buttons.
//
// The GPS banner is never silent. A driver whose location is off is invisible
// to dispatch and to their customer, and finding that out from an angry phone
// call is the failure this replaces.

export type DriverJob = {
  kind: "ride" | "delivery";
  id: string;
  status: string;
  channelKey: string | null;
  pickup: string | null;
  dropoff: string | null;
  pickupLat: number | null; pickupLng: number | null;
  dropoffLat: number | null; dropoffLng: number | null;
  customerName: string | null;
  customerPhone: string | null;
};

/** The ride graph, from the driver's side. Mirrors driver_advance_ride_by_token. */
const RIDE_STEPS: { to: string; label: string; hint: string }[] = [
  { to: "driver_on_way", label: "I'M ON MY WAY", hint: "Tell them you've set off" },
  { to: "arrived", label: "I'VE ARRIVED", hint: "You're at the pickup point" },
  { to: "on_trip", label: "START THE TRIP", hint: "Passenger is in the car" },
  { to: "completed", label: "FINISH THE TRIP", hint: "You've dropped them off" },
];

function nextStep(status: string): { to: string; label: string; hint: string } | null {
  switch (status) {
    case "assigned": return RIDE_STEPS[0];
    case "driver_on_way": return RIDE_STEPS[1];
    case "arrived": return RIDE_STEPS[2];
    case "on_trip": return RIDE_STEPS[3];
    default: return null;
  }
}

function afterThat(status: string): string | null {
  const order = ["assigned", "driver_on_way", "arrived", "on_trip"];
  const i = order.indexOf(status);
  return i >= 0 && i + 1 < RIDE_STEPS.length ? RIDE_STEPS[i + 1].label : null;
}

/** ride status → the tracking stage the customer's map reads. */
function trackingStageOf(status: string): TrackingStatus {
  switch (status) {
    case "driver_on_way": return "en_route_pickup";
    case "arrived": return "at_pickup";
    case "on_trip": return "on_trip";
    case "completed": return "ended";
    default: return "pending";
  }
}

/**
 * Hand off to whatever maps app the phone has.
 *
 * A universal https Google Maps directions link, NOT a geo: URI. geo: is the
 * "correct" scheme and it is a coin flip in practice — on iOS nothing claims it,
 * and on Android an unlucky device shows an app-chooser to a driver who wanted
 * one tap. The https form deep-links into the installed Google Maps app on both
 * platforms and degrades to the web map when there is none.
 */
function navUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
}

export default function DriverJobPanel({
  token, job, working, onChanged, driverId,
}: {
  token: string;
  job: DriverJob | null;
  working: boolean;
  onChanged: () => void | Promise<void>;
  /** For fleet presence, so the admin board sees them appear and disappear. */
  driverId?: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmFinish, setConfirmFinish] = useState(false);

  const stage = trackingStageOf(job?.status ?? "");
  const tracking = useDriverTracking({
    // Tracking runs while the driver is ON DUTY, not only while on a job:
    // dispatch has to know who is near a pickup before there is a job to be
    // near. The high-frequency broadcast is what is gated on having one.
    enabled: working,
    credential: useMemo(() => ({ kind: "taxi" as const, token }), [token]),
    channelKey: job?.channelKey ?? null,
    trip: job ? { kind: job.kind, id: job.id } : null,
    trackingStatus: stage,
    driverKind: "taxi",
    driverId,
  });

  // Going off duty erases the stored position rather than letting it age out.
  useEffect(() => {
    if (working) return;
    void fetch(`/api/tracking/ping?t=${encodeURIComponent(token)}`, { method: "DELETE" });
  }, [working, token]);

  const step = job ? nextStep(job.status) : null;

  const advance = useCallback(async () => {
    if (!step) return;
    if (step.to === "completed" && !confirmFinish) {
      setConfirmFinish(true);
      return;
    }
    setBusy(true);
    setMsg(null);
    setConfirmFinish(false);
    try {
      const r = await fetch("/api/driver-home", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "advance", token, to: step.to }),
      });
      const b = (await r.json().catch(() => ({}))) as
        { ok?: boolean; reason?: string; message?: string };
      if (!b.ok) {
        // 'out_of_order' means somebody (the office, or a double tap that did
        // land) already moved it. Not an error to shout about — refresh and the
        // button becomes the right one.
        setMsg(b.reason === "out_of_order" ? null : (b.message ?? "That didn't save. Try again."));
      }
      await onChanged();
    } catch {
      setMsg("No connection. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }, [step, token, confirmFinish, onChanged]);

  const target =
    job?.status === "on_trip"
      ? { lat: job.dropoffLat, lng: job.dropoffLng, label: job.dropoff }
      : { lat: job?.pickupLat ?? null, lng: job?.pickupLng ?? null, label: job?.pickup ?? null };

  return (
    <div className="space-y-3">
      {/* ── Am I being seen? ────────────────────────────────────────────
          One component for both driver screens: a taxi driver and a delivery
          driver hit the same five ways GPS fails, and the copy that explains
          them must not exist twice. */}
      <DriverGpsStatus tracking={tracking} working={working} hasJob={!!job} />

      {/* ── The job ─────────────────────────────────────────────────────── */}
      {job && (
        <div className="overflow-hidden rounded-2xl border border-green-500/30 bg-green-500/[0.05]">
          {/* A short map strip: proof the dot is live, not a thing to stare at. */}
          {tracking.lastFix && (
            <div className="h-[150px] w-full">
              <TrackingMap
                driver={{
                  id: "me",
                  lat: tracking.lastFix.lat,
                  lng: tracking.lastFix.lng,
                  kind: "driver",
                  bearing: tracking.lastFix.heading,
                  stale: tracking.gps !== "live",
                }}
                pins={[
                  ...(job.pickupLat != null && job.pickupLng != null
                    ? [{ id: "p", lat: job.pickupLat, lng: job.pickupLng, kind: "pickup" as const }]
                    : []),
                  ...(job.dropoffLat != null && job.dropoffLng != null
                    ? [{ id: "d", lat: job.dropoffLat, lng: job.dropoffLng, kind: "dropoff" as const }]
                    : []),
                ]}
                directLine={
                  target.lat != null && target.lng != null
                    ? [[tracking.lastFix.lat, tracking.lastFix.lng], [target.lat, target.lng]]
                    : null
                }
                fitTo={
                  target.lat != null && target.lng != null
                    ? [[tracking.lastFix.lat, tracking.lastFix.lng], [target.lat, target.lng]]
                    : [[tracking.lastFix.lat, tracking.lastFix.lng]]
                }
                follow
                interactive={false}
              />
            </div>
          )}

          <div className="p-5">
            <p className="font-bebas text-[10px] tracking-[0.25em] text-green-400">
              {job.status === "on_trip" ? "ON THE TRIP" : "YOUR CURRENT RIDE"}
            </p>
            {job.customerName && (
              <p className="mt-1.5 font-syne text-lg font-bold text-offwhite">{job.customerName}</p>
            )}

            <div className="mt-2 space-y-1.5 font-dm text-sm">
              <p className={`flex items-start gap-2 ${job.status === "on_trip" ? "opacity-45" : ""}`}>
                <MapPin size={14} className="mt-0.5 shrink-0 text-yellow" />
                <span className="text-offwhite/90">{job.pickup}</span>
              </p>
              <p className="flex items-start gap-2">
                <Navigation size={14} className="mt-0.5 shrink-0 text-green-400" />
                <span className="text-offwhite/90">{job.dropoff}</span>
              </p>
            </div>

            {/* ── THE next step. One button, thumb-sized. ──────────────── */}
            {step && (
              <>
                <button
                  onClick={() => void advance()}
                  disabled={busy}
                  className={`mt-4 flex w-full items-center justify-center gap-2.5 rounded-2xl py-[22px] font-syne text-lg font-extrabold transition-colors disabled:opacity-60 ${
                    confirmFinish
                      ? "bg-orange-400 text-dark"
                      : step.to === "completed"
                        ? "bg-green-500 text-dark"
                        : "bg-yellow text-dark"
                  }`}
                >
                  {busy ? <Loader2 size={22} className="animate-spin" /> : <CheckCircle2 size={22} />}
                  {confirmFinish ? "TAP AGAIN TO CONFIRM" : step.label}
                </button>
                <p className="mt-1.5 text-center font-dm text-[11px] text-muted">
                  {confirmFinish
                    ? "This ends the ride and can't be undone."
                    : afterThat(job.status)
                      ? `${step.hint} · next: ${afterThat(job.status)?.toLowerCase()}`
                      : step.hint}
                </p>
              </>
            )}

            {msg && (
              <p role="status" className="mt-2 text-center font-dm text-xs text-orange-300">{msg}</p>
            )}

            {/* ── Navigate + reach the customer ────────────────────────── */}
            <div className="mt-3 grid grid-cols-3 gap-2">
              <a
                href={target.lat != null && target.lng != null ? navUrl(target.lat, target.lng) : undefined}
                target="_blank"
                rel="noreferrer"
                aria-disabled={target.lat == null}
                className={`flex flex-col items-center justify-center gap-1 rounded-xl border border-white/15 bg-dark-card py-3 font-dm text-[11px] font-bold text-offwhite ${
                  target.lat == null ? "pointer-events-none opacity-40" : "hover:border-yellow/50"
                }`}
              >
                <Navigation size={18} className="text-yellow" />
                Navigate
              </a>
              <a
                href={job.customerPhone ? `tel:${job.customerPhone}` : undefined}
                aria-disabled={!job.customerPhone}
                className={`flex flex-col items-center justify-center gap-1 rounded-xl border border-white/15 bg-dark-card py-3 font-dm text-[11px] font-bold text-offwhite ${
                  job.customerPhone ? "hover:border-yellow/50" : "pointer-events-none opacity-40"
                }`}
              >
                <Phone size={18} className="text-yellow" />
                Call
              </a>
              <a
                href={
                  job.customerPhone
                    ? `https://wa.me/${job.customerPhone.replace(/\D/g, "")}`
                    : undefined
                }
                target="_blank"
                rel="noreferrer"
                aria-disabled={!job.customerPhone}
                className={`flex flex-col items-center justify-center gap-1 rounded-xl border border-white/15 bg-dark-card py-3 font-dm text-[11px] font-bold text-offwhite ${
                  job.customerPhone ? "hover:border-[#25D366]/60" : "pointer-events-none opacity-40"
                }`}
              >
                <MessageCircle size={18} className="text-[#25D366]" />
                WhatsApp
              </a>
            </div>

            {/* The honest limit, said where it matters rather than in a manual. */}
            <p className="mt-3 flex items-start gap-1.5 font-dm text-[11px] leading-relaxed text-muted">
              <ArrowRight size={12} className="mt-0.5 shrink-0" />
              Keep this page open while you drive. If you close it or lock your phone for a long
              time, your passenger stops seeing you move — that&apos;s a limit of the phone, not a fault.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
