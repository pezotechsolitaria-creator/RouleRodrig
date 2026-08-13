"use client";

import { useCallback, useEffect, useState } from "react";
import {
  MapPin, Navigation, Users, Luggage, Clock, Loader2, Check, X,
  Phone, PlaneTakeoff, CheckCircle2, AlertCircle,
} from "lucide-react";
import { RIDE_SERVICE_META, formatRidePrice, type RideService } from "@/lib/rides/model";

// ── ONE JOB. TWO BUTTONS. ───────────────────────────────────────────────────
//
// The brief: "Make ACCEPT extremely obvious. The driver should not need to
// navigate through multiple screens." There is exactly one screen, and ACCEPT is
// the largest thing on it.
//
// Read on a phone, possibly at the roadside, by somebody who may be older and is
// certainly in a hurry. So: big type, big targets, no navigation, no chrome, and
// every state — expired, taken, already yours — says what happened in one line
// rather than showing a broken form.

type Offer = {
  ok: boolean;
  reason?: string;
  offerStatus?: "offered" | "accepted" | "declined" | "expired" | "withdrawn";
  rideStatus?: string;
  mine?: boolean;
  driverName?: string;
  service?: RideService;
  whenKind?: "now" | "scheduled";
  scheduledAt?: string | null;
  pickup?: string;
  dropoff?: string;
  passengers?: number;
  luggage?: number;
  notes?: string | null;
  flightRef?: string | null;
  meetGreet?: boolean;
  price?: number | null;
  currency?: string;
  expiresAt?: string;
  customerName?: string | null;
  customerPhone?: string | null;
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-dark px-4 py-8 text-offwhite">
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}

function Message({
  tone, title, line, phone,
}: {
  tone: "good" | "bad" | "neutral";
  title: string;
  line: string;
  phone?: string | null;
}) {
  const Icon = tone === "good" ? CheckCircle2 : tone === "bad" ? AlertCircle : Clock;
  const colour =
    tone === "good" ? "text-green-400 border-green-500/30 bg-green-500/[0.07]"
    : tone === "bad" ? "text-orange-300 border-orange-400/30 bg-orange-400/[0.07]"
    : "text-muted border-white/12 bg-white/[0.04]";
  return (
    <div className={`rounded-2xl border p-6 text-center ${colour}`}>
      <Icon size={34} className="mx-auto" />
      <h1 className="mt-4 font-syne text-xl font-extrabold text-offwhite">{title}</h1>
      <p className="mt-2 font-dm text-sm text-muted">{line}</p>
      {phone && (
        <a
          href={`tel:${phone}`}
          className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-yellow px-5 py-4 font-dm text-base font-bold text-dark"
        >
          <Phone size={18} /> Call the customer
        </a>
      )}
    </div>
  );
}

