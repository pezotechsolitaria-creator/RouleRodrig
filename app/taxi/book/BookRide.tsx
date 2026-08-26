"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  MapPin,
  Navigation,
  Users,
  Luggage,
  Clock,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Check,
  Car,
  PlaneTakeoff,
  Ship,
  Hotel,
  Crown,
  PhoneCall,
} from "lucide-react";
import {
  RIDE_SERVICE_META,
  formatRidePrice,
  type RideService,
} from "@/lib/rides/model";
import type { RidePlace } from "@/lib/rides/places";
import { searchPlaces } from "@/lib/rides/places";
import PlacePicker from "@/components/PlacePicker";

// ── THE CUSTOMER BOOKS THEIR OWN RIDE ───────────────────────────────────────
//
// This screen is what removes the owner from the start of every journey. Before
// it, a ride began with a phone call he typed into /admin/rides and priced by
// hand — the exact intervention he asked to be rid of.
//
// ── WHY THREE STEPS AND NOT ONE FORM ────────────────────────────────────────
// A single form with eleven fields is the "old-fashioned taxi UI" the brief ruled
// out, and it is unusable for the elderly customers this has to serve. So:
//   1. what kind of journey        (one tap)
//   2. where from, where to        (search, or the landmark list, or GPS)
//   3. who you are                 (name + phone, and the price is already known)
// Progressive disclosure: nothing about flights appears unless there is a flight.
//
// ── WHY NO MAP ──────────────────────────────────────────────────────────────
// A drag-a-pin map is the wrong tool on Rodrigues. There are perhaps forty places
// anyone asks to be taken to, everybody knows their names, and a tourist dragging
// a pin around a coastline they have never seen will place it in the sea. A named
// list of real Rodriguan landmarks is faster, works on a slow connection, and
// gives us exact coordinates — which is what pricing and dispatch actually need.
// "Somewhere else" still accepts free text, and that ride simply prices on
// request rather than blocking the booking.

const SERVICE_ICON: Record<RideService, React.ElementType> = {
  taxi: Car,
  airport: PlaneTakeoff,
  ferry: Ship,
  hotel: Hotel,
  private: Crown,
};

// Airport and ferry runs have one end already known, so asking for it is
// wasted work. WHICH end it is depends on the direction of travel.
const FIXED_END: Partial<Record<RideService, string>> = {
  airport: "Plaine Corail Airport",
  ferry: "Port Mathurin ferry terminal",
};

/**
 * Which way an airport or ferry run goes.
 *
 * This was missing entirely, and it was not a small gap: the fixed end was
 * hardcoded as the DROP-OFF, so the flow could only ever express "take me TO
 * the airport". The arrival — landing at Plaine Corail and needing to reach a
 * hotel — is the more common half of an airport transfer and the one /transfers
 * exists for. Its own page says "Plan your journey before you land" and "Met at
 * arrivals", over a form that could not say it.
 *
 * The database needed nothing for this: `service` stays "airport", and pickup
 * and drop-off carry the direction the way they always did. lib/rides/model.ts
 * already described both — "To or from Plaine Corail".
 */
export type RideDirection = "to" | "from";

type Quote = {
  ok: boolean;
  price?: number;
  currency?: string;
  roadKm?: number | null;
  tripMinutes?: number | null;
  night?: boolean;
  message?: string;
  reason?: string;
};

