"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  Search,
  MapPin,
  Navigation,
  Phone,
  MessageCircle,
  Car,
  Users,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";
import {
  CUSTOMER_STATUS,
  searchingMessage,
  formatRidePrice,
  rideReference,
  RIDE_SERVICE_META,
  type RideStatus,
  type RideService,
} from "@/lib/rides/model";
import LiveTripView from "@/components/tracking/LiveTripView";
import { useLanguage } from "@/context/LanguageContext";
import { RIDES_COPY } from "@/lib/rides/copy.i18n";
import { trackErrorMessage } from "@/lib/rides/track-errors";

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
  /** A code the client can translate. `error` is the prose fallback. */
  code?: string;
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
  driver?: {
    name: string;
    phone: string;
    vehicle: string | null;
    photo?: string | null;
    // M110 — real standing or nothing. `rating` is NULL until somebody has
    // actually left a review; ridesCompleted is the honest fallback.
    rating?: number | null;
    ratingCount?: number | null;
    ridesCompleted?: number | null;
  } | null;
  // M109 — what makes the map possible. channelKey is served ONLY while the ride
  // is live and has a driver, so it disappears the moment tracking should stop.
  tripId?: string | null;
  channelKey?: string | null;
  /** M110 — shown back to the person who just proved the booking is theirs. */
  customerName?: string | null;
};

// Module scope, so it holds KEYS only. The words are looked up at render time
// from the dictionary the component reads — a constant evaluated once at import
// cannot know which language the visitor chose.
const STEP_KEYS = [
  "new",
  "assigned",
  "driver_on_way",
  "arrived",
  "on_trip",
  "completed",
] as const satisfies readonly RideStatus[];

const STEP_COPY: Record<
  (typeof STEP_KEYS)[number],
  keyof (typeof RIDES_COPY)["en"]["track"]["step2"]["steps"]
> = {
  new: "requested",
  assigned: "driverFound",
  driver_on_way: "onTheWay",
  arrived: "arrived",
  on_trip: "onTrip",
  completed: "finished",
};

/** Where on the six-step line this ride sits. */
function stepIndex(status: RideStatus): number {
  switch (status) {
    // A cancelled ride is not at step one. Returning 0 lit "Requested" as
    // IN PROGRESS directly under a headline that said "Cancelled" — the two
    // halves of the screen contradicting each other. -1 lights nothing.
    case "cancelled":
      return -1;
    case "new":
    case "dispatching":
    case "no_driver":
      return 0;
    case "assigned":
      return 1;
    case "driver_on_way":
      return 2;
    case "arrived":
      return 3;
    case "on_trip":
      return 4;
    case "completed":
      return 5;
    default:
      return 0;
  }
}

/**
 * Which of the four "still looking" lines to show.
 *
 * searchingMessage() in model.ts does this in English for the admin desk and
 * the mailer. The customer's version has to come from the dictionary, and the
 * rounds run past four, so the last line holds.
 */
function searchingRound(
  c: (typeof RIDES_COPY)["en"]["track"],
  rounds: number,
): string {
  const r = Math.max(1, Math.min(4, Math.round(rounds)));
  return (
    {
      1: c.status.searching.round1,
      2: c.status.searching.round2,
      3: c.status.searching.round3,
      4: c.status.searching.round4,
    } as Record<number, string>
  )[r];
}

