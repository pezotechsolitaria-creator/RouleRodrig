"use client";

import { useState, useEffect } from "react";
import posthog from "posthog-js";
import { motion } from "framer-motion";
import { X, Loader2, AlertCircle, Send, User, Mail, Users, MessageSquare, Clock, BedDouble } from "lucide-react";
import AvailabilityCalendar from "@/components/AvailabilityCalendar";
import PhoneInput from "@/components/PhoneInput";
import PayPalDeposit from "@/components/PayPalDeposit";
import BankTransferDetails from "@/components/BankTransferDetails";
import SuccessBurst from "@/components/SuccessBurst";
import { isValidPhone, isValidEmail } from "@/lib/phone";
import { useLanguage } from "@/context/LanguageContext";
import type { RecommendedPlace } from "@/lib/defaults";

type FormState = "idle" | "loading" | "success" | "error";

interface Range {
  start: string;
  end: string;
  confirmed: boolean;
  quantity: number;
  slot: string | null;
}

export default function PlaceBookingModal({
  place,
  whatsapp,
  onClose,
}: {
  place: RecommendedPlace;
  whatsapp?: string;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const capacity = Math.max(1, place.capacity ?? 1);
  const today = new Date().toISOString().split("T")[0];
  const isStay = place.category === "hotel";
  const slots = (place.timeSlots ?? []).filter(Boolean);
  // What one reservation consumes + how we label it
  const unitLabel = isStay ? "Rooms" : place.category === "restaurant" ? "Party size" : "People";
  const unitLeftLabel = isStay ? "rooms" : place.category === "restaurant" ? "seats" : "spots";

  const [formState, setFormState] = useState<FormState>("idle");
  const [ranges, setRanges] = useState<Range[]>([]);
  const [form, setForm] = useState({ name: "", email: "", phone: "", start: "", end: "", slot: "", qty: 1, guests: "", message: "", arrival: "" });
  // After a successful request: the created booking + whether a deposit is due,
  // and whether that deposit has been paid (→ confirmed celebration).
  const [result, setResult] = useState<{ bookingId: string; depositAmount: number | null } | null>(null);
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/place-availability?place=${encodeURIComponent(place.id)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { if (active && Array.isArray(d)) setRanges(d); })
      .catch(() => { if (active) setRanges([]); });
    return () => { active = false; };
  }, [place.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // ── Usage math ──────────────────────────────────────────────────────────
  const usedOn = (day: string) =>
    ranges.reduce((n, r) => (day >= r.start && day <= r.end ? n + (r.quantity || 1) : n), 0);
  const usedDateSlot = (date: string, slot: string | null) =>
    ranges.reduce((n, r) => (r.start === date && (r.slot ?? null) === slot ? n + (r.quantity || 1) : n), 0);

  // Hotels: a night is full when every room is taken
  const stayDayFull = (day: string) => capacity - usedOn(day) <= 0;
  // Restaurants/activities: a date is full when all slots (or the day) are full
  const slotLeft = (date: string, slot: string | null) => capacity - usedDateSlot(date, slot);
  const eatDayFull = (date: string) =>
    slots.length > 0 ? slots.every((s) => slotLeft(date, s) <= 0) : slotLeft(date, null) <= 0;

  // Rooms available across the whole selected stay
  const minRoomsLeft = (() => {
    if (!isStay || !form.start || !form.end) return capacity;
    let min = capacity;
    for (let d = new Date(form.start); d <= new Date(form.end); d.setDate(d.getDate() + 1)) {
      min = Math.min(min, capacity - usedOn(d.toISOString().split("T")[0]));
    }
    return Math.max(0, min);
  })();

  // Seats/spots available for the chosen date (+ slot)
  const seatsLeft = (() => {
    if (isStay || !form.start) return capacity;
    if (slots.length > 0) return form.slot ? Math.max(0, slotLeft(form.start, form.slot)) : capacity;
    return Math.max(0, slotLeft(form.start, null));
  })();

  const maxQty = isStay ? Math.max(1, minRoomsLeft) : Math.max(1, seatsLeft);
  const qty = Math.min(Math.max(1, form.qty), maxQty);

  // ── Validity ──
  const dateChosen = isStay ? !!(form.start && form.end) : !!form.start;
  const slotOk = isStay || slots.length === 0 || !!form.slot;
  const capacityOk = isStay ? minRoomsLeft >= qty : seatsLeft >= qty;
  const emailOk = isValidEmail(form.email); // email now required (confirmation + receipt)
  const emailInvalid = !!form.email && !isValidEmail(form.email);
  const canSubmit = !!form.name && isValidPhone(form.phone) && emailOk && dateChosen && slotOk && capacityOk && formState !== "loading";

  const inputCls =
    "w-full bg-dark border border-dark-border rounded-xl px-4 py-3 text-offwhite text-sm font-dm placeholder:text-muted/50 focus:border-yellow focus:outline-none transition-colors";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setFormState("loading");
    try {
      const res = await fetch("/api/place-bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          place_id: place.id,
          place_name: place.name,
          name: form.name,
          email: form.email || null,
          phone: form.phone || null,
          start_date: form.start,
          end_date: isStay ? form.end : form.start,
          quantity: qty,
          time_slot: !isStay && slots.length > 0 ? form.slot : null,
          guests: isStay && form.guests ? Number(form.guests) : null,
          message: form.message || null,
          arrival: isStay && form.arrival.trim() ? form.arrival.trim() : null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "failed");
      posthog.capture("place_reservation_requested", {
        place_id: place.id,
        place_category: place.category,
        quantity: qty,
        has_deposit: Boolean((j.depositAmount ?? 0) > 0),
      });
      setResult({ bookingId: j.bookingId, depositAmount: j.depositAmount ?? null });
      setFormState("success");
    } catch {
      setFormState("error");
      setTimeout(() => setFormState("idle"), 4000);
    }
  }

  const calLabels = {
    booked: t.booking.calBooked,
    available: t.booking.calAvailable,
    selected: t.booking.calSelected,
    hint: isStay ? "Tap check-in then check-out" : "Tap a day",
  };

  const summaryWhen = isStay
    ? `${form.start} → ${form.end}`
    : `${form.start}${form.slot ? " · " + form.slot : ""}`;
  const waLink = (msg: string) =>
    whatsapp
      ? `https://wa.me/${whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(`Hi Roule Rodrigues! ${msg} — ${place.name}.`)}`
      : "#";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-dark-card border border-dark-border rounded-2xl p-6 relative"
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-muted hover:text-offwhite transition-colors" aria-label="Close">
          <X size={20} />
        </button>

        <p className="font-bebas text-yellow text-[10px] tracking-[0.3em] mb-1">
          {isStay ? "BOOK YOUR STAY" : place.category === "restaurant" ? "RESERVE A TABLE" : "BOOK THIS ACTIVITY"}
        </p>
        <h3 className="font-syne font-extrabold text-offwhite text-2xl leading-tight mb-1">{place.name}</h3>
        {place.priceNote && <p className="text-yellow/90 font-dm text-sm mb-4">{place.priceNote}</p>}

        {formState === "success" && paid ? (
          /* ── Paid in full → confirmed celebration ── */
          <div className="py-6 text-center">
            <SuccessBurst size={84} />
            <p className="mt-4 font-syne font-extrabold text-offwhite text-xl mb-1">Reservation confirmed! 🎉</p>
            <p className="text-muted font-dm text-sm mb-5">You&apos;re paid up — nothing to settle on the day. See you at {place.name}; we&apos;ll be in touch with the details.</p>
            {whatsapp && (
              <a href={waLink("I just paid for my booking")} target="_blank" rel="noopener noreferrer"
                 className="inline-flex items-center gap-2 bg-green-500 text-white font-syne font-bold text-sm py-2.5 px-5 rounded-xl hover:bg-green-600 transition-colors">
                <MessageSquare size={15} /> Message us on WhatsApp
              </a>
            )}
            <button onClick={onClose} className="block mx-auto mt-4 text-muted hover:text-yellow text-sm font-dm transition-colors">Done</button>
          </div>
        ) : formState === "success" && result?.depositAmount && result.depositAmount > 0 ? (
          /* ── Request received → success animation first, THEN the payment step
                (so PayPal never overwhelms before the booking is acknowledged) ── */
          <div className="py-2">
            <div className="text-center">
              <SuccessBurst />
              <p className="mt-4 font-syne font-extrabold text-offwhite text-xl">Booking request received!</p>
              <p className="mt-1 text-muted font-dm text-sm">One quick step to lock it in — pay below and it&apos;s confirmed.</p>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.55 }}
              className="mt-6"
            >
              <dl className="mb-5 space-y-2 rounded-xl border border-dark-border bg-dark/40 p-4 text-sm font-dm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">{isStay ? "Stay" : place.category === "restaurant" ? "Table" : "Booking"}</dt>
                  <dd className="text-offwhite text-right">{place.name}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">When</dt>
                  <dd className="text-offwhite text-right">{summaryWhen}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">{unitLabel}</dt>
                  <dd className="text-offwhite text-right">{qty}</dd>
                </div>
                <div className="flex justify-between gap-3 border-t border-dark-border pt-2">
                  <dt className="text-muted">Total to pay now</dt>
                  <dd className="text-yellow font-syne font-bold text-right">Rs {result.depositAmount.toLocaleString()}</dd>
                </div>
              </dl>

              <PayPalDeposit bookingId={result.bookingId} depositMur={result.depositAmount} kind="place" settlement="full" onPaid={() => setPaid(true)} />
              <BankTransferDetails
                name={form.name}
                vehicle={place.name}
                settlement="full"
                bookingId={result.bookingId}
                email={form.email}
              />

              {whatsapp && (
                <a href={waLink("about my reservation")} target="_blank" rel="noopener noreferrer"
                   className="mt-3 w-full flex items-center justify-center gap-2 text-muted hover:text-yellow font-dm text-sm py-2 transition-colors">
                  <MessageSquare size={15} /> Prefer to chat? Message us on WhatsApp
                </a>
              )}
              <p className="mt-3 text-muted/50 font-dm text-[11px] text-center">This is the full price — once it&apos;s paid there is nothing left to settle with {place.name}.</p>
            </motion.div>
          </div>
        ) : formState === "success" ? (
          /* ── Request-only listing (no price set) → request received ── */
          <div className="py-8 text-center">
            <SuccessBurst />
            <p className="mt-4 font-syne font-bold text-offwhite text-lg mb-1">Request sent!</p>
            <p className="text-muted font-dm text-sm mb-5">We&apos;ll confirm your reservation at {place.name} shortly.</p>
            {whatsapp && (
              <a
                href={waLink("I just requested a reservation")}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-green-500 text-white font-syne font-bold text-sm py-2.5 px-5 rounded-xl hover:bg-green-600 transition-colors"
              >
                <MessageSquare size={15} /> Message us on WhatsApp
              </a>
            )}
            <button onClick={onClose} className="block mx-auto mt-4 text-muted hover:text-yellow text-sm font-dm transition-colors">Close</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            {formState === "error" && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
                <AlertCircle size={16} className="text-red-400 shrink-0" />
                <p className="text-red-400/80 font-dm text-xs">Something went wrong. Please try again.</p>
              </div>
            )}

            {/* Date(s) */}
            <div>
              <label className="font-bebas text-muted text-[10px] tracking-[0.25em] block mb-2">
                {isStay ? "CHECK-IN → CHECK-OUT" : "DATE"} <span className="text-yellow">*</span>
              </label>
              <AvailabilityCalendar
                startDate={form.start}
                endDate={isStay ? form.end : form.start}
                minDate={today}
                bookedRanges={[]}
                singleDay={!isStay}
                isDayFull={isStay ? stayDayFull : eatDayFull}
                onChange={(start, end) =>
                  setForm((f) => ({ ...f, start, end: isStay ? end : start, slot: "" }))
                }
                labels={calLabels}
              />
            </div>

            {/* Restaurants / activities: time slot */}
            {!isStay && slots.length > 0 && form.start && (
              <div>
                <label className="font-bebas text-muted text-[10px] tracking-[0.25em] flex items-center gap-1.5 mb-2">
                  <Clock size={12} className="text-yellow" /> TIME <span className="text-yellow">*</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {slots.map((s) => {
                    const left = slotLeft(form.start, s);
                    const full = left <= 0;
                    const active = form.slot === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        disabled={full}
                        onClick={() => setForm((f) => ({ ...f, slot: s, qty: 1 }))}
                        className={`px-3.5 py-2 rounded-xl text-sm font-dm border transition-colors ${
                          full
                            ? "border-dark-border text-muted/30 line-through cursor-not-allowed"
                            : active
                            ? "bg-yellow text-dark border-yellow font-bold"
                            : "border-dark-border text-offwhite/80 hover:border-yellow/40"
                        }`}
                      >
                        {s}{!full && <span className="text-[10px] opacity-60"> · {left} {unitLeftLabel}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quantity (rooms / party size / people) + guests for hotels */}
            {dateChosen && slotOk && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bebas text-muted text-[10px] tracking-[0.25em] flex items-center gap-1.5 mb-2">
                    {isStay ? <BedDouble size={12} className="text-yellow" /> : <Users size={12} className="text-yellow" />}
                    {unitLabel.toUpperCase()}
                  </label>
                  <input
                    type="number" min={1} max={maxQty} inputMode="numeric" value={form.qty === 0 ? "" : form.qty}
                    // Let the field be freely typed (incl. cleared) so any
                    // multi-digit value is reachable on mobile; we only clamp to
                    // 1..maxQty when the field loses focus, not on each keystroke.
                    onChange={(e) => {
                      const raw = e.target.value;
                      setForm({ ...form, qty: raw === "" ? 0 : Math.max(0, Math.floor(Number(raw) || 0)) });
                    }}
                    onBlur={() => setForm((f) => ({ ...f, qty: Math.min(maxQty, Math.max(1, f.qty || 1)) }))}
                    className={inputCls} disabled={formState === "loading"}
                  />
                  <p className="text-muted/50 font-dm text-[11px] mt-1">{maxQty} {unitLeftLabel} available</p>
                </div>
                {isStay && (
                  <div>
                    <label className="font-bebas text-muted text-[10px] tracking-[0.25em] block mb-2">GUESTS</label>
                    <input
                      type="number" min={1} max={99} placeholder="2" value={form.guests}
                      onChange={(e) => setForm({ ...form, guests: e.target.value })}
                      className={inputCls} disabled={formState === "loading"}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Contact */}
            <div className="relative">
              <User size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted/50" />
              <input
                type="text" placeholder="Your name" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={`${inputCls} pl-10`} required disabled={formState === "loading"}
              />
            </div>
            <div>
              <div className="relative">
                <Mail size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted/50" />
                <input
                  type="email" placeholder="your@email.com (required)" value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className={`${inputCls} pl-10${emailInvalid ? " !border-red-500/60" : ""}`} required disabled={formState === "loading"}
                />
              </div>
              {emailInvalid && <p className="text-red-400 font-dm text-[11px] mt-1.5">Please enter a valid email address.</p>}
            </div>
            <PhoneInput
              value={form.phone}
              onChange={(full) => setForm((f) => ({ ...f, phone: full }))}
              disabled={formState === "loading"}
              inputClassName={`${inputCls} pl-10`}
            />
            {isStay && (
              <div>
                <label className="font-bebas text-muted text-[10px] tracking-[0.25em] flex items-center gap-1.5 mb-2">
                  <Clock size={12} className="text-yellow" /> ARRIVAL DETAILS
                </label>
                <input
                  type="text"
                  placeholder="Arrival time, flight or ferry — so we know when you land"
                  value={form.arrival}
                  onChange={(e) => setForm({ ...form, arrival: e.target.value })}
                  className={inputCls}
                  disabled={formState === "loading"}
                />
              </div>
            )}
            <textarea
              rows={2} placeholder="Anything we should know? (optional)" value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              className={`${inputCls} resize-none`} disabled={formState === "loading"}
            />

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full flex items-center justify-center gap-2 bg-yellow text-dark font-syne font-bold text-base py-3.5 rounded-xl hover:bg-yellow-dark transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {formState === "loading" ? <><Loader2 size={16} className="animate-spin" /> Sending…</> : <>Request reservation <Send size={15} /></>}
            </button>
            <p className="text-muted/40 font-dm text-[11px] text-center">A request, not a confirmed booking — we&apos;ll confirm availability with you.</p>
          </form>
        )}
      </motion.div>
    </div>
  );
}
