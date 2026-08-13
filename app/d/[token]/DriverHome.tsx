"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2, Power, BellRing, BellOff, Car, MapPin, Navigation, Phone,
  MessageCircle, CheckCircle2, AlertCircle, ArrowRight,
} from "lucide-react";
import { formatRidePrice } from "@/lib/rides/model";

// ── THE DRIVER'S WHOLE APP ──────────────────────────────────────────────────
//
// One bookmarked link, no password, no install. It answers the four questions a
// driver actually has, in the order they have them:
//
//   Am I working?      the switch, and it is the biggest thing on the screen
//   Do I have a job?   the live offer, or the ride they are on
//   Will I hear about  the notification state, said plainly when it is off,
//   the next one?      because a driver who thinks they are covered and is not
//                      loses work silently
//   How am I doing?    one number, rides completed
//
// The switch is theirs, not the office's. That is what makes automatic dispatch
// safe: before this, the only person who could stop a driver being woken at 6am
// on their day off was the owner, and he is exactly who we are taking out of the
// loop.

type Offer = { token: string; pickup: string; dropoff: string; price: number | null; passengers: number; expiresAt: string };
type Job = { pickup: string; dropoff: string; customerName: string; customerPhone: string; status: string; price: number | null };
type Home = {
  ok: boolean; name?: string; availability?: "available" | "busy" | "off";
  vehicle?: string | null; whatsappReady?: boolean; ridesCompleted?: number;
  offer?: Offer | null; job?: Job | null;
};

type PushState = "unsupported" | "denied" | "off" | "on" | "working";