export default function TrackRide({
  initialRef,
  initialPhone,
}: {
  initialRef: string;
  initialPhone: string;
}) {
  const { language } = useLanguage();
  const c = RIDES_COPY[language].track;
  // There is no locale for Kreol. fr-FR is the closer of the two we can use,
  // and it is the same call lib/speak.ts already makes for pronunciation.
  const dateLocale = language === "en" ? "en-GB" : "fr-FR";
  const [ref, setRef] = useState(initialRef);
  const [phone, setPhone] = useState(initialPhone);
  const [ride, setRide] = useState<Ride | null>(null);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);

  const look = useCallback(async (r: string, p: string, quiet = false) => {
    if (!r.trim() || !p.trim()) return;
    if (!quiet) setBusy(true);
    try {
      const res = await fetch("/api/rides/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref: r, phone: p }),
      });
      const body = (await res.json()) as Ride;
      // ── A BACKGROUND POLL MAY NOT DESTROY THE SCREEN ─────────────────
      // This overwrote `ride` on ANY outcome. One 429 from the rate limiter,
      // or one dropped request in a lift, replaced a live tracking map with
      // the "we couldn't find that" lookup form — and because the poll is
      // keyed on `ride.status`, it then never restarted. The customer was
      // left retyping their reference while their taxi was on the way.
      //
      // A quiet refresh that fails leaves what is on screen alone; the
      // "last seen" line is already saying how old it is.
      if (quiet && !body?.ok) return;
      setRide(body);
    } catch {
      if (quiet) return;
      setRide({ ok: false, error: c.errors.offline });
    } finally {
      setBusy(false);
      setTried(true);
    }
  }, []);

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
  // A ride somebody is actually driving. 'assigned' counts: the driver has the
  // job and may already be moving toward the pickup.
  const isLive =
    status === "assigned" ||
    status === "driver_on_way" ||
    status === "arrived" ||
    status === "on_trip";
  const showLive = Boolean(found && isLive && ride?.channelKey);

  return (
    <div>
      {/* The lookup. Hidden once a ride is on screen — it has done its job. */}
      {!found && (
        <div className="rounded-2xl border border-white/12 bg-dark-card p-5">
          <h2 className="font-syne text-lg font-bold text-offwhite">
            {c.step1.title}
          </h2>
          <p className="mt-1 font-dm text-sm text-muted">{c.step1.help}</p>
          <div className="mt-4 space-y-2.5">
            <input
              value={ref}
              onChange={(e) => setRef(e.target.value.toUpperCase())}
              placeholder={c.step1.refPlaceholder}
              aria-label={c.step1.refLabel}
              className="w-full rounded-xl border border-white/12 bg-dark px-3 py-3.5 font-dm text-base uppercase tracking-wider text-offwhite placeholder:text-muted focus:border-yellow/60 focus:outline-none"
            />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={c.step1.phonePlaceholder}
              inputMode="tel"
              aria-label={c.step1.phoneLabel}
              className="w-full rounded-xl border border-white/12 bg-dark px-3 py-3.5 font-dm text-base text-offwhite placeholder:text-muted focus:border-yellow/60 focus:outline-none"
            />
            <button
              onClick={() => void look(ref, phone)}
              disabled={busy || !ref.trim() || !phone.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-yellow py-4 font-dm text-base font-bold text-dark disabled:opacity-40"
            >
              {busy ? (
                <Loader2 size={17} className="animate-spin" />
              ) : (
                <Search size={17} />
              )}
              {c.cta.find}
            </button>
          </div>
          {tried && ride && !ride.ok && (
            <p role="alert" className="mt-3 font-dm text-sm text-orange-300">
              {trackErrorMessage(language, ride)}
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
            ) : status === "assigned" ||
              status === "driver_on_way" ||
              status === "arrived" ||
              status === "on_trip" ? (
              <Car size={30} className="mx-auto text-yellow" />
            ) : (
              <Loader2 size={30} className="mx-auto animate-spin text-yellow" />
            )}
            <h2 className="mt-3 font-syne text-2xl font-extrabold text-offwhite">
              {c.status[status]}
            </h2>
            {/* Only while still looking: the reassurance widens with each round,
                which is how a longer wait reads as patience and not as trouble. */}
            {(status === "new" || status === "dispatching") && (
              <p className="mt-1.5 font-dm text-sm text-muted">
                {searchingRound(c, ride.rounds ?? 1)}
              </p>
            )}
            {status === "no_driver" && (
              <p className="mt-1.5 font-dm text-sm text-muted">
                {c.step2.noDriverHelp}
                We&apos;ll call you.
              </p>
            )}
          </div>

          {/* ── THE MAP, once there is something to watch (M109) ────────────
              Replaces the static driver card and the step list rather than
              sitting above them: LiveTripView already contains both, and two
              driver cards on one screen is how a page stops feeling considered.

              The condition is channelKey, not status. The key is minted by the
              server only for a ride that is genuinely live AND has a driver, so
              this cannot show a map for a trip that has nothing to plot — and
              a customer whose driver has not opened their phone yet gets the
              old, honest text screen instead of an empty map. */}
          {showLive && (
            <LiveTripView
              lookup={{ ref, phone }}
              channelKey={ride.channelKey ?? null}
              active={isLive}
              driver={
                ride.driver
                  ? {
                      name: ride.driver.name,
                      phone: ride.driver.phone,
                      vehicle: ride.driver.vehicle,
                      photo: ride.driver.photo ?? null,
                      rating: ride.driver.rating ?? null,
                      ratingCount: ride.driver.ratingCount ?? null,
                      ridesCompleted: ride.driver.ridesCompleted ?? null,
                    }
                  : null
              }
              pickupLabel={ride.pickup ?? null}
              dropoffLabel={ride.dropoff ?? null}
              // The same reference the confirmation email and the office use, so
              // a customer reading it down a phone is read back the same string.
              reference={ride.tripId ? rideReference(ride.tripId) : null}
              fare={
                ride.price != null
                  ? formatRidePrice(ride.price, ride.currency)
                  : null
              }
              passengerName={ride.customerName ?? null}
            />
          )}

          {/* The driver, the moment there is one. Their number is the whole point
              of this screen — a customer who can call their driver does not call
              the office. */}
          {!showLive && ride.driver && (
            <div className="rounded-2xl border border-green-500/30 bg-green-500/[0.07] p-5">
              <p className="font-bebas text-[10px] tracking-[0.25em] text-green-400">
                {c.step2.driverEyebrow}
              </p>
              <p className="mt-0.5 font-syne text-xl font-extrabold text-offwhite">
                {ride.driver.name}
              </p>
              {ride.driver.vehicle && (
                <p className="font-dm text-sm text-muted">
                  {ride.driver.vehicle}
                </p>
              )}
              <div className="mt-4 grid grid-cols-2 gap-2">
                <a
                  href={`tel:${ride.driver.phone}`}
                  className="flex items-center justify-center gap-2 rounded-xl bg-yellow py-3.5 font-dm text-sm font-bold text-dark"
                >
                  <Phone size={16} /> {c.cta.call}
                </a>
                <a
                  href={`https://wa.me/${ride.driver.phone.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 rounded-xl bg-[#25D366] py-3.5 font-dm text-sm font-bold text-black"
                >
                  <MessageCircle size={16} /> {c.cta.whatsapp}
                </a>
              </div>
            </div>
          )}

          {/* The journey. Six steps, and the one you are on is lit. Hidden when
              the live map is up — it carries its own timeline. */}
          {!showLive && (
            <div className="rounded-2xl border border-white/10 bg-dark-card p-5">
              <ol className="space-y-0">
                {STEP_KEYS.map((stepKey, i) => {
                  const at = stepIndex(status);
                  const done = i < at;
                  const now = i === at;
                  return (
                    <li key={stepKey} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                            done
                              ? "border-green-500 bg-green-500"
                              : now
                                ? "border-yellow bg-yellow"
                                : "border-white/20"
                          }`}
                        >
                          {done && (
                            <CheckCircle2 size={11} className="text-dark" />
                          )}
                        </span>
                        {i < STEP_KEYS.length - 1 && (
                          <span
                            className={`my-0.5 w-0.5 flex-1 ${i < at ? "bg-green-500/50" : "bg-white/12"}`}
                            style={{ minHeight: 18 }}
                          />
                        )}
                      </div>
                      <span
                        className={`pb-3 font-dm text-sm ${now ? "font-bold text-yellow" : done ? "text-offwhite/70" : "text-muted"}`}
                      >
                        {c.step2.steps[STEP_COPY[stepKey]]}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {/* The journey itself, for reassurance that we got it right. */}
          <div className="rounded-2xl border border-white/10 bg-dark-card p-5">
            <p className="font-bebas text-[10px] tracking-[0.22em] text-muted">
              {ride.service
                ? c.service[ride.service].toUpperCase()
                : c.step2.rideEyebrow}
            </p>
            <div className="mt-2 space-y-2 font-dm text-sm">
              <p className="flex items-start gap-2">
                <MapPin size={15} className="mt-0.5 shrink-0 text-green-400" />{" "}
                {ride.pickup}
              </p>
              <p className="flex items-start gap-2">
                <Navigation size={15} className="mt-0.5 shrink-0 text-yellow" />{" "}
                {ride.dropoff}
              </p>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/10 pt-3 font-dm text-xs text-muted">
              <span className="inline-flex items-center gap-1.5">
                <Users size={12} className="text-yellow" /> {ride.passengers}
              </span>
              {ride.whenKind === "scheduled" && ride.scheduledAt && (
                <span className="inline-flex items-center gap-1.5">
                  <Clock size={12} className="text-yellow" />
                  {new Date(ride.scheduledAt).toLocaleString(dateLocale, {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Indian/Mauritius",
                  })}
                </span>
              )}
              <span className="text-offwhite/85">
                {formatRidePrice(ride.price, ride.currency)}
              </span>
            </div>
            <p className="mt-2 font-dm text-xs text-muted">{c.step2.payNote}</p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <button
              onClick={() => {
                setRide(null);
                setTried(false);
              }}
              className="font-dm text-sm text-muted hover:text-offwhite"
            >
              {c.cta.checkAnother}
            </button>
            <Link
              href="/taxi/book"
              className="font-dm text-sm font-bold text-yellow hover:underline"
            >
              {c.cta.bookAnother} →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
