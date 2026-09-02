"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, Loader2, RotateCcw } from "lucide-react";
import BackLink from "@/components/BackLink";
import BookingTimeline from "@/components/BookingTimeline";
import OrderAlerts from "@/components/orders/OrderAlerts";
import PayPalDeposit from "@/components/PayPalDeposit";
import BankTransferDetails from "@/components/BankTransferDetails";
import { Field } from "@/components/ui/field";
import { useLanguage } from "@/context/LanguageContext";
import { loc } from "@/lib/localize";

type Booking = {
  kind: "vehicle" | "place";
  id: string;
  ref: string;
  item: string;
  start: string;
  end: string;
  days?: number;
  total: number | null;
  deposit: number | null;
  /** What was ACTUALLY captured (M19). null on pre-M19 or non-card bookings. */
  amountPaid?: number | null;
  depositPaid: boolean;
  status: string;
  /** M91 — when an approved-but-unpaid reservation stops holding the vehicle. */
  paymentDueBy?: string | null;
  /** M91 — why a request could not be met, in the owner's own words. */
  unavailableNote?: string | null;
};

// dd/mm/yyyy — the format guests expect (not the ISO the API returns).
function fmtD(iso: string): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB");
}


function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{k}</dt>
      <dd className={`text-right ${strong ? "font-syne font-bold text-yellow" : "text-offwhite"}`}>{v}</dd>
    </div>
  );
}

