"use client";

import { useState, useEffect, useRef } from "react";
import posthog from "posthog-js";
import { createPortal } from "react-dom";
import RentalConditions from "./RentalConditions";
import type { ConditionItem } from "@/lib/rental-conditions";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
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
  X,
  Download,
  ShieldCheck, CalendarClock } from "lucide-react";
import type { FleetItem, VehicleCategory } from "@/lib/defaults";
import { useLanguage } from "@/context/LanguageContext";
import { useCurrency } from "@/context/CurrencyContext";
import AvailabilityCalendar from "@/components/AvailabilityCalendar";
import PayPalDeposit from "@/components/PayPalDeposit";
import PhoneInput from "@/components/PhoneInput";
import SuccessBurst from "@/components/SuccessBurst";
import BookingTimeline from "@/components/BookingTimeline";
import { downloadReceipt as saveReceiptPdf } from "@/lib/receipt";
import { isValidPhone, isValidEmail } from "@/lib/phone";
// Pricing is SHARED with /api/bookings — the summary the customer sees here
// and the figures the server stores are the same arithmetic by construction.
// rentalDays comes from the same module the SERVER prices with. This file
// used to carry its own daysBetween(), and the two disagreed: the local one
// returned 0 for a same-day booking where the server returned 1, so the
// quote on screen could differ from the amount charged (RR012).
import { priceBreakdown, rentalDays, todayInRodrigues } from "@/lib/booking-pricing";

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

