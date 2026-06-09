"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  CalendarDays,
  User,
  Mail,
  Phone,
  MessageSquare,
  Send,
  CheckCircle,
  AlertCircle,
  Loader2,
  BadgeCheck,
  Ban,
  Sparkles,
} from "lucide-react";
import type { FleetItem } from "@/lib/defaults";
import { useLanguage } from "@/context/LanguageContext";
import { useCurrency } from "@/context/CurrencyContext";

type FormState = "idle" | "loading" | "success" | "error";

function daysBetween(a: string, b: string): number {
  if (!a || !b) return 0;
  const diff = new Date(b).getTime() - new Date(a).getTime();
  return Math.max(0, Math.round(diff / 86_400_000));
}

function extractDailyPrice(priceStr: string): number {
  const match = priceStr.match(/[\d,]+/);
  if (!match) return 0;
  return parseInt(match[0].replace(/,/g, ""), 10);
}

function estimateTotal(scooter: FleetItem | undefined, days: number): string {
  if (!scooter || days <= 0) return "";
  const daily = extractDailyPrice(scooter.price);
  if (!daily) return "";
  let rate = daily;
  if (days >= 7)      rate = Math.round(daily * 0.85);
  else if (days >= 3) rate = Math.round(daily * 0.90);
  const total = rate * days;
  return `Rs ${total.toLocaleString()}`;
}

