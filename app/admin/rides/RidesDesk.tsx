"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Loader2, Send, RefreshCw, Plus, Car, MapPin, Navigation, Users, Clock,
  AlertTriangle, MessageCircle, UserCheck, X, Ban, ChevronRight, Copy, Wallet,
} from "lucide-react";
import {
  ADMIN_STATUS, RIDE_SERVICE_META, RIDE_SERVICES, NEXT_STATUSES,
  formatRidePrice, rideReference, type RideStatus, type RideService,
} from "@/lib/rides/model";

// ── THE DISPATCH DESK ───────────────────────────────────────────────────────
//
// Optimised for the brief's admin priorities — speed, information density,
// operational control — and for one specific job: a phone call comes in, and a
// car has to be on its way in under a minute.
//
// The layout follows that: the queue on the left, and when you pick a ride, the
// ranked driver list on the right WITH the reasons drivers were skipped. An
// operator who can see "Paul — not working today" next to "Jean — 1.2 km" is
// making a decision; one staring at a list of three names is guessing.
//
// Dispatch sends WhatsApp links the owner taps himself. Nothing is posted on his
// behalf: taxi drivers have no accounts by design, so a human pressing send is
// both the channel and the consent.

type Ride = {
  id: string; service: RideService; when_kind: string; scheduled_at: string | null;
  pickup_label: string; dropoff_label: string; passengers: number; luggage: number;
  customer_name: string; customer_phone: string; quoted_price: number | null; currency: string;
  status: RideStatus; driver_id: string | null; offer_rounds: number; created_at: string;
  taxi_drivers?: { name: string; phone: string; whatsapp: string | null } | null;
};
type Driver = {
  id: string; name: string; phone: string; whatsapp: string | null; vehicle: string | null;
  seats: number | null; base_label: string | null; base_lat: number | null;
  active: boolean; availability: string;
  base_lng?: number | null; luggage_capacity?: number | null;
  handles_taxi?: boolean; handles_airport?: boolean; handles_transfer?: boolean;
  rides_offered: number; rides_accepted: number; rides_completed: number;
};
type Candidate = {
  driver_id: string; name: string; whatsapp: string | null; vehicle: string | null;
  seats: number | null; base_label: string | null; distance_km: number | null;
  eta_minutes: number | null; accept_rate: string | null; score: string | null;
  reason_skipped: string | null;
};
type Target = { name: string; whatsapp: string; waUrl: string; acceptUrl: string };
type PricingRow = {
  service: string; base_fare: number; per_km: number; minimum_fare: number;
  flat_fare: number | null; per_extra_passenger: number; per_luggage: number;
  night_surcharge: number; night_from_hour: number; night_to_hour: number;
  is_bookable: boolean;
};

const STATUS_TONE: Record<string, string> = {
  new: "border-yellow/40 text-yellow",
  dispatching: "border-blue-400/40 text-blue-300",
  assigned: "border-green-500/40 text-green-400",
  driver_on_way: "border-green-500/40 text-green-400",
  arrived: "border-green-500/40 text-green-400",
  on_trip: "border-purple-400/40 text-purple-300",
  completed: "border-white/15 text-muted",
  cancelled: "border-white/15 text-muted",
  no_driver: "border-red-500/50 text-red-300",
};