export default function ManageBookingPage() {
  const { t, language } = useLanguage();
  const M = t.manageBooking;
  const [kind, setKind] = useState<"vehicle" | "shop">("vehicle");
  const [ref, setRef] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBooking(null);
    if (!ref.trim() || !email.trim()) {
      setError(M.errMissing);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/bookings/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref, email }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || M.errNotFound);
      setBooking(j.booking as Booking);
    } catch (err) {
      setError(err instanceof Error ? err.message : M.errNotFound);
    } finally {
      setLoading(false);
    }
  }

  const completed = booking ? (booking.depositPaid || booking.status === "confirmed" ? 3 : 1) : 1;
  const confirmed = booking?.status === "confirmed" || booking?.depositPaid;
  // Anything not confirmed used to fall through to a hopeful yellow "Awaiting
  // deposit" badge — including CANCELLED, which is exactly what the guests most
  // likely to check back are looking at: the nightly cron cancels every expired
  // unpaid hold, and the PayPal capture cancels bumped rivals. They were being
  // told they still owed a deposit they could no longer pay, with no button to
  // pay it and no explanation.
  const isCancelled = booking?.status === "cancelled";
  const isCompleted = booking?.status === "completed";
  // What the customer actually paid. Falls back to the deposit for rows that
  // predate M19 (or were not paid by card), which is exactly how those rows
  // behaved before — no existing booking changes meaning.
  const paidAmount = booking?.depositPaid ? (booking.amountPaid ?? booking.deposit ?? 0) : 0;
  const paidInFull = Boolean(booking?.total != null && paidAmount >= Number(booking.total));
  const balanceDue = Math.max(0, Number(booking?.total ?? 0) - paidAmount);

  return (
    <main className="min-h-screen bg-dark font-dm text-offwhite">
      <div className="mx-auto max-w-lg px-5 py-10 md:py-16">
        {/* Fallback /more: the only page in the app that links here is /more's
            "Bookings & help" group, and this lookup needs no account — sending a
            guest who arrived from a booking email to /account would offer them a
            sign-in they do not have. The label is localised inline rather than
            left in English on an otherwise translated screen. */}
        <BackLink
          fallback="/more"
          iconSize={15}
          className="inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-yellow"
        >
          {" "}{loc(language, "Back", "Retour", "Retourne")}
        </BackLink>

        <h1 className="mt-6 font-syne text-3xl font-extrabold">{M.title}</h1>
        <p className="mt-1 text-sm text-muted">
          {kind === "vehicle" ? M.subtitleVehicle : M.subtitleShop}
        </p>

        {/* The Bookings tab used to reach vehicle rentals only, so a customer
            who had bought from a shop had nowhere to go — /orders existed but
            nothing linked to it. The two are genuinely different journeys, not
            one list with a filter: a vehicle booking is looked up as a GUEST
            with a reference, while a shop order needs the account it was placed
            with (create_order requires auth.uid()). Naming that difference here
            is kinder than a single form that silently fails for half the people
            who use it. */}
        <div role="tablist" aria-label={M.tabsLabel} className="mt-6 flex gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-1.5">
          {([
            ["vehicle", M.tabVehicle],
            ["shop", M.tabShop],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={kind === value}
              onClick={() => setKind(value)}
              className={`flex-1 rounded-xl px-3 py-2.5 font-dm text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow/60 ${
                kind === value ? "bg-yellow text-dark" : "text-muted hover:text-offwhite"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {kind === "shop" ? (
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <h2 className="font-syne text-lg font-bold text-offwhite">{M.shopTitle}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{M.shopBody}</p>
            <Link
              href="/orders"
              className="mt-5 inline-flex w-full items-center justify-center rounded-full bg-yellow px-5 py-3 font-syne text-sm font-bold text-dark transition-colors hover:bg-yellow-dark"
            >
              {M.shopCta}
            </Link>
            <p className="mt-4 text-xs leading-relaxed text-muted">
              {M.shopSwitchBefore} <strong className="text-offwhite">{M.tabVehicle}</strong> {M.shopSwitchAfter}
            </p>
          </div>
        ) : !booking ? (
          <form onSubmit={submit} className="mt-8 space-y-4">
            {/* These were bare <label>s with no htmlFor over inputs with no id,
                so both fields announced as unnamed textboxes and tapping a
                label did not focus its control. <Field> generates the id and
                the aria wiring, so that cannot recur. */}
            <Field label={M.refLabel} required>
              {(p) => (
                <input
                  {...p}
                  value={ref}
                  onChange={(e) => setRef(e.target.value)}
                  placeholder="RR-A1B2C3"
                  autoCapitalize="characters"
                />
              )}
            </Field>
            <Field label={M.emailLabel} required error={error}>
              {(p) => (
                <input
                  {...p}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                />
              )}
            </Field>
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-yellow py-3.5 font-syne font-bold text-dark transition-colors hover:bg-yellow-dark disabled:opacity-50"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} {M.find}
            </button>
            <p className="text-center text-[11px] text-muted/60">{M.refHint}</p>
          </form>
        ) : (
          <>
          {/* Offered once the booking is on screen, because that is the moment
              "will you tell me when this is confirmed?" occurs to the customer.
              Hidden for a booking already finished or cancelled — nothing more
              is coming, so the switch would be a lie. */}
          {!isCancelled && !isCompleted && (
            <OrderAlerts bookingRef={booking.ref} email={email} className="mt-8" />
          )}
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <span className="font-bebas text-[11px] tracking-[0.3em] text-yellow">{booking.ref}</span>
              <span
                className={`rounded-full px-3 py-1 font-syne text-[11px] font-bold ${
                  isCancelled
                    ? "bg-red-500/15 text-red-400"
                    : isCompleted
                      ? "bg-white/10 text-muted"
                      : confirmed
                        ? "bg-green-500/15 text-green-400"
                        : "bg-yellow/15 text-yellow"
                }`}
              >
                {isCancelled ? M.statusCancelled : isCompleted ? M.statusCompleted : confirmed ? M.statusConfirmed : M.statusAwaiting}
              </span>
            </div>
            {isCancelled ? (
              <div className="rounded-xl border border-red-500/25 bg-red-500/[0.05] p-4">
                <p className="font-dm text-sm text-offwhite">{M.cancelledBody}</p>
                <p className="mt-1.5 font-dm text-sm text-muted">{M.cancelledNoCharge}</p>
                <Link
                  href="/browse/scooter"
                  className="mt-3 inline-flex items-center gap-1.5 font-dm text-sm font-bold text-yellow hover:underline"
                >
                  {M.bookAgain} →
                </Link>
              </div>
            ) : (
              <BookingTimeline completed={completed} />
            )}
            <dl className="mt-5 space-y-2 border-t border-white/[0.08] pt-4 text-sm">
              <Row k={booking.kind === "vehicle" ? M.rowVehicle : M.rowReservation} v={booking.item} />
              <Row k={M.rowWhen} v={`${fmtD(booking.start)}${booking.end && booking.end !== booking.start ? " → " + fmtD(booking.end) : ""}`} />
              {booking.total != null && <Row k={M.rowTotal} v={`Rs ${Number(booking.total).toLocaleString()}`} />}
              {/* Never show a deposit as still owed on a booking that can no
                  longer be paid — that was the core of the same lie. */}
              {booking.deposit != null && booking.deposit > 0 && !isCancelled && (
                <Row
                  k={booking.depositPaid ? (paidInFull ? M.rowPaidInFull : M.rowDepositPaid) : M.rowDepositToConfirm}
                  v={`Rs ${Number(paidAmount ?? booking.deposit).toLocaleString()}`}
                  strong
                />
              )}
              {/* The balance line only appears when one is genuinely owed. A
                  customer who chose "pay in full" used to be shown a deposit
                  and an implied balance, and was asked for it again at pickup —
                  the booking row simply had nowhere to record what they paid. */}
              {booking.depositPaid && !isCancelled && booking.total != null && (
                <Row
                  k={balanceDue > 0 ? M.rowBalanceAtPickup : M.rowBalance}
                  v={balanceDue > 0 ? `Rs ${balanceDue.toLocaleString()}` : M.rowNothingToPay}
                />
              )}
            </dl>

            {/* ── M91: waiting on the availability check ──────────────────
                A vehicle request is no longer payable on arrival. The owner
                confirms with the partner first, so showing a pay button here
                would let a customer buy a scooter nobody has agreed to lend. */}
            {booking.kind === "vehicle" && booking.status === "pending" && !booking.depositPaid && (
              <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="font-syne text-sm font-bold text-offwhite">{M.checkingTitle}</p>
                <p className="mt-1 font-dm text-xs leading-relaxed text-muted">{M.checkingBody}</p>
              </div>
            )}

            {/* Declined, in the owner's own words rather than a bare "cancelled". */}
            {booking.unavailableNote && (
              <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="font-syne text-sm font-bold text-offwhite">{M.noteTitle}</p>
                <p className="mt-1 whitespace-pre-line font-dm text-xs leading-relaxed text-muted">
                  {booking.unavailableNote}
                </p>
              </div>
            )}

            {/* Approved → pay, WITH the deadline stated. A reservation that
                expires silently is the defect the marketplace already has;
                repeating it here would be inexcusable. */}
            {booking.status === "approved" && !booking.depositPaid && booking.deposit != null && booking.deposit > 0 && (
              <div className="mt-5 border-t border-white/[0.08] pt-5">
                <div className="mb-4 rounded-xl border border-green-500/30 bg-green-500/[0.07] p-3.5">
                  <p className="font-syne text-sm font-bold text-green-300">{M.approvedTitle}</p>
                  <p className="mt-1 font-dm text-xs leading-relaxed text-green-200/80">
                    {booking.paymentDueBy
                      ? M.holdingUntil(new Date(booking.paymentDueBy).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }))
                      : M.payBelow}
                  </p>
                </div>
                <PayPalDeposit
                  bookingId={booking.id}
                  depositMur={booking.deposit}
                  fullMur={booking.kind === "vehicle" && booking.total ? booking.total : undefined}
                  kind={booking.kind}
                  onPaid={() => setBooking((b) => (b ? { ...b, depositPaid: true, status: "confirmed" } : b))}
                />
                <BankTransferDetails
                  name={booking.ref}
                  vehicle={booking.item}
                  bookingId={booking.id}
                  email={email}
                />
              </div>
            )}

            {/* Place bookings are unchanged — they were never gated on an
                availability check, and quietly changing that here would break a
                flow this milestone is not about. */}
            {booking.kind === "place" && booking.status === "pending" && !booking.depositPaid && booking.deposit != null && booking.deposit > 0 && (
              <div className="mt-5 border-t border-white/[0.08] pt-5">
                <PayPalDeposit
                  bookingId={booking.id}
                  depositMur={booking.deposit}
                  // No larger "pay in full" option here — an activity is already
                  // settled in full at the amount the owner set.
                  settlement="full"
                  kind={booking.kind}
                  onPaid={() => setBooking((b) => (b ? { ...b, depositPaid: true, status: "confirmed" } : b))}
                />
              </div>
            )}

            <button onClick={() => { setBooking(null); setRef(""); setEmail(""); }} className="mt-5 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-yellow">
              <RotateCcw size={13} /> {M.lookUpAnother}
            </button>
          </div>
          </>
        )}
      </div>
    </main>
  );
}