export default function BookingSection({ fleet }: { fleet?: FleetItem[] }) {
  const { t } = useLanguage();
  const { convert } = useCurrency();
  const scooters = (fleet ?? []).filter((s) => s.available !== false);

  const [formState, setFormState] = useState<FormState>("idle");
  const [showPartnerCode, setShowPartnerCode] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    scooter: "",
    start_date: "",
    end_date: "",
    message: "",
    partner_code: "",
  });

  const days = daysBetween(form.start_date, form.end_date);
  const selectedScooter = scooters.find((s) => s.id === form.scooter);
  const estimatedTotal = estimateTotal(selectedScooter, days);

  // ── Trip Planner → Booking: pre-fill the trip length ──
  const [desiredDays, setDesiredDays] = useState<number | null>(null);

  function isoAddDays(base: string, n: number): string {
    const d = new Date(base);
    d.setDate(d.getDate() + n);
    return d.toISOString().split("T")[0];
  }

  useEffect(() => {
    function onPrefill(e: Event) {
      const detail = (e as CustomEvent).detail as { days?: number };
      const n = Number(detail?.days);
      if (!Number.isFinite(n) || n <= 0) return;
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const start = tomorrow.toISOString().split("T")[0];
      setForm((f) => ({ ...f, start_date: start, end_date: isoAddDays(start, n) }));
      setDesiredDays(n);
    }
    window.addEventListener("rr:prefill-booking", onPrefill);
    return () => window.removeEventListener("rr:prefill-booking", onPrefill);
  }, []);

  // ── Availability: booked date ranges for the selected scooter ──
  const [bookedRanges, setBookedRanges] = useState<{ start: string; end: string; confirmed: boolean }[]>([]);

  useEffect(() => {
    if (!form.scooter) {
      setBookedRanges([]);
      return;
    }
    let active = true;
    fetch(`/api/availability?scooter=${encodeURIComponent(form.scooter)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { if (active && Array.isArray(d)) setBookedRanges(d); })
      .catch(() => { if (active) setBookedRanges([]); });
    return () => { active = false; };
  }, [form.scooter]);

  // Does the chosen range overlap an existing confirmed booking?
  const hasOverlap =
    !!form.start_date && !!form.end_date &&
    bookedRanges.some(
      (r) => r.confirmed && form.start_date <= r.end && form.end_date >= r.start
    );

  function fmtRange(start: string, end: string): string {
    const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
    try {
      return `${new Date(start).toLocaleDateString("en-GB", opts)} – ${new Date(end).toLocaleDateString("en-GB", opts)}`;
    } catch {
      return `${start} – ${end}`;
    }
  }

  const inputCls =
    "w-full bg-dark-card border border-dark-border rounded-xl px-4 py-3.5 text-offwhite text-sm font-dm placeholder:text-muted/50 focus:border-yellow focus:outline-none transition-colors";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.scooter || !form.start_date || !form.end_date) return;
    if (days <= 0) return;
    if (hasOverlap) return; // selected dates clash with a confirmed booking

    setFormState("loading");
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email || null,
          phone: form.phone || null,
          scooter: form.scooter,
          start_date: form.start_date,
          end_date: form.end_date,
          days,
          total_price: estimatedTotal || null,
          total_amount: estimatedTotal ? parseInt(estimatedTotal.replace(/\D/g, ""), 10) || null : null,
          message: form.message || null,
          partner_code: form.partner_code.trim().toUpperCase() || null,
        }),
      });
      if (!res.ok) throw new Error("Booking failed");
      setFormState("success");
      setForm({ name: "", email: "", phone: "", scooter: "", start_date: "", end_date: "", message: "", partner_code: "" });
      setShowPartnerCode(false);
      setTimeout(() => setFormState("idle"), 8000);
    } catch {
      setFormState("error");
      setTimeout(() => setFormState("idle"), 5000);
    }
  }

  const today = new Date().toISOString().split("T")[0];

  return (
    <section id="booking" className="bg-[#0a0a0a] py-24 md:py-36 overflow-x-hidden" aria-label="Book a scooter">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7 }}
          className="mb-16"
        >
          <p className="font-bebas text-yellow text-xs tracking-[0.35em] mb-2">{t.booking.eyebrow}</p>
          <h2
            className="font-syne font-extrabold text-offwhite uppercase leading-[0.95]"
            style={{ fontSize: "clamp(38px, 8vw, 80px)" }}
          >
            {t.booking.title}
          </h2>
          <p className="text-muted font-dm text-sm md:text-base mt-4 max-w-lg">
            {t.booking.subtitle}
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 lg:gap-16">
          {/* Form */}
          <motion.div
            className="lg:col-span-3"
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.8 }}
          >
            {formState === "success" && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 flex items-start gap-3 bg-green-500/10 border border-green-500/30 rounded-xl px-5 py-4"
              >
                <CheckCircle size={18} className="text-green-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-syne font-bold text-green-400 text-sm">{t.booking.successTitle}</p>
                  <p className="font-dm text-green-400/70 text-xs mt-0.5">{t.booking.successDesc}</p>
                </div>
              </motion.div>
            )}

            {formState === "error" && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-5 py-4"
              >
                <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-syne font-bold text-red-400 text-sm">{t.booking.errorTitle}</p>
                  <p className="font-dm text-red-400/70 text-xs mt-0.5">{t.booking.errorDesc}</p>
                </div>
              </motion.div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              {/* Trip Planner pre-fill banner */}
              {desiredDays && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2.5 bg-yellow/10 border border-yellow/30 rounded-xl px-4 py-3"
                >
                  <Sparkles size={15} className="text-yellow shrink-0" />
                  <p className="font-dm text-yellow text-xs leading-snug">
                    {t.booking.tripPrefill(desiredDays)}
                  </p>
                </motion.div>
              )}

              {/* Scooter */}
              <div>
                <label className="font-bebas text-muted text-[10px] tracking-[0.25em] block mb-2">
                  {t.booking.scooterLabel} <span className="text-yellow">*</span>
                </label>
                <select
                  value={form.scooter}
                  onChange={(e) => setForm({ ...form, scooter: e.target.value })}
                  className={`${inputCls} appearance-none`}
                  disabled={formState === "loading"}
                  required
                >
                  <option value="">{t.booking.scooterPlaceholder}</option>
                  {scooters.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} — {convert(s.price)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bebas text-muted text-[10px] tracking-[0.25em] block mb-2">
                    {t.booking.pickupLabel} <span className="text-yellow">*</span>
                  </label>
                  <input
                    type="date"
                    min={today}
                    value={form.start_date}
                    onChange={(e) => {
                      const v = e.target.value;
                      // Keep the planned trip length locked when prefilled
                      setForm((f) => ({
                        ...f,
                        start_date: v,
                        end_date: desiredDays && v ? isoAddDays(v, desiredDays) : f.end_date,
                      }));
                    }}
                    className={inputCls}
                    disabled={formState === "loading"}
                    required
                  />
                </div>
                <div>
                  <label className="font-bebas text-muted text-[10px] tracking-[0.25em] block mb-2">
                    {t.booking.returnLabel} <span className="text-yellow">*</span>
                  </label>
                  <input
                    type="date"
                    min={form.start_date || today}
                    value={form.end_date}
                    onChange={(e) => {
                      // Manual edit hands date control back to the user
                      setForm((f) => ({ ...f, end_date: e.target.value }));
                      setDesiredDays(null);
                    }}
                    className={inputCls}
                    disabled={formState === "loading"}
                    required
                  />
                </div>
              </div>

              {/* Availability — booked dates for the selected scooter */}
              {form.scooter && bookedRanges.filter((r) => r.confirmed).length > 0 && (
                <div className={`rounded-xl px-4 py-3 border text-xs font-dm ${hasOverlap ? "border-red-500/40 bg-red-500/10" : "border-dark-border bg-dark-card"}`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <CalendarDays size={13} className={hasOverlap ? "text-red-400" : "text-yellow"} />
                    <span className={`font-bebas tracking-[0.2em] text-[10px] ${hasOverlap ? "text-red-400" : "text-muted"}`}>
                      {t.booking.bookedDatesLabel}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {bookedRanges.filter((r) => r.confirmed).map((r, i) => (
                      <span key={i} className="inline-block bg-dark/60 border border-dark-border rounded-full px-2.5 py-1 text-muted">
                        {fmtRange(r.start, r.end)}
                      </span>
                    ))}
                  </div>
                  {hasOverlap && (
                    <p className="text-red-400 mt-2 font-medium">{t.booking.overlapWarning}</p>
                  )}
                </div>
              )}

              {/* Name + Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bebas text-muted text-[10px] tracking-[0.25em] block mb-2">
                    {t.booking.nameLabel} <span className="text-yellow">*</span>
                  </label>
                  <div className="relative">
                    <User size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted/50" />
                    <input
                      type="text"
                      placeholder={t.booking.namePlaceholder}
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className={`${inputCls} pl-10`}
                      disabled={formState === "loading"}
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="font-bebas text-muted text-[10px] tracking-[0.25em] block mb-2">
                    {t.booking.emailLabel}
                  </label>
                  <div className="relative">
                    <Mail size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted/50" />
                    <input
                      type="email"
                      placeholder="your@email.com"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className={`${inputCls} pl-10`}
                      disabled={formState === "loading"}
                    />
                  </div>
                </div>
              </div>

              {/* Phone */}
              <div>
                <label className="font-bebas text-muted text-[10px] tracking-[0.25em] block mb-2">
                  {t.booking.phoneLabel}
                </label>
                <div className="relative">
                  <Phone size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted/50" />
                  <input
                    type="tel"
                    placeholder={t.booking.phonePlaceholder}
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className={`${inputCls} pl-10`}
                    disabled={formState === "loading"}
                  />
                </div>
              </div>

              {/* Message */}
              <div>
                <label className="font-bebas text-muted text-[10px] tracking-[0.25em] block mb-2">
                  {t.booking.messageLabel}
                </label>
                <div className="relative">
                  <MessageSquare size={14} className="absolute left-4 top-4 text-muted/50" />
                  <textarea
                    rows={3}
                    placeholder={t.booking.messagePlaceholder}
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    className={`${inputCls} pl-10 resize-none`}
                    disabled={formState === "loading"}
                  />
                </div>
              </div>

              {/* Partner / Hotel code */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowPartnerCode((v) => !v)}
                  className="text-xs font-dm text-muted/50 hover:text-yellow transition-colors flex items-center gap-1.5"
                >
                  {showPartnerCode ? "▾" : "▸"} {t.booking.partnerPrompt}
                </button>
                {showPartnerCode && (
                  <div className="mt-3">
                    <label className="font-bebas text-muted text-[10px] tracking-[0.25em] block mb-2">
                      {t.booking.partnerLabel}
                    </label>
                    <input
                      type="text"
                      placeholder={t.booking.partnerPlaceholder}
                      value={form.partner_code}
                      onChange={(e) => setForm({ ...form, partner_code: e.target.value.toUpperCase() })}
                      className={inputCls}
                      disabled={formState === "loading"}
                      maxLength={30}
                    />
                    <p className="text-muted/40 font-dm text-xs mt-1.5">{t.booking.partnerHint}</p>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={formState === "loading" || formState === "success" || hasOverlap}
                className="w-full flex items-center justify-center gap-2.5 bg-yellow text-dark font-syne font-bold text-base py-4 rounded-xl hover:bg-yellow-dark transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {formState === "loading" ? (
                  <><Loader2 size={16} className="animate-spin" /> {t.booking.sending}</>
                ) : formState === "success" ? (
                  <><CheckCircle size={16} /> {t.booking.sent}</>
                ) : (
                  <>{t.booking.submit} <Send size={16} /></>
                )}
              </button>
            </form>
          </motion.div>

          {/* Summary panel */}
          <motion.div
            className="lg:col-span-2"
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.8, delay: 0.1 }}
          >
            <div className="sticky top-24 space-y-5">
              {/* Booking summary */}
              <div className="bg-dark-card border border-dark-border rounded-2xl p-6">
                <p className="font-bebas text-yellow text-[10px] tracking-[0.3em] mb-4">{t.booking.summaryTitle}</p>
                <dl className="space-y-3">
                  <div className="flex justify-between items-start">
                    <dt className="text-muted font-dm text-xs">{t.booking.summaryScooter}</dt>
                    <dd className="text-offwhite font-dm text-xs text-right font-medium">
                      {selectedScooter ? selectedScooter.name : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between items-start">
                    <dt className="text-muted font-dm text-xs">{t.booking.summaryPickup}</dt>
                    <dd className="text-offwhite font-dm text-xs">
                      {form.start_date
                        ? new Date(form.start_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                        : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between items-start">
                    <dt className="text-muted font-dm text-xs">{t.booking.summaryReturn}</dt>
                    <dd className="text-offwhite font-dm text-xs">
                      {form.end_date
                        ? new Date(form.end_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                        : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between items-start">
                    <dt className="text-muted font-dm text-xs">{t.booking.summaryDuration}</dt>
                    <dd className="text-offwhite font-dm text-xs">
                      {days > 0 ? t.booking.days(days) : "—"}
                    </dd>
                  </div>
                  {estimatedTotal && (
                    <>
                      <div className="border-t border-dark-border pt-3 flex justify-between items-center">
                        <dt className="text-muted font-dm text-xs">{t.booking.summaryTotal}</dt>
                        <dd className="text-yellow font-syne font-bold text-base">{convert(estimatedTotal)}</dd>
                      </div>
                      {days >= 3 && (
                        <p className="text-green-400/80 text-xs font-dm">{t.booking.discountNote}</p>
                      )}
                    </>
                  )}
                </dl>
              </div>

              {/* Available scooters */}
              <div className="bg-dark-card border border-dark-border rounded-2xl p-6">
                <p className="font-bebas text-yellow text-[10px] tracking-[0.3em] mb-4">{t.booking.availabilityTitle}</p>
                <div className="space-y-2.5">
                  {(fleet ?? []).map((s) => (
                    <div key={s.id} className="flex items-center justify-between">
                      <span className="text-offwhite/80 font-dm text-xs">{s.name}</span>
                      {s.available !== false ? (
                        <span className="flex items-center gap-1.5 text-green-400 text-[10px] font-bebas tracking-[0.15em]">
                          <BadgeCheck size={12} /> {t.fleet.available}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-red-400/70 text-[10px] font-bebas tracking-[0.15em]">
                          <Ban size={12} /> {t.fleet.unavailable}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* What's included */}
              <div className="bg-dark-card border border-dark-border rounded-2xl p-6">
                <p className="font-bebas text-yellow text-[10px] tracking-[0.3em] mb-4">{t.booking.includedTitle}</p>
                <ul className="space-y-2">
                  {t.booking.included.map((item) => (
                    <li key={item} className="flex items-center gap-2.5 text-xs font-dm text-offwhite/70">
                      <CheckCircle size={12} className="text-yellow shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex items-start gap-3 bg-yellow/5 border border-yellow/20 rounded-2xl p-4">
                <CalendarDays size={16} className="text-yellow shrink-0 mt-0.5" />
                <p className="text-muted font-dm text-xs leading-relaxed">
                  {t.booking.requestNote}
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