export default function BookRide({
  initialService,
  initialDirection = "to",
}: {
  initialService: RideService;
  /** "from" starts an ARRIVAL — what /transfers wants by default. */
  initialDirection?: RideDirection;
}) {
  const [direction, setDirection] = useState<RideDirection>(initialDirection);
  const [step, setStep] = useState(initialService === "taxi" ? 1 : 2);
  const [service, setService] = useState<RideService>(initialService);
  const [pickup, setPickup] = useState<RidePlace | null>(null);
  const [dropoff, setDropoff] = useState<RidePlace | null>(null);
  const [whenKind, setWhenKind] = useState<"now" | "scheduled">("now");
  const [when, setWhen] = useState("");
  const [passengers, setPassengers] = useState(1);
  const [luggage, setLuggage] = useState(0);
  const [flightRef, setFlightRef] = useState("");
  const [meetGreet, setMeetGreet] = useState(false);
  const [notes, setNotes] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{
    reference: string;
    price: number | null;
  } | null>(null);

  const meta = RIDE_SERVICE_META[service];
  const fixedEnd = FIXED_END[service];
  // Which side the known place sits on. Everything else reads this.
  const fixedIsPickup = Boolean(fixedEnd) && direction === "from";
  const fixedIsDropoff = Boolean(fixedEnd) && direction === "to";

  // The known end, filled in so nobody types it — onto whichever side the
  // direction puts it, and cleared off the other so a reversed journey cannot
  // keep the airport at both ends.
  useEffect(() => {
    if (!fixedEnd) return;
    const known = searchPlaces(fixedEnd)[0] ?? null;
    const place = known ?? {
      id: "fixed",
      name: fixedEnd,
      area: "",
      lat: null,
      lng: null,
    };
    if (direction === "from") {
      setPickup(place);
      setDropoff(null);
    } else {
      setDropoff(place);
      setPickup(null);
    }
  }, [fixedEnd, direction]);

  // Re-quote whenever anything that changes the fare changes. Debounced, because a
  // customer stepping the passenger count from 1 to 6 should cost one request.
  const requote = useCallback(async () => {
    if (!pickup || (needsDropoff && !dropoff)) {
      setQuote(null);
      return;
    }
    setQuoting(true);
    try {
      const r = await fetch("/api/rides/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service,
          pickupLat: pickup.lat,
          pickupLng: pickup.lng,
          dropoffLat: dropoff?.lat ?? null,
          dropoffLng: dropoff?.lng ?? null,
          passengers,
          luggage,
          when:
            whenKind === "scheduled" && when
              ? new Date(when).toISOString()
              : null,
        }),
      });
      setQuote(await r.json());
    } catch {
      setQuote({ ok: false, message: "We'll confirm the price with you." });
    } finally {
      setQuoting(false);
    }
  }, [service, pickup, dropoff, passengers, luggage, whenKind, when]);

  useEffect(() => {
    const t = setTimeout(() => void requote(), 350);
    return () => clearTimeout(t);
  }, [requote]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/rides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service,
          whenKind,
          scheduledAt:
            whenKind === "scheduled" && when
              ? new Date(when).toISOString()
              : null,
          pickupLabel: pickup?.name ?? "",
          pickupLat: pickup?.lat ?? null,
          pickupLng: pickup?.lng ?? null,
          dropoffLabel: dropoff?.name ?? null,
          dropoffLat: dropoff?.lat ?? null,
          dropoffLng: dropoff?.lng ?? null,
          passengers,
          luggage,
          notes: notes || undefined,
          flightRef: meta.needsArrival ? flightRef || undefined : undefined,
          meetGreet: meta.needsArrival ? meetGreet : false,
          name,
          phone,
          email: email || undefined,
        }),
      });
      const b = await r.json();
      if (!r.ok || !b.ok)
        throw new Error(b.error || "Something went wrong. Please try again.");
      setDone({ reference: b.reference, price: b.price ?? null });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  // ── Booked ──────────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="rounded-3xl border border-green-500/30 bg-green-500/[0.07] p-6 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-green-500/15 text-green-400">
          <Check size={28} />
        </span>
        <h2 className="mt-4 font-syne text-2xl font-extrabold text-offwhite">
          We&apos;re finding your driver
        </h2>
        <p className="mt-2 font-dm text-sm text-muted">
          No need to call anyone. A driver will accept in the next few minutes
          and you&apos;ll see their name and number here.
        </p>
        <p className="mt-4 font-bebas text-[11px] tracking-[0.28em] text-yellow">
          YOUR REFERENCE
        </p>
        <p className="font-syne text-3xl font-extrabold text-offwhite">
          {done.reference}
        </p>
        {done.price != null && (
          <p className="mt-1 font-dm text-sm text-offwhite/85">
            {formatRidePrice(done.price)}
          </p>
        )}
        <Link
          href={`/taxi/track?ref=${encodeURIComponent(done.reference)}&phone=${encodeURIComponent(phone)}`}
          className="mt-6 flex items-center justify-center gap-2 rounded-2xl bg-yellow px-5 py-4 font-dm text-base font-bold text-dark"
        >
          Follow my ride <ArrowRight size={18} />
        </Link>
        <p className="mt-3 font-dm text-xs text-muted">
          Keep this reference. You&apos;ll need it and this phone number to
          check on the ride.
        </p>
      </div>
    );
  }

  // PRIVATE HIRE IS NEVER ASKED FOR A DESTINATION. "A driver for the day, or a
  // set route" — a day hire genuinely has nowhere to be going. It was first
  // made optional, but an optional field is still a question on the screen, and
  // customers kept inventing a place to get past the step; the driver then
  // received a trip nobody was taking. So the field is not rendered at all.
  // Every other service still needs it, and create_ride_request enforces the
  // same rule server-side (M98) — this is presentation, not the boundary.
  const needsDropoff = service !== "private";
  // A FLIGHT OR FERRY NUMBER IS REQUIRED, NOT A NICETY. It is the only way the
  // driver learns the plane is two hours late; without it an airport run turns
  // into a 5am phone call, or a driver waiting at the terminal for nobody.
  // Every other service still leaves it out entirely.
  const needsFlightRef = meta.needsArrival;
  const flightRefOk = !needsFlightRef || flightRef.trim().length >= 2;
  const canContinue2 =
    !!pickup &&
    (!needsDropoff || !!dropoff) &&
    (whenKind === "now" || !!when) &&
    flightRefOk;
  const canBook =
    canContinue2 && name.trim().length > 1 && phone.trim().length > 4;

  return (
    <div>
      {/* Three dots rather than "Step 2 of 3" — smaller, calmer, same information. */}
      <div className="mb-5 flex items-center justify-center gap-2">
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className={`h-1.5 rounded-full transition-all ${n === step ? "w-6 bg-yellow" : n < step ? "w-1.5 bg-yellow/50" : "w-1.5 bg-white/15"}`}
          />
        ))}
      </div>

      {/* ── 1. What kind of journey ──────────────────────────────────────── */}
      {step === 1 && (
        <div>
          <h2 className="font-syne text-xl font-extrabold text-offwhite">
            What do you need?
          </h2>
          <div className="mt-4 space-y-2.5">
            {(Object.keys(RIDE_SERVICE_META) as RideService[]).map((s) => {
              const Icon = SERVICE_ICON[s];
              const m = RIDE_SERVICE_META[s];
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setService(s);
                    setDropoff(null);
                    setStep(2);
                  }}
                  className="flex w-full items-center gap-4 rounded-2xl border border-white/12 bg-dark-card p-4 text-left transition-colors hover:border-yellow/50 active:scale-[0.99]"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-yellow/10 text-yellow">
                    <Icon size={22} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-syne text-base font-bold text-offwhite">
                      {m.label}
                    </span>
                    <span className="block font-dm text-xs text-muted">
                      {m.blurb}
                    </span>
                  </span>
                  <ArrowRight size={18} className="shrink-0 text-muted" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 2. Where, and when ───────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-3">
          <h2 className="font-syne text-xl font-extrabold text-offwhite">
            {meta.label}
          </h2>

          {/* ── WHICH WAY ─────────────────────────────────────────────────
              Two 48px halves, because an arrival and a departure are not the
              same journey and this flow could previously only say one of them. */}
          {fixedEnd && (
            <div
              role="group"
              aria-label="Direction of travel"
              className="grid grid-cols-2 gap-2"
            >
              {(["from", "to"] as RideDirection[]).map((d) => {
                const on = direction === d;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDirection(d)}
                    aria-pressed={on}
                    className={`min-h-12 rounded-xl border px-3 font-dm text-sm font-semibold transition-colors ${
                      on
                        ? "border-yellow bg-yellow/[0.12] text-yellow"
                        : "border-[#6E6E6E] text-offwhite"
                    }`}
                  >
                    {d === "from" ? "From" : "To"} the{" "}
                    {service === "ferry" ? "ferry" : "airport"}
                  </button>
                );
              })}
            </div>
          )}

          {/* ── ONE QUESTION OPEN AT A TIME ───────────────────────────────
              Neither picker was given `autoOpen`, so both defaulted to true and
              both stood open. PlacePicker's own doc comment measured exactly
              this mistake at 1661px against 599px of usable space — each open
              panel is a search box, a location button and eight village chips,
              and two at once is two lists to read before answering either.

              Whichever end is NOT already known asks first; the known one is
              stated. Nothing is hidden, and only one thing asks. */}
          {fixedIsPickup ? (
            <div className="flex items-center gap-3 rounded-2xl border border-white/12 bg-dark-card px-4 py-3.5">
              <MapPin size={18} className="shrink-0 text-yellow" />
              <span>
                <span className="block font-bebas text-[10px] tracking-[0.22em] text-muted">
                  PICKING YOU UP AT
                </span>
                <span className="block font-dm text-base text-offwhite">
                  {fixedEnd}
                </span>
              </span>
            </div>
          ) : (
            <PlacePicker
              label="PICK ME UP AT"
              icon={MapPin}
              value={pickup}
              onPick={setPickup}
              placeholder="Hotel, beach, village…"
              required
              autoOpen={!pickup}
            />
          )}

          {/* The other end: stated when it is already known, asked when not. */}
          {fixedIsDropoff ? (
            <div className="flex items-center gap-3 rounded-2xl border border-white/12 bg-dark-card px-4 py-3.5">
              <Navigation size={18} className="shrink-0 text-yellow" />
              <span>
                <span className="block font-bebas text-[10px] tracking-[0.22em] text-muted">
                  GOING TO
                </span>
                <span className="block font-dm text-base text-offwhite">
                  {fixedEnd}
                </span>
              </span>
            </div>
          ) : needsDropoff ? (
            <PlacePicker
              label="TAKE ME TO"
              icon={Navigation}
              value={dropoff}
              onPick={setDropoff}
              placeholder="Where are you going?"
              required
              // Waits its turn: a 64px row until pickup is answered.
              autoOpen={Boolean(pickup) && !dropoff}
            />
          ) : (
            /* Private hire asks where to COLLECT you and nothing else. An
               optional destination still reads as a question that has to be
               dealt with, and a day hire has no answer to give — the customer
               was inventing a place just to get past the step. */
            <p className="rounded-2xl border border-white/10 bg-dark-card px-4 py-3.5 font-dm text-sm leading-snug text-muted">
              Your driver stays with you — tell them where you would like to go
              on the day. We will confirm the price with you; no charge until
              you agree.
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setWhenKind("now")}
              className={`rounded-xl border px-3 py-3 font-dm text-sm ${whenKind === "now" ? "border-yellow bg-yellow/10 text-yellow" : "border-white/12 text-offwhite/80"}`}
            >
              As soon as possible
            </button>
            <button
              type="button"
              onClick={() => setWhenKind("scheduled")}
              className={`rounded-xl border px-3 py-3 font-dm text-sm ${whenKind === "scheduled" ? "border-yellow bg-yellow/10 text-yellow" : "border-white/12 text-offwhite/80"}`}
            >
              Book for later
            </button>
          </div>
          {whenKind === "scheduled" && (
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              aria-label="When do you need it"
              className="w-full rounded-xl border border-white/12 bg-dark-card px-3 py-3 font-dm text-base text-offwhite focus:border-yellow/60 focus:outline-none"
            />
          )}

          <div className="grid grid-cols-2 gap-2">
            <Stepper
              label="PEOPLE"
              icon={Users}
              value={passengers}
              setValue={setPassengers}
              min={1}
              max={12}
            />
            <Stepper
              label="BAGS"
              icon={Luggage}
              value={luggage}
              setValue={setLuggage}
              min={0}
              max={12}
            />
          </div>

          {/* Only for a journey that actually has a flight or a boat — and there
              it is required, because the driver plans around it. */}
          {meta.needsArrival && (
            <div className="rounded-2xl border border-white/12 bg-dark-card p-4">
              <label
                className="block font-bebas text-[10px] tracking-[0.22em] text-muted"
                htmlFor="flight"
              >
                {service === "ferry" ? "FERRY OR BOAT NUMBER" : "FLIGHT NUMBER"}
              </label>
              <input
                id="flight"
                value={flightRef}
                onChange={(e) => setFlightRef(e.target.value)}
                placeholder={service === "ferry" ? "e.g. Anna M" : "e.g. MK034"}
                required
                aria-describedby="flight-why"
                aria-invalid={!flightRefOk}
                className={`mt-1.5 w-full rounded-xl border bg-dark px-3 py-2.5 font-dm text-base text-offwhite placeholder:text-muted focus:outline-none ${
                  flightRefOk
                    ? "border-white/12 focus:border-yellow/60"
                    : "border-orange-400/50 focus:border-orange-400"
                }`}
              />
              <p
                id="flight-why"
                className="mt-1.5 font-dm text-xs leading-snug text-muted"
              >
                {service === "ferry"
                  ? "Your driver watches the boat, so they are there when it docks — not an hour early."
                  : "Your driver watches the flight, so they are there when you land — even if you are delayed."}
              </p>
              <label className="mt-3 flex items-center gap-2 font-dm text-sm text-offwhite/85">
                <input
                  type="checkbox"
                  checked={meetGreet}
                  onChange={(e) => setMeetGreet(e.target.checked)}
                  className="accent-yellow"
                />
                Wait for me inside with a sign
              </label>
            </div>
          )}

          <PriceCard quote={quote} quoting={quoting} />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="flex items-center gap-1.5 rounded-2xl border border-white/15 px-4 py-4 font-dm text-sm text-muted"
            >
              <ArrowLeft size={16} /> Back
            </button>
            <button
              type="button"
              disabled={!canContinue2}
              onClick={() => setStep(3)}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-yellow py-4 font-dm text-base font-bold text-dark disabled:opacity-40"
            >
              Continue <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* ── 3. Who you are ───────────────────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-3">
          <h2 className="font-syne text-xl font-extrabold text-offwhite">
            Almost done
          </h2>
          <p className="font-dm text-sm text-muted">
            Your driver needs a name and a number to find you. No account, no
            password.
          </p>

          <Field label="YOUR NAME">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              className={inputCls}
              placeholder="e.g. Marie Perrine"
            />
          </Field>
          <Field label="YOUR PHONE">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              autoComplete="tel"
              className={inputCls}
              placeholder="+230 5XXX XXXX"
            />
          </Field>
          <Field label="EMAIL (OPTIONAL)">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              inputMode="email"
              autoComplete="email"
              className={inputCls}
              placeholder="you@example.com"
            />
          </Field>
          <Field label="ANYTHING THE DRIVER SHOULD KNOW (OPTIONAL)">
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={inputCls}
              placeholder="e.g. baby seat, wheelchair, two stops"
            />
          </Field>

          <div className="rounded-2xl border border-white/10 bg-dark-card p-4 font-dm text-sm">
            <p className="text-offwhite">
              {dropoff
                ? `${pickup?.name} → ${dropoff.name}`
                : `${pickup?.name} · driver for the day`}
            </p>
            <p className="mt-0.5 text-muted">
              {whenKind === "now"
                ? "As soon as possible"
                : new Date(when).toLocaleString("en-GB", {
                    timeZone: "Indian/Mauritius",
                  })}
              {" · "}
              {passengers} {passengers === 1 ? "person" : "people"}
            </p>
          </div>

          <PriceCard quote={quote} quoting={quoting} />

          {error && (
            <p role="alert" className="font-dm text-sm text-red-400">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="flex items-center gap-1.5 rounded-2xl border border-white/15 px-4 py-4 font-dm text-sm text-muted"
            >
              <ArrowLeft size={16} /> Back
            </button>
            <button
              type="button"
              disabled={!canBook || busy}
              onClick={() => void submit()}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-yellow py-5 font-syne text-lg font-extrabold text-dark disabled:opacity-40"
            >
              {busy ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                <Check size={20} />
              )}
              Find me a driver
            </button>
          </div>
          <p className="text-center font-dm text-xs text-muted">
            You pay the driver directly. Nothing is charged here.
          </p>
        </div>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-white/12 bg-dark-card px-3 py-3.5 font-dm text-base text-offwhite placeholder:text-muted focus:border-yellow/60 focus:outline-none";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block font-bebas text-[10px] tracking-[0.22em] text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

// Big +/- buttons rather than a number input: a 44px target beats a spinner
// nobody over fifty can hit on a phone.
function Stepper({
  label,
  icon: Icon,
  value,
  setValue,
  min,
  max,
}: {
  label: string;
  icon: React.ElementType;
  value: number;
  setValue: (n: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div className="rounded-2xl border border-white/12 bg-dark-card p-3">
      <p className="flex items-center gap-1.5 font-bebas text-[10px] tracking-[0.22em] text-muted">
        <Icon size={12} className="text-yellow" /> {label}
      </p>
      <div className="mt-1.5 flex items-center justify-between">
        <button
          type="button"
          aria-label={`Fewer ${label.toLowerCase()}`}
          onClick={() => setValue(Math.max(min, value - 1))}
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 font-syne text-xl text-offwhite"
        >
          −
        </button>
        <span className="font-syne text-2xl font-extrabold text-offwhite">
          {value}
        </span>
        <button
          type="button"
          aria-label={`More ${label.toLowerCase()}`}
          onClick={() => setValue(Math.min(max, value + 1))}
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 font-syne text-xl text-offwhite"
        >
          +
        </button>
      </div>
    </div>
  );
}

function PriceCard({
  quote,
  quoting,
}: {
  quote: Quote | null;
  quoting: boolean;
}) {
  if (quoting && !quote) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-dark-card py-5 font-dm text-sm text-muted">
        <Loader2 size={15} className="animate-spin text-yellow" /> Working out
        the price…
      </div>
    );
  }
  if (!quote) return null;

  // A ride we cannot price is still a ride. Saying so beats an empty box or a
  // fake number.
  if (!quote.ok) {
    return (
      <div className="rounded-2xl border border-white/12 bg-dark-card px-5 py-4 text-center">
        <p className="flex items-center justify-center gap-2 font-dm text-sm text-offwhite/85">
          <PhoneCall size={15} className="text-yellow" />
          {quote.message ?? "We'll confirm the price with you."}
        </p>
        <p className="mt-1 font-dm text-xs text-muted">
          Nothing is charged until you agree.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-yellow/30 bg-yellow/[0.07] px-5 py-4 text-center">
      <p className="font-bebas text-[10px] tracking-[0.25em] text-yellow">
        YOUR FARE
      </p>
      <p className="font-syne text-3xl font-extrabold text-offwhite">
        {formatRidePrice(quote.price, quote.currency)}
      </p>
      <p className="mt-1 flex flex-wrap items-center justify-center gap-x-3 font-dm text-xs text-muted">
        {quote.roadKm != null && <span>about {quote.roadKm} km</span>}
        {quote.tripMinutes != null && (
          <span className="inline-flex items-center gap-1">
            <Clock size={11} /> ~{quote.tripMinutes} min
          </span>
        )}
        {quote.night && <span className="text-yellow/90">night rate</span>}
      </p>
      <p className="mt-1.5 font-dm text-xs text-muted">
        Paid directly to your driver
      </p>
    </div>
  );
}
