"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDriverTracking } from "@/lib/tracking/useDriverTracking";
import type { TrackingStatus } from "@/lib/tracking/model";
import DriverGpsStatus from "./DriverGpsStatus";

// ── TRACKING FOR THE DRIVER WHO DOES HAVE AN ACCOUNT ────────────────────────
//
// Same engine, different credential. A delivery driver holds a Supabase session,
// so /api/tracking/ping resolves them through current_driver() instead of a
// token — that is the entire difference between this file and the taxi one.
//
// It also means the channel key can be fetched by the BROWSER: M109 grants
// delivery_tracking_context() to `authenticated` precisely because the RPC
// resolves the driver from auth.uid() and can therefore never be pointed at
// somebody else's job. No new API route exists for this, because none is needed.
//
// The step ladder is NOT duplicated here. /driver already has a proven
// one-next-step flow (NEXT in DriverDashboard) writing through advance_delivery,
// and giving deliveries a second way to change status would be exactly the
// duplicate business logic the brief forbids. This adds the missing half —
// position — and nothing else.

/** Delivery lifecycle → the stage a watcher's map reads. */
function stageOf(status: string | undefined): TrackingStatus {
  switch (status) {
    case "assigned":
    case "going_to_pickup":
      return "en_route_pickup";
    case "arrived_at_pickup":
      return "at_pickup";
    case "picked_up":
    case "out_for_delivery":
    case "arrived":
      return "on_trip";
    case "delivered":
      return "ended";
    default:
      return "pending";
  }
}

type Ctx = { ok?: boolean; trip?: { id?: string; status?: string; channelKey?: string } | null };

/** One of the driver's active deliveries, as the dashboard knows it. */
export type TrackableJob = { id: string; status: string };

export default function DeliveryTracking({
  online, jobs, driverId,
}: {
  online: boolean;
  /**
   * EVERY active delivery, not the first one.
   *
   * ── WHY THIS IS A LIST ─────────────────────────────────────────────────
   * It used to be `activeId={active[0]?.id}` — the dashboard's own guess at
   * which job was being worked. Those two ends disagreed:
   *
   *   driver_dashboard()          order by d.assigned_at        → OLDEST
   *   delivery_tracking_context() order by assigned_at desc     → NEWEST
   *
   * and every consumer of the tracking context takes the newest. With one
   * active delivery the two agree and everything works, which is why this
   * survived. With TWO, the guess is the oldest, the server allows only the
   * newest, and the equality below fails — so `channelKey` went null, and
   * over in the ping route `body.tripId === allowedTripId` failed too, which
   * downgrades the stage to "online" and drops en_route_pickup / at_pickup /
   * on_trip on the floor.
   *
   * The result was not "the wrong job is tracked". It was NEITHER job
   * tracked: a driver doing two deliveries went dark for both customers, and
   * came back the moment they finished one.
   *
   * The component asks the server which trip is current anyway, on the line
   * below. It now believes the answer instead of overruling it.
   */
  jobs: TrackableJob[];
  /** For fleet presence, so the admin board sees them appear and disappear. */
  driverId?: string | null;
}) {
  const [trip, setTrip] = useState<{ id: string; channelKey: string | null; status: string | null } | null>(null);

  // A stable dependency: re-read when the SET of active jobs changes — a job
  // finishing or being reassigned mints a new key, and a driver holding the old
  // one would broadcast into a channel nobody is listening on.
  const jobKey = jobs.map((j) => `${j.id}:${j.status}`).join(",");
  const hasJobs = jobs.length > 0;

  const loadKey = useCallback(async () => {
    if (!online || !hasJobs) {
      setTrip(null);
      return;
    }
    try {
      const supabase = createClient();
      const { data } = await supabase.rpc("delivery_tracking_context");
      const ctx = data as Ctx | null;
      const id = ctx?.trip?.id ?? null;
      // The server decides WHICH. It is the only authority that can: the ping
      // route re-derives the same value and refuses anything else.
      setTrip(id ? { id, channelKey: ctx?.trip?.channelKey ?? null, status: ctx?.trip?.status ?? null } : null);
    } catch {
      // No key means no broadcast — the 20-second database write still happens,
      // so the customer's map is slower rather than blank.
      setTrip(null);
    }
    // jobKey is the real dependency; `jobs` is a fresh array every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, hasJobs, jobKey]);

  // Synchronising with an external system — the rule's documented escape
  // hatch. This kicks off an async read whose setState calls all happen after
  // an await; the rule cannot see that and flags the call site conservatively.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadKey(); }, [loadKey]);

  // Derived: a key belongs to a job, so it is null whenever there is no job to
  // broadcast for. Storing that as a separate transition is how a driver ends up
  // publishing into a channel for a delivery they already finished.
  const effectiveKey = online && trip ? trip.channelKey : null;

  // The STATUS of the tracked job — preferring the dashboard's copy, which is
  // 20 seconds fresh, and falling back to the context's own. Reading
  // `active[0].status` here was the same bug wearing a different hat: it could
  // publish "at_pickup" for a job the driver had already collected.
  const trackedStatus =
    (trip && jobs.find((j) => j.id === trip.id)?.status) ?? trip?.status ?? undefined;

  const tracking = useDriverTracking({
    enabled: online,
    credential: useMemo(() => ({ kind: "delivery" as const }), []),
    channelKey: effectiveKey,
    trip: trip ? { kind: "delivery" as const, id: trip.id } : null,
    trackingStatus: stageOf(trackedStatus),
    driverKind: "delivery",
    driverId,
  });

  // Going offline erases the stored position rather than letting it age out.
  useEffect(() => {
    if (online) return;
    void fetch("/api/tracking/ping", { method: "DELETE" });
  }, [online]);

  return <DriverGpsStatus tracking={tracking} working={online} hasJob={!!trip} />;
}
