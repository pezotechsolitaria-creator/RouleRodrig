"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2, Package, ShoppingBasket, MapPin, Check, X, Phone, Star,
  Bike, Car, Truck, ShieldCheck, Clock, AlertTriangle, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  requestStatusCopy, legCopy, legIndex, LEG_ORDER, sortQuotes, quoteBadges,
  BADGE_LABEL, formatFee, payAtDoor, expiresIn, TERMINAL_LEGS, BROKEN_LEGS,
  PRE_PICKUP_LEGS, requestRef,
  type Quote,
} from "@/lib/delivery/request-status";
import { emailFor, saveRequest } from "@/lib/delivery/my-requests";
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

type RequestView = {
  id: string;
  kind: string;
  what: string;
  sizeClass: string;
  status: string;
  pickupText: string;
  pickupNote: string | null;
  dropoffText: string;
  dropoffNote: string | null;
  spendCap: number | null;
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
  } | null;
};

const VEHICLE_ICON: Record<string, typeof Bike> = {
  scooter: Bike,
  motorcycle: Bike,
  bicycle: Bike,
  car: Car,
  van: Truck,
};

const TONE_CLASS = {
  waiting: "bg-white/[0.06] text-muted",
  action: "bg-yellow text-dark",
  moving: "bg-yellow/15 text-yellow",
  done: "bg-emerald-500/15 text-emerald-300",
  dead: "bg-white/[0.06] text-white/50",
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

  // Kept in a ref as well as state so the poller never closes over a stale one.
  const emailRef = useRef<string>("");

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      try {
        const res = await fetch(`/api/delivery-requests/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "view", email: emailRef.current || undefined }),
        });
        if (res.status === 404) {
          // Signed in with nothing stored → this may simply be a request they
          // made as a guest. Ask for the email rather than declaring it gone.
          setPhase(emailRef.current ? "gone" : "needsEmail");
          return;
        }
        const json = (await res.json()) as { request?: RequestView; error?: string };
        if (!res.ok || !json.request) {
          if (!opts.silent) toast.error(json.error ?? "Could not load that request.");
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
          toast.error("Could not reach us. Check your connection.");
          setPhase((p) => (p === "ready" ? p : "error"));
        }
      }
    },
    [id],
  );

  // First load: use whatever this device already knows.
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
        (TERMINAL_LEGS as readonly string[]).includes(view.delivery?.status ?? "")));

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
      toast.error(json.error ?? "That did not work. Please try again.");
      return false;
    }
    return true;
  }

  async function book(quote: Quote) {
    setBusyQuote(quote.id);
    try {
      // expectedFee is the number on the sheet in front of them. The server
      // still reads the real price from the quote row -- the browser never sets
      // one -- but it refuses if the two disagree, so nobody is committed to a
      // price a driver changed while they were reading it.
      const ok = await act({ action: "accept", quoteId: quote.id, expectedFee: quote.fee });
      if (ok) {
        setConfirming(null);
        toast.success(`${quote.driverName} is booked.`);
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
        toast.success("Request withdrawn.");
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
        <h1 className={cn(t.heading, "text-offwhite")}>Which email did you use?</h1>
        <p className={cn(t.bodySm, "mt-2 text-muted")}>
          This request was posted without an account, so we check the email against it
          before showing you anything.
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
            placeholder="you@example.com"
            className={recipe.field}
            aria-label="The email you used"
          />
          <button type="submit" className={recipe.primaryAction}>
            Show my request
          </button>
        </form>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className={cn(recipe.cardButton, "cursor-default text-center")}>
        <AlertTriangle size={22} className="mx-auto text-white/40" />
        <h1 className={cn(t.heading, "mt-3 text-offwhite")}>We couldn&apos;t load this</h1>
        <p className={cn(t.bodySm, "mt-2 text-muted")}>
          Your request is safe — this is us, not you. Try again in a moment.
        </p>
        <button
          type="button"
          onClick={() => {
            setPhase("loading");
            void load();
          }}
          className={cn(recipe.secondaryAction, "mt-5 inline-flex items-center py-2.5")}
        >
          Try again
        </button>
      </div>
    );
  }

  if (phase === "gone") {
    return (
      <div className={cn(recipe.cardButton, "cursor-default text-center")}>
        <AlertTriangle size={22} className="mx-auto text-white/40" />
        <h1 className={cn(t.heading, "mt-3 text-offwhite")}>We couldn&apos;t find that request</h1>
        <p className={cn(t.bodySm, "mt-2 text-muted")}>
          The link may be wrong, or it was posted with a different email.
        </p>
        <Link href="/deliver" className={cn(recipe.secondaryAction, "mt-5 inline-flex items-center py-2.5")}>
          Back to Deliver anything
        </Link>
        <p className={cn(t.meta, "mt-3 text-white/40")}>
          Lost the link? Find it there with your reference and email.
        </p>
      </div>
    );
  }

  if (phase === "loading" || !view) return <TrackerSkeleton />;

  const quotes = sortQuotes(view.quotes.filter((q) => q.status === "offered"));
  const badges = quoteBadges(quotes);
  const status = requestStatusCopy({
    status: view.status,
    quoteCount: quotes.length,
    expiresAt: view.expiresAt,
    deliveryStatus: view.delivery?.status,
  });
  const KindIcon = view.kind === "shop_and_deliver" ? ShoppingBasket : Package;
  // Getting out. Two different acts behind one control:
  //   open      -> withdraw the request. Nobody is committed; costs nothing.
  //   accepted  -> cancel a booked driver, but ONLY before they collect. After
  //                that the database refuses and names who to call instead, so
  //                offering the button there would be a promise the server
  //                breaks.
  const prePickup =
    view.status === "accepted" &&
    (PRE_PICKUP_LEGS as readonly string[]).includes(view.delivery?.status ?? "");
  const canWithdraw = view.status === "open" || prePickup;
  const closes = expiresIn(view.expiresAt);

  return (
    <div className="flex flex-col gap-6 pb-40">
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
        <h1 className={cn(t.display, "mt-3 text-offwhite")}>{status.headline}</h1>
        {/* The thread back. A guest gets no email and cannot memorise a uuid,
            so without this on screen the only route to this page is a link they
            still happen to have open. */}
        <p className={cn(t.meta, "mt-2 font-mono tracking-widest text-white/40")}>
          {requestRef(view.id)}
        </p>
        <p className={cn(t.body, "mt-2 text-muted")}>{status.detail}</p>
        {view.status === "open" && closes && (
          <p className={cn(t.meta, "mt-3 inline-flex items-center gap-1.5 text-white/45")}>
            <Clock size={13} /> Drivers can quote until it closes {closes}
          </p>
        )}
      </header>

      {/* ── What was asked for ──────────────────────────────────────────── */}
      <section className={cn("rounded-2xl border border-white/10 bg-dark-card p-4")}>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-yellow/12 text-yellow">
            <KindIcon size={17} />
          </span>
          <div className="min-w-0">
            <p className={cn(t.cardTitle, "text-offwhite")}>{view.what}</p>
            <p className={cn(t.meta, "mt-1 text-white/45")}>
              {view.kind === "shop_and_deliver" ? "Buy & deliver" : "Collect & deliver"}
              {view.sizeClass === "large" && " · Large item"}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <Leg label="Collect from" place={view.pickupText} note={view.pickupNote} />
          <Leg label="Deliver to" place={view.dropoffText} note={view.dropoffNote} />
        </div>
      </section>

      {/* ── The prices, or the wait ─────────────────────────────────────── */}
      {view.status === "open" && status.tone !== "dead" && (
        <section>
          <h2 className={cn(t.heading, "text-offwhite")}>
            {quotes.length > 0 ? "Choose a driver" : "No prices yet"}
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

      {/* ── The driver who was chosen ───────────────────────────────────── */}
      {view.status === "accepted" && view.delivery && <BookedDriver view={view} />}

      {/* ── Getting out ─────────────────────────────────────────────────── */}
      {canWithdraw && (
        <button
          type="button"
          onClick={withdraw}
          disabled={cancelling}
          className={cn(t.bodySm, "self-start text-white/40 underline underline-offset-4 transition-colors hover:text-white/70 disabled:opacity-50")}
        >
          {cancelling
            ? "Cancelling…"
            : prePickup
              ? "Cancel this delivery"
              : "Withdraw this request"}
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
            onConfirm={() => void book(confirming)}
          />
        )}
      </AnimatePresence>

      {email && (
        <p className={cn(t.meta, "text-white/30")}>
          Showing this request to {email}.
        </p>
      )}
    </div>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function Leg({ label, place, note }: { label: string; place: string; note: string | null }) {
  return (
    <div className="flex items-start gap-3">
      <MapPin size={15} className="mt-0.5 shrink-0 text-white/30" />
      <div className="min-w-0">
        <p className={cn(t.meta, "text-white/40")}>{label}</p>
        <p className={cn(t.bodySm, "text-offwhite")}>{place}</p>
        {note && <p className={cn(t.meta, "mt-0.5 text-muted")}>{note}</p>}
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
  return (
    <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <div className="flex items-center gap-3">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow/70" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-yellow" />
        </span>
        <p className={cn(t.bodySm, "text-offwhite")}>Drivers are being shown your job</p>
      </div>
      <p className={cn(t.bodySm, "mt-3 text-muted")}>
        {/* No invented statistic: not one request has ever been priced, so a
            number here would be a promise made up out of nothing. And no
            promise of a message, because nothing enrols this customer in any
            channel — see requestStatusCopy. */}
        Prices appear here as drivers send them. Keep this page open, or come back to
        it any time with your reference.
      </p>
      <div className="mt-4 flex flex-col gap-2" aria-hidden>
        {[0, 1].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl bg-white/[0.03]" />
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
  const Icon = VEHICLE_ICON[quote.vehicleType ?? ""] ?? Package;
  return (
    <button type="button" onClick={onChoose} className={cn(recipe.cardButton, "group")}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.05] text-white/60">
          <Icon size={17} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className={cn(t.cardTitle, "truncate text-offwhite")}>{quote.driverName}</p>
            {/* Tabular, so a column of prices does not shimmer as it updates. */}
            <p className={cn(t.numeric, "shrink-0 font-syne text-lg font-bold text-yellow")}>
              {formatFee(quote.fee)}
            </p>
          </div>

          <p className={cn(t.meta, "mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted")}>
            {quote.vehicleType && <span className="capitalize">{quote.vehicleType}</span>}
            {quote.completed > 0 && (
              <>
                <span aria-hidden>·</span>
                <span>{quote.completed} delivered</span>
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
            <p className={cn(t.bodySm, "mt-2 text-white/60")}>&ldquo;{quote.note}&rdquo;</p>
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
              {BADGE_LABEL[badge as keyof typeof BADGE_LABEL]}
            </span>
          )}
        </div>

        <ChevronRight
          size={16}
          className="mt-3 shrink-0 text-white/25 transition-transform group-hover:translate-x-0.5"
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
  onConfirm: () => void;
}) {
  const pay = payAtDoor({ fee: quote.fee, kind: view.kind, spendCap: view.spendCap });

  // Escape closes it, because a sheet that can only be dismissed by finding a
  // small X is a sheet people confirm by accident.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
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
        role="dialog"
        aria-modal="true"
        aria-label={`Book ${quote.driverName}`}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={transition.sheet}
        className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl border-t border-white/12 bg-dark-card px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15" aria-hidden />
        <div className="mx-auto w-full max-w-md">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className={cn(t.heading, "text-offwhite")}>Book {quote.driverName}?</h2>
              <p className={cn(t.bodySm, "mt-1 text-muted")}>
                They will be told straight away and will come for it.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              aria-label="Close"
              className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/40 transition-colors hover:bg-white/5 hover:text-offwhite"
            >
              <X size={17} />
            </button>
          </div>

          <dl className="mt-5 flex flex-col gap-2 rounded-xl bg-white/[0.03] p-4">
            {pay.lines.map((l) => (
              <div key={l.label} className="flex items-baseline justify-between gap-4">
                <dt className={cn(t.bodySm, "text-muted")}>{l.label}</dt>
                <dd className={cn(t.numeric, "text-sm text-offwhite")}>{l.value}</dd>
              </div>
            ))}
            <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-white/10 pt-2.5">
              <dt className={cn(t.bodySm, "font-semibold text-offwhite")}>You pay at the door</dt>
              <dd className={cn(t.numeric, "font-syne text-base font-bold text-yellow")}>
                {pay.total}
              </dd>
            </div>
          </dl>
          {pay.note && <p className={cn(t.meta, "mt-2 text-muted")}>{pay.note}</p>}

          <p className={cn(t.meta, "mt-4 flex items-start gap-2 text-white/45")}>
            <ShieldCheck size={14} className="mt-px shrink-0 text-yellow/70" />
            You will get a 4-digit code. Read it out only once it is in your hands —
            it is what proves the delivery happened.
          </p>

          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={cn(recipe.primaryAction, "mt-5 inline-flex items-center justify-center gap-2")}
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            {busy ? "Booking…" : `Book for ${formatFee(quote.fee)}`}
          </button>
          <p className={cn(t.meta, "mt-3 text-center text-white/35")}>
            The other prices are withdrawn once you book.
          </p>
        </div>
      </motion.div>
    </>
  );
}

function BookedDriver({ view }: { view: RequestView }) {
  const d = view.delivery!;
  const here = legIndex(d.status);
  const pay = payAtDoor({ fee: d.fee, kind: view.kind, spendCap: view.spendCap });
  const leg = legCopy(d.status);
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
          broken ? "border-white/12 bg-white/[0.03]" : "border-yellow/25 bg-yellow/[0.05]",
        )}
      >
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
              broken ? "bg-white/[0.06] text-white/50" : "bg-yellow text-dark",
            )}
          >
            {broken ? <AlertTriangle size={19} /> : <Icon size={19} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className={cn(t.cardTitle, "truncate text-offwhite")}>
              {hasDriver ? d.driverName : leg.label}
            </p>
            <p className={cn(t.meta, "text-muted")}>
              {hasDriver ? leg.label : "No driver on this job right now"}
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
              aria-label={`Call ${d.driverName}`}
            >
              <Phone size={16} />
            </a>
          )}
        </div>
        {leg.detail && <p className={cn(t.bodySm, "mt-3 text-muted")}>{leg.detail}</p>}
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
                      !done && !now && "border-white/12 text-white/25",
                    )}
                  >
                    {done ? <Check size={12} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                  </span>
                  {i < LEG_ORDER.length - 1 && (
                    <span className={cn("w-px flex-1", i < here ? "bg-yellow/40" : "bg-white/10")} />
                  )}
                </div>
                <p
                  className={cn(
                    t.bodySm,
                    "pb-5",
                    now ? "font-semibold text-offwhite" : done ? "text-muted" : "text-white/30",
                  )}
                >
                  {legCopy(step).label}
                </p>
              </li>
            );
          })}
        </ol>
      )}

      {/* ── The code, and the money ─────────────────────────────────────── */}
      {d.status !== "delivered" && (
        <div className="rounded-2xl border border-white/10 bg-dark-card p-4 text-center">
          <p className={cn(t.eyebrow, "text-yellow")}>YOUR CODE</p>
          <p className="mt-2 font-syne text-4xl font-extrabold tracking-[0.3em] text-offwhite">
            {d.pin}
          </p>
          <p className={cn(t.bodySm, "mt-2 text-muted")}>
            Read this out only when it is in your hands.
          </p>
        </div>
      )}

      <dl className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-dark-card p-4">
        {pay.lines.map((l) => (
          <div key={l.label} className="flex items-baseline justify-between gap-4">
            <dt className={cn(t.bodySm, "text-muted")}>{l.label}</dt>
            <dd className={cn(t.numeric, "text-sm text-offwhite")}>{l.value}</dd>
          </div>
        ))}
        <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-white/10 pt-2.5">
          <dt className={cn(t.bodySm, "font-semibold text-offwhite")}>
            {d.status === "delivered" ? "You paid" : "Pay at the door"}
          </dt>
          <dd className={cn(t.numeric, "font-syne text-base font-bold text-yellow")}>{pay.total}</dd>
        </div>
      </dl>
      {pay.note && <p className={cn(t.meta, "-mt-3 text-muted")}>{pay.note}</p>}
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
