"use client";

import Link from "next/link";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { track } from "@vercel/analytics";
import { useLanguage } from "@/context/LanguageContext";
import {
  Car,
  Phone,
  MessageCircle,
  Star,
  Loader2,
  MapPin,
  Languages,
  DollarSign,
  Bus,
  Bike,
  PenLine,
  X,
  CheckCircle,
  PlaneTakeoff,
} from "lucide-react";
import AppPageHeader from "@/components/AppPageHeader";
import type { T } from "@/lib/i18n";
import type { TaxiDriver, TaxiDriverReview } from "@/lib/supabase/taxi-types";

const VEHICLE_EMOJI: Record<string, string> = {
  car: "🚗",
  minibus: "🚐",
  van: "🚐",
  scooter: "🛵",
  other: "🚕",
};

const VEHICLE_ICON: Record<string, React.ElementType> = {
  car: Car,
  minibus: Bus,
  van: Bus,
  scooter: Bike,
  other: Car,
};

function fmtDate(s: string): string {
  try {
    return new Date(s).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return s;
  }
}

// ── THE SENTENCE A STUCK CUSTOMER READS ──────────────────────────────────────
//
// The review modal used to render whatever /api/taxi/reviews put in `error`:
// finished English, down to the raw Postgres message on a failed insert. So a
// traveller who had chosen French or Kreol met English at the one moment they
// were already stuck, and a database fault described the schema to them.
//
// A client cannot translate a sentence it did not author. Same fix as
// /api/rides/track (see lib/rides/track-errors.ts): the route sends a CODE and
// the words come from the dictionary. It lives here rather than in lib/ because
// this form is its only caller.
type ReviewFailure = { code?: string | null; error?: string | null };

function reviewErrorMessage(
  tx: T["taxi"],
  status: number,
  failure: ReviewFailure,
): string {
  // guard() answers 429 without a code of its own, and it earns its own line:
  // "wait a moment and try again" is advice, "something went wrong" is not.
  if (status === 429) return tx.errBusy;
  switch (failure.code) {
    case "driver_required":
      return tx.errDriver;
    case "name_required":
      return tx.errName;
    case "text_required":
      return tx.errText;
    case "rating_required":
      return tx.errRating;
    default:
      // Deliberately NOT failure.error — unlike the ride tracker, which can
      // fall through to the server's prose. This route's `error` is where the
      // Postgres text used to arrive, and no customer should ever read it.
      return tx.errServer;
  }
}

