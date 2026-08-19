"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2, Package, MapPin, Phone, Navigation, CheckCircle2,
  AlertTriangle, Clock, Wallet, XCircle,
} from "lucide-react";
import { centsToDecimalString } from "@/lib/money";
import { Button } from "@/components/ui/button";
import AlertsToggle from "./AlertsToggle";
import DeliveryTracking from "@/components/tracking/DeliveryTracking";
import WhatsappAlerts from "./WhatsappAlerts";

// ── The driver's phone ──────────────────────────────────────────────────────
//
// Designed for one hand, outdoors, in a hurry, on a bad signal. The governing
// rule: EVERY ACTIVE DELIVERY HAS EXACTLY ONE OBVIOUS NEXT ACTION. A driver
// should never have to work out what the app wants — the primary button says
// it, full width, at the bottom of the thumb's reach.
//
// The server is authoritative for every transition. Nothing here optimistically
// advances a status: on this island a request can hang, and a screen that says
// "Delivered" when the server never agreed is the one failure that destroys
// trust in the whole network.

type Offer = {
  id: string; earning: number; storeName: string;
  storeAddress: string | null; dropoffNote: string | null; expiresAt: string | null;
};
type Active = {
  id: string; status: string; earning: number;
  storeName: string; storePhone: string | null; storeAddress: string | null;
  orderNumber: string; customerName: string | null; customerPhone: string | null;
  dropoffLat: number | null; dropoffLng: number | null; dropoffNote: string | null;
  pickupDueAt: string | null; deliveryDueAt: string | null; pinAttempts: number;
  /** M79c — cash still owed on the order, to take at the door. Minor units. */
  collectCash?: number;
};
type Dash = {
  isDriver: boolean;
  driver?: { id: string; name: string; status: string; availability: string; statusReason: string | null };
  limits?: { maxActive: number };
  today?: { completed: number; earned: number };
  metrics?: { completed: number; accepted: number; offers: number; cancellations: number; onTime: number };
  active?: Active[];
  offers?: Offer[];
  // A boolean only. The key itself is never returned by any endpoint.
  whatsappConfigured?: boolean;
};

// The single next step for each state. Keeping this as data rather than a
// chain of ifs is what guarantees there is never more than one.
const NEXT: Record<string, { to: string; label: string } | undefined> = {
  assigned: { to: "going_to_pickup", label: "Start — going to pick up" },
  going_to_pickup: { to: "arrived_at_pickup", label: "I've arrived at the shop" },
  arrived_at_pickup: { to: "picked_up", label: "I have the order" },
  picked_up: { to: "out_for_delivery", label: "Start delivery" },
  out_for_delivery: { to: "arrived", label: "I've arrived at the customer" },
};

// ── What a driver actually needs to know in the street ─────────────────────
// pickupDueAt, deliveryDueAt and an offer's expiresAt were all in the payload
// and none of them were on screen. A driver could not tell whether they were
// early, late, or about to lose an offer — the three questions they actually
// have while holding a phone at a junction.

/** "12 min left" / "8 min late". Null when there is no deadline to report. */
function timeLeft(iso: string | null): { text: string; late: boolean } | null {
  if (!iso) return null;
  const mins = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (Number.isNaN(mins)) return null;
  if (mins < 0) return { text: `${Math.abs(mins)} min late`, late: true };
  if (mins === 0) return { text: "due now", late: true };
  if (mins < 60) return { text: `${mins} min left`, late: false };
  return { text: `${Math.floor(mins / 60)}h ${mins % 60}m left`, late: false };
}

// The whole journey, so "where am I up to" is answered by looking rather than
// by remembering which button was pressed last.
const STEPS = ["assigned", "going_to_pickup", "arrived_at_pickup", "picked_up", "out_for_delivery", "arrived"];
const STEP_LABEL: Record<string, string> = {
  assigned: "Accepted",
  going_to_pickup: "To shop",
  arrived_at_pickup: "At shop",
  picked_up: "Collected",
  out_for_delivery: "To customer",
  arrived: "At door",
};

