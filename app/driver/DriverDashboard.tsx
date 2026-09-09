"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePolling } from "@/lib/use-polling";
import VehicleHandover from "./VehicleHandover";
import { mayLayOutMoney, toRequestKind } from "@/lib/delivery/kind";
import { useSearchParams } from "next/navigation";
import {
  Loader2,
  Package,
  MapPin,
  Phone,
  Navigation,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Wallet,
  XCircle,
  Landmark,
  Banknote,
  FileText,
  IdCard,
  ArrowDown,
} from "lucide-react";
import { centsToDecimalString } from "@/lib/money";
import { Button } from "@/components/ui/button";
import AlertsToggle from "./AlertsToggle";
import DeliveryTracking from "@/components/tracking/DeliveryTracking";
import { driverDutyState } from "@/lib/delivery/availability";
import DeliveryLog from "./DeliveryLog";
import QuoteBoard, { type OpenRequest } from "./QuoteBoard";
import { formatWindow } from "@/lib/delivery/schedule";
import { legFor } from "@/lib/delivery/leg";
import { legTarget } from "@/lib/delivery/job-legs";
import { isPoint, navigateUrl, routeUrl } from "@/lib/maps/nav";
import {
  canStartDelivery,
  paymentCardState,
  waitingOn,
} from "@/lib/delivery/payment-state";

/**
 * Open a signed document, and notice when the browser refuses.
 *
 * ── WHY THIS IS NOT JUST window.open ──────────────────────────────────────
 * Both call sites open AFTER two awaits — a fetch and a json() — so the tap
 * that started it is long over. Every mobile browser treats a window.open with
 * no user gesture behind it as a popup and blocks it, and it does so SILENTLY:
 * the call returns null and nothing anywhere says a word.
 *
 * The driver is standing at the door on a cash job, taps "View ID", and
 * nothing happens. Not an error, not a document — nothing. There is no way for
 * them to tell that from a slow connection, so they tap again, and again.
 *
 * A blocked popup is reported now, with the one instruction that fixes it.
 */
function openSigned(url: string, onBlocked: (message: string) => void): void {
  const win = window.open(url, "_blank", "noopener,noreferrer");
  if (!win || win.closed) {
    onBlocked(
      "Your browser blocked the document window. Allow pop-ups for this site, then tap again.",
    );
  }
}

/** The only failure where the tap never left the phone. */
const OFFLINE_MESSAGE =
  "No signal just now — that did not go through. Nothing has changed, so tap it again when you have a bar.";

/**
 * Did the request fail to reach the server at all?
 *
 * A fetch that never connects rejects with a TypeError, and the message is the
 * browser's rather than ours: "Load failed" (Safari), "Failed to fetch"
 * (Chrome), "NetworkError when attempting to fetch resource" (Firefox). We do
 * not match on those strings — they are three, they are localised in some
 * builds, and they change. The reliable signals are the error TYPE and, when
 * the browser bothers to set it, navigator.onLine.
 */
function isNetworkFailure(e: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return e instanceof TypeError;
}

/** Our own messages pass through; anything else becomes plain words. */
function messageFor(e: unknown): string {
  const m = e instanceof Error ? e.message : "";
  return m && m.length < 200 ? m : "That didn't work. Try again.";
}

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
  id: string;
  earning: number;
  storeName: string;
  storeAddress: string | null;
  dropoffNote: string | null;
  expiresAt: string | null;
  /** M186 emits these for the offers block too. A dispatch offer is a
   *  countdown, and "is this pickup near me" is most of the decision. */
  pickupLat?: number | null;
  pickupLng?: number | null;
};
type Active = {
  id: string;
  status: string;
  earning: number;
  storeName: string;
  storePhone: string | null;
  storeAddress: string | null;
  orderNumber: string;
  customerName: string | null;
  customerPhone: string | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
  dropoffNote: string | null;
  /** ── WHERE TO COLLECT FROM ────────────────────────────────────────────
   *  M186. `deliveries` has no pickup columns at all, and driver_dashboard()
   *  joined the request to read `pickup_text` — the ADDRESS — while selecting
   *  neither coordinate. So the console knew the NAME of the place and could
   *  not point at it: the only Navigate button on the screen went to the
   *  drop-off, whatever leg the driver was on. On a store job these come from
   *  the store's own pin, on a direct request from what the customer dropped
   *  on the map. */
  pickupLat?: number | null;
  pickupLng?: number | null;
  /** "Ask for Marie round the back" — worth nothing until you have arrived. */
  pickupNote?: string | null;
  pickupDueAt: string | null;
  deliveryDueAt: string | null;
  pinAttempts: number;
  /** M79c — cash still owed on the order, to take at the door. Minor units.
   *  M157: this is ZERO for a bank transfer, because the money is already in.
   *  It used to read the fee unconditionally, which told a driver to collect a
   *  bill the customer had already settled. */
  collectCash?: number;
  /** M155/M157 — how this job is being paid, and whether the receipt landed. */
  paymentMethod?: string | null;
  paymentProofAt?: string | null;
  paymentReference?: string | null;
  hasProof?: boolean;
  /** M158 — the customer's ID on a cash job, checked at the door. */
  idDocumentAt?: string | null;
  hasIdDocument?: boolean;
  /** A shopping run: the driver fronts the till and is repaid at the door. */
  /** The delivery_request behind this job. Custody rows hang off the
   *  REQUEST, not the delivery. */
  requestId?: string | null;
  requestKind?: string | null;
  /** Only on a car collection. `nextHandover` is DERIVED from the custody rows
   *  — collected, then returned, then null — so it can never disagree with what
   *  the driver actually did at the car. */
  errandKind?: string | null;
  vehiclePlate?: string | null;
  vehicleDesc?: string | null;
  nextHandover?: "collected" | "returned" | null;
  spendCap?: number | null;
  /** M152 — when the customer needs it. */
  windowStart?: string | null;
  windowEnd?: string | null;
  scheduleKind?: string | null;
  timeSlot?: string | null;
};
type Dash = {
  isDriver: boolean;
  driver?: {
    id: string;
    name: string;
    status: string;
    availability: string;
    statusReason: string | null;
    /** What this person signed up to do. Both, for almost everybody on a small
     *  island — which is why they are two booleans and not one enum. */
    canDeliver?: boolean;
    canRunErrands?: boolean;
  };
  limits?: { maxActive: number };
  today?: { completed: number; earned: number };
  metrics?: {
    completed: number;
    accepted: number;
    offers: number;
    cancellations: number;
    onTime: number;
  };
  active?: Active[];
  offers?: Offer[];
  // A boolean only. The key itself is never returned by any endpoint.
  /** M136 — Deliver Anything jobs this driver may name a price on. A board,
   *  not a dispatch queue: no price is set and the customer chooses. */
  openRequests?: OpenRequest[];
};