export default function RideOfferScreen({ token }: { token: string }) {
  const [offer, setOffer] = useState<Offer | null>(null);
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string; phone?: string | null } | null>(null);
  const [left, setLeft] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/ride-offer?t=${encodeURIComponent(token)}`);
      setOffer(await r.json());
    } catch {
      setOffer({ ok: false, reason: "error" });
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  // The countdown the brief asked for. Recomputed from the server's expiry rather
  // than counted down locally, so a phone that slept does not show 20 seconds
  // remaining on an offer that died ten minutes ago.
  useEffect(() => {
    if (!offer?.expiresAt || offer.offerStatus !== "offered") return;
    const tick = () => {
      const ms = new Date(offer.expiresAt!).getTime() - Date.now();
      setLeft(Math.max(0, Math.floor(ms / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [offer?.expiresAt, offer?.offerStatus]);

  async function answer(a: "accept" | "decline") {
    // Guard the double-tap in the UI as well as the server. The server is the
    // authority — it returns "already answered" — but a driver should not see a
    // button appear to do nothing.
    if (busy) return;
    setBusy(a);
    try {
      const r = await fetch("/api/ride-offer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, answer: a }),
      });
      const b = await r.json();
      setResult({
        ok: !!b.ok,
        message: b.message ?? (b.ok ? "Done." : "That didn't work — please call the office."),
        phone: b.customerPhone ?? null,
      });
    } catch {
      setResult({ ok: false, message: "No connection. Please call the office." });
    } finally {
      setBusy(null);
    }
  }

  if (!offer) {
    return (
      <Shell>
        <div className="flex items-center justify-center py-20">
          <Loader2 size={26} className="animate-spin text-yellow" />
        </div>
      </Shell>
    );
  }

  // ── Terminal states, said plainly ─────────────────────────────────────────
  if (result) {
    return (
      <Shell>
        <Message
          tone={result.ok ? "good" : "bad"}
          title={result.ok ? "This ride is yours" : "Not this time"}
          line={result.message}
          phone={result.phone}
        />
      </Shell>
    );
  }
  if (!offer.ok) {
    return (
      <Shell>
        <Message tone="bad" title="This link is not valid"
          line="It may have been mistyped. Please call the office and we'll sort it out." />
      </Shell>
    );
  }
  if (offer.mine) {
    return (
      <Shell>
        <Message tone="good" title="This ride is yours"
          line={`${offer.pickup} → ${offer.dropoff}`} phone={offer.customerPhone} />
      </Shell>
    );
  }
  if (offer.offerStatus === "expired") {
    return (
      <Shell>
        <Message tone="neutral" title="This offer has expired"
          line="No problem — we'll send you the next one." />
      </Shell>
    );
  }
  if (offer.offerStatus === "withdrawn" || offer.offerStatus === "accepted") {
    return (
      <Shell>
        <Message tone="neutral" title="Someone else took this ride"
          line="You'll get the next one that suits you." />
      </Shell>
    );
  }
  if (offer.offerStatus === "declined") {
    return (
      <Shell>
        <Message tone="neutral" title="You passed on this one"
          line="That's fine — we'll send you the next one." />
      </Shell>
    );
  }

  // ── The live offer ───────────────────────────────────────────────────────
  const meta = offer.service ? RIDE_SERVICE_META[offer.service] : null;
  const when =
    offer.whenKind === "scheduled" && offer.scheduledAt
      ? new Date(offer.scheduledAt).toLocaleString("en-GB", {
          weekday: "short", day: "numeric", month: "short",
          hour: "2-digit", minute: "2-digit", timeZone: "Indian/Mauritius",
        })
      : "Now";

  return (
    <Shell>
      <p className="text-center font-bebas text-[11px] tracking-[0.3em] text-yellow">NEW RIDE</p>
      <h1 className="mt-1 text-center font-syne text-2xl font-extrabold">
        {meta?.label ?? "Ride"}
      </h1>
      {offer.driverName && (
        <p className="mt-1 text-center font-dm text-sm text-muted">For {offer.driverName}</p>
      )}

      {/* The fare, biggest fact after the buttons — it is what decides it. */}
      <div className="mt-5 rounded-2xl border border-yellow/30 bg-yellow/[0.07] px-5 py-4 text-center">
        <p className="font-bebas text-[10px] tracking-[0.25em] text-yellow">YOU EARN</p>
        <p className="mt-0.5 font-syne text-3xl font-extrabold text-offwhite">
          {formatRidePrice(offer.price, offer.currency)}
        </p>
      </div>

      <div className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-dark-card p-5">
        <div className="flex items-start gap-3">
          <MapPin size={18} className="mt-0.5 shrink-0 text-green-400" />
          <div>
            <p className="font-bebas text-[10px] tracking-[0.22em] text-muted">PICK UP</p>
            <p className="font-dm text-base text-offwhite">{offer.pickup}</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Navigation size={18} className="mt-0.5 shrink-0 text-yellow" />
          <div>
            <p className="font-bebas text-[10px] tracking-[0.22em] text-muted">DROP OFF</p>
            <p className="font-dm text-base text-offwhite">{offer.dropoff}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-white/10 pt-3 font-dm text-sm text-offwhite/85">
          <span className="inline-flex items-center gap-1.5"><Clock size={15} className="text-yellow" /> {when}</span>
          <span className="inline-flex items-center gap-1.5"><Users size={15} className="text-yellow" /> {offer.passengers} {offer.passengers === 1 ? "person" : "people"}</span>
          {!!offer.luggage && (
            <span className="inline-flex items-center gap-1.5"><Luggage size={15} className="text-yellow" /> {offer.luggage} bags</span>
          )}
        </div>

        {(offer.flightRef || offer.meetGreet) && (
          <div className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
            <PlaneTakeoff size={15} className="mt-0.5 shrink-0 text-yellow" />
            <p className="font-dm text-sm text-offwhite/85">
              {offer.flightRef && <>Flight <strong>{offer.flightRef}</strong>. </>}
              {offer.meetGreet && "Wait inside with a name sign."}
            </p>
          </div>
        )}

        {offer.notes && (
          <p className="rounded-xl bg-white/[0.04] px-3 py-2.5 font-dm text-sm text-offwhite/80">
            {offer.notes}
          </p>
        )}
      </div>

      {/* ACCEPT is the biggest thing on the screen, and says the race out loud so
          losing it is not a surprise. */}
      <button
        onClick={() => void answer("accept")}
        disabled={!!busy}
        className="mt-5 flex w-full items-center justify-center gap-2.5 rounded-2xl bg-yellow py-6 font-syne text-2xl font-extrabold text-dark transition-opacity active:opacity-80 disabled:opacity-50"
      >
        {busy === "accept" ? <Loader2 size={24} className="animate-spin" /> : <Check size={26} />}
        ACCEPT
      </button>
      <p className="mt-2 text-center font-dm text-xs text-muted">
        First to accept gets the ride
        {left !== null && left > 0 && <> · {Math.floor(left / 60)}m {left % 60}s left</>}
      </p>

      <button
        onClick={() => void answer("decline")}
        disabled={!!busy}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 py-4 font-dm text-base text-muted transition-colors active:border-white/30 disabled:opacity-50"
      >
        {busy === "decline" ? <Loader2 size={17} className="animate-spin" /> : <X size={17} />}
        Can&apos;t take it
      </button>
    </Shell>
  );
}
