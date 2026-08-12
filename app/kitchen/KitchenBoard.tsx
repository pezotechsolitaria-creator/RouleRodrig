"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  Loader2, ChefHat, Check, Clock, UtensilsCrossed, ClipboardList,
  Volume2, VolumeX, Undo2, WifiOff,
} from "lucide-react";
import MenuPanel from "./MenuPanel";

// ── The cook's screen ──────────────────────────────────────────────────────
//
// Designed for someone with flour on their hands, standing up, glancing at a
// propped-up phone between tasks. The governing rule is the same one the driver
// dashboard follows: EVERY ORDER HAS EXACTLY ONE OBVIOUS NEXT ACTION, and it is
// a full-width button at the bottom of the card.
//
// What is deliberately absent: the customer's email or phone, payment method,
// the menu. A cook needs to know what to cook and who is collecting.
//
// M80 brings it up to what a real kitchen display does. Measured against Toast,
// Square KDS and the Deliveroo/Uber Eats merchant tablet, five things were
// missing, and all five are the difference between a screen that works in a
// kitchen and a screen that works in a demo:
//
//   1. IT NEVER MADE A SOUND. Every KDS on the market chimes, because the cook
//      is not looking at the screen — that is the entire point of a kitchen.
//      A silent order board is a board that gets checked when someone
//      remembers to.
//   2. NOTHING AGED. A ticket sitting 40 minutes looked exactly like one that
//      arrived 40 seconds ago. Toast colours tickets by elapsed time; so does
//      this now, and the clock is large instead of grey 12px text.
//   3. NO WAY BACK. One mis-tap of a full-width button and the order was gone
//      forward for good. Every KDS has recall. See kitchen_undo_step (M80).
//   4. THE SCREEN SLEPT. A propped-up phone locks after 30 seconds, so the cook
//      wakes it, unlocks it, and finds the tab. Wake Lock keeps it on, exactly
//      as a mounted KDS tablet does.
//   5. LOSING THE SERVER LOOKED IDENTICAL TO A QUIET EVENING. A failed poll
//      left the last-known orders on screen with no indication they were stale.
//      That is the worst failure a kitchen screen can have.
//
// Finished orders are also no longer interleaved with live ones by timestamp —
// a cancelled order from three hours ago used to sort above an order that
// needed cooking now.

type Item = { name: string; variant: string | null; qty: number };
type Order = {
  id: string;
  orderNumber: string;
  kitchen: string;
  status: string;
  customer: string;
  fulfillment: string | null;
  placedAt: string;
  items: Item[];
  note: string | null;
  /** Cash, not yet paid. The customer settles at the counter on collection. */
  payOnCollection?: boolean;
  /** Bank transfer with a receipt uploaded, waiting on the kitchen's judgement. */
  awaitingPayment?: boolean;
  /** Bank transfer with nothing proven yet — do NOT cook this. */
  waitingOnTransfer?: boolean;
  hasReceipt?: boolean;
  /** Collected, cancelled or refunded. Kept on screen as today's record. */
  finished?: boolean;
  total?: number;
  currency?: string;
  /** M79 — still to be handed over in cash. Summed from the ledger, not stored. */
  balanceDue?: number;
};

/** Minor units to something a cook reads. Rs 500, not 50000. */
function money(minor: number, currency = "MUR"): string {
  return `${currency === "MUR" ? "Rs " : ""}${(minor / 100).toFixed(2)}`;
}
type Dash = { onTeam: boolean; kitchens?: { id: string; name: string }[]; orders?: Order[] };

// One next step per state — as data, so there can never be two.
const NEXT: Record<string, { to: string; label: string }> = {
  // Cash orders arrive unpaid and go straight to the kitchen (M74): the
  // customer pays at the counter, so the food has to exist first. M80 made the
  // RPC actually accept this — until then the button below raised "that order
  // has already moved on" for every cash order on the island.
  pending_payment: { to: "preparing", label: "Start cooking" },
  paid: { to: "preparing", label: "Start cooking" },
  preparing: { to: "ready_for_pickup", label: "Food is ready" },
  ready_for_pickup: { to: "collected", label: "Handed to customer" },
};

/** Where "Undo" goes back to, in words the cook recognises from the button they hit. */
const UNDO_LABEL: Record<string, string> = {
  preparing: "Undo “Start cooking”",
  ready_for_pickup: "Undo “Food is ready”",
};

