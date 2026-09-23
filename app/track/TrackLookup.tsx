"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, ArrowRight, Bike, CalendarCheck, Car, Clock, Loader2, MapPin, Search, Store, Ticket, Truck, User, UtensilsCrossed, Wrench } from "lucide-react";
import { centsToDecimalString, centsToDisplay } from "@/lib/money";
import type { Activity, ActivityKind, ActivityStage } from "@/lib/activity";
import { holdInfo, holdDeadlineLabel, holdRemaining } from "@/lib/orders/hold";
import { useLanguage } from "@/context/LanguageContext";
import { dateLocales } from "@/lib/i18n";
import { TRACK_COPY, type TrackCopy } from "@/lib/track/copy.i18n";
import PaymentHelp from "@/components/payments/PaymentHelp";
import type { PaymentSection } from "@/lib/payment-help";

// ── ONE BOX FOR EVERYTHING ─────────────────────────────────────────────────
//
// The customer used to have to know which page held their thing — and which of
// three reference formats belonged to which page. Now they type whatever is on
// their confirmation and the platform works it out.
//
// The two-factor property is unchanged and deliberate: reference AND email.
// "Show me everything for this email" would be a nicer form and a genuinely bad
// idea — an email address is not a secret, and the result would include home
// addresses on delivery orders.

const KIND_ICON: Record<ActivityKind, React.ElementType> = {
  vehicle: Bike,
  place: MapPin,
  order: Store,
  ride: Car,
  delivery: Truck,
  service: Wrench,
};

const STAGE_STYLE: Record<ActivityStage, string> = {
  pending: "border-orange-400/40 bg-orange-400/10 text-orange-200",
  confirmed: "border-green-500/40 bg-green-500/10 text-green-200",
  active: "border-yellow/50 bg-yellow/15 text-yellow",
  done: "border-white/15 bg-white/5 text-muted",
  cancelled: "border-red-500/30 bg-red-500/10 text-red-200",
};

// Which payment desk a found activity belongs to, so the help message says
// "Rental booking" for a scooter rather than "Order payment" for everything.
// A trade appointment is settled with the provider on the day; "order" is the
// nearest desk it has.
const HELP_SECTION: Record<ActivityKind, PaymentSection> = {
  vehicle: "rental",
  place: "stay",
  order: "order",
  ride: "ride",
  delivery: "delivery",
  service: "order",
};

