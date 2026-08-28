"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2,
  Package,
  ShoppingBasket,
  MapPin,
  Check,
  X,
  Phone,
  Star,
  Bike,
  Car,
  Truck,
  ShieldCheck,
  Clock,
  Banknote,
  Landmark,
  UploadCloud,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import OrderAlerts from "@/components/orders/OrderAlerts";
import LiveTripView from "@/components/tracking/LiveTripView";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";
import {
  requestStatusCopy,
  legCopy,
  legIndex,
  LEG_ORDER,
  sortQuotes,
  quoteBadges,
  BADGE_LABEL,
  formatFee,
  payAtDoor,
  expiresIn,
  TERMINAL_LEGS,
  BROKEN_LEGS,
  PRE_PICKUP_LEGS,
  requestRef,
  type Quote,
} from "@/lib/delivery/request-status";
import { emailFor, saveRequest } from "@/lib/delivery/my-requests";
import { columnsToItem, DELIVER_COPY } from "@/lib/delivery/copy.i18n";
import { writeDraft } from "@/lib/delivery/draft";
import { formatWindow } from "@/lib/delivery/schedule";
import { recipe, transition, travel, type as t } from "@/lib/delivery/tokens";

// ── Where a Deliver Anything job is actually decided ────────────────────────
//
// The screen that did not exist. A customer could post a request and then had
// no route back to it — no quotes, no driver, no way to say "not any more".
// delivery_requests having zero rows was that, not a demand problem.
//
// ── The one idea this screen is built around ───────────────────────────────
// THE NEXT MOVE IS THE CUSTOMER'S. Every other order on this site is committed
// the moment it is placed, so somebody arriving here carries the wrong mental
// model and will sit waiting for a driver nobody sent. So the state is a
// headline rather than a badge, "nobody is on the way until you choose" is
// unconditional, and the primary action is pinned to the bottom of the thumb's
// reach where it cannot scroll away.
//
// ── Polling, not realtime ──────────────────────────────────────────────────
// Quotes arrive minutes apart, over island mobile data, on a screen somebody
// leaves open in a tab. A websocket would cost a connection per idle viewer to
// deliver an event every few minutes; a 20-second poll that STOPS when the tab
// is hidden and stops entirely once the job is booked costs less and cannot
// leak a subscription.
//
// ── In the reader's own language ───────────────────────────────────────────
// This file had no useLanguage call anywhere in it. The form that leads here
// (app/deliver/DeliverForm.tsx) has been trilingual since it was built, so
// somebody chose Kreol at the door, answered five questions in Kreol, and then
// met a wall of English at the one moment they were asked to commit to a price
// — the paying end of the flow was the untranslated end.
//
// Every piece below reads DELIVER_COPY[language] the same way DeliverForm does.
// The sub-components call useLanguage() themselves rather than being handed a
// prop: they are already client components in this file, and threading copy
// through eight signatures would be the change most likely to break something.
// The status words come from lib/delivery/request-status.ts, which now takes a
// `lang` exactly as slotLabel() and urgencyLabel() do in schedule.ts.

type RequestView = {
  id: string;
  kind: string;
  what: string;
  sizeClass: string;
  // Returned by delivery_request_view since M148/M149 and never declared here,
  // so nothing on this screen could read them. Reorder needs all six: without
  // the coordinates a repeat request is a DOWNGRADE of the original, arriving
  // at dispatch with no origin — the exact regression M145 had to fix.
  cargoKind: string | null;
  photoPath: string | null;
  scheduleKind: string | null;
  timeSlot: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
  status: string;
  pickupText: string;
  pickupNote: string | null;
  dropoffText: string;
  dropoffNote: string | null;
  spendCap: number | null;
  /** M155/M156. The most a driver may be asked to settle in cash, in minor
   *  units. Known BEFORE the choice is offered, so cash is never offered and
   *  then refused. */
  cashLimit: number | null;
  contactName: string;
  contactPhone: string;
  createdAt: string;
  expiresAt: string | null;
  cancelReason: string | null;
  quotes: Quote[];
  delivery: {
    id: string;
    status: string;
    fee: number;
    pin: string;
    assignedAt: string | null;
    pickedUpAt: string | null;
    deliveredAt: string | null;
    // The driver who ACTUALLY holds the job right now (M141). Not the same as
    // the driver on the accepted quote: a driver can bail before pickup and a
    // different one can pick the job up, and reading the quote showed the
    // customer a name and a phone number that were no longer anybody's.
    driverId: string | null;
    driverName: string | null;
    driverPhone: string | null;
    vehicleType: string | null;
    /** Minted by the server only once there is a trip row to watch, so its
     *  presence is the honest test for "there is something to plot" — better
     *  than guessing from a status. */
    tripId: string | null;
    channelKey: string | null;
    /** M155. The PATH is deliberately never sent to the browser — the object is
     *  private and the customer already knows what they uploaded. Only whether
     *  it landed, which is what the screen has to say. */
    paymentMethod: string | null;
    paymentProofAt: string | null;
    paymentReference: string | null;
    /** M158. WHETHER the ID landed, never where it is. */
    idDocumentAt: string | null;
  } | null;
};

type PaymentMethod = "cash" | "bank_transfer";

const VEHICLE_ICON: Record<string, typeof Bike> = {
  scooter: Bike,
  motorcycle: Bike,
  bicycle: Bike,
  car: Car,
  van: Truck,
};

const TONE_CLASS = {
  waiting: "bg-white/[0.06] text-[#B0B0B0]",
  action: "bg-yellow text-dark",
  moving: "bg-yellow/15 text-yellow",
  done: "bg-emerald-500/15 text-emerald-300",
  dead: "bg-white/[0.06] text-[#B0B0B0]",
} as const;

