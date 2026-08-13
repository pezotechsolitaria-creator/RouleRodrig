"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2, Search, MapPin, Navigation, Phone, MessageCircle, Car, Users,
  CheckCircle2, Clock, AlertCircle,
} from "lucide-react";
import {
  CUSTOMER_STATUS, searchingMessage, formatRidePrice,
  RIDE_SERVICE_META, type RideStatus, type RideService,
} from "@/lib/rides/model";

// ── "WHERE IS MY TAXI?" ─────────────────────────────────────────────────────
//
// The screen that stops the phone ringing. Without it, every customer who has
// waited four minutes calls the owner — and being the answering service was the
// intervention he asked to be rid of.
//
// ── WHAT IT DELIBERATELY DOES NOT SAY ───────────────────────────────────────
// Never "dispatching", never "radius stage 3", never "no driver found". Those are
// words about our plumbing, and the brief was explicit. The customer sees what is
// happening to THEM, and the wording widens with each round so a longer wait feels
// like patience rather than failure. CUSTOMER_STATUS in lib/rides/model.ts is the
// single source of that vocabulary, and a test asserts none of it leaks internals.

type Ride = {
  ok: boolean;
  error?: string;
  status?: RideStatus;
  service?: RideService;
  pickup?: string;
  dropoff?: string;
  whenKind?: string;
  scheduledAt?: string | null;
  price?: number | null;
  currency?: string;
  passengers?: number;
  rounds?: number;
  driver?: { name: string; phone: string; vehicle: string | null } | null;
};

const STEPS: { key: RideStatus; label: string }[] = [
  { key: "new", label: "Requested" },
  { key: "assigned", label: "Driver found" },
  { key: "driver_on_way", label: "On the way" },
  { key: "arrived", label: "Arrived" },
  { key: "on_trip", label: "On your trip" },
  { key: "completed", label: "Finished" },
];

/** Where on the six-step line this ride sits. */
function stepIndex(status: RideStatus): number {
  switch (status) {
    case "new": case "dispatching": case "no_driver": return 0;
    case "assigned": return 1;
    case "driver_on_way": return 2;
    case "arrived": return 3;
    case "on_trip": return 4;
    case "completed": return 5;
    default: return 0;
  }
}

