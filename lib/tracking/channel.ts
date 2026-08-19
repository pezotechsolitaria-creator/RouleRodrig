"use client";

import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { Fix } from "./model";

// ── THE FAST PATH ───────────────────────────────────────────────────────────
//
// Supabase Realtime BROADCAST. Ephemeral by design: a position ping is worthless
// three seconds later, so it never touches Postgres. The database still learns
// where a driver is, but through /api/tracking/ping every ~20 s — one write per
// twenty fixes instead of one per fix.
//
// ── WHY THE TOPIC IS A SECRET AND NOT AN ID ─────────────────────────────────
// Supabase authorises PRIVATE channels with RLS on realtime.messages, which
// reads auth.uid(). On this platform the taxi driver, the customer and the admin
// all have NO Supabase session — they authenticate to our server by token,
// reference+phone and an admin cookie respectively. Private channels are
// therefore unreachable for exactly the parties that need them.
//
// So the topic name IS the capability: trip_tracking.channel_key, 256 bits from
// the database, handed out only by a server route that has just checked a
// credential. It is the same construction ride_offers.token already uses to let
// an account-less driver accept a job, and it is unguessable in the same way.
//
// ── WHAT THAT COSTS, HONESTLY ───────────────────────────────────────────────
// A public channel can be WRITTEN to by anyone who knows its name. Somebody
// holding a key could therefore broadcast a false position — but holding the key
// already grants watching, and a customer faking their own map fools nobody.
// The mitigation that matters is that BROADCAST IS NOT THE SOURCE OF TRUTH: the
// tracking page also polls /api/tracking/trip, which re-checks authorisation
// server-side and returns the database's last-known position. A wrong frame is
// corrected within one poll, and a missing socket degrades to a slower dot
// rather than a blank map.
//
// ── FREE-TIER BUDGET ────────────────────────────────────────────────────────
// Supabase free: 200 concurrent connections, 2,000,000 messages/month, 256 KB
// per message. This module sends ~1 message per PUBLISH_MS while a driver is on
// a job — never merely while online — so a 20-minute trip costs about 240
// messages. Twenty trips a day is ~144k/month, comfortably inside it. See
// docs/LIVE_TRACKING.md for the arithmetic.

/** The one event name. Kept short: it is on every frame. */
const POSITION_EVENT = "p";

/** How often a driver's phone broadcasts while on a job. */
export const PUBLISH_MS = 4000;

/** How often it persists to the database. One write per five broadcasts. */
export const PERSIST_MS = 20_000;

/** How often a watcher re-reads the authoritative snapshot. */
export const POLL_MS = 25_000;

export function trackingTopic(channelKey: string): string {
  return `trip-${channelKey}`;
}

export type ChannelState = "connecting" | "live" | "error" | "closed";

/**
 * Watch a trip's channel.
 *
 * Returns an unsubscribe function. `onState` reports the socket honestly so the
 * UI can say "reconnecting" rather than silently showing a stale dot — a
 * customer must always be able to tell a stopped car from a dropped connection.
 */
export function subscribeToTrip(
  channelKey: string,
  onFix: (fix: Fix) => void,
  onState?: (state: ChannelState) => void,
): () => void {
  const supabase = createClient();
  let channel: RealtimeChannel | null = null;
  let closed = false;

  onState?.("connecting");

  channel = supabase
    .channel(trackingTopic(channelKey), {
      // self:false — a driver watching their own trip (it happens: the owner
      // testing) should not receive their own frames back and animate twice.
      config: { broadcast: { self: false, ack: false } },
    })
    .on("broadcast", { event: POSITION_EVENT }, (msg) => {
      const p = (msg as { payload?: Partial<Fix> }).payload;
      if (!p || typeof p.lat !== "number" || typeof p.lng !== "number") return;
      onFix({
        lat: p.lat,
        lng: p.lng,
        heading: typeof p.heading === "number" ? p.heading : null,
        speedKmh: typeof p.speedKmh === "number" ? p.speedKmh : null,
        accuracyM: typeof p.accuracyM === "number" ? p.accuracyM : null,
        // Never trust a client clock for ordering across devices; stamp arrival.
        // shouldAcceptFix() uses this only to order frames from ONE source.
        at: Date.now(),
      });
    })
    .subscribe((status) => {
      if (closed) return;
      if (status === "SUBSCRIBED") onState?.("live");
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") onState?.("error");
      else if (status === "CLOSED") onState?.("closed");
    });

  return () => {
    closed = true;
    onState?.("closed");
    if (channel) void supabase.removeChannel(channel);
    channel = null;
  };
}

/**
 * A driver's publishing handle.
 *
 * The channel is joined once and held: `send` on an un-joined channel falls back
 * to an HTTP POST per message, which on a phone on mobile data is both slower
 * and far more battery than one socket.
 */