// The single next step for each state. Keeping this as data rather than a
// chain of ifs is what guarantees there is never more than one.
const NEXT: Record<string, { to: string; label: string } | undefined> = {
  assigned: { to: "going_to_pickup", label: "Start — going to pick up" },
  going_to_pickup: {
    to: "arrived_at_pickup",
    label: "I've arrived at the shop",
  },
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
const STEPS = [
  "assigned",
  "going_to_pickup",
  "arrived_at_pickup",
  "picked_up",
  "out_for_delivery",
  "arrived",
];
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
      <div
        className="flex items-center gap-1"
        role="img"
        aria-label={`Step ${at + 1} of ${STEPS.length}: ${STEP_LABEL[status] ?? status}`}
      >
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

/**
 * The console, for both kinds of provider.
 *
 * `only="errand"` is what /errands renders. It is the SAME dashboard rather
 * than a second one, and that is deliberate: quoting, accepting, the handover
 * PIN, the money and the ratings are one machine, and a parallel copy for
 * errand runners would be a second place for every one of those to drift. What
 * an errand runner gets that is genuinely theirs is the route, the framing and
 * this filter — not a reimplementation of the parts that must never differ.
 */
export default function DriverDashboard({ only }: { only?: "errand" } = {}) {
  const [dash, setDash] = useState<Dash | null>(null);
  const [loading, setLoading] = useState(true);
  // ── Where a push notification tap should LAND ─────────────────────────────
  // The pushes carry /driver?delivery=<id> (an offer or a job that is theirs)
  // or /driver?request=<id> (a Deliver Anything job to price). Once the first
  // load has painted the cards, the one the tap was about is scrolled into
  // view and pulsed — a driver one-handed on a scooter should never have to
  // hunt the board for the job their lock screen just named. Once only, per
  // page load: the ref stops the poll cycle from re-scrolling under their
  // thumb while they work.
  const searchParams = useSearchParams();
  const focusDelivery = searchParams.get("delivery");
  const focusRequest = searchParams.get("request");
  const focusDone = useRef(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Did the CURRENT message come from something the driver did? If so the
   *  twenty-second poll must not wipe it before they have read it. */
  const errorFromAction = useRef(false);
  const [pin, setPin] = useState<Record<string, string>>({});
  const [excuseFor, setExcuseFor] = useState<string | null>(null);
  const [reason, setReason] = useState("vehicle");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/driver", { cache: "no-store" });
      // ── A NON-JSON REPLY USED TO UNAPPROVE THE DRIVER ──────────────────
      // res.json() had no .catch, unlike act() below which has exactly this
      // guard. An edge 502, a captive-portal page, a carrier interception —
      // any of them rejected here, `dash` stayed null, and loading still
      // cleared. The render then read `dash?.driver?.status` as undefined and
      // told an APPROVED driver, mid-shift:
      //
      //     Account undefined
      //     We'll message you as soon as it's checked.
      //     You can't take deliveries yet.
      //
      // No jobs, no button, no sign-in link, and the word "undefined" in the
      // sentence. A bad first byte on 3G is routine.
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (body as { error?: string } | null)?.error || "Could not load.",
        );
      }
      // A 200 that is not the dashboard is not a dashboard. Keeping the last
      // good state beats replacing a working screen with a wrong one.
      if (!body || typeof body !== "object") {
        throw new Error("Could not load.");
      }
      setDash(body as Dash);
      // ── ONLY CLEAR WHAT THIS FUNCTION SAID ─────────────────────────────
      // This cleared EVERY message, and usePolling runs it every twenty
      // seconds regardless of what the driver just did. So RR086, a 429, the
      // offline notice — all of them vanished inside twenty seconds whether or
      // not anyone read them. A driver who glances up from the road sees a
      // normal screen and no explanation of why their tap did nothing.
      //
      // An action's message now stays until the driver takes another action.
      if (!errorFromAction.current) setError(null);
    } catch (e) {
      // Same rule as act(): a driver refreshing on 3G must not be shown
      // "Load failed", which is Safari's words for "no signal" and reads like
      // the app is broken.
      setError(isNetworkFailure(e) ? OFFLINE_MESSAGE : messageFor(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Offers expire, so a stale screen shows work that is already gone. 20s is
  // frequent enough to feel live without draining a battery all afternoon — and
  // it stops entirely while the driver has the app in the background.
  usePolling(load, 20_000);

  // Bring the notification's card into view once the first load has painted
  // it. The small delay lets the cards mount; a card that never appears (the
  // job was taken, the offer expired) simply scrolls nowhere — the dashboard
  // itself already explains an empty board better than an error could.
  useEffect(() => {
    if (loading || focusDone.current) return;
    const targetId = focusDelivery
      ? `delivery-${focusDelivery}`
      : focusRequest
        ? `request-${focusRequest}`
        : null;
    if (!targetId) return;
    focusDone.current = true;
    const t = window.setTimeout(() => {
      const el = document.getElementById(targetId);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("rr-notify-focus");
      window.setTimeout(() => el.classList.remove("rr-notify-focus"), 5000);
    }, 300);
    return () => window.clearTimeout(t);
  }, [loading, focusDelivery, focusRequest]);

  async function act(key: string, payload: Record<string, unknown>) {
    if (busy) return; // one action at a time, always
    setBusy(key);
    // A new action supersedes the last one's message, and hands the flag back
    // to load() until something goes wrong again.
    errorFromAction.current = false;
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
      if (body.ok === false && body.message) {
        errorFromAction.current = true;
        setError(body.message);
      }
      await load();
      return body;
    } catch (e) {
      // ── WHAT A DRIVER ON A BAD SIGNAL ACTUALLY SEES ────────────────────
      // A failed fetch is a TypeError whose message is the browser's own:
      // "Load failed" on Safari, "Failed to fetch" on Chrome, "NetworkError
      // when attempting to fetch resource" on Firefox. Those went straight to
      // the screen — three different English strings, none of which tells
      // somebody standing at a roadside on 3G that their tap did not leave the
      // phone, and none of which says whether the step happened.
      //
      // The distinction that matters is exactly that: a REQUEST THAT NEVER
      // ARRIVED is safe to repeat, and a driver who does not know that either
      // gives up or taps again and fears they have broken something.
      errorFromAction.current = true;
      setError(isNetworkFailure(e) ? OFFLINE_MESSAGE : messageFor(e));
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
        <h2 className="mt-3 font-syne text-xl font-bold">
          Become a delivery partner
        </h2>
        <p className="mx-auto mt-2 max-w-sm font-dm text-sm text-muted">
          Deliver orders around Rodrigues on your own schedule. Free to join.
        </p>
        <a
          href="/driver/apply"
          className="mt-5 inline-block rounded-full bg-yellow px-6 py-3 font-syne text-sm font-bold text-dark"
        >
          Apply now
        </a>
      </div>
    );
  }

  const d = dash?.driver;
  const approved = d?.status === "approved";
  // The same split for work already accepted: an errand runner's console
  // should not show a parcel job they took last week, and a driver's should
  // not lose it.
  const allActive = dash?.active ?? [];
  // /errands narrows; /driver deliberately does not. Somebody approved for
  // both should still find ALL of their work on the driver console rather than
  // having to remember which screen a job came in on.
  const active = only === "errand"
    ? allActive.filter((a) => a.requestKind === "errand")
    : allActive;
  const offers = dash?.offers ?? [];
  const allOpen = dash?.openRequests ?? [];
  // Belt and braces. driver_open_requests already refuses to return work this
  // person did not sign up for, and offer_delivery_quote refuses to price it —
  // this only decides which of THEIR OWN jobs each console shows, so somebody
  // approved for both is not handed a parcel run on the errands screen.
  const openRequests = only === "errand"
    ? allOpen.filter((r) => r.kind === "errand")
    : allOpen;
  // One source of truth, mirroring dispatch_candidates. `availability` alone
  // cannot answer this: 'busy' means "on duty, holding a job", and whether that
  // driver can take another is a COUNT against the owner's limit, not a value
  // of the column. Reading it as a two-state flag is what let this screen show
  // a green dot to a driver dispatch could not see (M116).
  const duty = driverDutyState(
    d?.availability,
    active.length,
    dash?.limits?.maxActive,
  );
  const online = duty.onDuty;

  return (
    <div className="space-y-4">
      {/* Status — the first thing a driver checks, so it is the first thing here. */}
      <div className="rounded-2xl border border-white/10 bg-dark-card p-4">
        {!approved ? (
          <div className="flex items-start gap-2">
            <Clock size={18} className="mt-0.5 shrink-0 text-orange-300" />
            <div>
              <p className="font-syne text-sm font-bold text-orange-300">
                {d?.status === "pending"
                  ? "Application under review"
                  : `Account ${d?.status}`}
              </p>
              <p className="mt-1 font-dm text-xs text-muted">
                {d?.statusReason ??
                  "We'll message you as soon as it's checked. You can't take deliveries yet."}
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 font-syne text-base font-bold">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      duty.tone === "off"
                        ? "bg-white/30"
                        : duty.tone === "full"
                          ? "bg-orange-300"
                          : "bg-green-400"
                    }`}
                  />
                  {duty.label}
                </p>
                <p className="mt-0.5 font-dm text-xs text-muted">{d?.name}</p>
              </div>
              <button
                onClick={() =>
                  void act("online", { action: "online", online: !online })
                }
                disabled={busy !== null}
                aria-pressed={online}
                className={`min-h-[44px] rounded-full px-5 font-syne text-sm font-bold transition-colors disabled:opacity-50 ${
                  online
                    ? "border border-white/20 text-offwhite"
                    : "bg-yellow text-dark"
                }`}
              >
                {busy === "online" ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  duty.toggleLabel
                )}
              </button>
            </div>
            {/* Said plainly in EVERY state. The two questions a driver has are
                "am I getting work?" and "what happens to what I'm holding?" —
                and this line used to appear only when they went offline still
                carrying something, so a driver at their limit was told nothing
                at all. */}
            <p
              className={`mt-3 font-dm text-xs ${duty.tone === "good" ? "text-muted" : "text-orange-300"}`}
            >
              {duty.detail}
            </p>
          </>
        )}
      </div>

      {/* Shown to any driver, not just approved ones. A PENDING driver is
          exactly who needs alerts on: the first thing they are waiting for is
          the message saying they were approved. Gating this behind `approved`
          meant they could not subscribe until after the notification they
          wanted had already been sent. */}
      <AlertsToggle />
      {/* WhatsApp alerts used to be configured HERE, by the driver: message
          CallMeBot, wait for a key, paste it in. Moved to /admin/people, where
          the owner who already onboards these drivers can switch it on for
          them. The alerts themselves are unchanged — same table, same sender —
          only who sets them up. */}

      {approved && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/10 bg-dark-card p-4">
            <p className="font-bebas text-[10px] tracking-[0.25em] text-yellow">
              TODAY
            </p>
            <p className="mt-1 font-syne text-2xl font-extrabold">
              {dash?.today?.completed ?? 0}
            </p>
            <p className="font-dm text-xs text-muted">delivered</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-dark-card p-4">
            <p className="font-bebas text-[10px] tracking-[0.25em] text-yellow">
              EARNED TODAY
            </p>
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

          A driver holding two deliveries is in one place, and the position
          belongs to whichever they are actually doing. THE SERVER DECIDES
          WHICH — this list is ordered oldest-first and the tracking context
          takes the newest, so the old `active[0]` guess disagreed with it and
          the driver went dark for both customers. */}
      {approved && (
        <DeliveryTracking
          online={online}
          // ALL of them, not active[0]. The server picks which one is being
          // tracked — see the note on the `jobs` prop. Sending it the first
          // of the list meant a driver holding two deliveries broadcast for
          // neither.
          jobs={allActive.map((a) => ({ id: a.id, status: a.status }))}
          driverId={dash?.driver?.id ?? null}
        />
      )}

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-500/25 bg-red-500/[0.07] px-4 py-3 font-dm text-sm text-red-400"
        >
          {error}
        </p>
      )}

      {/* Active work comes BEFORE new offers: finishing what you hold beats
          taking more, and it is what the driver opened the app for. */}
      {active.map((a) => {
        const next = NEXT[a.status];
        const atDoor =
          a.status === "arrived" || a.status === "out_for_delivery";
        // Which end of the job this is — the shop, or the customer's door.
        // Shared with the deadline strip below and with Navigate, because
        // those three disagreeing is exactly the confusion being fixed.
        const leg = legFor(a.status);
        // The exact condition advance_delivery() refuses on, so the button
        // can say so instead of throwing RR087 after the tap. Kept in
        // lib/delivery/payment-state.ts with a test naming the SQL it mirrors,
        // because a screen that disagrees with the gate is worse than no
        // screen at all.
        const waitingOnPayment = !canStartDelivery(a);
        return (
          <div
            key={a.id}
            // Anchor for the ?delivery= deep link a push notification carries.
            id={`delivery-${a.id}`}
            className="rounded-2xl border border-yellow/30 bg-yellow/[0.05] p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bebas text-[10px] tracking-[0.25em] text-yellow">
                  {a.orderNumber}
                </p>
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
                leg === "pickup" ? a.pickupDueAt : a.deliveryDueAt,
              );
              if (!due) return null;
              return (
                <p
                  className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-dm text-xs ${
                    due.late
                      ? "bg-red-500/15 text-red-300"
                      : "bg-white/[0.06] text-muted"
                  }`}
                >
                  <Clock size={12} />
                  {leg === "pickup" ? "Pickup" : "Delivery"} {due.text}
                </p>
              );
            })()}

            <Progress status={a.status} />

            {/* ── THE TWO ENDS, SAID AS SUCH ────────────────────────────────
                These were two grey lines with two different icons and no
                words: one the collection address, one the delivery note. A
                driver had to know which was which from a Package glyph. On
                the leg where it matters most — before collection — the app
                was showing them the customer's instructions with equal
                weight and no label. */}
            <div className="mt-3 space-y-1.5 font-dm text-sm">
              {a.storeAddress && (
                <p className="flex items-start gap-2 text-muted">
                  <Package size={14} className="mt-0.5 shrink-0 text-yellow" />
                  <span>
                    <span className="text-white/40">Collect from </span>
                    <span className={leg === "pickup" ? "text-offwhite" : ""}>
                      {a.storeAddress}
                    </span>
                  </span>
                </p>
              )}
              {/* Collection instructions, and only while collecting: "ask for
                  Marie round the back" is noise once the package is in the
                  bag. */}
              {leg === "pickup" && a.pickupNote && (
                <p className="flex items-start gap-2 text-offwhite">
                  <FileText size={14} className="mt-0.5 shrink-0 text-yellow" />
                  {a.pickupNote}
                </p>
              )}
              {a.dropoffNote && (
                <p className="flex items-start gap-2 text-muted">
                  <MapPin size={14} className="mt-0.5 shrink-0 text-yellow" />
                  <span>
                    <span className="text-white/40">Deliver to </span>
                    <span className={leg === "dropoff" ? "text-offwhite" : ""}>
                      {a.dropoffNote}
                    </span>
                  </span>
                </p>
              )}
            </div>

            {/* M152 — WHEN the customer needs it. Until this landed a driver
                could only find out by ringing them. */}
            {a.windowStart && (
              <p className="mt-3 flex items-center gap-2 font-dm text-sm text-offwhite">
                <Clock size={14} className="shrink-0 text-yellow" aria-hidden />
                <span className="text-muted">Needed</span>{" "}
                {formatWindow(
                  a.windowStart,
                  a.windowEnd ?? null,
                  a.scheduleKind ?? null,
                  a.timeSlot ?? null,
                  "en",
                )}
              </p>
            )}

            {/* ── HOW THIS ONE IS BEING PAID ───────────────────────────────
                Three states, and the driver must never have to guess which.
                Getting this wrong costs somebody real money in one direction
                or holds up a job in the other, so each says the amount or the
                blocker in words rather than as a status. */}
            <PaymentState delivery={a} />

            {/* A CUSTOMER'S CAR. The only job here where the thing being moved
                is worth more than everything else on the platform, and the only
                one that cannot be recorded without a photograph. Shown on the
                job card rather than behind a tap: the driver is standing at the
                car when they need it. */}
            {a.errandKind === "vehicle" && (
              <VehicleHandover
                requestId={a.requestId ?? ""}
                plate={a.vehiclePlate ?? null}
                next={a.nextHandover ?? null}
                onDone={() => void load()}
              />
            )}

            {/* Calling and navigating are the two things a driver reaches for
                mid-job; they are links, not buried in a menu. */}
            <div className="mt-3 flex flex-wrap gap-2">
              {/* ── NAVIGATE TO THE END YOU ARE ACTUALLY GOING TO ─────────
                  This pointed at the DROP-OFF on every leg of every job. A
                  driver on `assigned` — who has not collected anything yet —
                  tapped Navigate and was routed to the customer's house.

                  It also used /maps/search/, which drops a pin rather than
                  starting guidance: two more taps on a screen they are trying
                  not to look at. Both fixed here; the label now names the
                  destination, so it is checkable at a glance instead of
                  trusted. */}
              {/* ── BOTH ENDS, ALWAYS ────────────────────────────────────
                  One button whose destination swapped with the stage still
                  decides FOR the driver. A driver on `going_to_pickup` who
                  wants to see how far the customer is before choosing the
                  order to run two jobs in had no way to look, and one who
                  left something at the shop after collecting was offered no
                  route back to it.

                  So both are offered and the STAGE decides which is
                  EMPHASISED, not which exists. The gold one is still the one
                  obvious next action.

                  A leg with no coordinates falls back to a map search on the
                  place name -- the owner's "kot pive" -- labelled as a search
                  rather than passed off as a pin. */}
              {([
                ["pickup", legTarget(a.pickupLat, a.pickupLng, a.storeAddress), "Pickup"],
                ["dropoff", legTarget(a.dropoffLat, a.dropoffLng, a.dropoffNote), "Drop-off"],
              ] as const).map(([which, target, name]) =>
                target ? (
                  <a
                    key={which}
                    href={target.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={target.precise ? undefined : target.label}
                    className={
                      leg === which
                        ? "inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-yellow px-4 font-dm text-sm font-bold text-dark"
                        : "inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-white/20 px-4 font-dm text-sm text-offwhite"
                    }
                  >
                    <Navigation
                      size={14}
                      className={leg === which ? "" : "text-yellow"}
                    />
                    {name}
                    {/* Never let an approximate result look exact: a driver
                        who trusts a name search as a pin ends up in the wrong
                        village and blames the app. */}
                    {!target.precise && (
                      <span className="opacity-60">~</span>
                    )}
                  </a>
                ) : null,
              )}
              {/* Where they will be sent NEXT, while they still have a choice
                  about the order they do things in. Quiet on purpose — it is
                  information, not the next action. */}
              {leg === "pickup" &&
                isPoint(a.pickupLat, a.pickupLng) &&
                isPoint(a.dropoffLat, a.dropoffLng) && (
                  <a
                    href={routeUrl(
                      { lat: a.pickupLat as number, lng: a.pickupLng as number },
                      { lat: a.dropoffLat as number, lng: a.dropoffLng as number },
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-white/20 px-4 font-dm text-sm text-muted"
                  >
                    <MapPin size={14} /> Whole route
                  </a>
                )}
              {a.customerPhone && atDoor && (
                <a
                  href={`tel:${a.customerPhone.replace(/\s+/g, "")}`}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-white/20 px-4 font-dm text-sm"
                >
                  <Phone size={14} /> Call customer
                </a>
              )}
              {a.storePhone && !atDoor && (
                <a
                  href={`tel:${a.storePhone.replace(/\s+/g, "")}`}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-white/20 px-4 font-dm text-sm"
                >
                  <Phone size={14} /> Call shop
                </a>
              )}
            </div>

            {/* THE one next action.
                M157: held shut while a bank transfer has no receipt on it. The
                gate itself lives in advance_delivery() and always did — what
                was missing was any way to know BEFORE tapping. A driver got
                RR087 and an error toast with no idea what to do about it. */}
            {next && (
              <>
                <Button
                  className="mt-4 min-h-[52px] w-full text-base"
                  disabled={busy !== null || waitingOnPayment}
                  onClick={() =>
                    void act(`adv-${a.id}`, {
                      action: "advance",
                      deliveryId: a.id,
                      to: next.to,
                    })
                  }
                >
                  {busy === `adv-${a.id}` ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : waitingOnPayment ? (
                    "Waiting for payment"
                  ) : (
                    next.label
                  )}
                </Button>
                {waitingOnPayment && (
                  <p className="mt-2 text-center font-dm text-xs text-muted">
                    {waitingOn(a) === "id"
                      ? "You will be able to start the moment their ID arrives."
                      : "You will be able to start the moment their receipt arrives."}
                  </p>
                )}
              </>
            )}

            {/* At the door the next action is the PIN, and nothing else. */}
            {a.status === "arrived" && (
              <div className="mt-4 rounded-xl border border-white/12 bg-dark p-3">
                <label
                  htmlFor={`pin-${a.id}`}
                  className="block font-dm text-xs text-muted"
                >
                  Ask {a.customerName ?? "the customer"} for their 4-digit code
                </label>
                <div className="mt-2 flex gap-2">
                  <input
                    id={`pin-${a.id}`}
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={4}
                    value={pin[a.id] ?? ""}
                    onChange={(e) =>
                      setPin({
                        ...pin,
                        [a.id]: e.target.value.replace(/\D/g, "").slice(0, 4),
                      })
                    }
                    placeholder="0000"
                    className="w-28 rounded-xl border border-dark-border bg-dark-card px-3 py-3 text-center font-syne text-2xl font-bold tracking-[0.3em] text-offwhite placeholder:text-muted/40 focus:border-yellow focus:outline-none"
                  />
                  <Button
                    className="min-h-[52px] flex-1 text-base"
                    disabled={busy !== null || (pin[a.id] ?? "").length !== 4}
                    onClick={() =>
                      void act(`pin-${a.id}`, {
                        action: "complete",
                        deliveryId: a.id,
                        pin: pin[a.id],
                      })
                    }
                  >
                    {busy === `pin-${a.id}` ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      "Complete delivery"
                    )}
                  </Button>
                </div>
                {a.pinAttempts > 0 && (
                  <p className="mt-2 font-dm text-xs text-orange-300">
                    {5 - a.pinAttempts} tries left before this has to be
                    finished by the office.
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
                  {REASONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
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
                    variant="outline"
                    className="min-h-[44px] flex-1"
                    onClick={() => {
                      setExcuseFor(null);
                      setNote("");
                    }}
                  >
                    Keep it
                  </Button>
                  <button
                    disabled={
                      busy !== null || (reason === "other" && !note.trim())
                    }
                    onClick={async () => {
                      const r = await act(`cx-${a.id}`, {
                        action: "cannot_complete",
                        deliveryId: a.id,
                        reason,
                        note: note.trim() || undefined,
                      });
                      setExcuseFor(null);
                      setNote("");
                      if (r?.afterPickup) {
                        setError(
                          "Thanks — because you already have the package, the office will contact you to arrange the handover. Please keep it safe.",
                        );
                      }
                    }}
                    className="min-h-[44px] flex-1 rounded-xl bg-red-500 px-4 font-syne text-sm font-bold text-white disabled:opacity-40"
                  >
                    {busy === `cx-${a.id}` ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      "Confirm"
                    )}
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

      {/* Offers. Gated on `offerable`, not `online`: a driver at their limit is
          still online, and showing them an empty "nothing available" panel
          promises a job the capacity gate will refuse. */}
      {approved &&
        duty.offerable &&
        (offers.length > 0 ? (
          <div className="space-y-3">
            <h2 className="font-syne text-lg font-bold">Available now</h2>
            {offers.map((o) => (
              <div
                key={o.id}
                // Same anchor family as the active card: an offer and a job
                // are the same delivery id at different moments, and the push
                // does not know which moment the tap will arrive in.
                id={`delivery-${o.id}`}
                className="rounded-2xl border border-white/10 bg-dark-card p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-syne text-base font-bold">
                      {o.storeName}
                    </p>
                    {o.storeAddress && (
                      <p className="font-dm text-xs text-muted">
                        {o.storeAddress}
                      </p>
                    )}
                    {/* An offer is a countdown, and "is that pickup near me"
                        is most of the decision. Opens in a new tab on purpose:
                        the offer must still be here when they come back. */}
                    {isPoint(o.pickupLat, o.pickupLng) && (
                      <a
                        href={navigateUrl(
                          o.pickupLat as number,
                          o.pickupLng as number,
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 font-dm text-xs text-muted underline-offset-4 hover:text-yellow hover:underline"
                      >
                        <Navigation size={11} /> Where is this?
                      </a>
                    )}
                    {o.dropoffNote && (
                      <p className="mt-1 flex items-start gap-1.5 font-dm text-xs text-muted">
                        <MapPin size={12} className="mt-0.5 shrink-0" />{" "}
                        {o.dropoffNote}
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
                        left.late
                          ? "bg-red-500/15 text-red-300"
                          : "bg-yellow/15 text-yellow"
                      }`}
                    >
                      <Clock size={12} />{" "}
                      {left.late ? "Expiring now" : left.text}
                    </p>
                  );
                })()}
                <Button
                  className="mt-3 min-h-[52px] w-full text-base"
                  disabled={busy !== null}
                  onClick={() =>
                    void act(`acc-${o.id}`, {
                      action: "accept",
                      deliveryId: o.id,
                    })
                  }
                >
                  {busy === `acc-${o.id}` ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    "Accept delivery"
                  )}
                </Button>
              </div>
            ))}
          </div>
        ) : active.length === 0 && openRequests.length === 0 ? (
          // ── IT HAS TO LOOK AT THE BOARD BELOW IT ────────────────────────
          // This branched on `offers` and `active` only, while the quote board
          // renders as the very next sibling from a SECOND rpc
          // (driver_open_requests). Dispatch offers are rare here — Deliver
          // Anything is a reverse auction, so nearly all work arrives on the
          // board — which made "Nothing available right now" the ordinary
          // state of a screen with jobs printed underneath it. The owner
          // reported exactly that, naming a job ("f44") he could see below the
          // card telling him there was none.
          //
          // An empty state is a claim about the WHOLE SCREEN, so it has to be
          // computed from everything the screen can show.
          <div className="rounded-2xl border border-white/10 bg-dark-card p-6 text-center">
            <CheckCircle2 size={24} className="mx-auto text-muted" />
            <p className="mt-2 font-syne text-sm font-bold">
              Nothing available right now
            </p>
            {/* Not hardcoded any more: this panel used to promise a job was
                coming to a driver dispatch could not reach. */}
            <p className="mt-1 font-dm text-xs text-muted">{duty.detail}</p>
          </div>
        ) : active.length === 0 && openRequests.length > 0 ? (
          // ── AND SILENCE IS NOT THE FIX EITHER ────────────────────────────
          // Correcting the condition above stops the screen LYING, but it
          // leaves this slot blank — and the board it is pointing at starts
          // below the fold on a phone. A driver who opens the app to nothing
          // where the news used to be has no reason to keep scrolling.
          //
          // So the same space that used to say "no work" now says how much
          // there is and takes them to it. One tap, not a scroll and a hope.
          <a
            href="#quote-board"
            className="flex items-center justify-between gap-3 rounded-2xl border border-yellow/40 bg-yellow/[0.07] p-4"
          >
            <span className="min-w-0">
              <span className="block font-syne text-sm font-bold text-offwhite">
                {openRequests.length === 1
                  ? "1 job open for quotes"
                  : `${openRequests.length} jobs open for quotes`}
              </span>
              <span className="mt-0.5 block font-dm text-xs text-muted">
                No direct offer for you yet — name your price below.
              </span>
            </span>
            <ArrowDown size={18} className="shrink-0 text-yellow" />
          </a>
        ) : null)}

      {/* The quote board. Gated on `online` rather than `duty.offerable`: a
          driver already holding their maximum active deliveries can still name
          a price on a job for later, because quoting commits them to nothing —
          the capacity gate applies when the CUSTOMER accepts, not now. */}
      {/* Shown while OFFLINE too when the board has rows: driver_open_requests
          returns an off-duty driver only the requests they have a live quote
          on, precisely so they can withdraw it. Hiding the board there left
          those prices standing and bookable with no way to pull them. */}
      {approved && (online || openRequests.length > 0) && (
        <div id="quote-board" className="scroll-mt-24">
        <QuoteBoard
          requests={openRequests}
          busy={busy}
          onQuote={async (requestId, fee, note) => {
            // act() returns the body on success and undefined when it caught an
            // error, so this is the board's signal to keep the editor open and
            // the driver's typed price with it.
            const out = await act(`quote-${requestId}`, {
              action: "quote",
              requestId,
              fee,
              note: note || undefined,
            });
            return out !== undefined;
          }}
          onWithdraw={async (quoteId) => {
            await act(`withdraw-${quoteId}`, {
              action: "withdraw_quote",
              quoteId,
            });
          }}
        />
        </div>
      )}

      {approved && !online && active.length === 0 && (
        <div className="rounded-2xl border border-white/10 bg-dark-card p-6 text-center">
          <XCircle size={24} className="mx-auto text-muted" />
          <p className="mt-2 font-syne text-sm font-bold">
            You&apos;re offline
          </p>
          <p className="mt-1 font-dm text-xs text-muted">
            Go online to start receiving deliveries.
          </p>
        </div>
      )}

      {/* Last, and collapsed. It is the only thing on this screen that is not
          about right now, so it must never push the live work down — and it
          loads nothing until somebody opens it. */}
      {approved && <DeliveryLog only={only} />}
    </div>
  );
}

/**
 * How this job is being paid, on the card the driver works from.
 *
 * ── THREE STATES, AND NEVER A GUESS ───────────────────────────────────────
 * Getting this wrong costs somebody real money in one direction and holds up a
 * job in the other, so each state names the amount or the blocker in words.
 *
 *   CASH             — collect it at the door. Loud, in red, in money.
 *   TRANSFER, unpaid — the job is held; say so before they tap Start.
 *   TRANSFER, paid   — say it is settled, so nobody asks for it twice.
 *
 * ── THE SHOPPING-RUN SENTENCE ─────────────────────────────────────────────
 * On a "buy & deliver" job the driver puts their own money across the counter
 * and is repaid at the door. Nothing in this system knows the real till total —
 * `spendCap` is a CAP the customer set, not an amount — so the card says "plus
 * what you spent, up to Rs X" rather than printing the cap as though it were a
 * figure to collect. A cap shown as an amount is the same double-charge bug
 * pointing the other way.
 */
function PaymentState({ delivery: a }: { delivery: Active }) {
  const [busy, setBusy] = useState(false);
  // Its own error state rather than the page's: this component sits inside a
  // map over the active jobs, so a failure belongs on the card it happened on
  // and not at the top of a screen that may be showing two.
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState(false);
  // "Did this driver spend their own money?" — which an errand does too. As a
  // shop-only test, a driver who paid a Rs 2,000 bill was told to collect their
  // fee and nothing else.
  const shopping = mayLayOutMoney(toRequestKind(a.requestKind), a.spendCap);

  // Two minutes, not five: an ID is meant to be opened where the customer is
  // standing, not saved. See /api/driver/id-document.
  async function openId() {
    if (busyId) return;
    setBusyId(true);
    try {
      setError(null);
      const res = await fetch(`/api/driver/id-document/${a.id}`);
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        setError(json.error ?? "Could not open it.");
        return;
      }
      openSigned(json.url, setError);
    } catch {
      setError("Could not open it. Check your connection.");
    } finally {
      setBusyId(false);
    }
  }
  const cap =
    shopping && a.spendCap
      ? `, up to Rs ${centsToDecimalString(a.spendCap)}`
      : "";
  const plusTill = shopping ? ` Plus whatever you paid at the shop${cap}.` : "";

  async function openReceipt() {
    if (busy) return;
    setBusy(true);
    try {
      setError(null);
      const res = await fetch(`/api/driver/payment-proof/${a.id}`);
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        setError(json.error ?? "Could not open the receipt.");
        return;
      }
      // A five-minute signed URL. Opened, never stored.
      openSigned(json.url, setError);
    } catch {
      setError("Could not open the receipt. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  const state = paymentCardState(a);

  // ── Cash ────────────────────────────────────────────────────────────────
  if (state === "cash") {
    return (
      <div className="mt-3 rounded-xl border border-red-400/40 bg-red-500/[0.09] px-3 py-2">
        <p className="flex items-start gap-2 font-syne text-sm font-bold text-red-300">
          <Banknote size={15} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            Collect Rs {centsToDecimalString(a.collectCash!)} in cash at the
            door.
            {plusTill}
          </span>
        </p>
        {/* M158. The card is checked WITH the PIN, at the door, on the same
            row as the amount — that is the one moment it means anything, and
            the only window in which it is readable at all. */}
        {a.paymentMethod === "cash" && (
          <p className="mt-2 flex items-start gap-2 border-t border-red-400/25 pt-2 font-dm text-xs text-muted">
            <IdCard size={14} className="mt-0.5 shrink-0" aria-hidden />
            <span className="flex-1">
              {a.idDocumentAt
                ? "Check their ID against the name on this job, together with the 4-digit code."
                : "Waiting for their ID. You cannot start until it arrives."}
            </span>
          </p>
        )}
        {a.hasIdDocument && (
          <button
            type="button"
            onClick={() => void openId()}
            disabled={busyId}
            className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-full border border-white/20 px-4 font-dm text-sm text-offwhite disabled:opacity-50"
          >
            {busyId ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <IdCard size={14} aria-hidden />
            )}
            View ID
          </button>
        )}
        {error && (
          <p role="alert" className="mt-2 font-dm text-xs text-red-300">
            {error}
          </p>
        )}
      </div>
    );
  }

  if (state === "none") return null;

  // ── Transfer, still waiting ─────────────────────────────────────────────
  if (state === "awaiting") {
    return (
      <p className="mt-3 flex items-start gap-2 rounded-xl border border-yellow/45 bg-yellow/[0.08] px-3 py-2 font-dm text-sm text-offwhite">
        <Clock size={15} className="mt-0.5 shrink-0 text-yellow" aria-hidden />
        <span>
          <strong className="font-syne">
            Waiting for their transfer receipt.
          </strong>{" "}
          Do not set off yet — you will be able to start as soon as it arrives.
        </span>
      </p>
    );
  }

  // ── Transfer, settled ───────────────────────────────────────────────────
  return (
    <div className="mt-3 rounded-xl border border-emerald-500/35 bg-emerald-500/[0.08] px-3 py-2">
      <p className="flex items-start gap-2 font-dm text-sm text-offwhite">
        <Landmark
          size={15}
          className="mt-0.5 shrink-0 text-emerald-300"
          aria-hidden
        />
        <span>
          <strong className="font-syne">Paid by bank transfer.</strong> Nothing
          to collect for the delivery.{plusTill}
          {a.paymentReference && (
            <span className="mt-0.5 block text-xs text-muted">
              Reference {a.paymentReference}
            </span>
          )}
        </span>
      </p>
      {a.hasProof && (
        <button
          type="button"
          onClick={() => void openReceipt()}
          disabled={busy}
          className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-full border border-white/20 px-4 font-dm text-sm text-offwhite disabled:opacity-50"
        >
          {busy ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <FileText size={14} aria-hidden />
          )}
          View receipt
        </button>
      )}
      {error && (
        <p role="alert" className="mt-2 font-dm text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