function Progress({ status }: { status: string }) {
  const at = STEPS.indexOf(status);
  return (
    <div className="mt-3">
      <div className="flex items-center gap-1" role="img" aria-label={`Step ${at + 1} of ${STEPS.length}: ${STEP_LABEL[status] ?? status}`}>
        {STEPS.map((st, i) => (
          <div
            key={st}
            className={`h-1.5 flex-1 rounded-full ${i <= at ? "bg-yellow" : "bg-white/12"}`}
          />
        ))}
      </div>
      <p className="mt-1.5 font-dm text-xs text-muted">
        Step {at + 1} of {STEPS.length} — {STEP_LABEL[status] ?? status}
      </p>
    </div>
  );
}

const REASONS: { value: string; label: string }[] = [
  { value: "vehicle", label: "Vehicle problem" },
  { value: "illness", label: "Illness or emergency" },
  { value: "weather", label: "Bad weather" },
  { value: "access", label: "Road or access problem" },
  { value: "merchant", label: "Problem at the shop" },
  { value: "customer", label: "Customer unavailable" },
  { value: "other", label: "Something else" },
];

export default function DriverDashboard() {
  const [dash, setDash] = useState<Dash | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pin, setPin] = useState<Record<string, string>>({});
  const [excuseFor, setExcuseFor] = useState<string | null>(null);
  const [reason, setReason] = useState("vehicle");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/driver", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not load.");
      setDash(body as Dash);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // Offers expire, so a stale screen shows work that is already gone. 20s is
    // frequent enough to feel live without draining a battery all afternoon.
    const t = setInterval(() => void load(), 20_000);
    return () => clearInterval(t);
  }, [load]);

  async function act(key: string, payload: Record<string, unknown>) {
    if (busy) return;                       // one action at a time, always
    setBusy(key);
    setError(null);
    try {
      const res = await fetch("/api/driver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "That didn't work.");
      // A soft failure (wrong PIN, job taken) comes back 200 with ok:false.
      if (body.ok === false && body.message) setError(body.message);
      await load();
      return body;
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="animate-spin text-yellow" size={28} />
      </div>
    );
  }

  if (dash && !dash.isDriver) {
    return (
      <div className="rounded-2xl border border-white/10 bg-dark-card p-6 text-center">
        <Package size={30} className="mx-auto text-yellow" />
        <h2 className="mt-3 font-syne text-xl font-bold">Become a delivery partner</h2>
        <p className="mx-auto mt-2 max-w-sm font-dm text-sm text-muted">
          Deliver orders around Rodrigues on your own schedule. Free to join.
        </p>
        <a href="/driver/apply" className="mt-5 inline-block rounded-full bg-yellow px-6 py-3 font-syne text-sm font-bold text-dark">
          Apply now
        </a>
      </div>
    );
  }

  const d = dash?.driver;
  const online = d?.availability !== "offline";
  const approved = d?.status === "approved";
  const active = dash?.active ?? [];
  const offers = dash?.offers ?? [];

  return (
    <div className="space-y-4">
      {/* Status — the first thing a driver checks, so it is the first thing here. */}
      <div className="rounded-2xl border border-white/10 bg-dark-card p-4">
        {!approved ? (
          <div className="flex items-start gap-2">
            <Clock size={18} className="mt-0.5 shrink-0 text-orange-300" />
            <div>
              <p className="font-syne text-sm font-bold text-orange-300">
                {d?.status === "pending" ? "Application under review" : `Account ${d?.status}`}
              </p>
              <p className="mt-1 font-dm text-xs text-muted">
                {d?.statusReason ?? "We'll message you as soon as it's checked. You can't take deliveries yet."}
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 font-syne text-base font-bold">
                  <span className={`h-2.5 w-2.5 rounded-full ${online ? "bg-green-400" : "bg-white/30"}`} />
                  {online ? "Online — taking deliveries" : "Offline"}
                </p>
                <p className="mt-0.5 font-dm text-xs text-muted">{d?.name}</p>
              </div>
              <button
                onClick={() => void act("online", { action: "online", online: !online })}
                disabled={busy !== null}
                aria-pressed={online}
                className={`min-h-[44px] rounded-full px-5 font-syne text-sm font-bold transition-colors disabled:opacity-50 ${
                  online ? "border border-white/20 text-offwhite" : "bg-yellow text-dark"
                }`}
              >
                {busy === "online" ? <Loader2 size={16} className="animate-spin" /> : online ? "Go offline" : "Go online"}
              </button>
            </div>
            {!online && active.length > 0 && (
              // Said plainly, because a driver going offline reasonably fears
              // their current job vanishes.
              <p className="mt-3 font-dm text-xs text-orange-300">
                You still have {active.length} delivery{active.length === 1 ? "" : "ies"} to finish — going offline
                only stops new ones.
              </p>
            )}
          </>
        )}
      </div>

      {/* Shown to any driver, not just approved ones. A PENDING driver is
          exactly who needs alerts on: the first thing they are waiting for is
          the message saying they were approved. Gating this behind `approved`
          meant they could not subscribe until after the notification they
          wanted had already been sent. */}
      <AlertsToggle />
      <WhatsappAlerts configured={Boolean(dash?.whatsappConfigured)} onSaved={() => void load()} />

      {approved && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/10 bg-dark-card p-4">
            <p className="font-bebas text-[10px] tracking-[0.25em] text-yellow">TODAY</p>
            <p className="mt-1 font-syne text-2xl font-extrabold">{dash?.today?.completed ?? 0}</p>
            <p className="font-dm text-xs text-muted">delivered</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-dark-card p-4">
            <p className="font-bebas text-[10px] tracking-[0.25em] text-yellow">EARNED TODAY</p>
            <p className="mt-1 flex items-center gap-1.5 font-syne text-2xl font-extrabold">
              <Wallet size={17} className="text-yellow" />
              {centsToDecimalString(dash?.today?.earned ?? 0)}
            </p>
            <p className="font-dm text-xs text-muted">rupees</p>
          </div>
        </div>
      )}

      {/* ── Where the driver is (M109) ────────────────────────────────────
          Above the job cards deliberately: a driver whose location is off is
          invisible to dispatch AND to the customer watching them, and that has
          to be visible before the work, not buried under it.

          Only the FIRST active job is tracked. A driver holding two deliveries
          is in one place, and the position belongs to whichever they are
          actually doing — which is the one at the top of this list. */}
      {approved && (
        <DeliveryTracking
          online={online}
          activeId={active[0]?.id ?? null}
          activeStatus={active[0]?.status ?? null}
          driverId={dash?.driver?.id ?? null}
        />
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-red-500/25 bg-red-500/[0.07] px-4 py-3 font-dm text-sm text-red-400">
          {error}
        </p>
      )}

      {/* Active work comes BEFORE new offers: finishing what you hold beats
          taking more, and it is what the driver opened the app for. */}
      {active.map((a) => {
        const next = NEXT[a.status];
        const atDoor = a.status === "arrived" || a.status === "out_for_delivery";
        return (
          <div key={a.id} className="rounded-2xl border border-yellow/30 bg-yellow/[0.05] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bebas text-[10px] tracking-[0.25em] text-yellow">{a.orderNumber}</p>
                <p className="font-syne text-base font-bold">{a.storeName}</p>
              </div>
              <span className="shrink-0 font-syne text-base font-bold text-yellow">
                Rs {centsToDecimalString(a.earning)}
              </span>
            </div>

            {/* The deadline that applies RIGHT NOW: the pickup one until the
                package is collected, the delivery one after. Showing both at
                once is noise; showing neither is what shipped. */}
            {(() => {
              const due = timeLeft(
                ["assigned", "going_to_pickup", "arrived_at_pickup"].includes(a.status)
                  ? a.pickupDueAt
                  : a.deliveryDueAt,
              );
              if (!due) return null;
              return (
                <p
                  className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-dm text-xs ${
                    due.late ? "bg-red-500/15 text-red-300" : "bg-white/[0.06] text-muted"
                  }`}
                >
                  <Clock size={12} />
                  {["assigned", "going_to_pickup", "arrived_at_pickup"].includes(a.status)
                    ? "Pickup"
                    : "Delivery"}{" "}
                  {due.text}
                </p>
              );
            })()}

            <Progress status={a.status} />

            <div className="mt-3 space-y-1.5 font-dm text-sm">
              {a.storeAddress && (
                <p className="flex items-start gap-2 text-muted">
                  <Package size={14} className="mt-0.5 shrink-0 text-yellow" /> {a.storeAddress}
                </p>
              )}
              {a.dropoffNote && (
                <p className="flex items-start gap-2 text-muted">
                  <MapPin size={14} className="mt-0.5 shrink-0 text-yellow" /> {a.dropoffNote}
                </p>
              )}
            </div>

            {/* M79c — a split payment: the customer still owes cash and the
                driver is the one who has to ask for it. Loud, and stated in
                money rather than as a status, because this is the only thing
                on the card that costs somebody real money if it is missed. */}
            {(a.collectCash ?? 0) > 0 && (
              <p className="mt-3 rounded-xl border border-red-400/40 bg-red-500/[0.09] px-3 py-2 font-syne text-sm font-bold text-red-300">
                Collect Rs {centsToDecimalString(a.collectCash!)} in cash at the door
              </p>
            )}

            {/* Calling and navigating are the two things a driver reaches for
                mid-job; they are links, not buried in a menu. */}
            <div className="mt-3 flex flex-wrap gap-2">
              {a.dropoffLat != null && a.dropoffLng != null && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${a.dropoffLat},${a.dropoffLng}`}
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-white/20 px-4 font-dm text-sm"
                >
                  <Navigation size={14} /> Navigate
                </a>
              )}
              {a.customerPhone && atDoor && (
                <a href={`tel:${a.customerPhone.replace(/\s+/g, "")}`}
                   className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-white/20 px-4 font-dm text-sm">
                  <Phone size={14} /> Call customer
                </a>
              )}
              {a.storePhone && !atDoor && (
                <a href={`tel:${a.storePhone.replace(/\s+/g, "")}`}
                   className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-white/20 px-4 font-dm text-sm">
                  <Phone size={14} /> Call shop
                </a>
              )}
            </div>

            {/* THE one next action. */}
            {next && (
              <Button
                className="mt-4 min-h-[52px] w-full text-base"
                disabled={busy !== null}
                onClick={() => void act(`adv-${a.id}`, { action: "advance", deliveryId: a.id, to: next.to })}
              >
                {busy === `adv-${a.id}` ? <Loader2 size={18} className="animate-spin" /> : next.label}
              </Button>
            )}

            {/* At the door the next action is the PIN, and nothing else. */}
            {a.status === "arrived" && (
              <div className="mt-4 rounded-xl border border-white/12 bg-dark p-3">
                <label htmlFor={`pin-${a.id}`} className="block font-dm text-xs text-muted">
                  Ask {a.customerName ?? "the customer"} for their 4-digit code
                </label>
                <div className="mt-2 flex gap-2">
                  <input
                    id={`pin-${a.id}`}
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={4}
                    value={pin[a.id] ?? ""}
                    onChange={(e) => setPin({ ...pin, [a.id]: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                    placeholder="0000"
                    className="w-28 rounded-xl border border-dark-border bg-dark-card px-3 py-3 text-center font-syne text-2xl font-bold tracking-[0.3em] text-offwhite placeholder:text-muted/40 focus:border-yellow focus:outline-none"
                  />
                  <Button
                    className="min-h-[52px] flex-1 text-base"
                    disabled={busy !== null || (pin[a.id] ?? "").length !== 4}
                    onClick={() => void act(`pin-${a.id}`, { action: "complete", deliveryId: a.id, pin: pin[a.id] })}
                  >
                    {busy === `pin-${a.id}` ? <Loader2 size={18} className="animate-spin" /> : "Complete delivery"}
                  </Button>
                </div>
                {a.pinAttempts > 0 && (
                  <p className="mt-2 font-dm text-xs text-orange-300">
                    {5 - a.pinAttempts} tries left before this has to be finished by the office.
                  </p>
                )}
              </div>
            )}

            {/* The escape hatch. Present on every active job, quiet enough not
                to compete with the primary action, and it never silently
                releases a package that has already been collected. */}
            {excuseFor === a.id ? (
              <div className="mt-3 rounded-xl border border-red-500/25 bg-red-500/[0.05] p-3">
                <p className="font-dm text-xs text-muted">What happened?</p>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="mt-2 min-h-[44px] w-full rounded-lg border border-dark-border bg-dark px-3 font-dm text-sm text-offwhite"
                >
                  {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                {reason === "other" && (
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    placeholder="Tell us briefly…"
                    className="mt-2 w-full rounded-lg border border-dark-border bg-dark px-3 py-2 font-dm text-sm text-offwhite"
                  />
                )}
                <div className="mt-3 flex gap-2">
                  <Button
                    variant="outline" className="min-h-[44px] flex-1"
                    onClick={() => { setExcuseFor(null); setNote(""); }}
                  >
                    Keep it
                  </Button>
                  <button
                    disabled={busy !== null || (reason === "other" && !note.trim())}
                    onClick={async () => {
                      const r = await act(`cx-${a.id}`, {
                        action: "cannot_complete", deliveryId: a.id, reason, note: note.trim() || undefined,
                      });
                      setExcuseFor(null); setNote("");
                      if (r?.afterPickup) {
                        setError("Thanks — because you already have the package, the office will contact you to arrange the handover. Please keep it safe.");
                      }
                    }}
                    className="min-h-[44px] flex-1 rounded-xl bg-red-500 px-4 font-syne text-sm font-bold text-white disabled:opacity-40"
                  >
                    {busy === `cx-${a.id}` ? <Loader2 size={16} className="animate-spin" /> : "Confirm"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setExcuseFor(a.id)}
                className="mt-3 flex w-full items-center justify-center gap-1.5 py-2 font-dm text-xs text-muted underline underline-offset-4"
              >
                <AlertTriangle size={12} /> I can&apos;t complete this delivery
              </button>
            )}
          </div>
        );
      })}

      {/* Offers */}
      {approved && online && (
        offers.length > 0 ? (
          <div className="space-y-3">
            <h2 className="font-syne text-lg font-bold">Available now</h2>
            {offers.map((o) => (
              <div key={o.id} className="rounded-2xl border border-white/10 bg-dark-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-syne text-base font-bold">{o.storeName}</p>
                    {o.storeAddress && <p className="font-dm text-xs text-muted">{o.storeAddress}</p>}
                    {o.dropoffNote && (
                      <p className="mt-1 flex items-start gap-1.5 font-dm text-xs text-muted">
                        <MapPin size={12} className="mt-0.5 shrink-0" /> {o.dropoffNote}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 font-syne text-lg font-bold text-yellow">
                    Rs {centsToDecimalString(o.earning)}
                  </span>
                </div>
                {/* An offer expires. Without this it vanished mid-tap with no
                    warning, and the driver had no way to tell a job worth
                    hurrying for from one they had all afternoon to take. */}
                {(() => {
                  const left = timeLeft(o.expiresAt);
                  if (!left) return null;
                  return (
                    <p
                      className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-dm text-xs ${
                        left.late ? "bg-red-500/15 text-red-300" : "bg-yellow/15 text-yellow"
                      }`}
                    >
                      <Clock size={12} /> {left.late ? "Expiring now" : left.text}
                    </p>
                  );
                })()}
                <Button
                  className="mt-3 min-h-[52px] w-full text-base"
                  disabled={busy !== null}
                  onClick={() => void act(`acc-${o.id}`, { action: "accept", deliveryId: o.id })}
                >
                  {busy === `acc-${o.id}` ? <Loader2 size={18} className="animate-spin" /> : "Accept delivery"}
                </Button>
              </div>
            ))}
          </div>
        ) : active.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-dark-card p-6 text-center">
            <CheckCircle2 size={24} className="mx-auto text-muted" />
            <p className="mt-2 font-syne text-sm font-bold">Nothing available right now</p>
            <p className="mt-1 font-dm text-xs text-muted">
              You&apos;re online — we&apos;ll show a job here the moment one comes in.
            </p>
          </div>
        ) : null
      )}

      {approved && !online && active.length === 0 && (
        <div className="rounded-2xl border border-white/10 bg-dark-card p-6 text-center">
          <XCircle size={24} className="mx-auto text-muted" />
          <p className="mt-2 font-syne text-sm font-bold">You&apos;re offline</p>
          <p className="mt-1 font-dm text-xs text-muted">Go online to start receiving deliveries.</p>
        </div>
      )}
    </div>
  );
}