export default function RidesDesk() {
  const [rides, setRides] = useState<Ride[] | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [scope, setScope] = useState<"open" | "all">("open");
  const [picked, setPicked] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [showRoster, setShowRoster] = useState(false);
  const [showFares, setShowFares] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/rides?scope=${scope}`);
      const b = await r.json();
      if (!r.ok) throw new Error(b.error || "Failed to load.");
      setRides(b.rides);
      setDrivers(b.drivers ?? []);
    } catch (e) {
      setRides([]);
      toast.error(e instanceof Error ? e.message : "Failed to load rides.");
    }
  }, [scope]);

  useEffect(() => { void load(); }, [load]);

  const openRide = useCallback(async (id: string) => {
    setPicked(id);
    setTargets([]);
    try {
      const r = await fetch(`/api/admin/rides?rideId=${id}`);
      const b = await r.json();
      setCandidates(b.candidates ?? []);
    } catch {
      setCandidates([]);
    }
  }, []);

  async function act(payload: Record<string, unknown>, key: string, ok: string) {
    setBusy(key);
    try {
      const r = await fetch("/api/admin/rides", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error || "That didn't work.");
      if (Array.isArray(b.targets)) {
        setTargets(b.targets);
        const d = b.delivery as { sent?: number; unreachable?: { name: string }[] } | undefined;
        if (b.targets.length === 0) {
          toast.warning("No eligible driver in this round — press Dispatch again to widen the search.");
        } else if (d?.sent) {
          // The normal case now: it already went. Nothing for the owner to do.
          toast.success(`Sent automatically to ${d.sent} driver${d.sent === 1 ? "" : "s"}.`);
        } else {
          toast.warning(`${b.targets.length} driver${b.targets.length === 1 ? "" : "s"} offered, but none can be messaged automatically yet — send below.`);
        }
        // Naming who is unreachable is the only way the owner knows to fix it.
        if (d?.unreachable?.length) {
          toast.warning(
            `${d.unreachable.map((u) => u.name).join(", ")} ${d.unreachable.length === 1 ? "has" : "have"} not set up WhatsApp yet — use the button below for now.`,
            { duration: 8000 },
          );
        }
      } else {
        toast.success(ok);
      }
      await load();
      if (picked) await openRide(picked);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  }

  const ride = rides?.find((r) => r.id === picked) ?? null;
  // Drivers who cannot be ranked at all yet. Worth saying loudly: the engine can
  // only rank on distance if somebody has typed a base location.
  const unlocated = drivers.filter((d) => d.active && d.base_lat == null).length;
  const noSeats = drivers.filter((d) => d.active && d.seats == null).length;

  return (
    <main className="min-h-screen bg-dark px-4 pb-20 pt-8 text-offwhite lg:px-8">
      <div className="mx-auto max-w-6xl">
        <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">OPERATIONS</p>
        <h1 className="mt-1 flex items-center gap-2 font-syne text-2xl font-extrabold">
          <Car size={20} className="text-yellow" /> Taxi &amp; transfers
        </h1>
        <p className="mt-1.5 max-w-2xl font-dm text-sm text-muted">
          Take a call, dispatch it, and watch it through. Drivers need no account — they get a
          WhatsApp link and the first to tap it gets the ride.
        </p>

        {(unlocated > 0 || noSeats > 0) && (
          <div className="mt-4 rounded-xl border border-orange-400/25 bg-orange-400/[0.06] px-4 py-3 font-dm text-xs text-orange-200">
            <AlertTriangle size={13} className="mr-1.5 inline" />
            {unlocated > 0 && (
              <>
                <strong>{unlocated}</strong> active driver{unlocated === 1 ? " has" : "s have"} no base
                location, so {unlocated === 1 ? "they cannot" : "they cannot"} be ranked by distance —
                {unlocated === 1 ? " they will" : " they will"} still be offered work, just last.{" "}
              </>
            )}
            {noSeats > 0 && (
              <>
                <strong>{noSeats}</strong> {noSeats === 1 ? "has" : "have"} no seat count, so they are
                assumed to fit 4 and will be skipped for bigger groups.
              </>
            )}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button onClick={() => setShowNew((s) => !s)}
            className="inline-flex items-center gap-1.5 rounded-full bg-yellow px-4 py-2 font-dm text-sm font-bold text-dark">
            <Plus size={15} /> New ride
          </button>
          <select value={scope} onChange={(e) => setScope(e.target.value as "open" | "all")}
            aria-label="Which rides"
            className="rounded-full border border-white/15 bg-dark-card px-3 py-2 font-dm text-sm text-offwhite">
            <option value="open">Open rides</option>
            <option value="all">Everything</option>
          </select>
          <button onClick={() => setShowFares((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-2 font-dm text-sm text-muted hover:text-offwhite">
            <Wallet size={14} /> Fares
          </button>
          <button onClick={() => setShowRoster((r) => !r)}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-2 font-dm text-sm text-muted hover:text-offwhite">
            <Users size={14} /> Drivers ({drivers.filter((d) => d.active).length})
          </button>
          <button onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-2 font-dm text-sm text-muted hover:text-offwhite">
            <RefreshCw size={14} /> Refresh
          </button>
          <button onClick={() => void act({ action: "sweep" }, "sweep", "Expired offers cleared.")}
            disabled={busy === "sweep"}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-2 font-dm text-sm text-muted hover:text-offwhite disabled:opacity-50">
            {busy === "sweep" ? <Loader2 size={14} className="animate-spin" /> : <Clock size={14} />}
            Clear expired offers
          </button>
        </div>

        {showNew && <NewRideForm onDone={() => { setShowNew(false); void load(); }} />}
        {showRoster && <DriverRoster drivers={drivers} onSaved={() => void load()} />}
        {showFares && <FaresPanel />}

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
          {/* ── The queue ───────────────────────────────────────────────── */}
          <section>
            <h2 className="mb-2 font-bebas text-[11px] tracking-[0.28em] text-yellow">THE QUEUE</h2>
            {rides === null ? (
              <div className="flex justify-center py-10"><Loader2 className="animate-spin text-yellow" /></div>
            ) : rides.length === 0 ? (
              <p className="rounded-2xl border border-white/10 bg-dark-card px-5 py-10 text-center font-dm text-sm text-muted">
                No rides {scope === "open" ? "waiting" : "yet"}. Press <strong className="text-offwhite">New ride</strong> when
                the phone goes.
              </p>
            ) : (
              <div className="space-y-2">
                {rides.map((r) => (
                  <button key={r.id} onClick={() => void openRide(r.id)}
                    className={`w-full rounded-xl border bg-dark-card px-4 py-3 text-left transition-colors ${
                      picked === r.id ? "border-yellow" : "border-white/10 hover:border-yellow/40"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-dm text-sm text-offwhite">
                          {RIDE_SERVICE_META[r.service]?.label ?? r.service} · {rideReference(r.id)}
                        </p>
                        <p className="mt-0.5 truncate font-dm text-xs text-muted">
                          {r.pickup_label} → {r.dropoff_label}
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 font-dm text-xs text-muted">
                          <span className="inline-flex items-center gap-1"><Users size={11} /> {r.passengers}</span>
                          <span>{formatRidePrice(r.quoted_price, r.currency)}</span>
                          {r.taxi_drivers?.name && <span className="text-green-400">{r.taxi_drivers.name}</span>}
                          {r.offer_rounds > 0 && <span>round {r.offer_rounds}</span>}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 font-bebas text-[9px] tracking-[0.14em] ${STATUS_TONE[r.status] ?? "border-white/15 text-muted"}`}>
                        {ADMIN_STATUS[r.status]}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* ── The decision ────────────────────────────────────────────── */}
          <section>
            <h2 className="mb-2 font-bebas text-[11px] tracking-[0.28em] text-yellow">
              {ride ? "DISPATCH" : "PICK A RIDE"}
            </h2>
            {!ride ? (
              <p className="rounded-2xl border border-white/10 bg-dark-card px-5 py-10 text-center font-dm text-sm text-muted">
                Choose a ride to see who can take it, and why the others cannot.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="rounded-2xl border border-white/10 bg-dark-card p-4">
                  <p className="font-syne text-base font-bold">{ride.customer_name}</p>
                  <a href={`tel:${ride.customer_phone}`} className="font-dm text-sm text-yellow">{ride.customer_phone}</a>
                  <div className="mt-3 space-y-1.5 font-dm text-sm">
                    <p className="flex items-start gap-2"><MapPin size={14} className="mt-0.5 text-green-400" /> {ride.pickup_label}</p>
                    <p className="flex items-start gap-2"><Navigation size={14} className="mt-0.5 text-yellow" /> {ride.dropoff_label}</p>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 border-t border-white/10 pt-3">
                    {(ride.status === "new" || ride.status === "dispatching") && (
                      <button onClick={() => void act({ action: "dispatch", rideId: ride.id, minutes: 10 }, "dispatch", "Offers out.")}
                        disabled={busy === "dispatch"}
                        className="inline-flex items-center gap-1.5 rounded-full bg-yellow px-4 py-2 font-dm text-sm font-bold text-dark disabled:opacity-50">
                        {busy === "dispatch" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                        {ride.offer_rounds === 0 ? "Dispatch" : "Widen the search"}
                      </button>
                    )}
                    {(NEXT_STATUSES[ride.status] ?? []).filter((s) => s !== "cancelled" && s !== "new").map((s) => (
                      <button key={s} onClick={() => void act({ action: "status", rideId: ride.id, status: s }, `st-${s}`, "Updated.")}
                        disabled={busy === `st-${s}`}
                        className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-2 font-dm text-xs text-offwhite hover:border-yellow/50 disabled:opacity-50">
                        {busy === `st-${s}` ? <Loader2 size={12} className="animate-spin" /> : <ChevronRight size={12} />}
                        {ADMIN_STATUS[s]}
                      </button>
                    ))}
                    {(NEXT_STATUSES[ride.status] ?? []).includes("cancelled") && (
                      <button onClick={() => {
                        const why = prompt("Why is this ride cancelled?");
                        if (why === null) return;
                        void act({ action: "status", rideId: ride.id, status: "cancelled", reason: why }, "cancel", "Cancelled.");
                      }}
                        className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 px-3 py-2 font-dm text-xs text-red-300 hover:border-red-500">
                        <Ban size={12} /> Cancel
                      </button>
                    )}
                  </div>
                </div>

                {/* The WhatsApp links from the last dispatch. One tap each. */}
                {targets.length > 0 && (
                  <div className="rounded-2xl border border-green-500/30 bg-green-500/[0.06] p-4">
                    <p className="font-dm text-sm text-offwhite">
                      Send these now — first to tap gets the ride:
                    </p>
                    <div className="mt-2.5 space-y-2">
                      {targets.map((t) => (
                        <div key={t.whatsapp} className="flex items-center gap-2">
                          <a href={t.waUrl} target="_blank" rel="noreferrer"
                            className="inline-flex flex-1 items-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 font-dm text-sm font-bold text-black">
                            <MessageCircle size={15} /> WhatsApp {t.name}
                          </a>
                          <button onClick={() => { void navigator.clipboard.writeText(t.acceptUrl); toast.success("Link copied."); }}
                            aria-label={`Copy ${t.name}'s link`}
                            className="rounded-xl border border-white/15 p-2.5 text-muted hover:text-offwhite">
                            <Copy size={15} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Ranked, with reasons. This is the part that makes dispatch a
                    decision instead of a guess. */}
                <div className="overflow-hidden rounded-2xl border border-white/10">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-white/10 bg-white/[0.03]">
                        {["Driver", "Away", "ETA", "Takes", "Score", ""].map((h) => (
                          <th key={h} className="px-3 py-2 font-bebas text-[10px] tracking-[0.18em] text-muted">{h.toUpperCase()}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {candidates.length === 0 && (
                        <tr><td colSpan={6} className="px-3 py-6 text-center font-dm text-sm text-muted">
                          No drivers on the roster yet.
                        </td></tr>
                      )}
                      {candidates.map((c) => (
                        <tr key={c.driver_id} className={`border-b border-white/5 last:border-0 ${c.reason_skipped ? "opacity-55" : ""}`}>
                          <td className="px-3 py-2.5 font-dm text-sm text-offwhite">
                            {c.name}
                            <span className="block font-dm text-[11px] text-muted">
                              {c.vehicle}{c.seats ? ` · ${c.seats} seats` : ""}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 font-dm text-xs tabular-nums text-muted">
                            {c.distance_km != null ? `${c.distance_km} km` : "—"}
                          </td>
                          <td className="px-3 py-2.5 font-dm text-xs tabular-nums text-muted">
                            {c.eta_minutes != null ? `${c.eta_minutes} min` : "—"}
                          </td>
                          <td className="px-3 py-2.5 font-dm text-xs tabular-nums text-muted">
                            {c.accept_rate ? `${Math.round(Number(c.accept_rate) * 100)}%` : "—"}
                          </td>
                          <td className="px-3 py-2.5 font-dm text-xs tabular-nums text-yellow">
                            {c.score ?? <span className="text-orange-300">{c.reason_skipped}</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            {!c.reason_skipped && !ride.driver_id && (
                              <button onClick={() => void act({ action: "assign", rideId: ride.id, driverId: c.driver_id }, `as-${c.driver_id}`, `Assigned to ${c.name}.`)}
                                disabled={busy === `as-${c.driver_id}`}
                                className="inline-flex items-center gap-1 rounded-full border border-white/15 px-2.5 py-1.5 font-dm text-[11px] text-offwhite hover:border-yellow/50 disabled:opacity-50">
                                {busy === `as-${c.driver_id}` ? <Loader2 size={11} className="animate-spin" /> : <UserCheck size={11} />}
                                Assign
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

// ── Taking a call ───────────────────────────────────────────────────────────
// Progressive disclosure, as the brief asked: the flight fields only exist for a
// journey that has a flight.
function NewRideForm({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({
    service: "taxi" as RideService, whenKind: "now" as "now" | "scheduled", scheduledAt: "",
    pickupLabel: "", dropoffLabel: "", passengers: "1", luggage: "0",
    customerName: "", customerPhone: "", price: "", flightRef: "", meetGreet: false, notes: "",
  });
  const [busy, setBusy] = useState(false);
  const needsArrival = RIDE_SERVICE_META[f.service].needsArrival;

  async function submit() {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/rides", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service: f.service, whenKind: f.whenKind,
          scheduledAt: f.whenKind === "scheduled" && f.scheduledAt ? new Date(f.scheduledAt).toISOString() : null,
          pickupLabel: f.pickupLabel, dropoffLabel: f.dropoffLabel,
          passengers: parseInt(f.passengers) || 1, luggage: parseInt(f.luggage) || 0,
          customerName: f.customerName, customerPhone: f.customerPhone,
          // Rupees in, minor units out — the same convention as the rest of the
          // platform, so a price never lands 100× wrong.
          quotedPrice: f.price ? Math.round(parseFloat(f.price) * 100) : null,
          flightRef: needsArrival ? f.flightRef : undefined,
          meetGreet: needsArrival ? f.meetGreet : false,
          notes: f.notes || undefined,
        }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error || "Could not save.");
      toast.success("Ride taken — dispatch it from the queue.");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full rounded-xl border border-white/12 bg-dark-card px-3 py-2.5 font-dm text-sm text-offwhite placeholder:text-muted focus:border-yellow/50 focus:outline-none";
  const label = "block font-bebas text-[10px] tracking-[0.2em] text-muted mb-1";

  return (
    <div className="mt-4 rounded-2xl border border-yellow/25 bg-yellow/[0.04] p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <span className={label}>WHAT KIND</span>
          <select value={f.service} onChange={(e) => setF({ ...f, service: e.target.value as RideService })} className={input}>
            {RIDE_SERVICES.map((s) => <option key={s} value={s}>{RIDE_SERVICE_META[s].label}</option>)}
          </select>
        </div>
        <div>
          <span className={label}>WHEN</span>
          <div className="flex gap-2">
            <select value={f.whenKind} onChange={(e) => setF({ ...f, whenKind: e.target.value as "now" | "scheduled" })} className={input}>
              <option value="now">Now</option>
              <option value="scheduled">Later</option>
            </select>
            {f.whenKind === "scheduled" && (
              <input type="datetime-local" value={f.scheduledAt} onChange={(e) => setF({ ...f, scheduledAt: e.target.value })} className={input} />
            )}
          </div>
        </div>
        <div><span className={label}>PICK UP FROM</span>
          <input value={f.pickupLabel} onChange={(e) => setF({ ...f, pickupLabel: e.target.value })} placeholder="e.g. Port Mathurin jetty" className={input} /></div>
        <div><span className={label}>GOING TO</span>
          <input value={f.dropoffLabel} onChange={(e) => setF({ ...f, dropoffLabel: e.target.value })} placeholder="e.g. Plaine Corail airport" className={input} /></div>
        <div><span className={label}>CUSTOMER NAME</span>
          <input value={f.customerName} onChange={(e) => setF({ ...f, customerName: e.target.value })} className={input} /></div>
        <div><span className={label}>CUSTOMER PHONE</span>
          <input value={f.customerPhone} onChange={(e) => setF({ ...f, customerPhone: e.target.value })} placeholder="+230 5XXX XXXX" className={input} /></div>
        <div className="grid grid-cols-3 gap-2">
          <div><span className={label}>PEOPLE</span>
            <input type="number" value={f.passengers} onChange={(e) => setF({ ...f, passengers: e.target.value })} className={input} /></div>
          <div><span className={label}>BAGS</span>
            <input type="number" value={f.luggage} onChange={(e) => setF({ ...f, luggage: e.target.value })} className={input} /></div>
          <div><span className={label}>PRICE Rs</span>
            <input value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} placeholder="1800" className={input} /></div>
        </div>
        {needsArrival && (
          <div>
            <span className={label}>FLIGHT / FERRY</span>
            <input value={f.flightRef} onChange={(e) => setF({ ...f, flightRef: e.target.value })} placeholder="e.g. MK034" className={input} />
            <label className="mt-2 flex items-center gap-2 font-dm text-xs text-muted">
              <input type="checkbox" checked={f.meetGreet} onChange={(e) => setF({ ...f, meetGreet: e.target.checked })} className="accent-yellow" />
              Wait inside with a name sign
            </label>
          </div>
        )}
        <div className="sm:col-span-2"><span className={label}>ANYTHING ELSE</span>
          <input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="e.g. baby seat, wheelchair, two stops" className={input} /></div>
      </div>
      <div className="mt-4 flex gap-2">
        <button onClick={() => void submit()} disabled={busy || !f.pickupLabel || !f.dropoffLabel || !f.customerName || !f.customerPhone}
          className="inline-flex items-center gap-2 rounded-full bg-yellow px-5 py-2.5 font-dm text-sm font-bold text-dark disabled:opacity-50">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Take this ride
        </button>
        <button onClick={onDone} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-2.5 font-dm text-sm text-muted">
          <X size={15} /> Close
        </button>
      </div>
    </div>
  );
}


// ── THE ROSTER ──────────────────────────────────────────────────────────────
//
// These fields decide who gets offered work, so they live on the dispatch desk
// rather than in the content studio next to the driver's photo and languages.
// They were added to taxi_drivers by the rides migration and then blocked by the
// API's mass-assignment allowlist, so until now there was no way to set any of
// them — every driver defaulted to 4 seats and could never be ranked by distance.
function DriverRoster({ drivers, onSaved }: { drivers: Driver[]; onSaved: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);

  async function save(id: string, patch: Record<string, unknown>) {
    setBusy(id);
    try {
      const r = await fetch("/api/admin/taxi", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(b.error || "Could not save.");
      }
      toast.success("Saved.");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(null);
    }
  }

  const cell =
    "rounded-lg border border-white/12 bg-dark px-2 py-1.5 font-dm text-xs text-offwhite focus:border-yellow/50 focus:outline-none";

  return (
    <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
      <table className="w-full min-w-[880px] text-left">
        <thead>
          <tr className="border-b border-white/10 bg-white/[0.03]">
            {["Driver", "Working?", "Seats", "Waits at", "Latitude", "Longitude", "Takes", "Record", ""].map((h) => (
              <th key={h} className="px-3 py-2 font-bebas text-[10px] tracking-[0.18em] text-muted">
                {h.toUpperCase()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {drivers.length === 0 && (
            <tr>
              <td colSpan={9} className="px-3 py-8 text-center font-dm text-sm text-muted">
                No drivers yet. Add them in the content studio under Taxi, then set their seats and base here.
              </td>
            </tr>
          )}
          {drivers.map((d) => (
            <DriverRow key={d.id} d={d} busy={busy === d.id} onSave={save} cell={cell} />
          ))}
        </tbody>
      </table>
      <p className="border-t border-white/10 px-3 py-2.5 font-dm text-[11px] text-muted">
        Seats and a base location are what let the engine rank a driver. Without a base they still get
        offered work — just last, after everyone whose position is known.
      </p>
    </div>
  );
}

function DriverRow({
  d, busy, onSave, cell,
}: {
  d: Driver;
  busy: boolean;
  cell: string;
  onSave: (id: string, patch: Record<string, unknown>) => void;
}) {
  const [f, setF] = useState({
    availability: d.availability,
    seats: d.seats?.toString() ?? "",
    base_label: d.base_label ?? "",
    base_lat: d.base_lat?.toString() ?? "",
    base_lng: d.base_lng?.toString() ?? "",
    handles_taxi: d.handles_taxi ?? true,
    handles_airport: d.handles_airport ?? true,
    handles_transfer: d.handles_transfer ?? true,
  });
  const rate = d.rides_offered > 0 ? Math.round((d.rides_accepted / d.rides_offered) * 100) : null;

  return (
    <tr className={`border-b border-white/5 last:border-0 ${d.active ? "" : "opacity-50"}`}>
      <td className="px-3 py-2 font-dm text-sm text-offwhite">
        {d.name}
        <span className="block font-dm text-[11px] text-muted">{d.vehicle}</span>
      </td>
      <td className="px-3 py-2">
        <select
          value={f.availability}
          onChange={(e) => setF({ ...f, availability: e.target.value })}
          aria-label={`Is ${d.name} working`}
          className={cell}
        >
          <option value="available">Working</option>
          <option value="busy">Busy</option>
          <option value="off">Not today</option>
        </select>
      </td>
      <td className="px-3 py-2">
        <input value={f.seats} onChange={(e) => setF({ ...f, seats: e.target.value })}
          aria-label={`Seats for ${d.name}`} placeholder="4" inputMode="numeric" className={`${cell} w-14`} />
      </td>
      <td className="px-3 py-2">
        <input value={f.base_label} onChange={(e) => setF({ ...f, base_label: e.target.value })}
          aria-label={`Where ${d.name} waits`} placeholder="Port Mathurin" className={`${cell} w-32`} />
      </td>
      <td className="px-3 py-2">
        <input value={f.base_lat} onChange={(e) => setF({ ...f, base_lat: e.target.value })}
          aria-label={`Latitude for ${d.name}`} placeholder="-19.6790" inputMode="decimal" className={`${cell} w-24`} />
      </td>
      <td className="px-3 py-2">
        <input value={f.base_lng} onChange={(e) => setF({ ...f, base_lng: e.target.value })}
          aria-label={`Longitude for ${d.name}`} placeholder="63.4180" inputMode="decimal" className={`${cell} w-24`} />
      </td>
      <td className="px-3 py-2">
        <div className="flex gap-2 font-dm text-[11px] text-muted">
          {([["handles_taxi", "Taxi"], ["handles_airport", "Airport"], ["handles_transfer", "Transfer"]] as const).map(
            ([k, lbl]) => (
              <label key={k} className="inline-flex items-center gap-1">
                <input type="checkbox" checked={f[k]}
                  onChange={(e) => setF({ ...f, [k]: e.target.checked })} className="accent-yellow" />
                {lbl}
              </label>
            ),
          )}
        </div>
      </td>
      <td className="px-3 py-2 font-dm text-[11px] tabular-nums text-muted">
        {rate === null ? "no offers yet" : `${rate}% accepted`}
        <span className="block">{d.rides_completed} done</span>
      </td>
      <td className="px-3 py-2 text-right">
        <button
          onClick={() =>
            onSave(d.id, {
              availability: f.availability,
              // Empty means "not set", which the engine handles. It must not
              // become 0 — a driver with 0 seats is skipped for every ride.
              seats: f.seats ? parseInt(f.seats) : null,
              base_label: f.base_label || null,
              base_lat: f.base_lat ? parseFloat(f.base_lat) : null,
              base_lng: f.base_lng ? parseFloat(f.base_lng) : null,
              handles_taxi: f.handles_taxi,
              handles_airport: f.handles_airport,
              handles_transfer: f.handles_transfer,
            })
          }
          disabled={busy}
          className="rounded-full border border-white/15 px-2.5 py-1.5 font-dm text-[11px] text-offwhite hover:border-yellow/50 disabled:opacity-50"
        >
          {busy ? <Loader2 size={11} className="animate-spin" /> : "Save"}
        </button>
      </td>
    </tr>
  );
}


// ── THE FARES ───────────────────────────────────────────────────────────────
//
// The owner asked for test prices he can edit or delete after. The numbers seeded
// by the migration are my guesses at Rodriguan rates and they are customer-facing
// the moment the booking screen is live, so this is where he makes them his.
//
// "Delete" is `Offer this` turned off, not a deleted row: quote_ride() would
// answer 'unknown_service' for a missing row while the booking screen still listed
// the service. Off means the screen says "we will confirm the price with you",
// which is a real answer rather than a broken one.
//
// Rupees in the boxes, minor units in the database — the conversion happens in the
// route, so a fare cannot land 100x wrong.
function FaresPanel() {
  const [rows, setRows] = useState<PricingRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/ride-pricing");
      const b = await r.json();
      if (!r.ok) throw new Error(b.error || "Could not load fares.");
      setRows(b.pricing);
    } catch (e) {
      setRows([]);
      toast.error(e instanceof Error ? e.message : "Could not load fares.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save(service: string, patch: Record<string, unknown>) {
    setBusy(service);
    try {
      const r = await fetch("/api/admin/ride-pricing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service, ...patch }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error || "Could not save.");
      toast.success("Fare saved — customers see this immediately.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(null);
    }
  }

  if (rows === null) {
    return (
      <div className="mt-4 flex justify-center py-8">
        <Loader2 className="animate-spin text-yellow" />
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <p className="rounded-xl border border-orange-400/25 bg-orange-400/[0.06] px-4 py-3 font-dm text-xs text-orange-200">
        <AlertTriangle size={13} className="mr-1.5 inline" />
        These are starting numbers, not real Rodriguan rates — change them before customers
        book. A price saved here appears on the booking screen straight away.
      </p>
      {rows.map((p) => <FareRow key={p.service} p={p} busy={busy === p.service} onSave={save} />)}
    </div>
  );
}

function FareRow({
  p, busy, onSave,
}: {
  p: PricingRow;
  busy: boolean;
  onSave: (service: string, patch: Record<string, unknown>) => void;
}) {
  // Minor units out of the database, rupees into the boxes.
  const r = (minor: number | null | undefined) => (minor == null ? "" : String(minor / 100));
  const [f, setF] = useState({
    baseFare: r(p.base_fare),
    perKm: r(p.per_km),
    minimumFare: r(p.minimum_fare),
    flatFare: r(p.flat_fare),
    nightSurcharge: r(p.night_surcharge),
    isBookable: p.is_bookable,
  });
  const meta = RIDE_SERVICE_META[p.service as RideService];
  const isFlat = f.flatFare !== "";

  const box = "w-full rounded-lg border border-white/12 bg-dark px-2.5 py-2 font-dm text-sm text-offwhite focus:border-yellow/50 focus:outline-none";
  const lbl = "block font-bebas text-[9px] tracking-[0.18em] text-muted mb-1";

  return (
    <div className={`rounded-2xl border p-4 ${f.isBookable ? "border-white/10 bg-dark-card" : "border-white/[0.06] bg-dark-card opacity-60"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-syne text-base font-bold text-offwhite">{meta?.label ?? p.service}</p>
        <label className="inline-flex items-center gap-2 font-dm text-xs text-muted">
          <input
            type="checkbox"
            checked={f.isBookable}
            onChange={(e) => setF({ ...f, isBookable: e.target.checked })}
            className="accent-yellow"
          />
          Offer this
        </label>
      </div>

      {/* A flat fare and a per-km fare are alternatives, not a pair. Saying so
          beats letting somebody fill both in and wonder which one won. */}
      <p className="mt-1 font-dm text-[11px] text-muted">
        {isFlat
          ? "Flat fare — distance is ignored. Clear it to charge by distance instead."
          : "Charged by distance. Set a flat fare to override it entirely."}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <label>
          <span className={lbl}>FLAT FARE Rs</span>
          <input value={f.flatFare} onChange={(e) => setF({ ...f, flatFare: e.target.value })}
            inputMode="decimal" placeholder="—" className={box} />
        </label>
        <label className={isFlat ? "opacity-40" : ""}>
          <span className={lbl}>BASE Rs</span>
          <input value={f.baseFare} onChange={(e) => setF({ ...f, baseFare: e.target.value })}
            inputMode="decimal" className={box} disabled={isFlat} />
        </label>
        <label className={isFlat ? "opacity-40" : ""}>
          <span className={lbl}>PER KM Rs</span>
          <input value={f.perKm} onChange={(e) => setF({ ...f, perKm: e.target.value })}
            inputMode="decimal" className={box} disabled={isFlat} />
        </label>
        <label className={isFlat ? "opacity-40" : ""}>
          <span className={lbl}>MINIMUM Rs</span>
          <input value={f.minimumFare} onChange={(e) => setF({ ...f, minimumFare: e.target.value })}
            inputMode="decimal" className={box} disabled={isFlat} />
        </label>
        <label>
          <span className={lbl}>NIGHT EXTRA Rs</span>
          <input value={f.nightSurcharge} onChange={(e) => setF({ ...f, nightSurcharge: e.target.value })}
            inputMode="decimal" placeholder="0" className={box} />
        </label>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() =>
            onSave(p.service, {
              // An empty box is null, not 0: null clears a flat fare, while 0
              // would advertise a free ride.
              flatFare: f.flatFare === "" ? null : Number(f.flatFare),
              baseFare: f.baseFare === "" ? 0 : Number(f.baseFare),
              perKm: f.perKm === "" ? 0 : Number(f.perKm),
              minimumFare: f.minimumFare === "" ? 0 : Number(f.minimumFare),
              nightSurcharge: f.nightSurcharge === "" ? 0 : Number(f.nightSurcharge),
              isBookable: f.isBookable,
            })
          }
          disabled={busy}
          className="rounded-full bg-yellow px-4 py-2 font-dm text-xs font-bold text-dark disabled:opacity-50"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : "Save fare"}
        </button>
        <a
          href={`/taxi/book?service=${p.service}`}
          target="_blank"
          rel="noreferrer"
          className="font-dm text-xs text-muted hover:text-yellow"
        >
          See what a customer sees →
        </a>
      </div>
    </div>
  );
}
