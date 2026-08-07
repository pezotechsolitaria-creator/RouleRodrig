"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Search, Loader2, RotateCcw } from "lucide-react";
import BookingTimeline from "@/components/BookingTimeline";
import PayPalDeposit from "@/components/PayPalDeposit";
import { Field } from "@/components/ui/field";

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
      setError("Enter your booking reference and email.");
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
      if (!res.ok) throw new Error(j.error || "No booking found.");
      setBooking(j.booking as Booking);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No booking found.");
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
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-yellow">
          <ArrowLeft size={15} /> Roule Rodrigues
        </Link>

        <h1 className="mt-6 font-syne text-3xl font-extrabold">Manage your booking</h1>
        <p className="mt-1 text-sm text-muted">No account needed — enter your reference and the email you booked with.</p>

        {!booking ? (
          <form onSubmit={submit} className="mt-8 space-y-4">
            {/* These were bare <label>s with no htmlFor over inputs with no id,
                so both fields announced as unnamed textboxes and tapping a
                label did not focus its control. <Field> generates the id and
                the aria wiring, so that cannot recur. */}
            <Field label="Booking reference" required>
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
            <Field label="Email" required error={error}>
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
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Find my booking
            </button>
            <p className="text-center text-[11px] text-muted/60">Your reference is in your confirmation email &amp; receipt (it looks like RR-XXXXXX).</p>
          </form>
        ) : (
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
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
                {isCancelled ? "Cancelled" : isCompleted ? "Completed" : confirmed ? "Confirmed" : "Awaiting deposit"}
              </span>
            </div>
            {isCancelled ? (
              <div className="rounded-xl border border-red-500/25 bg-red-500/[0.05] p-4">
                <p className="font-dm text-sm text-offwhite">
                  This booking was cancelled — either the reservation window passed before it was confirmed, or the
                  vehicle was secured by someone else first.
                </p>
                <p className="mt-1.5 font-dm text-sm text-muted">You have not been charged.</p>
                <Link
                  href="/browse/scooter"
                  className="mt-3 inline-flex items-center gap-1.5 font-dm text-sm font-bold text-yellow hover:underline"
                >
                  Book again →
                </Link>
              </div>
            ) : (
              <BookingTimeline completed={completed} />
            )}
            <dl className="mt-5 space-y-2 border-t border-white/[0.08] pt-4 text-sm">
              <Row k={booking.kind === "vehicle" ? "Vehicle" : "Reservation"} v={booking.item} />
              <Row k="When" v={`${fmtD(booking.start)}${booking.end && booking.end !== booking.start ? " → " + fmtD(booking.end) : ""}`} />
              {booking.total != null && <Row k="Estimated total" v={`Rs ${Number(booking.total).toLocaleString()}`} />}
              {/* Never show a deposit as still owed on a booking that can no
                  longer be paid — that was the core of the same lie. */}
              {booking.deposit != null && booking.deposit > 0 && !isCancelled && (
                <Row
                  k={booking.depositPaid ? (paidInFull ? "Paid in full" : "Deposit paid") : "Deposit to confirm"}
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
                  k={balanceDue > 0 ? "Balance at pickup" : "Balance"}
                  v={balanceDue > 0 ? `Rs ${balanceDue.toLocaleString()}` : "Nothing further to pay"}
                />
              )}
            </dl>

            {/* Still pending & unpaid → let the guest pay the deposit right here to lock it in. */}
            {booking.status === "pending" && !booking.depositPaid && booking.deposit != null && booking.deposit > 0 && (
              <div className="mt-5 border-t border-white/[0.08] pt-5">
                <PayPalDeposit
                  bookingId={booking.id}
                  depositMur={booking.deposit}
                  fullMur={booking.kind === "vehicle" && booking.total ? booking.total : undefined}
                  kind={booking.kind}
                  onPaid={() => setBooking((b) => (b ? { ...b, depositPaid: true, status: "confirmed" } : b))}
                />
              </div>
            )}

            <button onClick={() => { setBooking(null); setRef(""); setEmail(""); }} className="mt-5 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-yellow">
              <RotateCcw size={13} /> Look up another
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