const STATUS_LABEL: Record<string, string> = {
  collected: "Handed over",
  cancelled: "Cancelled",
  refunded: "Refunded",
  awaiting_payment_confirmation: "Check the payment proof",
  pending_payment: "New order",
  paid: "New order",
  preparing: "Cooking",
  ready_for_pickup: "Ready — waiting for collection",
};

function minutesSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
}

function waitingFor(iso: string): string {
  const mins = minutesSince(iso);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

// Toast's traffic light, in this kitchen's palette. The thresholds are
// deliberately generous — a Rodrigues kitchen cooks to order, and a screen that
// screams at ten minutes is a screen people learn to ignore.
function ageTone(mins: number): { ring: string; clock: string } {
  if (mins >= 25) return { ring: "border-red-500/60 bg-red-500/[0.08]", clock: "text-red-300" };
  if (mins >= 12) return { ring: "border-orange-400/50 bg-orange-400/[0.07]", clock: "text-orange-300" };
  return { ring: "border-yellow/30 bg-yellow/[0.05]", clock: "text-muted" };
}

/**
 * The chime.
 *
 * Synthesised rather than shipped as an audio file: no asset to load on a slow
 * connection, nothing to 404, and it works the first time offline. Two short
 * rising notes — recognisable across a noisy kitchen without being a siren.
 *
 * Browsers refuse to play audio until the user has interacted with the page, so
 * the context is created on an explicit tap and kept.
 */
const SOUND_KEY = "rr-kitchen-sound";

/**
 * The preference lives in localStorage so it survives the cook closing the tab,
 * and is read through useSyncExternalStore rather than an effect: the server
 * snapshot is always false, so there is no hydration mismatch and no cascading
 * render on mount.
 */
const soundStore = {
  subscribe(cb: () => void) {
    window.addEventListener(SOUND_KEY, cb);
    return () => window.removeEventListener(SOUND_KEY, cb);
  },
  get: () => window.localStorage.getItem(SOUND_KEY) === "1",
  set(v: boolean) {
    window.localStorage.setItem(SOUND_KEY, v ? "1" : "0");
    window.dispatchEvent(new Event(SOUND_KEY));
  },
};

function useChime() {
  const ctxRef = useRef<AudioContext | null>(null);
  const on = useSyncExternalStore(soundStore.subscribe, soundStore.get, () => false);

  const ensureCtx = useCallback(() => {
    if (!ctxRef.current) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctxRef.current = new Ctor();
    }
    void ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  const play = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    void ctx.resume();
    [0, 0.18].forEach((delay, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = i === 0 ? 660 : 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.36);
    });
  }, []);

  const toggle = useCallback(() => {
    const next = !soundStore.get();
    soundStore.set(next);
    // Unlock the audio context on this very tap, and confirm audibly — a
    // silent "sound is on" button is not believable in a kitchen.
    if (next) { ensureCtx(); setTimeout(play, 50); }
  }, [ensureCtx, play]);

  return { on, toggle, play: useCallback(() => { if (on) play(); }, [on, play]), ensureCtx };
}

/**
 * Keep the screen on, the way a mounted KDS tablet is always on.
 *
 * Best effort by construction: unsupported on some browsers, and the lock is
 * dropped whenever the tab is hidden, so it is re-acquired on every return.
 */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    type Sentinel = { release: () => Promise<void> };
    type WakeLockNav = { wakeLock?: { request: (t: "screen") => Promise<Sentinel> } };
    const nav = navigator as unknown as WakeLockNav;
    if (!nav.wakeLock) return;

    let sentinel: Sentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        if (document.visibilityState !== "visible") return;
        sentinel = (await nav.wakeLock!.request("screen")) ?? null;
        if (cancelled) { void sentinel?.release(); sentinel = null; }
      } catch {
        // A refused wake lock is not worth a message on a cook's screen.
      }
    };

    void acquire();
    const onVis = () => { if (document.visibilityState === "visible") void acquire(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      void sentinel?.release();
    };
  }, [active]);
}