export default function BookingSection({
  fleet,
  categories,
  whatsapp,
  conditions,
}: {
  fleet?: FleetItem[];
  /** The FAQ entries answering "am I allowed to rent this, and what am I
   *  agreeing to". Passed from the server so the panel shows the owner's own
   *  words instead of a second copy that drifts out of date. */
  conditions?: ConditionItem[];
  /** The owner's vehicle categories — where the delivery fee lives. The booking
   *  API prices the same rental from the same list, so a summary rendered
   *  without this would quote one figure and charge another. */
  categories?: VehicleCategory[];
  whatsapp?: string;
}) {
  const { t, language } = useLanguage();
  const { convert } = useCurrency();
  const scooters = (fleet ?? []).filter((s) => s.available !== false && !s.soldOutToday);

  const [formState, setFormState] = useState<FormState>("idle");
  // createPortal needs document.body, which does not exist during SSR.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [showPartnerCode, setShowPartnerCode] = useState(false);
  const [lastBooking, setLastBooking] = useState<
    { scooter: string; range: string; days: number; name: string; email: string; total: string; bookingId?: string; deposit?: number; totalMur?: number; rate?: number; rental?: number; delivery?: number; balance?: number; pct?: number } | null
  >(null);
  const [agreed, setAgreed] = useState(false);
  const [agreeError, setAgreeError] = useState(false);
  const [depositPaid, setDepositPaid] = useState(false);
  // Inline validation: which fields are wrong + the message to show. Set on a
  // submit attempt so the customer instantly sees WHAT to fix instead of a
  // silently-disabled button (the reported "took 5 minutes to figure out" pain).
  // Marks the boxes red. Was vehicle+date only, so a missing name or a bad
// phone number produced a message at the top of the form and a field that
// looked perfectly fine (M163).
  const [fieldErr, setFieldErr] = useState<{
    vehicle?: boolean; date?: boolean; name?: boolean; email?: boolean; phone?: boolean;
  }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Every requirement still outstanding, so the customer can see the whole job
  // rather than discovering it one refusal at a time.
  const [missingSteps, setMissingSteps] = useState<string[]>([]);
  const formTopRef = useRef<HTMLFormElement | null>(null);
  const successRef = useRef<HTMLDivElement | null>(null);
  // When the booking succeeds the form unmounts and the confirmation card takes
  // its place — bring it into view so the customer sees "Booking request sent"
  // (and the Pay-deposit button) immediately, without hunting for it.
  useEffect(() => {
    if (formState === "success") {
      requestAnimationFrame(() => successRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }, [formState]);
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

  // ── "INCLUDED" MUST DESCRIBE THE VEHICLE IN FRONT OF YOU ────────────────
  //
  // This panel rendered t.booking.included — a hardcoded scooter list — on
  // every category. So /browse/car promised "Helmet & lock" and "Full tank of
  // fuel" with a Suzuki Swift, which is not a joke to the customer who turns up
  // expecting a helmet for a car, and is the sort of small false promise that
  // costs more trust than the feature was ever worth.
  //
  // Every fleet item already carries its own `included`, and the detail modal
  // has always rendered it correctly. Use the selected vehicle's list; before
  // one is chosen, borrow the first vehicle in THIS category, so a car page
  // never shows scooter kit. The i18n list survives only as a last resort for
  // a category whose vehicles carry no inclusions at all.
  const includedItems =
    selectedScooter?.included?.length
      ? selectedScooter.included
      : scooters.find((s) => s.included?.length)?.included ?? t.booking.included;
  // A single tap = a 1-day rental. Now that rentalDays() counts BOTH ends, one
  // day is start === end. It used to be start+1, which was the same 1 day under
  // the old exclusive arithmetic — leaving it would silently have made every
  // single-tap booking two days and charged for it.
  const effectiveEnd = form.end_date || form.start_date;
  const days = rentalDays(form.start_date, effectiveEnd);
  const breakdown = priceBreakdown(selectedScooter, days, categories);
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
      // n DAYS inclusive, so the last day is start + (n - 1). Adding n would
      // ask for n+1 days now that both ends are counted — the planner would
      // quietly sell a day more than the customer chose.
      setForm((f) => ({ ...f, start_date: start, end_date: isoAddDays(start, Math.max(0, n - 1)) }));
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
      // n DAYS inclusive, so the last day is start + (n - 1). Adding n would
      // ask for n+1 days now that both ends are counted — the planner would
      // quietly sell a day more than the customer chose.
      setForm((f) => ({ ...f, start_date: start, end_date: isoAddDays(start, Math.max(0, n - 1)) }));
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
  const emailOk = isValidEmail(form.email); // email is now required for confirmations/receipts
  const emailInvalid = !!form.email && !isValidEmail(form.email); // only flag inline once they've typed something wrong

  function downloadReceipt() {
    if (!lastBooking) return;
    const short = (lastBooking.bookingId || "").replace(/-/g, "").slice(0, 6).toUpperCase() || Date.now().toString(36).toUpperCase().slice(-6);
    saveReceiptPdf({
      ref: `RR-${short}`,
      heading: depositPaid ? "Deposit receipt" : "Booking receipt",
      customer: lastBooking.name,
      itemLabel: "Vehicle",
      item: lastBooking.scooter,
      // ── THE ARITHMETIC, NOT JUST THE ANSWER (M167) ──────────────────────
      // The receipt used to say "Estimated total Rs 2,097" and stop, so a
      // customer could not check the sum or see that delivery was free — the
      // two things they are most likely to query at pickup. Every line comes
      // from the same server-priced breakdown the booking was created from.
      rows: [
        { label: "Dates", value: `${lastBooking.range} (${lastBooking.days} day${lastBooking.days !== 1 ? "s" : ""})` },
        ...(lastBooking.rate && lastBooking.rental != null
          ? [{
              label: `${lastBooking.days} day${lastBooking.days !== 1 ? "s" : ""} x Rs ${lastBooking.rate.toLocaleString()}`,
              value: `Rs ${lastBooking.rental.toLocaleString()}`,
            }]
          : []),
        ...(lastBooking.delivery != null
          ? [{
              label: "Delivery",
              // Free is worth saying in words. A "Rs 0" line reads like an
              // omission; "Free" reads like the offer it is.
              value: lastBooking.delivery > 0 ? `Rs ${lastBooking.delivery.toLocaleString()}` : "Free",
            }]
          : []),
        ...(lastBooking.total ? [{ label: "Total", value: lastBooking.total, strong: true }] : []),
        ...((lastBooking.deposit ?? 0) > 0
          ? [{
              label: depositPaid
                ? "Deposit paid"
                : `Deposit due${lastBooking.pct ? ` (${lastBooking.pct}%)` : ""}`,
              value: `Rs ${(lastBooking.deposit ?? 0).toLocaleString()}`,
            }]
          : []),
        ...(lastBooking.balance != null && lastBooking.balance > 0
          ? [{ label: "Balance at pickup", value: `Rs ${lastBooking.balance.toLocaleString()}` }]
          : []),
      ],
      note: depositPaid
        ? "Your deposit is received and your booking is confirmed. The balance is settled at pickup. Keep this receipt for your records."
        : "This confirms your booking request. Pay the deposit to lock it in — the balance is settled at pickup.",
    });
  }

  // Trilingual, specific error messages — one clear problem at a time.
  const ERR = {
    en: { vehicle: "Please choose a vehicle.", date: "Please choose your pickup date.", dates: "Return must be after pickup.", name: "Please enter your name.", phone: "Please enter a valid phone number.", email: "Please enter a valid email address.", overlap: "Those dates are already taken — please pick another range.", agree: "Please accept the terms to continue." },
    fr: { vehicle: "Veuillez choisir un véhicule.", date: "Veuillez choisir votre date de retrait.", dates: "Le retour doit être après le retrait.", name: "Veuillez indiquer votre nom.", phone: "Veuillez saisir un numéro de téléphone valide.", email: "Veuillez saisir une adresse e-mail valide.", overlap: "Ces dates sont déjà prises — choisissez une autre période.", agree: "Veuillez accepter les conditions pour continuer." },
    cr: { vehicle: "Swazir enn veikil.", date: "Swazir ou dat retre.", dates: "Retour bizin apre retre.", name: "Met ou nom.", phone: "Met enn nimero telefonn valab.", email: "Met enn adres email valab.", overlap: "Sa bann dat la fini pran — swazir enn lot peryod.", agree: "Aksepte bann kondision pou kontinie." },
  }[language] ?? { vehicle: "Please choose a vehicle.", date: "Please choose your pickup date.", dates: "Return must be after pickup.", name: "Please enter your name.", phone: "Please enter a valid phone number.", email: "Please enter a valid email address.", overlap: "Those dates are already taken.", agree: "Please accept the terms." };

  const STILL_NEEDED =
    language === "fr" ? "Il reste à remplir :"
    : language === "cr" ? "Ankor bizin :"
    : "Still to do:";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Validate top-to-bottom; show the FIRST problem clearly + highlight its
    // field, then scroll the form into view. No silent no-ops.
    // ── EVERYTHING THAT IS STILL MISSING, AT ONCE ────────────────────────
    // This used to keep only the FIRST problem. Somebody who had not filled
    // three things was told about one, fixed it, pressed the button, and was
    // told about the next — the form dripping out its requirements one at a
    // time, which reads as the button being broken rather than as a list of
    // things to do.
    //
    // The checks and their order are unchanged, and so is the field
    // highlighting and the scroll: only the reporting is now complete.
    const fe: { vehicle?: boolean; date?: boolean; name?: boolean; email?: boolean; phone?: boolean } = {};
    const missing: string[] = [];
    let firstError: string | null = null;
    // ── TAKE THEM TO THE BOX, NOT TO THE TOP (M163) ─────────────────────
    //
    // The form always said what was missing, and then scrolled to its own
    // first line. On a phone the offending field is often a screenful below
    // that, so the customer read "Enter your phone number", found themselves
    // looking at the vehicle picker, and had to hunt for the box.
    //
    // Every field already had a stable id for its label to point at, so the
    // first failing check can name one and the form can go there and focus it.
    // Focus rather than scroll alone: it opens the keyboard on a phone and it
    // is what a screen reader announces.
    let firstFieldId: string | null = null;
    const flag = (
      cond: boolean,
      msg: string,
      field?: "vehicle" | "date" | "name" | "email" | "phone",
      id?: string,
    ) => {
      if (!cond) return;
      if (!missing.includes(msg)) missing.push(msg);
      if (!firstError) firstError = msg;
      if (!firstFieldId && id) firstFieldId = id;
      if (field) fe[field] = true;
    };
    // Ordered the way the form reads, so "first error" is the one highest up
    // the page and the customer is never sent backwards.
    flag(!form.scooter, ERR.vehicle, "vehicle", "bk-vehicle");
    flag(!form.start_date, ERR.date, "date", "bk-dates-label");
    flag(!!form.start_date && days <= 0, ERR.dates, "date", "bk-dates-label");
    flag(hasOverlap, ERR.overlap, "date", "bk-dates-label");
    flag(!form.name.trim(), ERR.name, "name", "bk-name");
    flag(!emailOk, ERR.email, "email", "bk-email");
    flag(!phoneOk, ERR.phone, "phone", "bk-phone");
    flag(!agreed, ERR.agree, undefined, "bk-agree");

    if (firstError) {
      setFieldErr(fe);
      setMissingSteps(missing);
      setSubmitError(firstError);
      setAgreeError(!agreed);
      const target = firstFieldId
        ? document.getElementById(firstFieldId)
        : null;
      if (target) {
        // `center`, not `start`: a sticky header would otherwise sit on top of
        // the very field we just sent them to.
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        // preventScroll — scrollIntoView above already owns the movement, and
        // letting focus scroll as well makes the page jump twice.
        if (typeof (target as HTMLElement).focus === "function") {
          (target as HTMLElement).focus({ preventScroll: true });
        }
      } else {
        formTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      return;
    }
    setFieldErr({});
    setMissingSteps([]);
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
      // The server sends genuinely actionable refusals — "Those dates were just
      // taken. Please pick another range.", "The pickup date has already
      // passed.", "For rentals longer than 60 days, contact us on WhatsApp" —
      // and every one of them used to be thrown away and replaced with
      // "Something went wrong. Please try again", which then erased itself
      // after 5 seconds. The one failure a customer can trivially recover from
      // (pick different dates) was presented as an unexplained system fault at
      // the final click.
      const resData = (await res.json().catch(() => ({}))) as {
        bookingId?: string; depositAmount?: number; error?: string;
      };
      if (!res.ok) throw new Error(resData.error || "");
      // Capture a summary (the form is cleared next) for the WhatsApp confirm link
      // and the deposit payment. Keep the deposit MUR from the breakdown before
      // the form clears it.
      posthog.capture("scooter_booking_requested", {
        scooter_id: form.scooter,
        rental_days: days,
        has_partner_referral: Boolean(form.partner_code.trim()),
        has_deposit: Boolean((breakdown?.deposit ?? resData.depositAmount ?? 0) > 0),
      });
      setLastBooking({
        scooter: selectedScooter?.name ?? form.scooter,
        range: fmtRange(form.start_date, effectiveEnd),
        days,
        name: form.name,
        // Captured here, not read at render: setForm() below clears the form on
        // success, so by the time the receipt uploader mounts, form.email is "".
        email: form.email,
        total: estimatedTotal,
        bookingId: resData.bookingId,
        deposit: breakdown?.deposit ?? resData.depositAmount ?? 0,
        totalMur: breakdown?.total,
        // Carried so the receipt can show the arithmetic rather than a single
        // figure the customer has to take on trust (M167).
        rate: breakdown ? Math.round(breakdown.rental / Math.max(1, days)) : undefined,
        rental: breakdown?.rental,
        delivery: breakdown?.delivery,
        balance: breakdown?.balance,
        pct: breakdown?.pct,
      });
      setFormState("success");
      setForm({ name: "", email: "", phone: "", scooter: "", start_date: "", end_date: "", pickup_time: "10:00", return_time: "10:00", message: "", partner_code: "" });
      setShowPartnerCode(false);
      setAgreed(false);
      // Note: no auto-reset here — the success card holds the deposit-payment
      // button, which the customer needs time to use.
    } catch (err) {
      // A specific, fixable reason goes in the inline slot right above the
      // button (where the field errors already appear) and STAYS there — the
      // customer has to be able to read it while editing. Only a genuinely
      // unknown failure falls back to the generic banner.
      const message = err instanceof Error ? err.message : "";
      if (message) {
        setSubmitError(message);
        setFormState("idle");
        formTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        setFormState("error");
        setTimeout(() => setFormState("idle"), 5000);
      }
    }
  }

  // Rodrigues' calendar day, not the device's — a traveler booking from the
  // Americas (or anyone after midnight) must not be offered the wrong "today".
  const today = todayInRodrigues();

  return (
    <section id="booking" className="bg-[#0a0a0a] py-24 md:py-36 overflow-x-hidden" aria-label={t.common.bookScooter}>
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
                ref={successRef}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 scroll-mt-24 rounded-xl border border-green-500/30 bg-green-500/[0.07] px-5 py-6"
              >
                {/* Premium confirmation first — payment lives behind a button so it
                    never overwhelms the moment the request is acknowledged. */}
                <div className="text-center">
                  <SuccessBurst />
                  <p className="mt-4 font-syne font-extrabold text-offwhite text-lg">
                    {depositPaid
                      ? language === "fr" ? "Acompte payé — confirmé !" : language === "cr" ? "Depo peye — konfirmen!" : "Deposit paid — booking confirmed!"
                      : t.booking.successTitle}
                  </p>
                  <p className="mt-1 font-dm text-muted text-sm">
                    {depositPaid
                      ? language === "fr" ? "À très bientôt — nous vous contactons avec les détails." : language === "cr" ? "Nou trouv ou byento — nou pou kontakte ou." : "See you soon — we'll be in touch with the details."
                      : t.booking.successDesc}
                  </p>
                </div>

                <div className="mt-5">
                  <BookingTimeline completed={depositPaid ? 3 : 1} />
                </div>

                {/* ── M91: what happens next, instead of a payment button ──
                    The owner rents vehicles he does not all own, so a booking
                    confirmed on the spot can turn into a refund when the
                    partner turns out to be busy. A refund costs the PayPal fee,
                    the exchange spread and the customer's trust, so the check
                    now comes first and NOTHING is charged until it passes.
                    Saying that plainly here is the whole point: "we'll be right
                    back" with no explanation reads as a site that failed. */}
                {!depositPaid && (
                  <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-left">
                    <p className="font-bebas text-[10px] tracking-[0.25em] text-yellow">
                      {t.booking.checkingTitle}
                    </p>
                    <ol className="mt-2.5 space-y-2">
                      {[t.booking.checkingStep1, t.booking.checkingStep2, t.booking.checkingStep3].map((step, i) => (
                        <li key={i} className="flex gap-2.5 font-dm text-xs leading-relaxed text-offwhite/80">
                          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-yellow/15 font-syne text-[10px] font-bold text-yellow">
                            {i + 1}
                          </span>
                          {step}
                        </li>
                      ))}
                    </ol>
                    <p className="mt-3 font-dm text-[11px] leading-relaxed text-muted/70">
                      {t.booking.checkingNote}
                    </p>
                  </div>
                )}

                {/* ── PAY NOW, OR WAIT — BOTH ARE REAL (M161) ─────────────────
                    M91 removed the payment sheet from this screen because the
                    owner rents vehicles he does not all own: a booking taken on
                    the spot can become a refund that costs the PayPal fee, the
                    exchange spread and the customer's trust. That reasoning
                    still holds, and the check above is still offered first and
                    costs nothing.

                    What it did not account for is the rule the platform has
                    always run on — first deposit paid keeps the vehicle. A
                    customer who wants certainty had no way to get it, and
                    could lose their dates while waiting for a check they never
                    asked for.

                    So both paths exist and the copy is honest about each: wait
                    and pay nothing, or pay now and hold it. The refund promise
                    is stated in the same breath as the button, because it is
                    the thing that makes the second path fair — and it is the
                    owner's exposure, not the customer's. */}
                {!depositPaid && lastBooking?.bookingId && (lastBooking.deposit ?? 0) > 0 && (
                  <div className="mt-4 rounded-xl border border-yellow/25 bg-yellow/[0.04] p-4 text-left">
                    <p className="font-bebas text-[10px] tracking-[0.25em] text-yellow">
                      {t.booking.secureNowTitle}
                    </p>
                    <p className="mt-2 font-dm text-xs leading-relaxed text-offwhite/80">
                      {t.booking.secureNowBody}
                    </p>
                    <p className="mt-2 font-dm text-[11px] leading-relaxed text-muted/70">
                      {t.booking.secureNowRefund}
                    </p>
                    <div className="mt-3.5">
                      <PayPalDeposit
                        bookingId={lastBooking.bookingId}
                        depositMur={lastBooking.deposit ?? 0}
                        fullMur={lastBooking.totalMur}
                        kind="vehicle"
                        onPaid={() => setDepositPaid(true)}
                      />
                    </div>
                  </div>
                )}

                <div className="mt-6 flex flex-col gap-2.5">
                  <button
                    type="button"
                    onClick={downloadReceipt}
                    className="w-full flex items-center justify-center gap-2 border border-white/15 text-offwhite/80 font-syne font-bold text-sm py-3 rounded-xl hover:border-yellow/40 hover:text-yellow transition-colors"
                  >
                    <Download size={15} /> {t.common.downloadReceipt}
                  </button>
                </div>
              </motion.div>
            )}

            {/* M91: the secure-payment sheet that used to live here is gone.
                Payment no longer happens at request time — the owner checks
                the vehicle with its partner first, and the pay step moves to
                /manage-booking once he has approved it. Leaving a dormant
                PayPal sheet behind would be a second, unreachable payment
                path that nobody maintains. */}

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

            {/* The form disappears once the request is sent — the confirmation
                (with the Pay-deposit button) replaces it, so payment never sits
                below a now-irrelevant calendar. */}
            {/* The id lets the portal'd mobile bar submit this form from
                outside its DOM subtree: a button carrying form="rr-booking-form"
                is the native way to do it, with no extra handler or ref. */}
            {formState !== "success" && (
            <form id="rr-booking-form" ref={formTopRef} onSubmit={handleSubmit} className="space-y-5" noValidate>
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
                <label htmlFor="bk-vehicle" className="font-bebas text-muted text-[10px] tracking-[0.25em] block mb-2">
                  {t.booking.scooterLabel} <span className="text-yellow">*</span>
                </label>
                <select
                  id="bk-vehicle"
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
                {/* A <label> can only name a form control, and the calendar is
                    a group of buttons — so this named nothing. Exposed as a
                    labelled group instead, which is what it actually is. */}
                <span
                  id="bk-dates-label"
                  className="font-bebas text-muted text-[10px] tracking-[0.25em] flex items-center gap-1.5 mb-2"
                >
                  <CalendarDays size={12} className="text-yellow" />
                  {t.booking.datesLabel} <span className="text-yellow">*</span>
                </span>
                <div
                  role="group"
                  aria-labelledby="bk-dates-label"
                  className={fieldErr.date ? "rounded-2xl ring-1 ring-red-500/60" : ""}
                >
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
                  {t.common.tapOneDay}
                </p>
              </div>

              {/* Pickup & return times */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="bk-pickup-time" className="font-bebas text-muted text-[10px] tracking-[0.25em] flex items-center gap-1.5 mb-2">
                    <Clock size={12} className="text-yellow" /> {t.booking.pickupLabel} time
                  </label>
                  <select
                    id="bk-pickup-time"
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
                  <label htmlFor="bk-return-time" className="font-bebas text-muted text-[10px] tracking-[0.25em] flex items-center gap-1.5 mb-2">
                    <Clock size={12} className="text-yellow" /> {t.booking.returnLabel} time
                  </label>
                  <select
                    id="bk-return-time"
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
                  <label htmlFor="bk-name" className="font-bebas text-muted text-[10px] tracking-[0.25em] block mb-2">
                    {t.booking.nameLabel} <span className="text-yellow">*</span>
                  </label>
                  <div className="relative">
                    <User size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted/50" />
                    <input
                      id="bk-name"
                      type="text"
                      // WCAG 1.3.5: no field on this form declared its purpose,
                      // so nothing could autofill a booking.
                      autoComplete="name"
                      placeholder={t.booking.namePlaceholder}
                      value={form.name}
                      onChange={(e) => { setForm({ ...form, name: e.target.value }); setFieldErr((p) => ({ ...p, name: false })); }}
                      aria-invalid={fieldErr.name || undefined}
                      className={`${inputCls} pl-10${fieldErr.name ? " !border-red-500/70" : ""}`}
                      disabled={formState === "loading"}
                      required
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="bk-email" className="font-bebas text-muted text-[10px] tracking-[0.25em] block mb-2">
                    {t.booking.emailLabel} <span className="text-yellow">*</span>
                  </label>
                  <div className="relative">
                    <Mail size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted/50" />
                    <input
                      id="bk-email"
                      type="email"
                      autoComplete="email"
                      // The label carries a visual "*" that a screen reader
                      // does not read as "required".
                      aria-required
                      // emailInvalid is "you typed something that is not an
                      // email". fieldErr.email is "you tried to submit without
                      // one" — an EMPTY required field looked perfectly fine
                      // until now, which is the commonest way to fail this form.
                      aria-invalid={emailInvalid || fieldErr.email || undefined}
                      placeholder="your@email.com"
                      value={form.email}
                      onChange={(e) => { setForm({ ...form, email: e.target.value }); setFieldErr((p) => ({ ...p, email: false })); }}
                      className={`${inputCls} pl-10${emailInvalid || fieldErr.email ? " !border-red-500/60" : ""}`}
                      disabled={formState === "loading"}
                    />
                  </div>
                  {emailInvalid && <p className="text-red-400 font-dm text-[11px] mt-1.5">{t.common.validEmail}</p>}
                </div>
              </div>

              {/* Phone — with international country-code picker */}
              <div>
                <label htmlFor="bk-phone" className="font-bebas text-muted text-[10px] tracking-[0.25em] block mb-2">
                  {t.booking.phoneLabel} <span className="text-yellow">*</span>
                </label>
                <PhoneInput
                  // This label used to point at nothing, so the field had no
                  // accessible name whatsoever — an unlabelled edit box in the
                  // middle of a booking form.
                  id="bk-phone"
                  value={form.phone}
                  onChange={(full) => { setForm((f) => ({ ...f, phone: full })); setFieldErr((p) => ({ ...p, phone: false })); }}
                  disabled={formState === "loading"}
                  placeholder={t.booking.phonePlaceholder}
                  inputClassName={`${inputCls} pl-10${fieldErr.phone ? " !border-red-500/70" : ""}`}
                />
              </div>

              {/* Message */}
              <div>
                <label htmlFor="bk-message" className="font-bebas text-muted text-[10px] tracking-[0.25em] block mb-2">
                  {t.booking.messageLabel}
                </label>
                <div className="relative">
                  <MessageSquare size={14} className="absolute left-4 top-4 text-muted/50" />
                  <textarea
                    id="bk-message"
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
                    <label htmlFor="bk-partner" className="font-bebas text-muted text-[10px] tracking-[0.25em] block mb-2">
                      {t.booking.partnerLabel}
                    </label>
                    <input
                      id="bk-partner"
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
                  id="bk-agree"
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
              {/* One problem reads as a sentence, as it always did. TWO OR MORE
                  read as a list, because "please enter your name" on its own,
                  when the date and the terms are also outstanding, is not the
                  truth about what is left to do. Same red, same icon, same
                  place — only the shape changes with the number of things. */}
              {submitError && missingSteps.length > 1 ? (
                <div className="flex items-start gap-2 text-red-400 font-dm text-sm -mb-1" role="alert">
                  <AlertCircle size={15} className="shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">{STILL_NEEDED}</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4">
                      {missingSteps.map((m) => (
                        <li key={m}>{m}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : submitError ? (
                <p className="flex items-start gap-2 text-red-400 font-dm text-sm -mb-1" role="alert">
                  <AlertCircle size={15} className="shrink-0 mt-0.5" /> {submitError}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={formState === "loading"}
                className="w-full flex items-center justify-center gap-2.5 bg-yellow text-dark font-syne font-bold text-base py-4 rounded-xl hover:bg-yellow-dark transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {formState === "loading" ? (
                  <><Loader2 size={16} className="animate-spin" /> {t.booking.sending}</>
                ) : (
                  <>{t.booking.submit} <Send size={16} /></>
                )}
              </button>

            </form>
            )}
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
                      {/* The cancellation terms, at the moment money is asked
                          for — they used to appear NOWHERE in the booking flow.

                          This line said "Free cancellation up to 48h before
                          pickup", which the refund policy did not support even
                          then and certainly does not now: outside 48 hours the
                          refund is 80% OF THE DEPOSIT — the only part paid in
                          advance — with 20% retained for administration.
                          A cancellation promise shown at the point of payment
                          is the one a customer relies on, so it states the fee
                          rather than implying there is none. The 100%-if-we-
                          cancel promise is separate and still holds. */}
                      <div className="flex items-start gap-2 border-t border-dark-border pt-3">
                        <ShieldCheck size={13} className="mt-0.5 shrink-0 text-green-400" />
                        <p className="font-dm text-[11px] leading-snug text-muted">
                          {language === "fr"
                            ? "Annulez plus de 48 h avant : 80 % de l'acompte remboursé. Dans les 48 h, non remboursable."
                            : language === "cr"
                              ? "Anile plis ki 48 er avan : 80 % lakont ranbourse. Dan 48 er, pena ranbourseman."
                              : "Cancel more than 48h before and 80% of your deposit is refunded. Inside 48h it is non-refundable."}{" "}
                          <Link href="/legal/refunds" target="_blank" className="text-yellow hover:underline">
                            {language === "fr" ? "Détails" : language === "cr" ? "Detay" : "Details"}
                          </Link>
                        </p>
                      </div>
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
                      {/* Three states, not two (M158). "Booked today" is not
                          "unavailable": this very form can book that vehicle
                          for any other date, and the calendar above already
                          shows which days are full. Painting it red here
                          contradicted the calendar sitting directly above it. */}
                      {s.available === false ? (
                        <span className="flex items-center gap-1.5 text-red-400/70 text-[10px] font-bebas tracking-[0.15em]">
                          <Ban size={12} /> {t.fleet.unavailable}
                        </span>
                      ) : s.soldOutToday ? (
                        <span className="flex items-center gap-1.5 text-amber-400/80 text-[10px] font-bebas tracking-[0.15em]">
                          <CalendarClock size={12} /> {t.fleet.bookedToday}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-green-400 text-[10px] font-bebas tracking-[0.15em]">
                          <BadgeCheck size={12} /> {t.fleet.available}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* The terms, beside the form rather than on another page. See
                  components/RentalConditions.tsx for why they are read from the
                  FAQ instead of restated here. */}
              {conditions?.length ? <RentalConditions items={conditions} /> : null}

              {/* What's included */}
              <div className="bg-dark-card border border-dark-border rounded-2xl p-6">
                <p className="font-bebas text-yellow text-[10px] tracking-[0.3em] mb-4">{t.booking.includedTitle}</p>
                <ul className="space-y-2">
                  {includedItems.map((item) => (
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

      {/* ── Mobile price bar ──────────────────────────────────────────────────
          The summary panel is `lg:col-span-2`, so on a phone the total, the
          deposit and the balance all render BELOW the submit button — the
          customer decides while the deciding number is off screen. This pins
          the two figures that matter above the tab bar as soon as a vehicle and
          dates exist, and disappears on desktop where the sticky panel already
          does the job.

          Rendered through a PORTAL to document.body. Both grid columns are
          framer-motion elements, and any transformed ancestor makes
          `position: fixed` resolve against that ancestor instead of the
          viewport — which parked this bar ~3000px down the page (measured).
          Moving it out of the form was not enough, because `whileInView`
          leaves a transform on the column until it animates; the portal takes
          it out of the transformed subtree entirely, which is the only
          placement that cannot regress when someone adds another motion
          wrapper later.
          Only formState !== "success" so it vanishes with the form it prices.
          aria-hidden: the same figures are in the summary <dl>, which screen
          readers already reach; announcing them twice would be noise. */}
      {breakdown && formState !== "success" && mounted && createPortal(
        <div
          /* 7rem clears the floating nav pill (~74px tall, ~12px above the safe
             area); measured overlapping it by 45px at 5.5rem.
             The STRIP stays pointer-events-none so it never swallows taps
             either side of the bar; the card re-enables them for the button. */
          className="pointer-events-none fixed inset-x-0 bottom-[calc(7rem+env(safe-area-inset-bottom))] z-30 flex justify-center px-4 lg:hidden"
        >
          <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-white/10 bg-dark/90 px-4 py-2.5 shadow-[0_16px_44px_-12px_rgba(0,0,0,0.75)] backdrop-blur-xl">
            {/* The FIGURES stay aria-hidden — the same numbers are in the
                summary <dl> a screen reader already reaches, and announcing
                them twice is noise. The BUTTON must not be: this bar used to be
                aria-hidden and pointer-events-none in its entirety, which made
                the only thumb-reachable thing on the booking screen a picture
                of a price. On the one flow with proven revenue, on the device
                travellers actually book from, there was nothing to press. */}
            <div aria-hidden="true" className="flex min-w-0 flex-1 items-center justify-between gap-3">
              <div>
                <p className="font-bebas text-[9px] tracking-[0.25em] text-muted">{t.booking.summaryTotal}</p>
                <p className="font-syne text-base font-extrabold text-offwhite">{convert(estimatedTotal)}</p>
              </div>
              <div className="text-right">
                <p className="font-bebas text-[9px] tracking-[0.25em] text-muted">
                  {t.booking.depositToConfirm(breakdown.pct)}
                </p>
                <p className="font-syne text-base font-extrabold text-yellow">
                  {convert(`Rs ${breakdown.deposit.toLocaleString()}`)}
                </p>
              </div>
            </div>
            <button
              type="submit"
              form="rr-booking-form"
              disabled={formState === "loading"}
              className="shrink-0 rounded-xl bg-yellow px-4 py-2.5 font-syne text-sm font-bold text-dark transition-colors hover:bg-yellow-dark disabled:opacity-60"
            >
              {formState === "loading" ? t.booking.sending : t.booking.submit}
            </button>
          </div>
        </div>,
        document.body,
      )}
    </section>
  );
}
