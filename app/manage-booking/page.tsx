"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Search, Loader2, RotateCcw } from "lucide-react";
import BookingTimeline from "@/components/BookingTimeline";

type Booking = {
  kind: "vehicle" | "place";
  ref: string;
  item: string;
  start: string;
  end: string;
  days?: number;
  total: number | null;
  deposit: number | null;
  depositPaid: boolean;
  status: string;
};

const inputCls =
  "w-full bg-dark-card border border-dark-border rounded-xl px-4 py-3.5 text-offwhite text-sm font-dm placeholder:text-muted/50 focus:border-yellow focus:outline-none transition-colors";

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
            <div>
              <label className="mb-2 block font-bebas text-[10px] tracking-[0.25em] text-muted">BOOKING REFERENCE</label>
              <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="RR-A1B2C3" className={inputCls} autoCapitalize="characters" />
            </div>
            <div>
              <label className="mb-2 block font-bebas text-[10px] tracking-[0.25em] text-muted">EMAIL</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" className={inputCls} />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
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
              <span className={`rounded-full px-3 py-1 font-syne text-[11px] font-bold ${confirmed ? "bg-green-500/15 text-green-400" : "bg-yellow/15 text-yellow"}`}>
                {confirmed ? "Confirmed" : "Awaiting deposit"}
              </span>
            </div>
            <BookingTimeline completed={completed} />
            <dl className="mt-5 space-y-2 border-t border-white/[0.08] pt-4 text-sm">
              <Row k={booking.kind === "vehicle" ? "Vehicle" : "Reservation"} v={booking.item} />
              <Row k="When" v={`${booking.start}${booking.end && booking.end !== booking.start ? " → " + booking.end : ""}`} />
              {booking.total != null && <Row k="Estimated total" v={`Rs ${Number(booking.total).toLocaleString()}`} />}
              {booking.deposit != null && booking.deposit > 0 && (
                <Row k={booking.depositPaid ? "Deposit paid" : "Deposit to confirm"} v={`Rs ${Number(booking.deposit).toLocaleString()}`} strong />
              )}
            </dl>
            <button onClick={() => { setBooking(null); setRef(""); setEmail(""); }} className="mt-5 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-yellow">
              <RotateCcw size={13} /> Look up another
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
