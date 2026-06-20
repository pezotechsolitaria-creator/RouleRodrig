"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { X, Loader2, CheckCircle, AlertCircle, Send, User, Mail, Users, MessageSquare } from "lucide-react";
import AvailabilityCalendar from "@/components/AvailabilityCalendar";
import PhoneInput from "@/components/PhoneInput";
import { useLanguage } from "@/context/LanguageContext";
import type { RecommendedPlace } from "@/lib/defaults";

type FormState = "idle" | "loading" | "success" | "error";

const CAT_LABEL: Record<string, string> = {
  hotel: "stay",
  restaurant: "table",
  activity: "activity",
};

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

  const [formState, setFormState] = useState<FormState>("idle");
  const [bookedRanges, setBookedRanges] = useState<{ start: string; end: string; confirmed: boolean }[]>([]);
  const [form, setForm] = useState({ name: "", email: "", phone: "", start: "", end: "", guests: "", message: "" });

  useEffect(() => {
    let active = true;
    fetch(`/api/place-availability?place=${encodeURIComponent(place.id)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { if (active && Array.isArray(d)) setBookedRanges(d); })
      .catch(() => { if (active) setBookedRanges([]); });
    return () => { active = false; };
  }, [place.id]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const startD = form.start;
  const endD = form.end || form.start; // single-day visit allowed
  const heldCountOn = (day: string) =>
    bookedRanges.reduce((n, r) => (day >= r.start && day <= r.end ? n + 1 : n), 0);
  const hasOverlap =
    !!startD &&
    (() => {
      const d = new Date(startD);
      const end = new Date(endD);
      while (d <= end) {
        if (heldCountOn(d.toISOString().split("T")[0]) >= capacity) return true;
        d.setDate(d.getDate() + 1);
      }
      return false;
    })();

  const inputCls =
    "w-full bg-dark border border-dark-border rounded-xl px-4 py-3 text-offwhite text-sm font-dm placeholder:text-muted/50 focus:border-yellow focus:outline-none transition-colors";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !startD || hasOverlap) return;
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
          start_date: startD,
          end_date: endD,
          guests: form.guests ? Number(form.guests) : null,
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

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-dark-card border border-dark-border rounded-2xl p-6 relative"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-muted hover:text-offwhite transition-colors"
          aria-label="Close"
        >
          <X size={20} />
        </button>

        <p className="font-bebas text-yellow text-[10px] tracking-[0.3em] mb-1">RESERVE YOUR {CAT_LABEL[place.category]?.toUpperCase() ?? "SPOT"}</p>
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
                target="_blank"
                rel="noopener noreferrer"
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

            <div>
              <label className="font-bebas text-muted text-[10px] tracking-[0.25em] block mb-2">
                {isStay ? "DATES" : "DATE"} <span className="text-yellow">*</span>
              </label>
              <AvailabilityCalendar
                startDate={form.start}
                endDate={form.end}
                minDate={today}
                bookedRanges={bookedRanges}
                capacity={capacity}
                onChange={(start, end) => setForm((f) => ({ ...f, start, end }))}
                labels={{
                  booked: t.booking.calBooked,
                  available: t.booking.calAvailable,
                  selected: t.booking.calSelected,
                  hint: isStay ? t.booking.calHint : "Tap a single day",
                }}
              />
              {hasOverlap && (
                <p className="text-red-400 font-dm text-xs mt-2">Those dates are already taken — please pick another.</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="relative">
                <User size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted/50" />
                <input
                  type="text" placeholder="Your name" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className={`${inputCls} pl-10`} required disabled={formState === "loading"}
                />
              </div>
              <div className="relative">
                <Users size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted/50" />
                <input
                  type="number" min={1} max={50} placeholder="Guests" value={form.guests}
                  onChange={(e) => setForm({ ...form, guests: e.target.value })}
                  className={`${inputCls} pl-10`} disabled={formState === "loading"}
                />
              </div>
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
              disabled={formState === "loading" || !form.name || !form.start || hasOverlap}
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