function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`${value} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={size}
          className={
            i < Math.round(value) ? "fill-yellow text-yellow" : "text-muted/30"
          }
        />
      ))}
    </div>
  );
}

// ── Reviews + rating modal for a single driver ───────────────────────────────
function DriverReviewsModal({
  driver,
  onClose,
}: {
  driver: TaxiDriver;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const tx = t.taxi;
  const [reviews, setReviews] = useState<TaxiDriverReview[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [origin, setOrigin] = useState("");
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/taxi/reviews?driver=${encodeURIComponent(driver.id)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d: TaxiDriverReview[]) => setReviews(Array.isArray(d) ? d : []))
      .catch(() => setReviews([]))
      .finally(() => setLoading(false));
  }, [driver.id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (rating < 1) return setError(tx.errRating);
    if (name.trim().length < 2) return setError(tx.errName);
    if (text.trim().length < 4) return setError(tx.errText);

    setSubmitting(true);
    try {
      const res = await fetch("/api/taxi/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driver_id: driver.id,
          driver_name: driver.name,
          name,
          origin,
          rating,
          text,
        }),
      });
      if (!res.ok) {
        const j: ReviewFailure = await res.json().catch(() => ({}));
        setError(reviewErrorMessage(tx, res.status, j));
        return;
      }
      setDone(true);
      setName("");
      setOrigin("");
      setRating(0);
      setText("");
    } catch {
      // fetch() only rejects when the request never completed at all — a
      // dropped connection, not an answer. Say so in the reader's language
      // rather than repeating the browser's own English.
      setError(tx.errOffline);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 20 }}
        transition={{ duration: 0.25 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-dark-card border border-white/10 rounded-2xl p-6 sm:p-8 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="font-bebas text-yellow text-[10px] tracking-[0.3em]">
              {tx.feedback}
            </p>
            <h3 className="font-syne font-extrabold text-offwhite text-xl">
              {driver.name}
            </h3>
            {driver.rating_count ? (
              <div className="flex items-center gap-2 mt-1">
                <Stars value={driver.rating_avg ?? 0} />
                <span className="text-muted text-xs font-dm">
                  {driver.rating_avg?.toFixed(1)} · {driver.rating_count}{" "}
                  {driver.rating_count !== 1 ? tx.reviews : tx.review}
                </span>
              </div>
            ) : null}
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-offwhite p-1 -mr-1 -mt-1"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Existing approved reviews */}
        <div className="mb-6">
          {loading ? (
            <div className="flex items-center gap-2 text-muted text-sm py-4">
              <Loader2 size={15} className="animate-spin" /> {tx.loadingReviews}
            </div>
          ) : reviews.length === 0 ? (
            <p className="text-muted/70 text-sm font-dm py-2">
              {tx.noReviews(driver.name)}
            </p>
          ) : (
            <div className="space-y-3 max-h-52 overflow-y-auto pr-1">
              {reviews.map((r) => (
                <div
                  key={r.id}
                  className="bg-dark border border-white/10 rounded-xl p-4"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <Stars value={r.rating} size={12} />
                    <span className="text-muted/50 text-[11px] font-dm">
                      {fmtDate(r.created_at)}
                    </span>
                  </div>
                  <p className="text-offwhite/80 text-sm font-dm leading-relaxed">
                    {r.text}
                  </p>
                  <p className="text-muted text-xs font-dm mt-2">
                    {r.name}
                    {r.origin ? ` · ${r.origin}` : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Submit form */}
        <div className="border-t border-white/10 pt-5">
          {done ? (
            <div className="text-center py-4">
              <CheckCircle size={36} className="text-green-400 mx-auto mb-3" />
              <p className="font-syne font-bold text-offwhite">
                {tx.thankTitle}
              </p>
              <p className="text-muted text-sm font-dm mt-1 max-w-xs mx-auto">
                {tx.thankDesc}
              </p>
              <button
                onClick={onClose}
                className="mt-5 bg-yellow text-dark font-syne font-bold text-sm px-6 py-3 rounded-full hover:bg-yellow-dark transition-colors"
              >
                {tx.done}
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <p className="font-bebas text-muted text-[10px] tracking-[0.25em]">
                {tx.rateThis}
              </p>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n)}
                    onMouseEnter={() => setHover(n)}
                    onMouseLeave={() => setHover(0)}
                    className="transition-transform hover:scale-110"
                    aria-label={`${n} star${n !== 1 ? "s" : ""}`}
                  >
                    <Star
                      size={30}
                      className={
                        n <= (hover || rating)
                          ? "fill-yellow text-yellow"
                          : "text-muted/30"
                      }
                    />
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={tx.yourName}
                  className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-offwhite text-sm font-dm placeholder:text-muted/40 focus:border-yellow focus:outline-none"
                />
                <input
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  placeholder={tx.fromPh}
                  className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-offwhite text-sm font-dm placeholder:text-muted/40 focus:border-yellow focus:outline-none"
                />
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
                placeholder={tx.reviewPh}
                className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-offwhite text-sm font-dm placeholder:text-muted/40 focus:border-yellow focus:outline-none resize-none"
              />
              {error && <p className="text-red-400 text-sm font-dm">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 bg-yellow text-dark font-syne font-bold text-sm px-6 py-3.5 rounded-full hover:bg-yellow-dark disabled:opacity-50 transition-colors"
              >
                {submitting ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <PenLine size={15} />
                )}
                {submitting ? tx.submitting : tx.submit}
              </button>
              <p className="text-muted/50 text-xs font-dm text-center">
                {tx.moderationNote}
              </p>
            </form>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function TaxiPage() {
  const { t } = useLanguage();
  const tx = t.taxi;
  const [drivers, setDrivers] = useState<TaxiDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewDriver, setReviewDriver] = useState<TaxiDriver | null>(null);

  // Option A — log each contact tap so demand is measurable in Vercel Analytics.
  function logContact(driver: TaxiDriver, type: "whatsapp" | "call") {
    try {
      track("taxi_contact", {
        driver: driver.name,
        type,
        vehicle: driver.vehicle_type,
      });
    } catch {
      /* analytics is best-effort */
    }
    // Durable record for the admin Leads dashboard (keepalive survives navigation)
    try {
      fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "taxi",
          target_name: driver.name,
          category: driver.vehicle_type,
          type,
        }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* best-effort */
    }
  }

  const load = useCallback(() => {
    fetch("/api/taxi")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setDrivers(d);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <main className="min-h-screen bg-dark text-offwhite font-dm">
      {/* `title` puts the world switch on a second row: 110px of header
          measured, against 57px for this shape. The page carries its own h1. */}
      <AppPageHeader showBack backHref="/" />
      <div className="max-w-5xl mx-auto px-4 md:px-6 pt-3 pb-10">
        <h1 className="font-syne text-base font-extrabold leading-tight text-offwhite md:text-3xl">
          {tx.title1} {tx.title2}
        </h1>

        {/* WAS: a tracked-capitals eyebrow repeating the title, over a 200-char
            subtitle — 114px measured, on a page that needed 607px of scrolling
            to reach one driver. The subtitle told a returning visitor nothing
            they had not worked out, and the eyebrow said "TRANSPORT" directly
            above a heading saying Transport. */}

        {/* ── THE NEW WAY, ABOVE THE DIRECTORY ─────────────────────────────
            The list below is still worth having — some people want to pick a
            driver they know by name. But the platform's job is to find them one,
            and until now the only option was to phone somebody yourself. This is
            the path that reaches every available driver at once instead of one. */}
        {/* MEASURED at 316px, of which three quarters was reassurance prose:
            an eyebrow, a two-line headline, and 150 characters explaining a
            thing the button says in two words. Three pills also wrapped to two
            rows at 375px. What is left is the action itself.

            It was also ENGLISH inside a page that is otherwise fully
            translated — a Kreol reader met "FASTEST WAY / Tell us where you're
            going" in the middle of their own language. These strings now come
            from the same dictionary as the rest of the page. */}
        <div className="mb-5 mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Link
            href="/taxi/book"
            className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-yellow px-5 font-dm text-base font-bold text-dark transition-opacity hover:opacity-90"
          >
            <Car size={17} /> {tx.bookRide}
          </Link>
          <Link
            href="/taxi/book?service=airport"
            className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-white/15 px-4 font-dm text-base text-offwhite transition-colors hover:border-yellow/50"
          >
            <PlaneTakeoff size={16} /> {tx.airportTransfer}
          </Link>
        </div>

        {/* The only way into /taxi/track from anywhere. It used to be a third
            pill up there and a footer link on /taxi/book; the booking path lost
            both, correctly — an exit does not belong inside a form. But losing
            them BOTH would have stranded the tracking screen, so it lives here,
            on the browsing page, where leaving is not a failure. */}
        <Link
          href="/taxi/track"
          className="mb-5 inline-flex min-h-11 items-center font-dm text-sm text-muted transition-colors hover:text-yellow"
        >
          {tx.followRide} →
        </Link>

        {/* Driver grid */}
        {loading ? (
          <div className="flex items-center gap-3 text-muted py-16">
            <Loader2 size={18} className="animate-spin text-yellow" />{" "}
            {tx.loading}
          </div>
        ) : drivers.length === 0 ? (
          <div className="text-center py-20">
            <Car size={48} className="text-muted/20 mx-auto mb-4" />
            <p className="text-muted font-dm text-sm">{tx.empty}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {drivers.map((d, i) => {
              const VIcon = VEHICLE_ICON[d.vehicle_type] ?? Car;
              const waNumber = (d.whatsapp ?? d.phone).replace(/\D/g, "");
              const waLink = `https://wa.me/${waNumber}?text=${encodeURIComponent(`Hi ${d.name}, I need a taxi on Rodrigues Island 🚗`)}`;
              return (
                <motion.div
                  key={d.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: Math.min(i, 3) * 0.05 }}
                  className={`bg-dark-card rounded-2xl overflow-hidden flex flex-col transition-colors ${
                    d.featured
                      ? "border-2 border-yellow/50 hover:border-yellow shadow-[0_0_24px_rgba(245,200,66,0.08)]"
                      : "border border-white/10 hover:border-yellow/40"
                  }`}
                >
                  {/* Photo or placeholder */}
                  {/* h-44 was 176px of a 494px card — a third of it, on a card whose
                      job is "ring this person", and none of it actionable. Half
                      that on a phone; unchanged from sm: up, where height is
                      free and the photo is doing real work. */}
                  <div className="relative h-28 sm:h-44 bg-gradient-to-br from-yellow/10 via-dark-card to-dark overflow-hidden">
                    {d.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={d.photo}
                        alt={d.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-5xl">
                          {VEHICLE_EMOJI[d.vehicle_type] ?? "🚗"}
                        </span>
                      </div>
                    )}
                    {d.featured && (
                      <span className="absolute top-3 left-3 flex items-center gap-1 font-bebas text-[9px] tracking-[0.15em] bg-yellow/10 text-yellow border border-yellow/30 px-2.5 py-1 rounded-full backdrop-blur-sm">
                        <Star size={8} className="fill-yellow" /> {tx.topDriver}
                      </span>
                    )}
                    {/* M72 — the admin takes a gallery now (the car, the boot,
                        the inside). The card shows the cover and says how many
                        more there are, like the shop and place cards do. */}
                    {(d.photos?.length ?? 0) > 1 && (
                      <span className="absolute bottom-3 right-3 rounded-full bg-black/70 px-2 py-0.5 font-dm text-[10px] text-white">
                        {tx.photosCount(d.photos!.length)}
                      </span>
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-5 flex flex-col flex-1 gap-3">
                    <div>
                      <h2 className="font-syne font-bold text-offwhite text-lg leading-tight">
                        {d.name}
                      </h2>
                      <p className="flex items-center gap-1.5 text-muted text-xs font-dm mt-0.5">
                        <VIcon size={12} className="text-yellow" />
                        {d.vehicle}
                      </p>
                    </div>

                    {/* Rating summary */}
                    {d.rating_count ? (
                      <button
                        onClick={() => setReviewDriver(d)}
                        className="flex items-center gap-2 text-left hover:opacity-80 transition-opacity"
                      >
                        <Stars value={d.rating_avg ?? 0} size={13} />
                        <span className="text-offwhite/80 text-xs font-dm">
                          {d.rating_avg?.toFixed(1)} · {d.rating_count}{" "}
                          {d.rating_count !== 1 ? tx.reviews : tx.review}
                        </span>
                      </button>
                    ) : null}

                    {d.areas && (
                      <p className="flex items-start gap-1.5 text-offwhite/70 text-xs font-dm">
                        <MapPin
                          size={12}
                          className="text-yellow shrink-0 mt-0.5"
                        />
                        {d.areas}
                      </p>
                    )}

                    {d.languages && d.languages.length > 0 && (
                      <p className="flex items-center gap-1.5 text-offwhite/60 text-xs font-dm">
                        <Languages size={12} className="text-yellow" />
                        {d.languages.join(" · ")}
                      </p>
                    )}

                    {/* M96: no fare is shown. Roulé Rodrigues does not set taxi
                        prices — every driver charges differently and the price
                        is agreed between the driver and the customer, so a
                        "From Rs …" here was a quote the platform could not
                        honour. public_taxi_drivers() no longer even returns
                        rate_from, so this cannot creep back by accident. */}
                    <p className="flex items-center gap-1.5 text-yellow/90 text-xs font-dm font-medium">
                      <DollarSign size={12} /> {tx.priceNote}
                    </p>

                    {d.notes && (
                      <p className="text-muted/60 text-xs font-dm italic">
                        {d.notes}
                      </p>
                    )}

                    {/* CTA row */}
                    <div className="flex items-center gap-2 mt-auto pt-3 border-t border-white/10">
                      <a
                        href={waLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => logContact(d, "whatsapp")}
                        className="flex-1 flex items-center justify-center gap-1.5 bg-green-500/15 text-green-400 hover:bg-green-500/25 text-xs font-syne font-bold px-3 py-2.5 rounded-full transition-colors"
                      >
                        <MessageCircle size={13} /> {tx.whatsapp}
                      </a>
                      <a
                        href={`tel:${d.phone.replace(/\s/g, "")}`}
                        onClick={() => logContact(d, "call")}
                        className="flex items-center justify-center gap-1.5 bg-dark border border-white/10 hover:border-yellow/40 text-muted hover:text-yellow text-xs font-syne font-bold px-3 py-2.5 rounded-full transition-colors"
                      >
                        <Phone size={13} /> {tx.call}
                      </a>
                    </div>

                    {/* Rate / reviews button */}
                    <button
                      onClick={() => setReviewDriver(d)}
                      className="flex items-center justify-center gap-1.5 text-xs font-dm text-muted hover:text-yellow border border-white/10 hover:border-yellow/40 px-3 py-2 rounded-full transition-colors"
                    >
                      <Star size={12} />{" "}
                      {d.rating_count ? tx.reviewsRate : tx.rate}
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* 102px of legal prose measured, at the foot of a page that already
            needed 607px of scrolling. It is worth keeping and it is not worth
            that, so it folds. The summary is a 44px target and the text is in
            the DOM either way, so it is still findable and still indexable.

            The disclaimer also still calls this "a scooter-rental platform",
            which stopped being the whole truth several sections ago — flagged
            rather than rewritten here, because it is legal wording and the
            owner's to settle. */}
        <details className="mt-8 text-center">
          <summary className="mx-auto inline-flex min-h-11 cursor-pointer items-center justify-center font-dm text-xs text-muted/50 transition-colors hover:text-muted">
            {tx.priceNote}
          </summary>
          <p className="mt-3 font-dm text-xs text-muted/40">{tx.fareNote}</p>
          <p className="mx-auto mt-2 max-w-2xl font-dm text-[11px] leading-relaxed text-muted/40">
            {tx.disclaimer}
          </p>
        </details>
      </div>

      <AnimatePresence>
        {reviewDriver && (
          <DriverReviewsModal
            driver={reviewDriver}
            onClose={() => setReviewDriver(null)}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
