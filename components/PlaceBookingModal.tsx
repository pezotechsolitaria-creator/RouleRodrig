"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { X, Loader2, CheckCircle, AlertCircle, Send, User, Mail, Users, MessageSquare, Clock, BedDouble } from "lucide-react";
import AvailabilityCalendar from "@/components/AvailabilityCalendar";
import PhoneInput from "@/components/PhoneInput";
import { isValidPhone } from "@/lib/phone";
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
  const [form, setForm] = useState({ name: "", email: "", phone: "", start: "", end: "", slot: "", qty: 1, guests: "", message: "" });

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
  const canSubmit = !!form.name && isValidPhone(form.phone) && dateChosen && slotOk && capacityOk && formState !== "loading";

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
        }),
      });
      if (!res.ok) throw new Error("failed");
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

        {formState === "success" ? (
          <div className="py-8 text-center">
            <CheckCircle size={40} className="text-green-400 mx-auto mb-4" />
            <p className="font-syne font-bold text-offwhite text-lg mb-1">Request sent!</p>
            <p className="text-muted font-dm text-sm mb-5">We&apos;ll confirm your reservation at {place.name} shortly.</p>
            {whatsapp && (
              <a
                href={`https://wa.me/${whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(`Hi Roule Rodrigues! I just requested a reservation at ${place.name}.`)}`}
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
                    type="number" min={1} max={maxQty} value={qty}
                    onChange={(e) => setForm({ ...form, qty: Math.min(maxQty, Math.max(1, Number(e.target.value) || 1)) })}
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
            <div className="relative">
              <Mail size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted/50" />
              <input
                type="email" placeholder="your@email.com" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={`${inputCls} pl-10`} disabled={formState === "loading"}
              />
            </div>
            <PhoneInput
              value={form.phone}
              onChange={(full) => setForm((f) => ({ ...f, phone: full }))}
              disabled={formState === "loading"}
              inputClassName={`${inputCls} pl-10`}
            />
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
