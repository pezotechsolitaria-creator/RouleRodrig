"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  CalendarDays,
  Clock,
  User,
  Mail,
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
import AvailabilityCalendar from "@/components/AvailabilityCalendar";
import PhoneInput from "@/components/PhoneInput";
import PayPalDeposit from "@/components/PayPalDeposit";
import BankTransferDetails from "@/components/BankTransferDetails";
import { isValidPhone, isValidEmail } from "@/lib/phone";

type FormState = "idle" | "loading" | "success" | "error";

// Half-hour pickup/return times across typical operating hours (06:00–20:00).
const TIME_SLOTS: { value: string; label: string }[] = (() => {
  const out: { value: string; label: string }[] = [];
  for (let m = 6 * 60; m <= 20 * 60; m += 30) {
    const h = Math.floor(m / 60), mm = m % 60;
    const value = `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    const h12 = ((h + 11) % 12) + 1;
    const label = `${h12}:${String(mm).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
    out.push({ value, label });
  }
  return out;
})();

function timeLabel(value?: string | null): string {
  return TIME_SLOTS.find((s) => s.value === value)?.label ?? (value ?? "");
}

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

// Delivery: scooters are delivered and collected for Rs 200 each way (Rs 400
// total); cars are delivered free. Category-driven so it stays correct even if
// the booking form is reused for a mixed fleet.
const DELIVERY_EACH_WAY = 200;
function deliveryFee(vehicle: FleetItem | undefined): number {
  if (!vehicle) return 0;
  return (vehicle.category ?? "scooter") === "car" ? 0 : DELIVERY_EACH_WAY * 2;
}

// Deposit to confirm a booking: cars 50%, scooters 25%. Kept in sync with the
// server, which recomputes it authoritatively (the client value is display-only).
function depositPct(vehicle: FleetItem | undefined): number {
  return (vehicle?.category ?? "scooter") === "car" ? 50 : 25;
}

// Full price breakdown as numbers, so the UI, the charge and the email all agree.
function priceBreakdown(
  vehicle: FleetItem | undefined,
  days: number,
): { rental: number; delivery: number; total: number; deposit: number; balance: number; pct: number } | null {
  if (!vehicle || days <= 0) return null;
  const daily = extractDailyPrice(vehicle.price);
  if (!daily) return null;
  let rate = daily;
  if (days >= 7) rate = Math.round(daily * 0.85);
  else if (days >= 3) rate = Math.round(daily * 0.9);
  const rental = rate * days;
  const delivery = deliveryFee(vehicle);
  const total = rental + delivery;
  const pct = depositPct(vehicle);
  const deposit = Math.round((total * pct) / 100);
  return { rental, delivery, total, deposit, balance: total - deposit, pct };
}

export default function BookingSection({ fleet, whatsapp }: { fleet?: FleetItem[]; whatsapp?: string }) {
  const { t, language } = useLanguage();
  const { convert } = useCurrency();
  const scooters = (fleet ?? []).filter((s) => s.available !== false && !s.soldOutToday);

  const [formState, setFormState] = useState<FormState>("idle");
  const [showPartnerCode, setShowPartnerCode] = useState(false);
  const [lastBooking, setLastBooking] = useState<
    { scooter: string; range: string; days: number; name: string; total: string; bookingId?: string; deposit?: number } | null
  >(null);
  const [agreed, setAgreed] = useState(false);
  const [agreeError, setAgreeError] = useState(false);
  // Inline validation: which fields are wrong + the message to show. Set on a
  // submit attempt so the customer instantly sees WHAT to fix instead of a
  // silently-disabled button (the reported "took 5 minutes to figure out" pain).
  const [fieldErr, setFieldErr] = useState<{ vehicle?: boolean; date?: boolean }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const formTopRef = useRef<HTMLFormElement | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    scooter: "",
    start_date: "",
    end_date: "",
    pickup_time: "10:00",
    return_time: "10:00",
    message: "",
    partner_code: "",
  });

  const selectedScooter = scooters.find((s) => s.id === form.scooter);
  // A single tap = a 1-day rental: if no return date is chosen, return is the
  // next day so the customer isn't forced to pick two days for one day's hire.
  const effectiveEnd = form.end_date || (form.start_date ? isoAddDays(form.start_date, 1) : "");
  const days = daysBetween(form.start_date, effectiveEnd);
  const breakdown = priceBreakdown(selectedScooter, days);
  const estimatedTotal = breakdown ? `Rs ${breakdown.total.toLocaleString()}` : "";
  const activeUnits = (selectedScooter?.assets ?? []).filter((a) => a.active !== false).length;
  const capacity = activeUnits > 0 ? activeUnits : Math.max(1, selectedScooter?.units ?? 1);

  // ── Trip Planner → Booking: pre-fill the trip length ──
  const [desiredDays, setDesiredDays] = useState<number | null>(null);

  function isoAddDays(base: string, n: number): string {
    const d = new Date(base);
    d.setDate(d.getDate() + n);
    return d.toISOString().split("T")[0];
  }

  useEffect(() => {
    function onPrefill(e: Event) {
      const detail = (e as CustomEvent).detail as { days?: number; scooter?: string };
      // Pre-select the scooter chosen from a Fleet "Book Now" button
      if (detail?.scooter) {
        const id = String(detail.scooter);
        setForm((f) => ({ ...f, scooter: id }));
      }
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

  // Trip Planner → Booking across pages: it stores the planned length in
  // localStorage, so pre-fill the dates when the booking form loads here.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("rr_trip_days");
      if (!raw) return;
      localStorage.removeItem("rr_trip_days");
      const n = parseInt(raw, 10);
      if (!Number.isFinite(n) || n <= 0) return;
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const start = tomorrow.toISOString().split("T")[0];
      setForm((f) => ({ ...f, start_date: start, end_date: isoAddDays(start, n) }));
      setDesiredDays(n);
    } catch {
      /* ignore */
    }
  }, []);

  // ── Referral auto-attribution: pull the hotel/partner code captured from
  //    the ?ref= link and pre-fill it so the guest never has to type a code. ──
  const [referredBy, setReferredBy] = useState<string | null>(null);
  useEffect(() => {
    try {
      const ref = localStorage.getItem("rr_ref");
      if (ref) {
        setForm((f) => (f.partner_code ? f : { ...f, partner_code: ref }));
        setReferredBy(ref);
      }
    } catch {
      /* ignore */
    }
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

  // Capacity-aware availability: a date is "full" when the number of active
  // bookings (pending holds + confirmed) covering it reaches the model's unit
  // count. A new request holds its dates immediately so others can't grab them.
  function heldCountOn(day: string): number {
    return bookedRanges.reduce(
      (n, r) => (day >= r.start && day <= r.end ? n + 1 : n),
      0,
    );
  }
  const hasOverlap =
    !!form.start_date && !!effectiveEnd &&
    (() => {
      const d = new Date(form.start_date);
      const end = new Date(effectiveEnd);
      while (d <= end) {
        const day = d.toISOString().split("T")[0];
        if (heldCountOn(day) >= capacity) return true;
        d.setDate(d.getDate() + 1);
      }
      return false;
    })();

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

  const phoneOk = isValidPhone(form.phone);
  const emailOk = !form.email || isValidEmail(form.email);

  // Trilingual, specific error messages — one clear problem at a time.
  const ERR = {
    en: { vehicle: "Please choose a vehicle.", date: "Please choose your pickup date.", dates: "Return must be after pickup.", name: "Please enter your name.", phone: "Please enter a valid phone number.", email: "Please enter a valid email address.", overlap: "Those dates are already taken — please pick another range.", agree: "Please accept the terms to continue." },
    fr: { vehicle: "Veuillez choisir un véhicule.", date: "Veuillez choisir votre date de retrait.", dates: "Le retour doit être après le retrait.", name: "Veuillez indiquer votre nom.", phone: "Veuillez saisir un numéro de téléphone valide.", email: "Veuillez saisir une adresse e-mail valide.", overlap: "Ces dates sont déjà prises — choisissez une autre période.", agree: "Veuillez accepter les conditions pour continuer." },
    cr: { vehicle: "Swazir enn veikil.", date: "Swazir ou dat retre.", dates: "Retour bizin apre retre.", name: "Met ou nom.", phone: "Met enn nimero telefonn valab.", email: "Met enn adres email valab.", overlap: "Sa bann dat la fini pran — swazir enn lot peryod.", agree: "Aksepte bann kondision pou kontinie." },
  }[language] ?? { vehicle: "Please choose a vehicle.", date: "Please choose your pickup date.", dates: "Return must be after pickup.", name: "Please enter your name.", phone: "Please enter a valid phone number.", email: "Please enter a valid email address.", overlap: "Those dates are already taken.", agree: "Please accept the terms." };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Validate top-to-bottom; show the FIRST problem clearly + highlight its
    // field, then scroll the form into view. No silent no-ops.
    const fe: { vehicle?: boolean; date?: boolean } = {};
    let firstError: string | null = null;
    const flag = (cond: boolean, msg: string, field?: "vehicle" | "date") => {
      if (cond && !firstError) { firstError = msg; if (field) fe[field] = true; }
    };
    flag(!form.scooter, ERR.vehicle, "vehicle");
    flag(!form.start_date, ERR.date, "date");
    flag(!!form.start_date && days <= 0, ERR.dates, "date");
    flag(!form.name.trim(), ERR.name);
    flag(!phoneOk, ERR.phone);
    flag(!emailOk, ERR.email);
    flag(hasOverlap, ERR.overlap, "date");
    flag(!agreed, ERR.agree);

    if (firstError) {
      setFieldErr(fe);
      setSubmitError(firstError);
      setAgreeError(!agreed);
      formTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setFieldErr({});
    setSubmitError(null);

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
          end_date: effectiveEnd,
          pickup_time: form.pickup_time || null,
          return_time: form.return_time || null,
          days,
          total_price: estimatedTotal || null,
          total_amount: breakdown ? breakdown.total : null,
          delivery_fee: breakdown ? breakdown.delivery : null,
          message: form.message || null,
          partner_code: form.partner_code.trim().toUpperCase() || null,
        }),
      });
      if (!res.ok) throw new Error("Booking failed");
      const resData = (await res.json().catch(() => ({}))) as { bookingId?: string; depositAmount?: number };
      // Capture a summary (the form is cleared next) for the WhatsApp confirm link
      // and the deposit payment. Keep the deposit MUR from the breakdown before
      // the form clears it.
      setLastBooking({
        scooter: selectedScooter?.name ?? form.scooter,
        range: fmtRange(form.start_date, effectiveEnd),
        days,
        name: form.name,
        total: estimatedTotal,
        bookingId: resData.bookingId,
        deposit: breakdown?.deposit ?? resData.depositAmount ?? 0,
      });
      setFormState("success");
      setForm({ name: "", email: "", phone: "", scooter: "", start_date: "", end_date: "", pickup_time: "10:00", return_time: "10:00", message: "", partner_code: "" });
      setShowPartnerCode(false);
      setAgreed(false);
      // Note: no auto-reset here — the success card holds the deposit-payment
      // button, which the customer needs time to use.
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
                className="mb-6 bg-green-500/10 border border-green-500/30 rounded-xl px-5 py-4"
              >
                <div className="flex items-start gap-3">
                  <CheckCircle size={18} className="text-green-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-syne font-bold text-green-400 text-sm">{t.booking.successTitle}</p>
                    <p className="font-dm text-green-400/70 text-xs mt-0.5">{t.booking.successDesc}</p>
                  </div>
                </div>
                {/* PAY FIRST: pay the deposit online to confirm instantly.
                    Renders nothing unless PayPal is configured. */}
                {lastBooking?.bookingId && (lastBooking.deposit ?? 0) > 0 && (
                  <div className="mt-4 border-t border-green-500/20 pt-4">
                    <PayPalDeposit
                      bookingId={lastBooking.bookingId}
                      depositMur={lastBooking.deposit ?? 0}
                    />
                  </div>
                )}
                {/* Then: pay another way — WhatsApp us / bank transfer details */}
                {lastBooking && whatsapp && (
                  <a
                    href={`https://wa.me/${whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(
                      `Hi Roule Rodrigues! I'd like to confirm my booking:\n\n` +
                      `🛵 Vehicle: ${lastBooking.scooter}\n` +
                      `📅 Dates: ${lastBooking.range} (${lastBooking.days} day${lastBooking.days !== 1 ? "s" : ""})\n` +
                      `👤 Name: ${lastBooking.name}\n` +
                      (lastBooking.total ? `💰 Est. total: ${lastBooking.total}\n` : "") +
                      `\nI'd like to pay the deposit by bank transfer — could you send me the bank details? Thank you!`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 w-full flex items-center justify-center gap-2 bg-green-500 text-white font-syne font-bold text-sm py-3 rounded-xl hover:bg-green-600 transition-colors"
                  >
                    <MessageSquare size={16} /> {t.booking.confirmWhatsApp}
                  </a>
                )}
                {/* Local bank transfer — reveal the account details on demand */}
                {lastBooking && <BankTransferDetails name={lastBooking.name} vehicle={lastBooking.scooter} />}
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

            <form ref={formTopRef} onSubmit={handleSubmit} className="space-y-5" noValidate>
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

              {/* Referral attribution banner */}
              {referredBy && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2.5 bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3"
                >
                  <BadgeCheck size={15} className="text-green-400 shrink-0" />
                  <p className="font-dm text-green-400 text-xs leading-snug">
                    {t.booking.referredBy(referredBy)}
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
                  onChange={(e) => { setForm({ ...form, scooter: e.target.value }); setFieldErr((p) => ({ ...p, vehicle: false })); setSubmitError(null); }}
                  className={`${inputCls} appearance-none${fieldErr.vehicle ? " !border-red-500/70" : ""}`}
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

              {/* Dates — visual availability calendar */}
              <div>
                <label className="font-bebas text-muted text-[10px] tracking-[0.25em] flex items-center gap-1.5 mb-2">
                  <CalendarDays size={12} className="text-yellow" />
                  {t.booking.datesLabel} <span className="text-yellow">*</span>
                </label>
                <div className={fieldErr.date ? "rounded-2xl ring-1 ring-red-500/60" : ""}>
                <AvailabilityCalendar
                  startDate={form.start_date}
                  endDate={form.end_date}
                  minDate={today}
                  bookedRanges={bookedRanges}
                  capacity={capacity}
                  onChange={(start, end) => {
                    setForm((f) => ({ ...f, start_date: start, end_date: end }));
                    setDesiredDays(null); // visual pick = manual control
                    setFieldErr((p) => ({ ...p, date: false }));
                    setSubmitError(null);
                  }}
                  labels={{
                    booked: t.booking.calBooked,
                    available: t.booking.calAvailable,
                    selected: t.booking.calSelected,
                    hint: t.booking.calHint,
                  }}
                />
                </div>
                {/* Selected range readout */}
                {form.start_date && (
                  <div className="flex items-center gap-2 mt-3 text-sm font-dm">
                    <span className="text-offwhite font-medium">{fmtRange(form.start_date, effectiveEnd)}</span>
                    {days > 0 && <span className="text-yellow">· {t.booking.days(days)}</span>}
                  </div>
                )}
                <p className="text-muted/40 font-dm text-[11px] mt-1.5">
                  Tap one day for a 1-day rental, or tap a return day for a longer trip.
                </p>
              </div>

              {/* Pickup & return times */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bebas text-muted text-[10px] tracking-[0.25em] flex items-center gap-1.5 mb-2">
                    <Clock size={12} className="text-yellow" /> {t.booking.pickupLabel} time
                  </label>
                  <select
                    value={form.pickup_time}
                    onChange={(e) => setForm({ ...form, pickup_time: e.target.value })}
                    className={`${inputCls} appearance-none`}
                    disabled={formState === "loading"}
                  >
                    {TIME_SLOTS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-bebas text-muted text-[10px] tracking-[0.25em] flex items-center gap-1.5 mb-2">
                    <Clock size={12} className="text-yellow" /> {t.booking.returnLabel} time
                  </label>
                  <select
                    value={form.return_time}
                    onChange={(e) => setForm({ ...form, return_time: e.target.value })}
                    className={`${inputCls} appearance-none`}
                    disabled={formState === "loading"}
                  >
                    {TIME_SLOTS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>

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
                      className={`${inputCls} pl-10${!emailOk ? " !border-red-500/60" : ""}`}
                      disabled={formState === "loading"}
                    />
                  </div>
                  {!emailOk && <p className="text-red-400 font-dm text-[11px] mt-1.5">Please enter a valid email address.</p>}
                </div>
              </div>

              {/* Phone — with international country-code picker */}
              <div>
                <label className="font-bebas text-muted text-[10px] tracking-[0.25em] block mb-2">
                  {t.booking.phoneLabel} <span className="text-yellow">*</span>
                </label>
                <PhoneInput
                  value={form.phone}
                  onChange={(full) => setForm((f) => ({ ...f, phone: full }))}
                  disabled={formState === "loading"}
                  placeholder={t.booking.phonePlaceholder}
                  inputClassName={`${inputCls} pl-10`}
                />
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

              {/* Terms acceptance — required before booking */}
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => { setAgreed(e.target.checked); if (e.target.checked) setAgreeError(false); }}
                  className="mt-0.5 w-4 h-4 accent-yellow shrink-0"
                  disabled={formState === "loading"}
                />
                <span className={`font-dm text-xs leading-snug ${agreeError ? "text-red-400" : "text-muted"}`}>
                  {t.booking.agreeBefore}{" "}
                  <Link href="/legal/terms" target="_blank" className="text-yellow hover:underline">
                    {t.booking.agreeLink}
                  </Link>
                  .
                </span>
              </label>
              {agreeError && <p className="text-red-400 font-dm text-xs -mt-2">{t.booking.agreeError}</p>}

              {/* First unmet requirement, shown in plain language. The button
                  stays clickable (only loading/success disable it) so a tap
                  always tells the customer what to fix — never a dead button. */}
              {submitError && (
                <p className="flex items-start gap-2 text-red-400 font-dm text-sm -mb-1" role="alert">
                  <AlertCircle size={15} className="shrink-0 mt-0.5" /> {submitError}
                </p>
              )}
              <button
                type="submit"
                disabled={formState === "loading" || formState === "success"}
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
                    <dd className="text-offwhite font-dm text-xs text-right">
                      {form.start_date
                        ? <>{new Date(form.start_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}<span className="text-yellow ml-1">· {timeLabel(form.pickup_time)}</span></>
                        : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between items-start">
                    <dt className="text-muted font-dm text-xs">{t.booking.summaryReturn}</dt>
                    <dd className="text-offwhite font-dm text-xs text-right">
                      {effectiveEnd
                        ? <>{new Date(effectiveEnd).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}<span className="text-yellow ml-1">· {timeLabel(form.return_time)}</span></>
                        : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between items-start">
                    <dt className="text-muted font-dm text-xs">{t.booking.summaryDuration}</dt>
                    <dd className="text-offwhite font-dm text-xs">
                      {days > 0 ? t.booking.days(days) : "—"}
                    </dd>
                  </div>
                  {breakdown && (
                    <>
                      <div className="border-t border-dark-border pt-3 flex justify-between items-start">
                        <dt className="text-muted font-dm text-xs">{t.booking.summaryRental}</dt>
                        <dd className="text-offwhite font-dm text-xs">{convert(`Rs ${breakdown.rental.toLocaleString()}`)}</dd>
                      </div>
                      <div className="flex justify-between items-start">
                        <dt className="text-muted font-dm text-xs">
                          {t.booking.summaryDelivery}
                          <span className="block text-muted/60 text-[10px]">{t.booking.deliveryNote}</span>
                        </dt>
                        <dd className="font-dm text-xs">
                          {breakdown.delivery > 0 ? (
                            <span className="text-offwhite">{convert(`Rs ${breakdown.delivery.toLocaleString()}`)}</span>
                          ) : (
                            <span className="text-green-400">{t.booking.deliveryFree}</span>
                          )}
                        </dd>
                      </div>
                      <div className="border-t border-dark-border pt-3 flex justify-between items-center">
                        <dt className="text-muted font-dm text-xs">{t.booking.summaryTotal}</dt>
                        <dd className="text-yellow font-syne font-bold text-base">{convert(estimatedTotal)}</dd>
                      </div>
                      {/* Deposit model: pay a % to confirm, balance at pickup */}
                      <div className="flex justify-between items-start">
                        <dt className="text-muted font-dm text-xs">
                          {t.booking.depositToConfirm(breakdown.pct)}
                        </dt>
                        <dd className="text-offwhite font-syne font-bold text-xs">
                          {convert(`Rs ${breakdown.deposit.toLocaleString()}`)}
                        </dd>
                      </div>
                      <div className="flex justify-between items-start">
                        <dt className="text-muted/70 font-dm text-[11px]">{t.booking.balanceAtPickup}</dt>
                        <dd className="text-muted font-dm text-[11px]">
                          {convert(`Rs ${breakdown.balance.toLocaleString()}`)}
                        </dd>
                      </div>
                      {days >= 3 && (
                        <p className="text-green-400/80 text-xs font-dm">{t.booking.discountNote}</p>
                      )}
                    </>
                  )}
                </dl>
              </div>

              {/* Available fleet — desktop only. On mobile the customer has
                  already seen availability while browsing, so it's hidden to
                  keep the mobile booking view focused on the summary (owner req). */}
              <div className="hidden lg:block bg-dark-card border border-dark-border rounded-2xl p-6">
                <p className="font-bebas text-yellow text-[10px] tracking-[0.3em] mb-4">{t.booking.availabilityTitle}</p>
                <div className="space-y-2.5">
                  {(fleet ?? []).map((s) => (
                    <div key={s.id} className="flex items-center justify-between">
                      <span className="text-offwhite/80 font-dm text-xs">{s.name}</span>
                      {s.available !== false && !s.soldOutToday ? (
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
