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

export default function DeliveryTracking({
  online, activeId, activeStatus, driverId,
}: {
  online: boolean;
  /** The delivery being worked, from the dashboard's own state. */
  activeId: string | null;
  activeStatus: string | null;
  /** For fleet presence, so the admin board sees them appear and disappear. */
  driverId?: string | null;
}) {
  const [channelKey, setChannelKey] = useState<string | null>(null);

  // The key is re-read whenever the job changes: a reassignment mints a new one,
  // and a driver holding the old key would broadcast into a channel nobody is
  // listening on.
  const loadKey = useCallback(async () => {
    if (!online || !activeId) return;
    try {
      const supabase = createClient();
      const { data } = await supabase.rpc("delivery_tracking_context");
      const ctx = data as Ctx | null;
      setChannelKey(ctx?.trip?.id === activeId ? (ctx.trip.channelKey ?? null) : null);
    } catch {
      // No key means no broadcast — the 20-second database write still happens,
      // so the customer's map is slower rather than blank.
      setChannelKey(null);
    }
  }, [online, activeId]);

  // Synchronising with an external system — the rule's documented escape
  // hatch. This kicks off an async read whose setState calls all happen after
  // an await; the rule cannot see that and flags the call site conservatively.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadKey(); }, [loadKey]);

  // Derived: a key belongs to a job, so it is null whenever there is no job to
  // broadcast for. Storing that as a separate transition is how a driver ends up
  // publishing into a channel for a delivery they already finished.
  const effectiveKey = online && activeId ? channelKey : null;

  const tracking = useDriverTracking({
    enabled: online,
    credential: useMemo(() => ({ kind: "delivery" as const }), []),
    channelKey: effectiveKey,
    trip: activeId ? { kind: "delivery" as const, id: activeId } : null,
    trackingStatus: stageOf(activeStatus ?? undefined),
    driverKind: "delivery",
    driverId,
  });

  // Going offline erases the stored position rather than letting it age out.
  useEffect(() => {
    if (online) return;
    void fetch("/api/tracking/ping", { method: "DELETE" });
  }, [online]);

  return <DriverGpsStatus tracking={tracking} working={online} hasJob={!!activeId} />;
}