export default function DriverHome({ token }: { token: string }) {
  const [home, setHome] = useState<Home | null>(null);
  const [busy, setBusy] = useState(false);
  const [push, setPush] = useState<PushState>("off");

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setBusy(true);
    try {
      const r = await fetch(`/api/driver-home?t=${encodeURIComponent(token)}`);
      setHome(await r.json());
    } catch {
      setHome({ ok: false });
    } finally {
      setBusy(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  // M92 — "nobody came". Confirmed first, because it ends the job and cannot be
  // undone from this screen; the reply tells the driver whether this passenger
  // has form, which is the whole reason for recording it.
  const [noShowBusy, setNoShowBusy] = useState(false);
  const [noShowMsg, setNoShowMsg] = useState<string | null>(null);
  const reportNoShow = useCallback(async () => {
    if (!window.confirm("Report that the passenger never came? This ends the ride.")) return;
    setNoShowBusy(true);
    setNoShowMsg(null);
    try {
      const r = await fetch("/api/driver-home", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "noShow", token }),
      });
      const b = (await r.json().catch(() => ({}))) as { ok?: boolean; previousNoShows?: number };
      if (!r.ok || !b.ok) throw new Error("failed");
      const prior = (b.previousNoShows ?? 1) - 1;
      setNoShowMsg(
        prior > 0
          ? `Recorded. This number has done it ${prior} time${prior === 1 ? "" : "s"} before — Roulé Rodrigues has been told.`
          : "Recorded, and Roulé Rodrigues has been told. Thank you.",
      );
      await load(true);
    } catch {
      setNoShowMsg("That didn't save. Please call Roulé Rodrigues.");
    } finally {
      setNoShowBusy(false);
    }
  }, [token, load]);

  // Poll quietly so a driver who leaves this open sees an offer arrive without
  // touching anything. Fifteen seconds against a ten-minute window is plenty and
  // costs a phone almost nothing.
  useEffect(() => {
    const id = setInterval(() => void load(true), 15_000);
    return () => clearInterval(id);
  }, [load]);

  // What the browser currently thinks. Read on mount rather than assumed: a
  // driver who cleared their data is unsubscribed and must be told.
  useEffect(() => {
    (async () => {
      if (typeof window === "undefined") return;
      if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        setPush("unsupported");
        return;
      }
      if (Notification.permission === "denied") { setPush("denied"); return; }
      try {
        const reg = await navigator.serviceWorker.ready;
        setPush((await reg.pushManager.getSubscription()) ? "on" : "off");
      } catch {
        setPush("off");
      }
    })();
  }, []);

  async function setAvailability(state: "available" | "off") {
    setBusy(true);
    try {
      await fetch("/api/driver-home", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "availability", token, state }),
      });
      await load(true);
    } finally {
      setBusy(false);
    }
  }

  async function enablePush() {
    setPush("working");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setPush(permission === "denied" ? "denied" : "off"); return; }
      const reg = await navigator.serviceWorker.ready;
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
      // Re-subscribing yields the same endpoint anyway, and the server treats it
      // as idempotent — so reuse rather than churn.
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: Uint8Array.from(
            atob((key + "=".repeat((4 - (key.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/")),
            (c) => c.charCodeAt(0),
          ),
        }));
      const j = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      const r = await fetch("/api/driver-home", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "subscribe", token,
          endpoint: j.endpoint, p256dh: j.keys?.p256dh, auth: j.keys?.auth,
          userAgent: navigator.userAgent.slice(0, 300),
        }),
      });
      setPush((await r.json()).ok ? "on" : "off");
    } catch {
      setPush("off");
    }
  }

  if (!home) {
    return <div className="flex justify-center py-20"><Loader2 size={26} className="animate-spin text-yellow" /></div>;
  }
  if (!home.ok) {
    return (
      <div className="rounded-2xl border border-orange-400/30 bg-orange-400/[0.07] p-6 text-center">
        <AlertCircle size={30} className="mx-auto text-orange-300" />
        <h1 className="mt-3 font-syne text-xl font-extrabold text-offwhite">This link is not valid</h1>
        <p className="mt-2 font-dm text-sm text-muted">
          Ask Roulé Rodrigues to send you your link again.
        </p>
      </div>
    );
  }

  const working = home.availability === "available";
  const busyByOffice = home.availability === "busy";

  return (
    <div className="space-y-4">
      <div>
        <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">DRIVER</p>
        <h1 className="font-syne text-2xl font-extrabold text-offwhite">{home.name}</h1>
        {home.vehicle && <p className="font-dm text-sm text-muted">{home.vehicle}</p>}
      </div>

      {/* ── AM I WORKING? The biggest thing on the screen. ─────────────────── */}
      <button
        onClick={() => void setAvailability(working ? "off" : "available")}
        disabled={busy || busyByOffice}
        className={`flex w-full items-center justify-center gap-3 rounded-3xl py-7 font-syne text-2xl font-extrabold transition-colors disabled:opacity-60 ${
          working ? "bg-green-500 text-dark" : "border-2 border-white/20 bg-dark-card text-muted"
        }`}
      >
        {busy ? <Loader2 size={24} className="animate-spin" /> : <Power size={26} />}
        {working ? "I'M WORKING" : "I'M OFF"}
      </button>
      <p className="text-center font-dm text-xs text-muted">
        {busyByOffice
          ? "The office has you marked busy — call them to change it."
          : working
            ? "You'll be offered rides near you. Tap to stop."
            : "You won't be offered any rides. Tap when you start."}
      </p>

      {/* ── A LIVE OFFER, if there is one ─────────────────────────────────── */}
      {home.offer && (
        <a
          href={`/r/${home.offer.token}`}
          className="block rounded-2xl border-2 border-yellow bg-yellow/10 p-5"
        >
          <p className="font-bebas text-[10px] tracking-[0.25em] text-yellow">A RIDE IS WAITING FOR YOU</p>
          <p className="mt-1 font-syne text-2xl font-extrabold text-offwhite">
            {formatRidePrice(home.offer.price)}
          </p>
          <p className="mt-1 font-dm text-sm text-offwhite/85">
            {home.offer.pickup} → {home.offer.dropoff}
          </p>
          <span className="mt-3 inline-flex items-center gap-2 rounded-full bg-yellow px-5 py-2.5 font-dm text-sm font-bold text-dark">
            See it and accept <ArrowRight size={15} />
          </span>
        </a>
      )}

      {/* ── THE JOB THEY ARE ON ───────────────────────────────────────────── */}
      {home.job && (
        <div className="rounded-2xl border border-green-500/30 bg-green-500/[0.07] p-5">
          <p className="font-bebas text-[10px] tracking-[0.25em] text-green-400">YOUR CURRENT RIDE</p>
          <p className="mt-1.5 font-syne text-lg font-bold text-offwhite">{home.job.customerName}</p>
          <div className="mt-2 space-y-1.5 font-dm text-sm">
            <p className="flex items-start gap-2"><MapPin size={14} className="mt-0.5 text-green-400" /> {home.job.pickup}</p>
            <p className="flex items-start gap-2"><Navigation size={14} className="mt-0.5 text-yellow" /> {home.job.dropoff}</p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <a href={`tel:${home.job.customerPhone}`}
              className="flex items-center justify-center gap-2 rounded-xl bg-yellow py-3.5 font-dm text-sm font-bold text-dark">
              <Phone size={16} /> Call
            </a>
            <a href={`https://wa.me/${home.job.customerPhone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"
              className="flex items-center justify-center gap-2 rounded-xl bg-[#25D366] py-3.5 font-dm text-sm font-bold text-black">
              <MessageCircle size={16} /> WhatsApp
            </a>
          </div>

          {/* Quiet and last on purpose: it is rare and it ends the job, so it
              must not sit where a thumb lands. But it belongs HERE, because the
              driver is standing at the pickup point looking at this exact
              screen. Calling comes first, which is why the two contact buttons
              stay big and this stays a line of text. */}
          <button
            onClick={() => void reportNoShow()}
            disabled={noShowBusy}
            className="mt-3 w-full font-dm text-xs text-muted underline underline-offset-2 disabled:opacity-50"
          >
            {noShowBusy ? "Reporting…" : "The passenger never came"}
          </button>
          {noShowMsg && (
            <p role="status" className="mt-2 text-center font-dm text-xs text-offwhite/80">
              {noShowMsg}
            </p>
          )}
        </div>
      )}

      {!home.offer && !home.job && working && (
        <div className="rounded-2xl border border-white/10 bg-dark-card px-5 py-8 text-center">
          <Car size={26} className="mx-auto text-muted" />
          <p className="mt-2 font-dm text-sm text-muted">
            Nothing right now. We&apos;ll message you the moment a ride comes up near you.
          </p>
        </div>
      )}

      {/* ── WILL I HEAR ABOUT THE NEXT ONE? ───────────────────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-dark-card p-4">
        <p className="font-bebas text-[10px] tracking-[0.22em] text-muted">HOW WE REACH YOU</p>

        <div className="mt-2.5 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 font-dm text-sm text-offwhite">
            {push === "on" ? <BellRing size={16} className="text-green-400" /> : <BellOff size={16} className="text-muted" />}
            Alerts on this phone
          </span>
          {push === "on" ? (
            <span className="font-dm text-xs font-bold text-green-400">On</span>
          ) : push === "unsupported" ? (
            <span className="font-dm text-xs text-muted">Not on this phone</span>
          ) : push === "denied" ? (
            // Nothing here can fix a denied permission — only their settings can.
            <span className="font-dm text-xs text-orange-300">Blocked in settings</span>
          ) : (
            <button onClick={() => void enablePush()} disabled={push === "working"}
              className="rounded-full bg-yellow px-4 py-2 font-dm text-xs font-bold text-dark disabled:opacity-50">
              {push === "working" ? <Loader2 size={12} className="animate-spin" /> : "Turn on"}
            </button>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
          <span className="flex items-center gap-2 font-dm text-sm text-offwhite">
            <MessageCircle size={16} className={home.whatsappReady ? "text-green-400" : "text-muted"} />
            WhatsApp
          </span>
          <span className={`font-dm text-xs ${home.whatsappReady ? "font-bold text-green-400" : "text-orange-300"}`}>
            {home.whatsappReady ? "On" : "Not set up"}
          </span>
        </div>

        {/* The one thing only the driver can do, said only when it needs doing. */}
        {!home.whatsappReady && (
          <div className="mt-3 rounded-xl border border-orange-400/25 bg-orange-400/[0.06] p-3">
            <p className="font-dm text-xs text-orange-200">
              To get rides by WhatsApp, do this once:
            </p>
            <ol className="mt-1.5 list-decimal space-y-1 pl-4 font-dm text-xs text-orange-100/90">
              <li>Save <strong>+34 644 51 95 23</strong> in your contacts</li>
              <li>Send it: <em>I allow callmebot to send me messages</em></li>
              <li>Send the code you get back to Roulé Rodrigues</li>
            </ol>
          </div>
        )}
      </div>

      {typeof home.ridesCompleted === "number" && home.ridesCompleted > 0 && (
        <p className="text-center font-dm text-sm text-muted">
          <CheckCircle2 size={14} className="mr-1 inline text-green-400" />
          {home.ridesCompleted} ride{home.ridesCompleted === 1 ? "" : "s"} completed with Roulé Rodrigues
        </p>
      )}

      <p className="pt-2 text-center font-dm text-xs text-muted">
        Save this page to your home screen so it&apos;s always one tap away.
      </p>
    </div>
  );
}