export default function RequestTracker({
  id,
  signedIn,
}: {
  id: string;
  signedIn: boolean;
}) {
  const [view, setView] = useState<RequestView | null>(null);
  const [phase, setPhase] = useState<
    "loading" | "ready" | "needsEmail" | "gone" | "error"
  >("loading");
  const [email, setEmail] = useState("");
  const [emailDraft, setEmailDraft] = useState("");
  const [busyQuote, setBusyQuote] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Quote | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [ratingSaved, setRatingSaved] = useState(false);
  const router = useRouter();
  const { language } = useLanguage();
  const c = DELIVER_COPY[language];

  // Kept in a ref as well as state so the poller never closes over a stale one.
  const emailRef = useRef<string>("");

  // ── Ordering ──────────────────────────────────────────────────────────────
  // Responses can land out of order: a 20-second poll fired before the customer
  // tapped Book can arrive AFTER the reload that follows it, on a bad connection
  // or a cold serverless start. Without a sequence guard that stale body wins
  // and the screen reverts from "Your driver is booked" to "Choose a driver" --
  // with the quotes back, inviting them to book a second time.
  const seq = useRef(0);

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      const mine = ++seq.current;
      const stale = () => mine !== seq.current;
      try {
        const res = await fetch(`/api/delivery-requests/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "view",
            email: emailRef.current || undefined,
          }),
        });
        if (stale()) return;
        if (res.status === 404) {
          // A BACKGROUND poll must never tear down a working screen. A 404 on
          // a silent refresh means the request was withdrawn or the row moved
          // under us; the next foreground load will say so properly. Reacting
          // here replaced a fully-rendered booked delivery with an email form.
          if (opts.silent) return;
          // Signed in with nothing stored → this may simply be a request they
          // made as a guest. Ask for the email rather than declaring it gone.
          setPhase(emailRef.current ? "gone" : "needsEmail");
          return;
        }
        const json = (await res.json()) as {
          request?: RequestView;
          error?: string;
        };
        if (stale()) return;
        if (!res.ok || !json.request) {
          // json.error is the SERVER's sentence and stays exactly as it
          // arrived: it is the specific reason, and inventing three
          // translations of a message we did not write would be worse than
          // showing the one we did. Only the fallback is ours to say.
          if (!opts.silent) toast.error(json.error ?? c.tracker.loadFailed);
          // A failed FIRST load has to leave the skeleton. Toasting and
          // returning left the screen pulsing for ever on any non-404 --
          // a 503 while the service key is missing, a 500, an outage --
          // which reads as a broken page rather than a retryable one. A
          // silent poll failure is different: there is already good data
          // on screen and replacing it with an error would be a downgrade.
          if (!opts.silent) setPhase((p) => (p === "ready" ? p : "error"));
          return;
        }
        setView(json.request);
        setPhase("ready");
        // Remember it, so this device gets straight back in next time.
        saveRequest({
          id,
          email: emailRef.current || undefined,
          what: json.request.what,
        });
      } catch {
        if (!opts.silent) {
          toast.error(c.error.network);
          setPhase((p) => (p === "ready" ? p : "error"));
        }
      }
    },
    // `c` is a module constant, one per language, so this identity changes only
    // when somebody presses the language button — at which point re-reading the
    // request is the same call the poll makes every twenty seconds anyway.
    [id, c],
  );

  // First load: use whatever this device already knows.
  //
  // An on-mount setState, and it stays one. localStorage cannot be read during
  // render — the server has no idea what is in it, so the two renders disagree
  // and React discards the tree. This fires once, with an empty dependency
  // list. (The same call, and the same reasoning, as the draft restore in
  // app/deliver/DeliverForm.tsx.)
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const known = emailFor(id);
    if (known) {
      emailRef.current = known;
      setEmail(known);
      void load();
      return;
    }
    // A guest with nothing remembered -- a different phone, cleared storage,
    // a link forwarded to them. Ask BEFORE spending a request that can only
    // 404, so the first thing they see is a question they can answer rather
    // than an error they cannot.
    if (!signedIn) {
      setPhase("needsEmail");
      return;
    }
    void load();
  }, [id, load, signedIn]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ── The poll ──────────────────────────────────────────────────────────────
  // Stops when the tab is hidden and stops for good once the job is settled.
  // A tracking screen left open in a background tab overnight should cost
  // nothing, and once a driver is booked there are no more quotes to wait for.
  const settled =
    phase === "ready" &&
    view != null &&
    (view.status === "cancelled" ||
      view.status === "expired" ||
      (view.status === "accepted" &&
        // Was a hand-written list containing "failed", which is not a label the
        // delivery_status enum has -- so a genuinely failed delivery polled for
        // ever. The list now comes from the same place the copy does.
        (TERMINAL_LEGS as readonly string[]).includes(
          view.delivery?.status ?? "",
        )));

  useEffect(() => {
    if (phase !== "ready" || settled) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      timer = setInterval(() => void load({ silent: true }), 20_000);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        // Catch up immediately on return — twenty seconds of staleness is
        // exactly what somebody is coming back to check.
        void load({ silent: true });
        start();
      } else {
        stop();
      }
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [phase, settled, load]);

  async function act(body: Record<string, unknown>): Promise<boolean> {
    const res = await fetch(`/api/delivery-requests/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, email: emailRef.current || undefined }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok) {
      toast.error(json.error ?? c.error.generic);
      return false;
    }
    return true;
  }

  async function book(quote: Quote, paymentMethod: PaymentMethod) {
    setBusyQuote(quote.id);
    try {
      // expectedFee is the number on the sheet in front of them. The server
      // still reads the real price from the quote row -- the browser never sets
      // one -- but it refuses if the two disagree, so nobody is committed to a
      // price a driver changed while they were reading it.
      const ok = await act({
        action: "accept",
        quoteId: quote.id,
        expectedFee: quote.fee,
        paymentMethod,
      });
      if (ok) {
        setConfirming(null);
        toast.success(c.tracker.booked(quote.driverName));
      } else {
        // Most likely the price moved. Close the sheet and refresh so the new
        // one is on screen rather than leaving them staring at a stale figure.
        setConfirming(null);
      }
      await load();
    } finally {
      setBusyQuote(null);
    }
  }

  async function withdraw() {
    setCancelling(true);
    try {
      if (await act({ action: "cancel" })) {
        toast.success(c.tracker.withdrawn);
        await load();
      }
    } finally {
      setCancelling(false);
    }
  }

  // ── Ask a returning guest which email they used ──────────────────────────
  if (phase === "needsEmail") {
    return (
      <div className={cn(recipe.cardButton, "cursor-default")}>
        <h1 className={cn(t.heading, "text-offwhite")}>
          {c.tracker.emailTitle}
        </h1>
        <p className={cn(t.bodySm, "mt-2 text-[#B0B0B0]")}>
          {c.tracker.emailWhy}
        </p>
        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const v = emailDraft.trim().toLowerCase();
            if (!v) return;
            emailRef.current = v;
            setEmail(v);
            setPhase("loading");
            void load();
          }}
        >
          <input
            type="email"
            autoComplete="email"
            value={emailDraft}
            onChange={(e) => setEmailDraft(e.target.value)}
            placeholder={c.tracker.emailPlaceholder}
            className={recipe.field}
            aria-label={c.find.emailLabel}
          />
          <button type="submit" className={recipe.primaryAction}>
            {c.tracker.emailSubmit}
          </button>
        </form>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className={cn(recipe.cardButton, "cursor-default text-center")}>
        <AlertTriangle size={22} className="mx-auto text-white/40" />
        <h1 className={cn(t.heading, "mt-3 text-offwhite")}>
          {c.tracker.errorTitle}
        </h1>
        <p className={cn(t.bodySm, "mt-2 text-[#B0B0B0]")}>
          {c.tracker.errorBody}
        </p>
        <button
          type="button"
          onClick={() => {
            setPhase("loading");
            void load();
          }}
          className={cn(
            recipe.secondaryAction,
            "mt-5 inline-flex items-center py-2.5",
          )}
        >
          {c.tracker.errorRetry}
        </button>
      </div>
    );
  }

  if (phase === "gone") {
    // Reachable by mistyping an email once. Without a route back it is a dead
    // end for somebody who simply has two addresses and guessed wrong.
    const retryEmail = () => {
      emailRef.current = "";
      setEmail("");
      setEmailDraft("");
      setPhase("needsEmail");
    };
    return (
      <div className={cn(recipe.cardButton, "cursor-default text-center")}>
        <AlertTriangle size={22} className="mx-auto text-white/40" />
        <h1 className={cn(t.heading, "mt-3 text-offwhite")}>
          {c.tracker.goneTitle}
        </h1>
        <p className={cn(t.bodySm, "mt-2 text-[#B0B0B0]")}>
          {c.tracker.goneBody}
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={retryEmail}
            className={cn(recipe.secondaryAction, "py-2.5")}
          >
            {c.tracker.goneOtherEmail}
          </button>
          <Link
            href="/deliver"
            className={cn(
              recipe.secondaryAction,
              "inline-flex items-center py-2.5",
            )}
          >
            {c.tracker.goneBack}
          </Link>
        </div>
        <p className={cn(t.meta, "mt-3 text-[#B0B0B0]")}>
          {c.tracker.goneLost}
        </p>
      </div>
    );
  }

  if (phase === "loading" || !view) return <TrackerSkeleton />;

  const quotes = sortQuotes(view.quotes.filter((q) => q.status === "offered"));
  const badges = quoteBadges(quotes);
  const status = requestStatusCopy(
    {
      status: view.status,
      quoteCount: quotes.length,
      expiresAt: view.expiresAt,
      deliveryStatus: view.delivery?.status,
    },
    language,
  );
  const KindIcon = view.kind === "shop_and_deliver" ? ShoppingBasket : Package;
  // Getting out. Two different acts behind one control:
  //   open      -> withdraw the request. Nobody is committed; costs nothing.
  //   accepted  -> cancel a booked driver, but ONLY before they collect. After
  //                that the database refuses and names who to call instead, so
  //                offering the button there would be a promise the server
  //                breaks.
  const prePickup =
    view.status === "accepted" &&
    (PRE_PICKUP_LEGS as readonly string[]).includes(
      view.delivery?.status ?? "",
    );
  const canWithdraw = view.status === "open" || prePickup;
  const closes = expiresIn(view.expiresAt, language);

  return (
    <div className="flex flex-col gap-6 pb-40">
      {/* ── Spoken, for somebody who cannot see it change ───────────────── */}
      {/* This screen refreshes itself every twenty seconds and rewrites the
          headline in place. Without a live region a screen-reader user is
          never told that a price arrived — the one event the whole surface
          exists to deliver. "polite" rather than "assertive" because a quote
          landing is news, not an emergency, and it should not cut across
          whatever they are reading. */}
      <p aria-live="polite" role="status" className="sr-only">
        {status.headline}. {status.detail}
      </p>

      {/* ── Where this stands ───────────────────────────────────────────── */}
      <header>
        <span
          className={cn(
            t.eyebrow,
            "inline-flex items-center rounded-full px-2.5 py-1",
            TONE_CLASS[status.tone],
          )}
        >
          {status.label}
        </span>
        <h1 className={cn(t.display, "mt-3 text-offwhite")}>
          {status.headline}
        </h1>
        {/* The thread back. A guest gets no email and cannot memorise a uuid,
            so without this on screen the only route to this page is a link they
            still happen to have open. */}
        <p
          className={cn(
            t.meta,
            "mt-2 font-mono tracking-widest text-[#B0B0B0]",
          )}
        >
          {requestRef(view.id)}
        </p>
        <p className={cn(t.body, "mt-2 text-[#B0B0B0]")}>{status.detail}</p>
        {/* ── The alert, exactly where it is worth something ──────────────
            A quote marketplace's whole value arrives MINUTES later. Without
            this the customer had to sit and watch the page poll, and the copy
            around it was careful never to promise a message — because nothing
            sent one. OrderAlerts makes that promise itself, and only once
            permission has actually been granted, so the promise lives where it
            is earned. Shown while the request is still live: after a driver is
            booked the trail is the thing to watch. */}
        {/* `email` is the STATE, not emailRef. The ref exists so the poller
            never closes over a stale value; reading it during render is a
            different thing and a wrong one — a ref changing does not
            re-render, so this prop could hold a value the screen has moved
            past. The state is the same value with the subscription React
            needs. Same below, for the live map's lookup. */}
        {view.status === "open" && status.tone !== "dead" && (
          <OrderAlerts
            requestId={view.id}
            email={email || undefined}
            className="mt-4"
          />
        )}

        {view.status === "open" && closes && (
          <p
            className={cn(
              t.meta,
              "mt-3 inline-flex items-center gap-1.5 text-[#B0B0B0]",
            )}
          >
            <Clock size={13} /> {c.tracker.closesIn(closes)}
          </p>
        )}
      </header>

      {/* ── What was asked for ──────────────────────────────────────────── */}
      <section
        className={cn("rounded-2xl border border-white/10 bg-dark-card p-4")}
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-yellow/12 text-yellow">
            <KindIcon size={17} />
          </span>
          <div className="min-w-0">
            <p className={cn(t.cardTitle, "text-offwhite")}>{view.what}</p>
            {/* The two kinds are named with the FORM's words, not a second
                house translation of the same idea. */}
            <p className={cn(t.meta, "mt-1 text-[#B0B0B0]")}>
              {view.kind === "shop_and_deliver"
                ? c.what.kind.shop.title
                : c.what.kind.package.title}
              {view.sizeClass === "large" && ` · ${c.tracker.largeItem}`}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          {/* WHEN, above where. M152 gave the request a window and this screen
              had no line for it — so a customer who asked for "tomorrow
              afternoon" could not see, anywhere, that we had understood. */}
          {view.windowStart && (
            <p
              className={cn(t.bodySm, "flex items-center gap-2 text-offwhite")}
            >
              <Clock size={15} className="shrink-0 text-yellow" aria-hidden />
              <span>
                {/* The window itself was already language-aware and was being
                    handed a hardcoded "en" by the one screen that renders it
                    for a customer. */}
                <span className="text-[#B0B0B0]">{c.tracker.neededLabel} </span>
                {formatWindow(
                  view.windowStart,
                  view.windowEnd,
                  view.scheduleKind,
                  view.timeSlot,
                  language,
                )}
              </span>
            </p>
          )}
          <Leg
            label={c.tracker.collectFrom}
            place={view.pickupText}
            note={view.pickupNote}
          />
          <Leg
            label={c.tracker.deliverTo}
            place={view.dropoffText}
            note={view.dropoffNote}
          />
        </div>
      </section>

      {/* ── The prices, or the wait ─────────────────────────────────────── */}
      {view.status === "open" && status.tone !== "dead" && (
        <section>
          <h2 className={cn(t.heading, "text-offwhite")}>
            {quotes.length > 0 ? c.tracker.chooseDriver : c.tracker.noPricesYet}
          </h2>
          {quotes.length === 0 ? (
            <WaitingForQuotes />
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              <AnimatePresence initial={false}>
                {quotes.map((q) => (
                  <motion.li
                    key={q.id}
                    layout
                    initial={{ opacity: 0, y: travel.step }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={transition.step}
                  >
                    <QuoteCard
                      quote={q}
                      badge={badges.get(q.id) ?? null}
                      onChoose={() => setConfirming(q)}
                    />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </section>
      )}

      {/* ── Where the driver actually is ────────────────────────────────── */}
      {/* Gated on channelKey, not on status: the key exists only once the
          server has a trip row with a driver on it, so this cannot render an
          empty map for a job that has nothing to plot. Somebody whose driver
          has not opened their phone yet gets the honest text trail below
          instead. Same component the taxi flow uses. */}
      {view.status === "accepted" && view.delivery?.channelKey && (
        <LiveTripView
          lookup={{ requestId: view.id, email: email || "" }}
          channelKey={view.delivery.channelKey}
          active={
            !(TERMINAL_LEGS as readonly string[]).includes(view.delivery.status)
          }
          driver={
            view.delivery.driverName
              ? {
                  name: view.delivery.driverName,
                  phone: view.delivery.driverPhone,
                  vehicle: view.delivery.vehicleType,
                  photo: null,
                  rating: null,
                  ratingCount: null,
                }
              : null
          }
          pickupLabel={view.pickupText}
          dropoffLabel={view.dropoffText}
          reference={requestRef(view.id)}
          fare={formatFee(view.delivery.fee)}
          passengerName={view.contactName}
        />
      )}

      {/* ── The driver who was chosen ───────────────────────────────────── */}
      {view.status === "accepted" && view.delivery && (
        <BookedDriver view={view} />
      )}

      {/* ── The transfer receipt ────────────────────────────────────────
          Shown only while it is actually outstanding, and it is the one thing
          on this screen holding the delivery up — so it sits directly under
          the driver who is waiting for it. */}
      {/* ── The ID, on a cash job ────────────────────────────────────────
          Asked for by the owner, twice, having read the case against it. What
          is built around it is the part that makes it survivable: it goes to
          its own private bucket, it is readable only by the driver currently
          holding the job and only until the job ends, and it is DELETED after
          the retention window. See M158 and /api/cron/purge-documents. */}
      {view.delivery?.paymentMethod === "cash" && (
        <IdDocument
          requestId={view.id}
          email={email}
          attachedAt={view.delivery.idDocumentAt}
          onDone={() => void load()}
        />
      )}

      {view.delivery?.paymentMethod === "bank_transfer" && (
        <PaymentProof
          requestId={view.id}
          email={email}
          attachedAt={view.delivery.paymentProofAt}
          reference={view.delivery.paymentReference}
          onDone={() => void load()}
        />
      )}

      {/* ── How was it? ─────────────────────────────────────────────────── */}
      {view.delivery?.status === "delivered" && view.delivery.driverName && (
        <RateDriver
          driverName={view.delivery.driverName}
          value={rating}
          saved={ratingSaved}
          onRate={async (stars) => {
            setRating(stars);
            const res = await fetch(`/api/delivery-requests/${id}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "rate",
                rating: stars,
                email: emailRef.current || undefined,
              }),
            });
            if (res.ok) {
              setRatingSaved(true);
            } else {
              const j = (await res.json()) as { error?: string };
              toast.error(j.error ?? c.tracker.rateFailed);
              setRating(null);
            }
          }}
        />
      )}

      {/* ── Again ───────────────────────────────────────────────────────
          One tap to repeat a job, which is the commonest shape of demand on a
          small island: the same parcel from the same sister to the same house,
          every month. DoorDash calls it Reorder and keeps it in an account; it
          does not need an account, because everything it needs is already on
          this screen.

          `settled` is reused rather than a new flag: it already means exactly
          "there is nothing left to wait for here" — delivered, cancelled or
          expired — and a second predicate for the same idea is a second thing
          to keep in step.

          It lives HERE and not in the history list on /deliver, which is a
          deliberate limitation rather than an oversight. my_delivery_requests
          returns the place NAMES but not their coordinates, so a one-tap repeat
          from that list would quietly post a worse request than the one it
          copied. This screen has the whole row. */}
      {settled && (
        <button
          type="button"
          onClick={() => {
            const { item, largeAndHeavy } = columnsToItem(
              view.sizeClass,
              view.cargoKind ?? "general",
            );
            // A shopping run that never named a shop must come back as
            // "anywhere", not as a place called "Anywhere you can find it".
            const shopping = view.kind === "shop_and_deliver";
            const named = !shopping || view.pickupLat != null;
            writeDraft({
              kind: shopping ? "shop_and_deliver" : "package",
              what: view.what,
              // Minor units on the wire, rupees on screen — the same convention
              // as every other amount in this system.
              budget: view.spendCap ? String(view.spendCap / 100) : "",
              item,
              largeAndHeavy,
              // THE SLOT COMES BACK, THE DAY DOES NOT. Somebody who always
              // sends things in the morning wants morning again; nobody wants
              // last month's date. Leaving the day unanswered lands the
              // restored draft on the "when" screen, which is the one question
              // a repeat genuinely has to ask again.
              scheduleKind: "",
              timeSlot: view.timeSlot ?? "",
              neededDate: "",
              // DELIBERATELY not carried over. A photo of last month's parcel
              // is a photo of last month's parcel, and a driver quoting from it
              // would be quoting on the wrong thing.
              photoPath: null,
              pickup: named
                ? {
                    id: "reorder-pickup",
                    name: view.pickupText,
                    area: "",
                    lat: view.pickupLat,
                    lng: view.pickupLng,
                  }
                : null,
              dropoff: {
                id: "reorder-dropoff",
                name: view.dropoffText,
                area: "",
                lat: view.dropoffLat,
                lng: view.dropoffLng,
              },
              pickupNote: view.pickupNote ?? "",
              dropoffNote: view.dropoffNote ?? "",
              namesShop: shopping && named,
              name: view.contactName,
              phone: view.contactPhone,
              guestEmail: emailRef.current ?? "",
              // Aims at the REVIEW screen. resumeScreen() clamps it back to
              // the "when" question, because that is the one thing a repeat
              // cannot inherit — so the person answers exactly one question and
              // lands on the button.
              step: "4",
            });
            router.push("/deliver");
          }}
          className={cn(recipe.secondaryAction, "self-start")}
        >
          {c.tracker.again}
        </button>
      )}

      {/* ── Getting out ─────────────────────────────────────────────────── */}
      {canWithdraw && (
        <button
          type="button"
          onClick={withdraw}
          disabled={cancelling}
          className={cn(
            t.bodySm,
            "self-start text-[#B0B0B0] underline underline-offset-4 transition-colors hover:text-[#B0B0B0] disabled:opacity-50",
          )}
        >
          {cancelling
            ? c.tracker.cancelling
            : prePickup
              ? c.tracker.cancelDelivery
              : c.tracker.withdraw}
        </button>
      )}

      {/* ── The confirmation, as a sheet ────────────────────────────────── */}
      <AnimatePresence>
        {confirming && (
          <ConfirmSheet
            quote={confirming}
            view={view}
            busy={busyQuote === confirming.id}
            onClose={() => setConfirming(null)}
            onConfirm={(method) => void book(confirming, method)}
          />
        )}
      </AnimatePresence>

      {email && (
        <p className={cn(t.meta, "text-[#B0B0B0]")}>
          {c.tracker.showingTo(email)}
        </p>
      )}
    </div>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function Leg({
  label,
  place,
  note,
}: {
  label: string;
  place: string;
  note: string | null;
}) {
  return (
    <div className="flex items-start gap-3">
      <MapPin size={15} className="mt-0.5 shrink-0 text-white/30" />
      <div className="min-w-0">
        <p className={cn(t.meta, "text-[#B0B0B0]")}>{label}</p>
        <p className={cn(t.bodySm, "text-offwhite")}>{place}</p>
        {note && <p className={cn(t.meta, "mt-0.5 text-[#B0B0B0]")}>{note}</p>}
      </div>
    </div>
  );
}

/**
 * The empty state that does the most work on this whole surface.
 *
 * Somebody who has just posted lands here, sees nothing, and decides whether
 * this island service is real. So it says what is happening RIGHT NOW, in the
 * present tense, and shows movement rather than an empty box.
 */
function WaitingForQuotes() {
  const { language } = useLanguage();
  const c = DELIVER_COPY[language];
  return (
    <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <div className="flex items-center gap-3">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow/70" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-yellow" />
        </span>
        <p className={cn(t.bodySm, "text-offwhite")}>
          {c.tracker.waitingTitle}
        </p>
      </div>
      <p className={cn(t.bodySm, "mt-3 text-[#B0B0B0]")}>
        {/* No invented statistic: not one request has ever been priced, so a
            number here would be a promise made up out of nothing. And no
            promise of a message, because nothing enrols this customer in any
            channel — see requestStatusCopy. */}
        {c.tracker.waitingBody}
      </p>
      <div className="mt-4 flex flex-col gap-2" aria-hidden>
        {[0, 1].map((i) => (
          <div
            key={i}
            className="h-14 animate-pulse rounded-xl bg-white/[0.03]"
          />
        ))}
      </div>
    </div>
  );
}

function QuoteCard({
  quote,
  badge,
  onChoose,
}: {
  quote: Quote;
  badge: string | null;
  onChoose: () => void;
}) {
  const { language } = useLanguage();
  const c = DELIVER_COPY[language];
  const Icon = VEHICLE_ICON[quote.vehicleType ?? ""] ?? Package;
  return (
    <button
      type="button"
      onClick={onChoose}
      className={cn(recipe.cardButton, "group")}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.05] text-[#B0B0B0]">
          <Icon size={17} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className={cn(t.cardTitle, "truncate text-offwhite")}>
              {quote.driverName}
            </p>
            {/* Tabular, so a column of prices does not shimmer as it updates. */}
            <p
              className={cn(
                t.numeric,
                "shrink-0 font-syne text-lg font-bold text-yellow",
              )}
            >
              {formatFee(quote.fee)}
            </p>
          </div>

          <p
            className={cn(
              t.meta,
              "mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[#B0B0B0]",
            )}
          >
            {/* The vehicle is the raw registered value, in English, in every
                language. VEHICLE_LABEL lives in lib/delivery/vehicle.ts and is
                English-only for every screen — DeliverForm renders it inside a
                French sentence too. Naming it here would be a second, private
                translation of a list that needs one shared one. */}
            {quote.vehicleType && (
              <span className="capitalize">{quote.vehicleType}</span>
            )}
            {quote.completed > 0 && (
              <>
                <span aria-hidden>·</span>
                <span>{c.tracker.completedCount(quote.completed)}</span>
              </>
            )}
            {quote.rating != null && (
              <>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1">
                  <Star size={11} className="fill-yellow text-yellow" />
                  {quote.rating}
                </span>
              </>
            )}
          </p>

          {quote.note && (
            <p className={cn(t.bodySm, "mt-2 text-[#B0B0B0]")}>
              &ldquo;{quote.note}&rdquo;
            </p>
          )}

          {badge && (
            // Named rather than implied. A list where the only signal is the
            // ordering quietly punishes the driver charging Rs 20 more for a van.
            <span
              className={cn(
                t.meta,
                "mt-2 inline-block rounded-full bg-yellow/12 px-2 py-0.5 font-medium text-yellow",
              )}
            >
              {BADGE_LABEL[language][badge as keyof (typeof BADGE_LABEL)["en"]]}
            </span>
          )}
        </div>

        <ChevronRight
          size={16}
          className="mt-3 shrink-0 text-[#B0B0B0] transition-transform group-hover:translate-x-0.5"
        />
      </div>
    </button>
  );
}

/**
 * The last screen before money is committed.
 *
 * A bottom sheet rather than a browser confirm, because what has to be shown
 * here is a BREAKDOWN — and on a shopping run the fee is not the bill. Somebody
 * who reads "Rs 250" and brings Rs 300 to a door where the driver has laid out
 * Rs 1,500 on gas bottles is the failure this sheet exists to prevent.
 */
function ConfirmSheet({
  quote,
  view,
  busy,
  onClose,
  onConfirm,
}: {
  quote: Quote;
  view: RequestView;
  busy: boolean;
  onClose: () => void;
  onConfirm: (method: PaymentMethod) => void;
}) {
  // ── THE CAP IS CHECKED BEFORE THE CHOICE IS OFFERED ───────────────────
  // The driver's exposure on a cash job is their fee PLUS whatever they front
  // at the till on a shopping run. Conflating the two is how a "Rs 300
  // delivery" quietly becomes a Rs 9,300 cash risk. accept_delivery_quote()
  // refuses over the limit regardless; doing the same arithmetic here means
  // the option is greyed with a reason instead of failing on the tap.
  const { language } = useLanguage();
  const c = DELIVER_COPY[language];
  const exposure = quote.fee + (view.spendCap ?? 0);
  const cashAllowed = view.cashLimit === null || exposure <= view.cashLimit;
  const [method, setMethod] = useState<PaymentMethod>(
    cashAllowed ? "cash" : "bank_transfer",
  );

  const pay = payAtDoor(
    {
      fee: quote.fee,
      kind: view.kind,
      spendCap: view.spendCap,
    },
    language,
  );

  const sheetRef = useRef<HTMLDivElement | null>(null);

  // ── Escape, focus, and keeping the sheet honest ──────────────────────────
  // Escape closes it, because a sheet that can only be dismissed by finding a
  // small X is a sheet people confirm by accident.
  //
  // The focus half is not decoration. This element declares aria-modal but did
  // nothing to enforce it, so keyboard focus stayed on the quote card BEHIND
  // the overlay: Tab walked the hidden list, Enter selected a different driver,
  // and the sheet in front of them still named the first one. Somebody could
  // book a driver they had never read the price of.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = sheetRef.current;
    const focusables = () =>
      Array.from(
        root?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );

    // Land on the confirm button: it is what they came here to press, and it
    // also puts the price in front of a screen reader immediately.
    focusables().at(-1)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      // Wrap, so Tab can never leave the sheet for the list underneath it.
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (root && !root.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      // Back where they were, so closing the sheet does not dump them at the
      // top of the page.
      previous?.focus?.();
    };
  }, [busy, onClose]);

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={transition.fade}
        onClick={() => !busy && onClose()}
        className="fixed inset-0 z-40 bg-black/70 backdrop-blur-[2px]"
      />
      <motion.div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={c.tracker.bookAria(quote.driverName, formatFee(quote.fee))}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={transition.sheet}
        className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl border-t border-white/12 bg-dark-card px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3"
      >
        <div
          className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15"
          aria-hidden
        />
        <div className="mx-auto w-full max-w-md">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className={cn(t.heading, "text-offwhite")}>
                {c.tracker.bookTitle(quote.driverName)}
              </h2>
              <p className={cn(t.bodySm, "mt-1 text-[#B0B0B0]")}>
                {c.tracker.bookWhy}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              aria-label={c.tracker.close}
              className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#B0B0B0] transition-colors hover:bg-white/5 hover:text-offwhite"
            >
              <X size={17} />
            </button>
          </div>

          <dl className="mt-5 flex flex-col gap-2 rounded-xl bg-white/[0.03] p-4">
            {pay.lines.map((l) => (
              <div
                key={l.label}
                className="flex items-baseline justify-between gap-4"
              >
                <dt className={cn(t.bodySm, "text-[#B0B0B0]")}>{l.label}</dt>
                <dd className={cn(t.numeric, "text-sm text-offwhite")}>
                  {l.value}
                </dd>
              </div>
            ))}
            <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-white/10 pt-2.5">
              <dt className={cn(t.bodySm, "font-semibold text-offwhite")}>
                {c.tracker.payAtDoor}
              </dt>
              <dd
                className={cn(
                  t.numeric,
                  "font-syne text-base font-bold text-yellow",
                )}
              >
                {pay.total}
              </dd>
            </div>
          </dl>
          {pay.note && (
            <p className={cn(t.meta, "mt-2 text-[#B0B0B0]")}>{pay.note}</p>
          )}

          <p
            className={cn(t.meta, "mt-4 flex items-start gap-2 text-[#B0B0B0]")}
          >
            <ShieldCheck size={14} className="mt-px shrink-0 text-yellow/70" />
            {c.tracker.codePromise}
          </p>

          {/* ── How the money moves ────────────────────────────────────
              Asked here, at the one moment it is a real question: a price has
              been chosen and nothing has been committed yet. */}
          <fieldset className="mt-5">
            {/* The whole payment question is the FORM's, word for word. It is
                the same choice with the same consequences, and two house
                translations of "Cash at the door" is a bug only somebody who
                uses both screens would ever see. */}
            <legend className={cn(t.label, "mb-2 text-offwhite")}>
              {c.pay.question}
            </legend>
            <div className="grid grid-cols-1 gap-2">
              {[
                {
                  k: "cash" as const,
                  icon: Banknote,
                  title: c.pay.cash.label,
                  body: cashAllowed
                    ? c.pay.cashTotal(pay.total)
                    : c.pay.cashCapped(formatFee(view.cashLimit ?? 0)),
                  disabled: !cashAllowed,
                },
                {
                  k: "bank_transfer" as const,
                  icon: Landmark,
                  title: c.pay.transfer.label,
                  body: c.pay.transfer.help,
                  disabled: false,
                },
              ].map((o) => {
                const on = method === o.k;
                return (
                  <button
                    key={o.k}
                    type="button"
                    disabled={o.disabled}
                    onClick={() => setMethod(o.k)}
                    aria-pressed={on}
                    className={cn(
                      "w-full rounded-2xl border p-3 text-left transition-colors",
                      on
                        ? "border-yellow/60 bg-yellow/[0.07]"
                        : "border-[#6E6E6E]",
                      o.disabled && "cursor-not-allowed opacity-45",
                    )}
                  >
                    <span className="flex items-center gap-2.5">
                      <o.icon
                        size={18}
                        className={cn(
                          "shrink-0",
                          on ? "text-yellow" : "text-[#B0B0B0]",
                        )}
                        aria-hidden
                      />
                      <span
                        className={cn(t.bodySm, "font-semibold text-offwhite")}
                      >
                        {o.title}
                      </span>
                      {on && (
                        <Check
                          size={16}
                          className="ml-auto shrink-0 text-yellow"
                        />
                      )}
                    </span>
                    <span className={cn(t.meta, "mt-1 block text-[#B0B0B0]")}>
                      {o.body}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <button
            type="button"
            onClick={() => onConfirm(method)}
            disabled={busy}
            className={cn(
              recipe.primaryAction,
              "mt-5 inline-flex items-center justify-center gap-2",
            )}
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            {busy ? c.tracker.booking : c.tracker.bookFor(formatFee(quote.fee))}
          </button>
          <p className={cn(t.meta, "mt-3 text-center text-[#B0B0B0]")}>
            {c.tracker.othersWithdrawn}
          </p>
        </div>
      </motion.div>
    </>
  );
}

/**
 * Proof that the money moved.
 *
 * ── WHY THIS IS THE ONLY DOCUMENT THIS FLOW ASKS FOR ──────────────────────
 * The brief also asked for a photo of the customer's national identity card on
 * cash orders. That is not built, and the reasoning is written out in full in
 * migration M155 — briefly: it is disproportionate for a Rs 250 parcel, it
 * would be shown to a private individual on an island where the customer is
 * likely to be recognised, it is sensitive personal data under the Mauritius
 * Data Protection Act 2017, and it would stop the very people this rebuild is
 * for. It also does not solve the driver's actual risk, which is not being paid
 * — a copy of an ID does not prevent that. The cash CAP does, by moving large
 * amounts to this screen instead.
 *
 * A transfer receipt is a different thing entirely: it is evidence of a
 * transaction the customer chose to make, it is what a Mauritian bank hands you
 * for exactly this purpose, and the driver needs it before setting off.
 *
 * Mirrors components/BookingReceiptUpload deliberately — same 4 MB ceiling,
 * same types, same camera-first input — because somebody photographing a bank
 * slip on island data should not meet two different uploaders on one site.
 */
function PaymentProof({
  requestId,
  email,
  attachedAt,
  reference,
  onDone,
}: {
  requestId: string;
  email: string;
  attachedAt: string | null;
  reference: string | null;
  onDone: () => void;
}) {
  const { language } = useLanguage();
  const c = DELIVER_COPY[language];
  const [file, setFile] = useState<File | null>(null);
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  if (attachedAt) {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4">
        <p className={cn(t.body, "flex items-start gap-2.5 text-offwhite")}>
          <Check
            size={18}
            className="mt-1 shrink-0 text-emerald-300"
            aria-hidden
          />
          <span>
            {c.pay.proofDone}
            {reference && (
              <span className={cn(t.meta, "mt-0.5 block text-[#B0B0B0]")}>
                {c.find.refLabel} {reference}
              </span>
            )}
          </span>
        </p>
      </div>
    );
  }

  async function send() {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (email) fd.append("email", email);
      const up = await fetch(
        `/api/delivery-requests/${requestId}/payment-proof`,
        {
          method: "POST",
          body: fd,
        },
      );
      const upJson = (await up.json()) as { path?: string; error?: string };
      if (!up.ok || !upJson.path) {
        setError(upJson.error ?? c.pay.failed);
        return;
      }
      // TWO steps on purpose: the upload proves the file is real and the
      // attach proves it is YOURS and that this delivery is still waiting for
      // it. Doing both in one endpoint would mean writing the row from a
      // handler that had not re-read the delivery's state.
      const res = await fetch(`/api/delivery-requests/${requestId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "attachProof",
          path: upJson.path,
          reference: ref.trim() || undefined,
          email: email || undefined,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? c.pay.failed);
        return;
      }
      toast.success(c.pay.proofDone);
      onDone();
    } catch {
      setError(c.error.network);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-yellow/40 bg-yellow/[0.05] p-4">
      <h3 className={cn(t.cardTitle, "text-offwhite")}>{c.pay.proofTitle}</h3>
      <p className={cn(t.bodySm, "mt-1 text-[#B0B0B0]")}>
        {c.pay.proofWhy} {c.pay.proofHelp}
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="sr-only"
        aria-label={c.pay.proofChoose}
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          setError(null);
          if (f && f.size > 4 * 1024 * 1024) {
            setError(c.pay.tooBig);
            return;
          }
          setFile(f);
        }}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="mt-3 flex min-h-14 w-full items-center justify-center gap-2.5 rounded-xl border border-[#6E6E6E] px-4 font-dm text-[16px] text-offwhite"
      >
        <UploadCloud size={18} aria-hidden />
        {file ? file.name.slice(0, 34) : c.pay.proofChoose}
      </button>

      <label
        htmlFor="proof-ref"
        className={cn(t.meta, "mt-3 block text-[#B0B0B0]")}
      >
        {c.tracker.referenceOptional}
      </label>
      <input
        id="proof-ref"
        value={ref}
        onChange={(e) => setRef(e.target.value)}
        placeholder={c.tracker.referencePlaceholder}
        className={cn(recipe.field, "mt-1")}
      />

      {error && (
        <p role="alert" className={cn(t.bodySm, "mt-2 text-red-400")}>
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => void send()}
        disabled={!file || busy}
        className={cn(
          recipe.primaryAction,
          "mt-3 inline-flex items-center justify-center gap-2",
        )}
      >
        {busy && <Loader2 size={16} className="animate-spin" />}
        {busy ? c.pay.proofSending : c.pay.proofSubmit}
      </button>
    </div>
  );
}

/**
 * A photograph of the customer's identity card, for a cash delivery.
 *
 * ── SAYING WHY, BEFORE ASKING ─────────────────────────────────────────────
 * This is the largest thing this flow asks anybody for, and the one most
 * likely to end a session. So the panel leads with the reason, names exactly
 * who will look at it, and says when it is deleted — in that order, before the
 * button. A request for a government document with no explanation attached is
 * one people are right to refuse.
 *
 * The delete date is not decoration: delivery_settings.id_document_retention_days
 * and a nightly purge make it true.
 */
function IdDocument({
  requestId,
  email,
  attachedAt,
  onDone,
}: {
  requestId: string;
  email: string;
  attachedAt: string | null;
  onDone: () => void;
}) {
  const { language } = useLanguage();
  const c = DELIVER_COPY[language];
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  if (attachedAt) {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4">
        <p className={cn(t.bodySm, "flex items-start gap-2.5 text-offwhite")}>
          <Check
            size={18}
            className="mt-0.5 shrink-0 text-emerald-300"
            aria-hidden
          />
          {c.pay.idDone}
        </p>
      </div>
    );
  }

  async function send() {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (email) fd.append("email", email);
      const up = await fetch(
        `/api/delivery-requests/${requestId}/id-document`,
        {
          method: "POST",
          body: fd,
        },
      );
      const upJson = (await up.json()) as { path?: string; error?: string };
      if (!up.ok || !upJson.path) {
        setError(upJson.error ?? c.pay.failed);
        return;
      }
      const res = await fetch(`/api/delivery-requests/${requestId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "attachId",
          path: upJson.path,
          email: email || undefined,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? c.pay.failed);
        return;
      }
      toast.success(c.pay.idDone);
      onDone();
    } catch {
      setError(c.error.network);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-yellow/40 bg-yellow/[0.05] p-4">
      <h3 className={cn(t.cardTitle, "text-offwhite")}>
        {c.pay.idTitle}
        <span className="font-bold text-red-400" aria-hidden>
          {" *"}
        </span>
      </h3>
      {/* The reason, who sees it, and when it goes — before the button. NOT
          pay.idWhy: that one promises the driver checks it at the door, this
          one promises who can see it and for how long. Both true, not the
          same sentence — so this panel keeps its own. */}
      <p className={cn(t.bodySm, "mt-1.5 text-[#B0B0B0]")}>
        {c.tracker.idWhy}
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="sr-only"
        aria-label={c.pay.idChoose}
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          setError(null);
          if (f && f.size > 4 * 1024 * 1024) {
            setError(c.pay.tooBig);
            return;
          }
          setFile(f);
        }}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="mt-3 flex min-h-14 w-full items-center justify-center gap-2.5 rounded-xl border border-[#6E6E6E] px-4 font-dm text-[16px] text-offwhite"
      >
        <UploadCloud size={18} aria-hidden />
        {file ? file.name.slice(0, 34) : c.pay.idChoose}
      </button>

      {error && (
        <p role="alert" className={cn(t.bodySm, "mt-2 text-red-400")}>
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => void send()}
        disabled={!file || busy}
        className={cn(
          recipe.primaryAction,
          "mt-3 inline-flex items-center justify-center gap-2",
        )}
      >
        {busy && <Loader2 size={16} className="animate-spin" />}
        {busy ? c.pay.proofSending : c.pay.idSubmit}
      </button>
    </div>
  );
}

function BookedDriver({ view }: { view: RequestView }) {
  const { language } = useLanguage();
  const c = DELIVER_COPY[language];
  const d = view.delivery!;
  const here = legIndex(d.status);
  const pay = payAtDoor(
    {
      fee: d.fee,
      kind: view.kind,
      spendCap: view.spendCap,
    },
    language,
  );
  const leg = legCopy(d.status, language);
  const Icon = VEHICLE_ICON[d.vehicleType ?? ""] ?? Package;
  // Everything here comes from the DELIVERY, never from the winning quote. A
  // driver can bail before pickup and a different one can take the job on;
  // reading the quote showed a name and a phone number that belonged to
  // nobody, beside a call button that rang somebody who was not coming.
  const broken = (BROKEN_LEGS as readonly string[]).includes(d.status);
  const hasDriver = Boolean(d.driverName);

  return (
    <section className="flex flex-col gap-5">
      {/* ── Who is coming ───────────────────────────────────────────────── */}
      <div
        className={cn(
          "rounded-2xl border p-4",
          broken
            ? "border-white/12 bg-white/[0.03]"
            : "border-yellow/25 bg-yellow/[0.05]",
        )}
      >
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
              broken ? "bg-white/[0.06] text-[#B0B0B0]" : "bg-yellow text-dark",
            )}
          >
            {broken ? <AlertTriangle size={19} /> : <Icon size={19} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className={cn(t.cardTitle, "truncate text-offwhite")}>
              {hasDriver ? d.driverName : leg.label}
            </p>
            <p className={cn(t.meta, "text-[#B0B0B0]")}>
              {hasDriver ? leg.label : c.tracker.noDriverNow}
            </p>
          </div>
          {/* Only while somebody actually holds the job. Released at booking and
              not before: while comparing prices the customer has no reason for
              a driver's number, and handing them all out invites the whole job
              off the platform, where nothing protects either side. */}
          {hasDriver && d.driverPhone && !broken && (
            <a
              href={`tel:${d.driverPhone.replace(/\s+/g, "")}`}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-yellow/40 text-yellow transition-colors hover:bg-yellow/10"
              aria-label={c.tracker.callDriver(d.driverName ?? "")}
            >
              <Phone size={16} />
            </a>
          )}
        </div>
        {leg.detail && (
          <p className={cn(t.bodySm, "mt-3 text-[#B0B0B0]")}>{leg.detail}</p>
        )}
      </div>

      {/* ── How far along ───────────────────────────────────────────────── */}
      {here >= 0 && (
        <ol className="flex flex-col gap-0">
          {LEG_ORDER.map((step, i) => {
            const done = i < here;
            const now = i === here;
            return (
              <li key={step} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors",
                      done && "border-yellow/50 bg-yellow/20 text-yellow",
                      now && "border-yellow bg-yellow text-dark",
                      !done && !now && "border-white/12 text-[#B0B0B0]",
                    )}
                  >
                    {done ? (
                      <Check size={12} />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    )}
                  </span>
                  {i < LEG_ORDER.length - 1 && (
                    <span
                      className={cn(
                        "w-px flex-1",
                        i < here ? "bg-yellow/40" : "bg-white/10",
                      )}
                    />
                  )}
                </div>
                <p
                  className={cn(
                    t.bodySm,
                    "pb-5",
                    now
                      ? "font-semibold text-offwhite"
                      : done
                        ? "text-[#B0B0B0]"
                        : "text-[#B0B0B0]",
                  )}
                >
                  {legCopy(step, language).label}
                </p>
              </li>
            );
          })}
        </ol>
      )}

      {/* ── The code, and the money ─────────────────────────────────────── */}
      {d.status !== "delivered" && (
        <div className="rounded-2xl border border-white/10 bg-dark-card p-4 text-center">
          <p className={cn(t.eyebrow, "text-yellow")}>{c.tracker.codeEyebrow}</p>
          <p className="mt-2 font-syne text-4xl font-extrabold tracking-[0.3em] text-offwhite">
            {d.pin}
          </p>
          <p className={cn(t.bodySm, "mt-2 text-[#B0B0B0]")}>
            {c.tracker.codeWhen}
          </p>
        </div>
      )}

      <dl className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-dark-card p-4">
        {pay.lines.map((l) => (
          <div
            key={l.label}
            className="flex items-baseline justify-between gap-4"
          >
            <dt className={cn(t.bodySm, "text-[#B0B0B0]")}>{l.label}</dt>
            <dd className={cn(t.numeric, "text-sm text-offwhite")}>
              {l.value}
            </dd>
          </div>
        ))}
        <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-white/10 pt-2.5">
          <dt className={cn(t.bodySm, "font-semibold text-offwhite")}>
            {d.status === "delivered" ? c.tracker.paid : c.tracker.payAtDoor}
          </dt>
          <dd
            className={cn(
              t.numeric,
              "font-syne text-base font-bold text-yellow",
            )}
          >
            {pay.total}
          </dd>
        </div>
      </dl>
      {pay.note && (
        <p className={cn(t.meta, "-mt-3 text-[#B0B0B0]")}>{pay.note}</p>
      )}
    </section>
  );
}

function TrackerSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-hidden>
      <div className="h-5 w-28 rounded-full bg-white/[0.06]" />
      <div className="h-9 w-3/4 rounded-lg bg-white/[0.06]" />
      <div className="h-28 rounded-2xl bg-white/[0.04]" />
      <div className="h-20 rounded-2xl bg-white/[0.04]" />
    </div>
  );
}

/**
 * Rating the driver, once the thing has actually arrived.
 *
 * Five taps, no typing, no "submit". On a surface where 44% of the intended
 * users cannot write (2022 census Vol. VI Table E2a), a review box asking for
 * prose is a review nobody leaves — and a rating nobody leaves is a rating
 * nobody can rely on when choosing between prices.
 *
 * Each star is a 56px target with its own accessible name, because a row of
 * icons is otherwise a row of unlabelled guesses.
 */
function RateDriver({
  driverName,
  value,
  saved,
  onRate,
}: {
  driverName: string;
  value: number | null;
  saved: boolean;
  onRate: (stars: number) => Promise<void>;
}) {
  const { language } = useLanguage();
  const c = DELIVER_COPY[language];
  return (
    <section className="rounded-2xl border border-white/12 bg-dark-card p-4">
      <h2 className={cn(t.heading, "text-offwhite")}>
        {saved ? c.tracker.rateThanks : c.tracker.rateTitle(driverName)}
      </h2>
      <p className={cn(t.bodySm, "mt-1 text-[#B0B0B0]")}>
        {saved ? c.tracker.rateSaved : c.tracker.rateHelp}
      </p>
      <div
        className="mt-3 flex gap-1"
        role="group"
        aria-label={c.tracker.rateAria(driverName)}
      >
        {[1, 2, 3, 4, 5].map((n) => {
          const on = (value ?? 0) >= n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => void onRate(n)}
              aria-label={c.tracker.starAria(n)}
              aria-pressed={on}
              className="flex h-14 w-14 items-center justify-center rounded-xl transition-colors hover:bg-white/[0.05]"
            >
              <Star
                size={30}
                className={on ? "fill-yellow text-yellow" : "text-[#6E6E6E]"}
                aria-hidden
              />
            </button>
          );
        })}
      </div>
    </section>
  );
}