export default function KitchenBoard() {
  // Two jobs, two tabs. Orders first and by default: during service that is
  // the only screen that matters, and the menu is set once at the start of the
  // day. A cook should never have to find their orders behind a menu editor.
  const [tab, setTab] = useState<"orders" | "menu">("orders");
  const [dash, setDash] = useState<Dash | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastOk, setLastOk] = useState<number>(() => Date.now());
  const [stale, setStale] = useState(false);
  const [newIds, setNewIds] = useState<string[]>([]);
  // Forces the ageing clocks to re-render even when no data changed.
  const [, setTick] = useState(0);

  const seen = useRef<Set<string> | null>(null);
  const chime = useChime();
  useWakeLock(tab === "orders");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/kitchen", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not load.");
      const next = body as Dash;

      // Chime for orders that were not on the previous poll. The first load
      // seeds the set silently — otherwise opening the page mid-service would
      // announce every order already on the board.
      const live = (next.orders ?? []).filter((o) => !o.finished);
      if (seen.current === null) {
        seen.current = new Set(live.map((o) => o.id));
      } else {
        const fresh = live.filter((o) => !seen.current!.has(o.id)).map((o) => o.id);
        live.forEach((o) => seen.current!.add(o.id));
        if (fresh.length > 0) {
          chime.play();
          setNewIds((prev) => Array.from(new Set([...prev, ...fresh])));
        }
      }

      setDash(next);
      setError(null);
      setLastOk(Date.now());
      setStale(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load.");
    }
  }, [chime]);

  useEffect(() => {
    void load();
    // A kitchen screen is left open all service. 15s keeps a new order visible
    // quickly without hammering a phone's battery.
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
  }, [load]);

  // Two jobs: re-render the ageing clocks, and notice when the server has gone
  // quiet. Showing hours-old orders as if they were current is the one failure
  // a kitchen screen must never have.
  useEffect(() => {
    const t = setInterval(() => {
      setTick((n) => n + 1);
      setStale(Date.now() - lastOk > 70_000);
    }, 20_000);
    return () => clearInterval(t);
  }, [lastOk]);

  async function post(order: Order, payload: Record<string, unknown>, after?: (b: Record<string, unknown>) => void) {
    if (busy) return;
    setBusy(order.id);
    setError(null);
    try {
      const res = await fetch("/api/kitchen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, ...payload }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "That didn't work.");
      after?.(body as Record<string, unknown>);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  }

  // Judge the transfer. The restaurant decides, not the platform owner —
  // otherwise every sale queues behind one person opening /admin.
  async function judgePayment(order: Order, decision: "confirm" | "reject", amountReceived?: number) {
    let reason: string | undefined;
    if (decision === "reject") {
      const answer = window.prompt(
        `Why can't this payment be accepted?

The customer can send a new photo — their order is NOT cancelled.`,
        "The proof of payment could not be read",
      );
      if (answer === null) return;
      reason = answer;
    }
    await post(order, { payment: decision, reason, amountReceived });
  }

  // The receipt lives in a private bucket, so it is opened through a signed URL
  // minted for this cook, valid two minutes.
  async function openReceipt(order: Order) {
    try {
      const res = await fetch("/api/kitchen", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.url) throw new Error(body.error || "Could not open that receipt.");
      window.open(body.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open that receipt.");
    }
  }

  // M79 — the cash half of a split, actually handed over. Deliberately its own
  // button rather than folded into "collected": the food can leave the counter
  // before the money is in the till, and a balance that settles itself the
  // moment an order is marked done is a balance nobody ever chases.
  async function settleBalance(order: Order) {
    if (!window.confirm(`Confirm you received ${money(order.balanceDue ?? 0, order.currency)} in cash for ${order.orderNumber}?`)) return;
    await post(order, { settleBalance: true });
  }

  // Cancelling. Quiet and secondary by design: it is the rarest action on this
  // screen and the only one that disappoints somebody.
  async function cancelOrder(order: Order) {
    const reason = window.prompt(
      `Cancel ${order.orderNumber}?

Tell the customer why — they will see this.`,
      "We have run out of this dish",
    );
    if (reason === null) return;
    await post(order, { cancel: true, reason }, (body) => {
      // Said plainly rather than hidden: the kitchen must not assume the
      // platform quietly handled money it never held.
      if (body.wasPaid) {
        setError("Cancelled. This customer had already paid — Roulé Rodrigues must return their money.");
      }
    });
  }

  async function advance(order: Order) {
    const next = NEXT[order.status];
    if (!next) return;
    // The order stops being "new" the moment it is acted on, so the highlight
    // and the banner clear themselves without a dismiss button to find.
    setNewIds((prev) => prev.filter((id) => id !== order.id));
    await post(order, { to: next.to });
  }

  const orders = useMemo(() => dash?.orders ?? [], [dash]);
  // Live first, oldest first; finished last, most recent first. The server
  // sorts purely by time, which put a cancelled order from this morning above
  // one that needed cooking now.
  const live = useMemo(
    () => orders.filter((o) => !o.finished)
      .sort((a, b) => new Date(a.placedAt).getTime() - new Date(b.placedAt).getTime()),
    [orders],
  );
  const done = useMemo(
    () => orders.filter((o) => o.finished)
      .sort((a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime()),
    [orders],
  );

  if (!dash) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="animate-spin text-yellow" size={28} />
      </div>
    );
  }

  if (!dash.onTeam) {
    return (
      <div className="rounded-2xl border border-white/10 bg-dark-card p-6 text-center">
        <ChefHat size={30} className="mx-auto text-yellow" />
        <h2 className="mt-3 font-syne text-xl font-bold">Not on a kitchen team yet</h2>
        <p className="mx-auto mt-2 max-w-sm font-dm text-sm text-muted">
          Ask Roulé Rodrigues to add this email address to your kitchen. Once they do, your orders
          appear here automatically — nothing else to set up.
        </p>
      </div>
    );
  }

  const tabCls = (active: boolean) =>
    `flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl font-syne text-sm font-bold transition-colors ${
      active ? "bg-yellow text-dark" : "border border-white/15 text-offwhite"
    }`;

  const renderCard = (o: Order) => {
    const next = NEXT[o.status];
    const ready = o.status === "ready_for_pickup";
    const mins = minutesSince(o.placedAt);
    const tone = ageTone(mins);
    const isNew = newIds.includes(o.id);
    const undoLabel = UNDO_LABEL[o.status];

    return (
      <div
        key={o.id}
        className={`rounded-2xl border p-4 transition-colors ${
          o.finished
            ? "border-white/10 bg-dark-card opacity-60"
            : isNew
              ? "border-yellow bg-yellow/[0.13] ring-2 ring-yellow/50"
              : ready
                ? "border-green-500/40 bg-green-500/[0.06]"
                : tone.ring
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-bebas text-[10px] tracking-[0.25em] text-yellow">{o.orderNumber}</p>
            <p className="font-syne text-base font-bold">{o.customer || "Customer"}</p>
            {/* ALWAYS shown, not only when someone works in two kitchens.
                The owner was on Riri Resto's team while every order sat in
                Ti Kitchen, saw an empty screen, and had no way to tell
                WHICH kitchen was empty. Naming it costs one line and turns
                "it is broken" into "I am looking at the wrong shop". */}
            <p className="font-dm text-xs text-muted">{o.kitchen}</p>
          </div>
          {/* The clock is the second most important thing on the card after
              the food. Grey 12px text is not a timer. */}
          <span className={`flex shrink-0 items-center gap-1 font-syne text-sm font-bold ${o.finished ? "text-muted" : tone.clock}`}>
            <Clock size={13} /> {waitingFor(o.placedAt)}
          </span>
        </div>

        {/* The order itself, big enough to read from arm's length. */}
        <ul className="mt-3 space-y-1">
          {o.items.map((it, i) => (
            <li key={i} className="flex gap-2 font-dm text-base text-offwhite">
              <span className="font-syne font-bold text-yellow">{it.qty}×</span>
              <span>
                {it.name}
                {it.variant && <span className="text-muted"> · {it.variant}</span>}
              </span>
            </li>
          ))}
        </ul>

        {o.note && (
          // A customer note is the thing most likely to be missed and most
          // expensive to get wrong, so it is boxed rather than inline.
          <p className="mt-3 rounded-xl border border-orange-400/30 bg-orange-400/5 px-3 py-2 font-dm text-sm text-orange-200">
            {o.note}
          </p>
        )}

        <p className="mt-3 font-dm text-xs text-muted">{STATUS_LABEL[o.status] ?? o.status}</p>

        {/* Do NOT cook this yet. The customer chose bank transfer and nothing
            has been proven — stated positively rather than left as an absence
            of a button, which reads as a broken card. */}
        {o.waitingOnTransfer && (
          <p className="mt-2 rounded-xl border border-white/15 bg-white/[0.03] px-3 py-2 font-dm text-sm text-muted">
            Waiting for the customer&apos;s bank transfer. Nothing to cook yet.
          </p>
        )}

        {/* The cook must know money is still owed BEFORE handing the bag
            over — after it leaves the counter it is gone. */}
        {o.payOnCollection && ready && (
          <p className="mt-2 rounded-xl border border-yellow/40 bg-yellow/10 px-3 py-2 font-syne text-sm font-bold text-yellow">
            Take payment when you hand this over
          </p>
        )}

        {/* The proof, on every order that has one and at any stage. It
            used to appear only while a decision was pending, so the
            moment it was accepted it became unreachable — and rejecting
            actively deleted it. Neither survives a dispute an hour later,
            which is exactly when somebody asks. */}
        {o.hasReceipt && !o.awaitingPayment && (
          <button
            onClick={() => void openReceipt(o)}
            className="mt-3 w-full rounded-xl border border-white/20 py-2.5 font-dm text-sm text-offwhite"
          >
            View proof of payment
          </button>
        )}

        {/* WAITING ON A TRANSFER. The cook looks at the photo and decides.
            Accept sits last and primary, Reject first and quiet — the
            destructive one should never be where a thumb lands by
            accident. Rejecting does NOT cancel: the customer can send a
            better photo. */}
        {o.awaitingPayment && (
          <div className="mt-3 rounded-xl border border-yellow/30 bg-yellow/[0.07] p-3">
            <p className="font-dm text-sm text-yellow">
              The customer says they have paid by bank transfer.
            </p>
            {o.hasReceipt ? (
              <button
                onClick={() => void openReceipt(o)}
                className="mt-2 min-h-[44px] w-full rounded-xl border border-white/20 font-dm text-sm text-offwhite"
              >
                View their proof of payment
              </button>
            ) : (
              <p className="mt-1 font-dm text-xs text-muted">No photo was uploaded.</p>
            )}
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => void judgePayment(o, "reject")}
                disabled={busy !== null}
                className="min-h-[48px] flex-1 rounded-xl border border-white/20 font-syne text-sm font-bold disabled:opacity-50"
              >
                Not received
              </button>
              <button
                onClick={() => void judgePayment(o, "confirm")}
                disabled={busy !== null}
                className="min-h-[48px] flex-[2] rounded-xl bg-yellow font-syne text-sm font-bold text-dark disabled:opacity-50"
              >
                {busy === o.id ? <Loader2 size={16} className="mx-auto animate-spin" /> : "Paid in full"}
              </button>
            </div>
            {/* M79 — a deposit by bank, the rest in cash on handover.
                Secondary to "paid in full" because it is the rarer case,
                but on the same card: asking a cook to go somewhere else
                to record a half-payment means it does not get recorded. */}
            {typeof o.total === "number" && o.total > 0 && (
              <button
                onClick={() => {
                  const answer = window.prompt(
                    `How much did you actually receive for ${o.orderNumber}?

The order is ${money(o.total!, o.currency)}. The rest becomes cash to collect on handover.`,
                    ((o.total! / 2) / 100).toFixed(2),
                  );
                  if (answer === null) return;
                  const n = Number(answer.replace(",", ".").trim());
                  if (!Number.isFinite(n) || n <= 0) return setError("Enter how much was received, for example 250.");
                  const minor = Math.round(n * 100);
                  if (minor > o.total!) return setError("That is more than the order total.");
                  void judgePayment(o, "confirm", minor);
                }}
                disabled={busy !== null}
                className="mt-2 min-h-[44px] w-full rounded-xl border border-white/20 font-dm text-sm text-offwhite disabled:opacity-50"
              >
                Only part of it arrived…
              </button>
            )}
          </div>
        )}

        {/* Money still owed on this order. Loud on purpose — this is the
            one thing on the screen that costs the restaurant real money
            if the person at the counter forgets it. */}
        {!o.finished && (o.balanceDue ?? 0) > 0 && (
          <div className="mt-3 rounded-xl border border-red-400/40 bg-red-500/[0.08] p-3">
            <p className="font-syne text-sm font-bold text-red-300">
              Collect {money(o.balanceDue!, o.currency)} in cash
            </p>
            <p className="mt-0.5 font-dm text-xs text-muted">
              {o.fulfillment === "rr_delivery"
                ? "The driver takes this at the door."
                : "Due when they collect."}
            </p>
            <button
              onClick={() => void settleBalance(o)}
              disabled={busy !== null}
              className="mt-2 min-h-[44px] w-full rounded-xl bg-yellow font-syne text-sm font-bold text-dark disabled:opacity-50"
            >
              {busy === o.id ? <Loader2 size={16} className="mx-auto animate-spin" /> : "Cash received"}
            </button>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          {/* Recall, named after the button that caused the mistake. Quiet and
              small — undo is for the rare mis-tap, not a step in the flow. */}
          {undoLabel && !o.finished && (
            <button
              onClick={() => void post(o, { undo: true })}
              disabled={busy !== null}
              className="inline-flex items-center gap-1 font-dm text-xs text-muted underline underline-offset-2 disabled:opacity-50"
            >
              <Undo2 size={12} /> {undoLabel}
            </button>
          )}
          {/* Last, small and quiet. A cook cancels rarely, and never by
              accident on a screen used with one thumb. */}
          {!o.awaitingPayment && !o.finished && (
            <button
              onClick={() => void cancelOrder(o)}
              disabled={busy !== null}
              className="ml-auto font-dm text-xs text-muted underline underline-offset-2 disabled:opacity-50"
            >
              Cancel this order
            </button>
          )}
        </div>

        {next && (
          <button
            onClick={() => void advance(o)}
            disabled={busy !== null}
            className={`mt-3 min-h-[56px] w-full rounded-2xl font-syne text-base font-bold disabled:opacity-50 ${
              ready ? "bg-green-500 text-dark" : "bg-yellow text-dark"
            }`}
          >
            {busy === o.id ? <Loader2 size={18} className="mx-auto animate-spin" /> : next.label}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button onClick={() => setTab("orders")} className={tabCls(tab === "orders")}>
          <ClipboardList size={15} /> Orders{live.length > 0 ? ` (${live.length})` : ""}
        </button>
        <button onClick={() => setTab("menu")} className={tabCls(tab === "menu")}>
          <UtensilsCrossed size={15} /> Today&apos;s menu
        </button>
      </div>

      {tab === "menu" ? (
        <MenuPanel />
      ) : (
      <>
      {/* Sound is the single most important control on a kitchen screen, so it
          is on the screen rather than in a settings page. Browsers block audio
          until a real tap, which is why this cannot simply default to on. */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-dark-card px-3 py-2">
        <button
          onClick={chime.toggle}
          className={`inline-flex items-center gap-2 font-dm text-sm ${chime.on ? "text-yellow" : "text-muted"}`}
        >
          {chime.on ? <Volume2 size={16} /> : <VolumeX size={16} />}
          {chime.on ? "Sound on for new orders" : "Turn on sound for new orders"}
        </button>
        {stale && (
          <span className="inline-flex items-center gap-1.5 font-dm text-xs text-red-300">
            <WifiOff size={13} /> Reconnecting…
          </span>
        )}
      </div>

      {/* A cook who was not looking gets told what they missed, in one line
          they can act on. Clears itself as soon as each order is started. */}
      {newIds.length > 0 && (
        <p className="rounded-xl border border-yellow bg-yellow/15 px-4 py-3 font-syne text-sm font-bold text-yellow">
          {newIds.length === 1 ? "1 new order" : `${newIds.length} new orders`} just came in
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-red-500/25 bg-red-500/[0.07] px-4 py-3 font-dm text-sm text-red-400">
          {error}
        </p>
      )}

      {live.length === 0 && done.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-dark-card p-8 text-center">
          <Check size={26} className="mx-auto text-green-400" />
          <p className="mt-2 font-syne text-base font-bold">
            {/* Say WHICH kitchen is quiet. An unlabelled empty screen reads as a
                broken page; a named one reads as a quiet evening. */}
            {(dash.kitchens ?? []).length > 0
              ? `No orders for ${(dash.kitchens ?? []).map((k) => k.name).join(" or ")}`
              : "All caught up"}
          </p>
          <p className="mt-1 font-dm text-sm text-muted">New orders appear here on their own.</p>
        </div>
      ) : (
        <>
          {live.map(renderCard)}

          {done.length > 0 && (
            // Today's record, kept below the live work rather than mixed into
            // it. Orders used to vanish the moment they finished, so a cancelled
            // order or a disputed receipt had nowhere to be looked up an hour
            // later — and then they were interleaved by time, which put this
            // morning's cancellation above an order that needed cooking.
            <details className="rounded-2xl border border-white/10 bg-dark-card/60">
              <summary className="cursor-pointer px-4 py-3 font-dm text-sm text-muted">
                {done.length} finished today — tap to review
              </summary>
              <div className="space-y-3 p-3 pt-0">{done.map(renderCard)}</div>
            </details>
          )}
        </>
      )}
      </>
      )}
    </div>
  );
}