export default function TrackLookup({ initialRef = "" }: { initialRef?: string }) {
  const { language } = useLanguage();
  const c = TRACK_COPY[language];
  const [ref, setRef] = useState(initialRef);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);

  const ready = ref.trim().length >= 4 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  // The card's own "this reservation has lapsed" state. holdUntil is only set
  // on a PENDING order, so this is an unpaid order whose clock ran out.
  const lapsed = !!activity && !!holdInfo(activity.holdUntil)?.expired;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    setActivity(null);
    try {
      const res = await fetch("/api/activity/lookup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ref: ref.trim(), email: email.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      // `body.error` is the route's own finished English prose — see note 2 in
      // lib/track/copy.i18n.ts. It is still preferred over ours, because a
      // sentence that names the actual problem beats a translated generic one.
      if (!res.ok) throw new Error(body.error || c.errors.notFound);
      setActivity(body.activity as Activity);
    } catch (err) {
      setError(err instanceof Error ? err.message : c.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  const field =
    "mt-1 w-full rounded-xl border border-white/10 bg-dark-card px-3.5 py-3 font-dm text-sm text-offwhite placeholder:text-muted focus:border-yellow/50 focus:outline-none";
  const label = "block font-bebas text-[11px] tracking-[0.2em] text-muted";

  return (
    <>
      <form onSubmit={submit} className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-5">
        <div>
          <span className={label}>{c.form.refLabel}</span>
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 mt-0.5 -translate-y-1/2 text-muted" />
            <input
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              autoCapitalize="characters"
              spellCheck={false}
              placeholder={c.form.refPlaceholder}
              className={`${field} pl-9`}
            />
          </div>
          {/* Says plainly that ONE box takes all of them — otherwise a customer
              holding an order number assumes this is the rentals page. */}
          <p className="mt-1.5 font-dm text-[11px] text-muted">
            {c.form.refHelp}
          </p>
        </div>

        <div className="mt-4">
          <span className={label}>{c.form.emailLabel}</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder={c.form.emailPlaceholder}
            className={field}
          />
        </div>

        <button
          type="submit"
          disabled={!ready || busy}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-yellow px-5 py-4 font-dm text-base font-bold text-dark transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {busy ? <Loader2 size={17} className="animate-spin" /> : <Search size={17} />}
          {c.form.submit}
        </button>
      </form>

      {error && (
        <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-4">
          <p className="flex items-center gap-2 font-syne text-base font-bold text-red-200">
            <AlertTriangle size={17} /> {c.errors.heading}
          </p>
          <p className="mt-1 font-dm text-sm text-red-200/90">{error}</p>
        </div>
      )}

      {activity && <ActivityCard activity={activity} />}

      {/* Payment help, under whatever the lookup showed: /track is where
          people land when a payment has gone quiet. Compact — finding the
          thing is this page's job. Once found it carries the server's own
          reference and the amount exactly as the card prints it; never what
          was typed in the box, which can arrive from a ?ref= link. Lit when an
          unpaid order's hold has lapsed — "I paid" is then the likely story. */}
      <div className="mt-4">
        {/* Keyed per result: the pill has no picker, so a new lookup must
            remount it to take the new section's own first problem. */}
        <PaymentHelp
          key={activity ? `${activity.kind}:${activity.id}` : "none"}
          section={activity ? HELP_SECTION[activity.kind] : "order"}
          variant="compact"
          reference={activity?.reference || null}
          amount={
            activity?.amountCents != null && activity.amountCents > 0
              ? `Rs ${centsToDisplay(activity.amountCents)}`
              : null
          }
          method={null}
          defaultTopic={lapsed ? "transfer_not_showing" : undefined}
          emphasis={lapsed}
        />
      </div>
    </>
  );
}

/**
 * The badge word, in the reader's language.
 *
 * Orders are keyed by their own status because `stage` collapses "Preparing"
 * and "Ready" into one word, and which of the two it is, is the whole question
 * somebody waiting on food is asking. Vehicles and places are keyed by stage,
 * which is what their English label was derived from in the first place.
 *
 * Falls back to the server's English rather than showing nothing: a status
 * added to the database before it is added here should still read.
 */
function statusWord(c: TrackCopy, a: Activity): string {
  const s = c.card.status;
  if (a.kind === "order") {
    const k = a.orderStatus as keyof typeof s.order | undefined;
    return (k && s.order[k]) || a.statusLabel;
  }
  const table =
    a.kind === "vehicle" ? s.vehicle
    : a.kind === "ride" ? s.ride
    : a.kind === "delivery" ? s.delivery
    : s.place;
  return table[a.stage] || a.statusLabel;
}

function ActivityCard({ activity }: { activity: Activity }) {
  const { language } = useLanguage();
  const c = TRACK_COPY[language];
  const Icon = KIND_ICON[activity.kind];

  return (
    <article className="mt-4 rounded-2xl border border-white/10 bg-dark-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-bebas text-[11px] tracking-[0.25em] text-yellow">
            <Icon size={13} /> {c.card.kind[activity.kind].toUpperCase()}
          </p>
          <h2 className="mt-1 font-syne text-xl font-extrabold text-offwhite">{activity.title}</h2>
          <p className="mt-0.5 font-dm text-sm text-muted">{activity.reference}</p>
        </div>
        {/* The machine value now travels beside the finished English, so the
            word comes from the dictionary — the treatment
            lib/rides/track-errors.ts already made for the ride lookup.
            statusLabel remains the fallback: a status the dictionary has not
            caught up with should read in English rather than vanish. */}
        <span
          className={`shrink-0 rounded-full border px-3 py-1.5 font-dm text-xs font-semibold ${STAGE_STYLE[activity.stage]}`}
        >
          {statusWord(c, activity)}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/5 pt-3.5 font-dm text-sm">
        {activity.date && (
          <span className="inline-flex items-center gap-1.5 text-muted">
            <CalendarCheck size={14} />
            {/* The card's own date, in the reader's locale. dateLocales()
                rather than languageTag(): `mfe` resolves on some engines and
                not others, and an unresolved tag formats in the VISITOR'S OS
                locale, so this would silently drift language by device. */}
            {new Date(activity.date).toLocaleDateString(dateLocales(language), {
              day: "numeric", month: "short", year: "numeric",
            })}
          </span>
        )}
        {activity.amountCents != null && activity.amountCents > 0 && (
          <span className="font-syne font-extrabold text-yellow">
            {/* ── ONE UNIT, NO BRANCH (M162, and now this) ────────────────
                The kind === "order" branch was right when orders were the only
                cents. Rides are cents too, so a Rs 1,800 transfer showed as
                Rs 180,000. Activity carries amountCents now; nothing to
                branch on. */}
            Rs {centsToDisplay(activity.amountCents)}
          </span>
        )}
      </div>

      {/* ── THE CLOCK, AT THE FIRST SURFACE THAT SEES IT (backlog #53) ────
          This card was the first thing a guest saw after finding their order,
          and it showed a status badge with no hint that the order expires. The
          deadline was already in the lookup response; it was simply dropped.

          Shown as an absolute date AND what is left of it: the date is what
          you act on, the remaining time is what makes you act now. */}
      {(() => {
        const h = holdInfo(activity.holdUntil);
        if (!h) return null;
        return (
          <p
            className={`mt-3.5 flex items-start gap-2 rounded-xl border px-3.5 py-2.5 font-dm text-xs leading-relaxed ${
              h.expired
                ? "border-red-500/30 bg-red-500/10 text-red-200"
                : h.urgent
                  ? "border-orange-400/40 bg-orange-400/10 text-orange-100"
                  : "border-yellow/25 bg-yellow/[0.06] text-offwhite"
            }`}
          >
            <Clock size={13} className="mt-0.5 shrink-0" />
            <span>
              {h.expired ? (
                c.card.hold.expired
              ) : (
                <>
                  {c.card.hold.reservedBefore}
                  <span className="font-bold">
                    {holdDeadlineLabel(h, language)}
                  </span>
                  {c.card.hold.reservedAfter(holdRemaining(h, language))}
                </>
              )}
            </span>
          </p>
        );
      })()}

      {/* Straight to the surface that owns this kind, which is where the real
          detail lives — the QR code, the bank details, the pickup address. */}
      <Link
        href={activity.href}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-yellow px-5 py-3.5 font-dm text-sm font-bold text-dark transition-opacity hover:opacity-90"
      >
        {c.card.cta} <ArrowRight size={15} />
      </Link>
    </article>
  );
}

// ── THE WORDS AROUND THE BOX ───────────────────────────────────────────────
//
// app/track/page.tsx is a server component — it owns the metadata and reads
// ?ref= — and the chosen language is neither a cookie nor a route segment:
// context/LanguageContext.tsx keeps it in localStorage and restores it after
// mount, so there is nothing on the server to read it from. Same problem
// app/deliver/DeliverTitle.tsx met, and the same answer: the text moves across
// the boundary, the page does not.
//
// These three are the whole page apart from the form, which is why they live
// beside it. The page keeps its own layout and composes them in order, so the
// markup a reader gets is byte-for-byte what it was.
//
// It still server-renders: the provider starts on "en" and corrects itself
// after hydration, so a reader with no JavaScript gets the English the page's
// metadata already promises — and /track is noindex, so no crawler is being
// told anything either way.

/** Back link, eyebrow, h1 and the one-line promise. */
export function TrackIntro() {
  const { language } = useLanguage();
  const c = TRACK_COPY[language].page;

  return (
    <>
      <Link href="/" className="inline-flex items-center gap-1.5 font-dm text-sm text-muted hover:text-yellow">
        <ArrowLeft size={14} /> {c.home}
      </Link>

      <p className="mt-3 font-bebas text-[11px] tracking-[0.3em] text-yellow">{c.eyebrow}</p>
      <h1 className="mt-1 font-syne text-3xl font-extrabold leading-[1.05] sm:text-4xl">
        {c.title}
      </h1>
      <p className="mt-2 font-dm text-sm text-muted">
        {c.subtitle}
      </p>
    </>
  );
}

// Naming everything this covers is the point: the old tab implied it was only
// for rentals, so nobody tried it for anything else.
//
// The KEYS are the machine side and never move; only the labels are read.
const COVERS = [
  { icon: Bike, key: "vehicle" },
  { icon: MapPin, key: "place" },
  { icon: UtensilsCrossed, key: "food" },
  { icon: Store, key: "shop" },
  { icon: Ticket, key: "event" },
] as const;

/** The five things this one box covers. */
export function TrackCovers() {
  const { language } = useLanguage();
  const c = TRACK_COPY[language].page;

  return (
    <ul className="mt-6 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
      {COVERS.map((cover) => {
        const Icon = cover.icon;
        return (
          <li key={cover.key} className="flex items-center gap-2 font-dm text-xs text-muted">
            <Icon size={13} className="shrink-0 text-yellow/70" /> {c.covers[cover.key]}
          </li>
        );
      })}
    </ul>
  );
}

/** For the customer who does have an account and need not type anything. */
export function TrackAccountCard() {
  const { language } = useLanguage();
  const c = TRACK_COPY[language].page;

  return (
    <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-dark-card px-5 py-4">
      <p className="inline-flex items-center gap-2 font-dm text-sm text-muted">
        <User size={15} className="text-yellow" />
        {c.accountNote}
      </p>
      <Link href="/orders" className="font-dm text-sm font-bold text-yellow hover:underline">
        {c.accountCta}
      </Link>
    </div>
  );
}