export function createTripPublisher(channelKey: string): {
  publish: (fix: Fix) => void;
  close: () => void;
} {
  const supabase = createClient();
  const channel = supabase.channel(trackingTopic(channelKey), {
    config: { broadcast: { self: false, ack: false } },
  });
  let joined = false;
  channel.subscribe((status) => {
    joined = status === "SUBSCRIBED";
  });

  return {
    publish(fix: Fix) {
      // Dropping a frame while the socket is down is correct: the next one is
      // four seconds away, and the 20-second database write is what guarantees
      // the position is not lost.
      if (!joined) return;
      void channel.send({
        type: "broadcast",
        event: POSITION_EVENT,
        payload: {
          lat: Number(fix.lat.toFixed(6)),
          lng: Number(fix.lng.toFixed(6)),
          heading: fix.heading == null ? null : Math.round(fix.heading),
          speedKmh: fix.speedKmh == null ? null : Math.round(fix.speedKmh),
          accuracyM: fix.accuracyM == null ? null : Math.round(fix.accuracyM),
        },
      });
    },
    close() {
      joined = false;
      void supabase.removeChannel(channel);
    },
  };
}

// ══════════════════════════════════════════════════════════════════════════
// PRESENCE — WHO IS TRANSMITTING RIGHT NOW
// ══════════════════════════════════════════════════════════════════════════
//
// Broadcast answers "where is this driver". Presence answers a different and
// coarser question: "is anybody there at all".
//
// ── WHY BOTH, AND WHY NOT ONE ─────────────────────────────────────────────
// The database already stores a last-known position with a timestamp, and
// staleness can be inferred from it — but only by WAITING. A driver whose phone
// dies looks perfectly live for `stale_location_minutes` (ten by default),
// because absence of an update is indistinguishable from a quiet moment until
// enough time has passed.
//
// Presence closes that gap: the socket drops, Supabase fires a `leave`, and the
// admin board knows within seconds rather than minutes. It does NOT replace the
// timestamp — a driver on a train with a flaky connection may leave and rejoin
// repeatedly while genuinely driving, so the DB's `recorded_at` stays the
// authority on the POSITION and presence is the authority on the CONNECTION.
//
// ── WHY ONE SHARED CHANNEL ────────────────────────────────────────────────
// Every on-duty driver joins the same fleet channel rather than one channel
// each. Supabase's free tier allows 200 concurrent connections, and one channel
// per driver plus one per watcher is how a small island spends them. Presence
// state is a map of driver -> metadata, which is exactly the shape the admin
// board needs anyway.
//
// The topic is NOT a capability here: it carries no position and no customer
// data, only "driver X, of kind Y, is transmitting". Anything more sensitive
// stays on the per-trip channel where the key is the authorisation.

/** The one channel every on-duty driver joins. */
export const FLEET_PRESENCE_TOPIC = "fleet-presence";

export type DriverPresence = {
  driverKind: "taxi" | "delivery";
  driverId: string;
  /** Whether they are currently on a job, for the admin board's counts. */
  onJob: boolean;
  /** Epoch ms, from the driver's own clock — indicative only, never compared. */
  since: number;
};

/**
 * Announce that this driver is transmitting, for as long as the handle lives.
 *
 * Returns a `close` that leaves the channel explicitly. Explicit beats implicit
 * here: a driver pressing "I'M OFF" should disappear from the board at once,
 * not when a heartbeat eventually times out.
 */
export function joinFleetPresence(me: DriverPresence): { update: (onJob: boolean) => void; close: () => void } {
  const supabase = createClient();
  const channel = supabase.channel(FLEET_PRESENCE_TOPIC, {
    // The key is what identifies this driver's slot. Without it Supabase
    // allocates a random one per connection and a reconnect looks like a second
    // driver.
    config: { presence: { key: `${me.driverKind}:${me.driverId}` } },
  });

  let joined = false;
  let current = me;

  void channel.subscribe((status) => {
    if (status !== "SUBSCRIBED") return;
    joined = true;
    void channel.track(current);
  });

  return {
    update(onJob: boolean) {
      current = { ...current, onJob };
      if (joined) void channel.track(current);
    },
    close() {
      joined = false;
      void channel.untrack().finally(() => void supabase.removeChannel(channel));
    },
  };
}

/**
 * Watch the whole fleet's presence. Used by the admin board.
 *
 * `onChange` receives the full set every time it changes — presence is small
 * (tens of drivers) and a diff would be more code than it saves.
 */
export function watchFleetPresence(
  onChange: (present: DriverPresence[]) => void,
): () => void {
  const supabase = createClient();
  const channel = supabase.channel(FLEET_PRESENCE_TOPIC, {
    config: { presence: { key: "observer" } },
  });

  const emit = () => {
    const state = channel.presenceState<DriverPresence>();
    const out: DriverPresence[] = [];
    for (const key of Object.keys(state)) {
      // An observer occupies a slot too; it is not a driver.
      if (key === "observer") continue;
      const first = state[key]?.[0];
      if (first?.driverId) out.push(first);
    }
    onChange(out);
  };

  channel
    .on("presence", { event: "sync" }, emit)
    .on("presence", { event: "join" }, emit)
    .on("presence", { event: "leave" }, emit)
    .subscribe();

  return () => { void supabase.removeChannel(channel); };
}