export default function TrackRide({
  initialRef, initialPhone,
}: {
  initialRef: string; initialPhone: string;
}) {
  const [ref, setRef] = useState(initialRef);
  const [phone, setPhone] = useState(initialPhone);
  const [ride, setRide] = useState<Ride | null>(null);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);

  const look = useCallback(
    async (r: string, p: string, quiet = false) => {
      if (!r.trim() || !p.trim()) return;
      if (!quiet) setBusy(true);
      try {
        const res = await fetch("/api/rides/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ref: r, phone: p }),
        });
        setRide(await res.json());
      } catch {
        setRide({ ok: false, error: "No connection. Please try again." });
      } finally {
        setBusy(false);
        setTried(true);
      }
    },
    [],
  );

  // Arriving straight from the booking screen, both are in the URL — so the ride
  // appears without anybody typing anything.
  useEffect(() => {
    if (initialRef && initialPhone) void look(initialRef, initialPhone);
  }, [initialRef, initialPhone, look]);

  // Poll while the ride is still moving. Quiet, so the screen never flashes a
  // spinner over information the customer is reading. Stops dead once the ride is
  // finished or cancelled — a page left open overnight must not poll forever.
  useEffect(() => {
    const s = ride?.status;
    if (!ride?.ok || !s) return;
    if (s === "completed" || s === "cancelled") return;
    const id = setInterval(() => void look(ref, phone, true), 15_000);
    return () => clearInterval(id);
  }, [ride?.ok, ride?.status, ref, phone, look]);

  const found = ride?.ok === true;
  const status = ride?.status;

  return (
    <div>
      {/* The lookup. Hidden once a ride is on screen — it has done its job. */}
      {!found && (
        <div className="rounded-2xl border border-white/12 bg-dark-card p-5">
          <h2 className="font-syne text-lg font-bold text-offwhite">Follow your ride</h2>
          <p className="mt-1 font-dm text-sm text-muted">
            Your reference and the phone number you booked with.
          </p>
          <div className="mt-4 space-y-2.5">
            <input
              value={ref}
              onChange={(e) => setRef(e.target.value.toUpperCase())}
              placeholder="RR-4F2A91"
              aria-label="Your reference"
              className="w-full rounded-xl border border-white/12 bg-dark px-3 py-3.5 font-dm text-base uppercase tracking-wider text-offwhite placeholder:text-muted focus:border-yellow/60 focus:outline-none"
            />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+230 5XXX XXXX"
              inputMode="tel"
              aria-label="The phone number you booked with"
              className="w-full rounded-xl border border-white/12 bg-dark px-3 py-3.5 font-dm text-base text-offwhite placeholder:text-muted focus:border-yellow/60 focus:outline-none"
            />
            <button
              onClick={() => void look(ref, phone)}
              disabled={busy || !ref.trim() || !phone.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-yellow py-4 font-dm text-base font-bold text-dark disabled:opacity-40"
            >
              {busy ? <Loader2 size={17} className="animate-spin" /> : <Search size={17} />}
              Find my ride
            </button>
          </div>
          {tried && ride && !ride.ok && (
            <p role="alert" className="mt-3 font-dm text-sm text-orange-300">
              {ride.error ?? "We couldn't find that."}
            </p>
          )}
        </div>
      )}

      {found && status && (
        <div className="space-y-4">
          {/* THE HEADLINE. One line, in the customer's language, never ours. */}
          <div className="rounded-3xl border border-yellow/25 bg-gradient-to-b from-yellow/10 to-transparent px-5 py-6 text-center">
            {status === "completed" ? (
              <CheckCircle2 size={30} className="mx-auto text-green-400" />
            ) : status === "cancelled" ? (
              <AlertCircle size={30} className="mx-auto text-orange-300" />
            ) : status === "assigned" || status === "driver_on_way" || status === "arrived" || status === "on_trip" ? (
              <Car size={30} className="mx-auto text-yellow" />
            ) : (
              <Loader2 size={30} className="mx-auto animate-spin text-yellow" />
            )}
            <h2 className="mt-3 font-syne text-2xl font-extrabold text-offwhite">
              {CUSTOMER_STATUS[status]}
            </h2>
            {/* Only while still looking: the reassurance widens with each round,
                which is how a longer wait reads as patience and not as trouble. */}
            {(status === "new" || status === "dispatching") && (
              <p className="mt-1.5 font-dm text-sm text-muted">
                {searchingMessage(ride.rounds ?? 1)}
              </p>
            )}
            {status === "no_driver" && (
              <p className="mt-1.5 font-dm text-sm text-muted">
                Every driver is busy right now, so a person is arranging this. We&apos;ll call you.
              </p>
            )}
          </div>

          {/* The driver, the moment there is one. Their number is the whole point
              of this screen — a customer who can call their driver does not call
              the office. */}
          {ride.driver && (
            <div className="rounded-2xl border border-green-500/30 bg-green-500/[0.07] p-5">
              <p className="font-bebas text-[10px] tracking-[0.25em] text-green-400">YOUR DRIVER</p>
              <p className="mt-0.5 font-syne text-xl font-extrabold text-offwhite">{ride.driver.name}</p>
              {ride.driver.vehicle && (
                <p className="font-dm text-sm text-muted">{ride.driver.vehicle}</p>
              )}
              <div className="mt-4 grid grid-cols-2 gap-2">
                <a
                  href={`tel:${ride.driver.phone}`}
                  className="flex items-center justify-center gap-2 rounded-xl bg-yellow py-3.5 font-dm text-sm font-bold text-dark"
                >
                  <Phone size={16} /> Call
                </a>
                <a
                  href={`https://wa.me/${ride.driver.phone.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 rounded-xl bg-[#25D366] py-3.5 font-dm text-sm font-bold text-black"
                >
                  <MessageCircle size={16} /> WhatsApp
                </a>
              </div>
            </div>
          )}

          {/* The journey. Six steps, and the one you are on is lit. */}
          <div className="rounded-2xl border border-white/10 bg-dark-card p-5">
            <ol className="space-y-0">
              {STEPS.map((s, i) => {
                const at = stepIndex(status);
                const done = i < at;
                const now = i === at;
                return (
                  <li key={s.key} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                          done ? "border-green-500 bg-green-500" : now ? "border-yellow bg-yellow" : "border-white/20"
                        }`}
                      >
                        {done && <CheckCircle2 size={11} className="text-dark" />}
                      </span>
                      {i < STEPS.length - 1 && (
                        <span className={`my-0.5 w-0.5 flex-1 ${i < at ? "bg-green-500/50" : "bg-white/12"}`} style={{ minHeight: 18 }} />
                      )}
                    </div>
                    <span className={`pb-3 font-dm text-sm ${now ? "font-bold text-yellow" : done ? "text-offwhite/70" : "text-muted"}`}>
                      {s.label}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>

          {/* The journey itself, for reassurance that we got it right. */}
          <div className="rounded-2xl border border-white/10 bg-dark-card p-5">
            <p className="font-bebas text-[10px] tracking-[0.22em] text-muted">
              {ride.service ? RIDE_SERVICE_META[ride.service].label.toUpperCase() : "YOUR RIDE"}
            </p>
            <div className="mt-2 space-y-2 font-dm text-sm">
              <p className="flex items-start gap-2">
                <MapPin size={15} className="mt-0.5 shrink-0 text-green-400" /> {ride.pickup}
              </p>
              <p className="flex items-start gap-2">
                <Navigation size={15} className="mt-0.5 shrink-0 text-yellow" /> {ride.dropoff}
              </p>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/10 pt-3 font-dm text-xs text-muted">
              <span className="inline-flex items-center gap-1.5">
                <Users size={12} className="text-yellow" /> {ride.passengers}
              </span>
              {ride.whenKind === "scheduled" && ride.scheduledAt && (
                <span className="inline-flex items-center gap-1.5">
                  <Clock size={12} className="text-yellow" />
                  {new Date(ride.scheduledAt).toLocaleString("en-GB", {
                    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                    timeZone: "Indian/Mauritius",
                  })}
                </span>
              )}
              <span className="text-offwhite/85">{formatRidePrice(ride.price, ride.currency)}</span>
            </div>
            <p className="mt-2 font-dm text-xs text-muted">Paid directly to your driver.</p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <button
              onClick={() => { setRide(null); setTried(false); }}
              className="font-dm text-sm text-muted hover:text-offwhite"
            >
              Check a different ride
            </button>
            <Link href="/taxi/book" className="font-dm text-sm font-bold text-yellow hover:underline">
              Book another ride →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
