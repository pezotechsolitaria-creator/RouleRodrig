"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import posthog from "posthog-js";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertCircle, BadgeCheck, Check, ChevronDown, ChevronLeft, Download, Loader2, MessageCircle, X } from "lucide-react";
import RentalConditions from "./RentalConditions";
import type { ConditionItem } from "@/lib/rental-conditions";
import type { FleetItem, VehicleCategory } from "@/lib/defaults";
import { useLanguage } from "@/context/LanguageContext";
import { useCurrency } from "@/context/CurrencyContext";
import PayPalDeposit from "@/components/PayPalDeposit";
import PaymentHelp from "@/components/payments/PaymentHelp";
import PhoneInput from "@/components/PhoneInput";
import SuccessBurst from "@/components/SuccessBurst";
import BookingTimeline from "@/components/BookingTimeline";
import RangeCalendar from "@/components/rentals/RangeCalendar";
import { isValidPhone, isValidEmail } from "@/lib/phone";
import { DATE_LOCALE, RENT_COPY, rentLang, rs as rsIn } from "@/lib/rentals/copy";
import { displayUnits } from "@/lib/rentals/units";
import { whatsappHref } from "@/lib/whatsapp-link";
import { fleetTerm } from "@/lib/fleet-terms";
import { OPEN_BOOKING_EVENT } from "@/lib/rentals/events";
import { bookingReference } from "@/lib/activity";
import { removePending, upsertPending } from "@/lib/pending/store";
// Pricing is SHARED with /api/bookings — the line items the customer sees here
// and the figures the server stores are the same arithmetic by construction.
// rentalDays comes from the same module the SERVER prices with (RR012).
import {
  CAR_SECURITY_HOLD,
  priceBreakdown,
  rentalDays,
  scooterRates,
  scooterTotal,
  todayInRodrigues,
  usesScooterRates,
  vehicleDayRate,
} from "@/lib/booking-pricing";
import type { PaymentPreference } from "@/lib/bookings/payment-preference";

// ── The ONE booking surface for cars and scooters: a sheet ──────────────────
//
// Until 6 Oct 2026 this was an in-page form under the fleet ("RESERVE
// ONLINE"), and a card's Book Now scrolled to it while a floating bar repeated
// "ESTIMATED TOTAL · DEPOSIT TO CONFIRM · Request Booking" over it. Now every
// way in — a card, a vehicle page's Reserve, a ?v= link, the trip planner —
// opens this sheet with the vehicle chosen:
//
//   1. Dates   vehicle row, calendar, and once a range exists the line items:
//              rental × days, Delivery, Total, Due now, Due at pickup, and for
//              a car the security Hold at pickup. One exact total — no
//              estimate, no "request".
//   2. Details name, contact, times, terms. Reserve sends it.
//   then       Dates held, with the same pay-now and receipt paths as before.
//
// The sheet has a FIXED height and scrolls inside itself, so picking dates,
// paging months or the price appearing never moves anything else; the page
// behind it keeps its scroll position. A dialog: focus is trapped, Esc and the
// phone's Back button close it, and focus returns to what opened it.
//
// The FAQ accordion (rental terms) is rendered INLINE where this component
// sits on the page — the terms belong on the page, the form in the sheet.

type FormState = "idle" | "loading" | "success" | "error";
type Step = "dates" | "details";


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

function isoAddDays(base: string, n: number): string {
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default function BookingSection({
  fleet,
  category,
  categories,
  whatsapp,
  conditions,
  showConditions = true,
  holdAtPickup,
}: {
  fleet?: FleetItem[];
  /** The FAQ entries answering "am I allowed to rent this, and what am I
   *  agreeing to". Rendered inline as the page's FAQ accordion. */
  conditions?: ConditionItem[];
  /** False on a vehicle page, which renders the same panel itself. */
  showConditions?: boolean;
  /** The owner's vehicle categories — where the delivery fee and the due-now
   *  percentage live. The booking API prices from the same list. */
  categories?: VehicleCategory[];
  whatsapp?: string;
  /** Which category's sheet this is. Chooses wording only. */
  category?: string;
  /** The car security hold, read from the owner's FAQ answer by the page. */
  holdAtPickup?: number;
}) {
  const { t, language } = useLanguage();
  const lang = rentLang(language);
  const r = RENT_COPY[lang];
  // Every figure in the sheet, grouped the reader's way ("Rs 1 899" in French).
  const rs = (n: number | null | undefined) => rsIn(n, lang);
  const { convert } = useCurrency();
  const calm = useReducedMotion();
  // ── OUT ON A TRIP TODAY IS NOT "NOT FOR HIRE" (M158) ────────────────────
  //   available === false   the owner withdrew it in admin — never bookable
  //   soldOutToday          every unit is out TODAY — says nothing about next
  //                         Tuesday, which is what most people book
  // /api/availability is capacity-aware per date, the calendar mutes full
  // days, and app/api/bookings re-checks server-side before accepting.
  const scooters = (fleet ?? []).filter((s) => s.available !== false);
  const units = useMemo(() => displayUnits(scooters), [scooters]);

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("dates");
  const [pickingVehicle, setPickingVehicle] = useState(false);
  const [unitKey, setUnitKey] = useState<string>("");
  const [formState, setFormState] = useState<FormState>("idle");
  // createPortal needs document.body, which does not exist during SSR.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [showPartnerCode, setShowPartnerCode] = useState(false);
  const [lastBooking, setLastBooking] = useState<
    { scooter: string; range: string; days: number; name: string; email: string; total: string; bookingId?: string; deposit?: number; totalMur?: number; rate?: number; rental?: number; delivery?: number; balance?: number; pct?: number; inPerson?: boolean } | null
  >(null);
  const [agreed, setAgreed] = useState(false);
  const [agreeError, setAgreeError] = useState(false);
  const [depositPaid, setDepositPaid] = useState(false);
  const [payPalFailed, setPayPalFailed] = useState(false);
  // Marks the boxes red AND says what to fix — never a silent dead button.
  const [fieldErr, setFieldErr] = useState<{
    vehicle?: boolean; date?: boolean; name?: boolean; email?: boolean; phone?: boolean;
  }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [missingSteps, setMissingSteps] = useState<string[]>([]);
  const formTopRef = useRef<HTMLFormElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const pushedRef = useRef(false);

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
    // M220: what the customer SAYS about paying. Online by default, so a
    // customer who never looks at the choice books exactly as before.
    payment_preference: "online" as PaymentPreference,
  });
  const payInPersonChosen = form.payment_preference === "in_person";

  const selectedScooter = scooters.find((s) => s.id === form.scooter);
  const selectedUnit = units.find((u) => u.key === unitKey) ?? units.find((u) => u.item.id === form.scooter);

  // A single tap = a 1-day rental: one day is start === end, both ends
  // counted (rentalDays). The return is optional; the pickup alone is a day.
  const effectiveEnd = form.end_date || form.start_date;
  const days = rentalDays(form.start_date, effectiveEnd);
  const breakdown = priceBreakdown(selectedScooter, days, categories);
  // The scooter list the owner set in /admin (Scooters category), else the
  // published defaults — the same figures the server charges with.
  const rates = scooterRates(categories);
  const totalLabel = breakdown ? `Rs ${breakdown.total.toLocaleString()}` : "";
  const activeUnits = (selectedScooter?.assets ?? []).filter((a) => a.active !== false).length;
  const capacity = activeUnits > 0 ? activeUnits : Math.max(1, selectedScooter?.units ?? 1);
  const isCar = (selectedScooter?.category ?? category) === "car";
  const hold = isCar ? holdAtPickup ?? CAR_SECURITY_HOLD : 0;

  // ── Trip Planner → Booking: pre-fill the trip length ──
  const [desiredDays, setDesiredDays] = useState<number | null>(null);

  const openSheet = useCallback(
    (opts: { scooter?: string; unit?: string; days?: number } = {}) => {
      openerRef.current = (document.activeElement as HTMLElement | null) ?? null;
      if (opts.scooter && scooters.some((s) => s.id === opts.scooter)) {
        const id = opts.scooter;
        setForm((f) => ({ ...f, scooter: id }));
        setUnitKey(opts.unit && units.some((u) => u.key === opts.unit) ? opts.unit : units.find((u) => u.item.id === id)?.key ?? "");
      }
      const n = Number(opts.days);
      if (Number.isFinite(n) && n > 0) {
        const start = isoAddDays(todayInRodrigues(), 1);
        // n DAYS inclusive, so the last day is start + (n - 1). Adding n would
        // ask for n+1 days now that both ends are counted — the planner would
        // quietly sell a day more than the customer chose.
        setForm((f) => ({ ...f, start_date: start, end_date: isoAddDays(start, Math.max(0, n - 1)) }));
        setDesiredDays(n);
      }
      setStep("dates");
      setPickingVehicle(false);
      if (formState === "success") setFormState("idle");
      setOpen(true);
      // A history entry, so the phone's Back button closes the sheet instead
      // of leaving the page behind it.
      try {
        if (!pushedRef.current) {
          window.history.pushState({ ...(window.history.state ?? {}), rrSheet: true }, "");
          pushedRef.current = true;
        }
      } catch {
        /* ignore */
      }
    },
    [scooters, units, formState],
  );

  const closeSheet = useCallback(() => {
    if (formState === "loading") return;
    setOpen(false);
    setPickingVehicle(false);
    if (pushedRef.current) {
      pushedRef.current = false;
      try {
        window.history.back();
      } catch {
        /* ignore */
      }
    }
    requestAnimationFrame(() => openerRef.current?.focus?.({ preventScroll: true }));
  }, [formState]);

  useEffect(() => {
    const onPop = () => {
      if (pushedRef.current) {
        pushedRef.current = false;
        setOpen(false);
        setPickingVehicle(false);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Every way in: the cards and vehicle pages dispatch OPEN_BOOKING_EVENT; the
  // trip planner and older code dispatch rr:prefill-booking.
  useEffect(() => {
    function onOpen(e: Event) {
      const detail = ((e as CustomEvent).detail ?? {}) as { scooter?: string; unit?: string; days?: number };
      openSheet({ scooter: detail.scooter ? String(detail.scooter) : undefined, unit: detail.unit, days: detail.days });
    }
    window.addEventListener(OPEN_BOOKING_EVENT, onOpen);
    window.addEventListener("rr:prefill-booking", onOpen);
    return () => {
      window.removeEventListener(OPEN_BOOKING_EVENT, onOpen);
      window.removeEventListener("rr:prefill-booking", onOpen);
    };
  }, [openSheet]);

  // A vehicle page's Reserve is a real link to /browse/<cat>?v=<id>#booking —
  // it works without JavaScript — and, with it, opens this sheet in place.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a[data-rr-reserve]") as HTMLAnchorElement | null;
      if (!a) return;
      const id = a.getAttribute("data-rr-reserve") ?? "";
      if (!scooters.some((s) => s.id === id)) return;
      e.preventDefault();
      openSheet({ scooter: id });
    }
    // CAPTURE phase: next/link handles the click in React's bubble phase and
    // navigates unless the event is already prevented. Listening on bubble,
    // this ran second, found it prevented by the Link, and the vehicle page's
    // Reserve left the page for /browse/<cat>?v= instead of opening in place.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [openSheet, scooters]);

  // ── ARRIVING FROM A VEHICLE'S OWN PAGE, OR A SHARED LINK ────────────────
  // /browse/car?v=<id>#booking opens the sheet with that vehicle. Read with
  // URLSearchParams rather than useSearchParams: this route is statically
  // prerendered and useSearchParams would opt it into per-request rendering
  // for a parameter that is absent on almost every visit.
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("v");
    // Only a vehicle the sheet can actually show.
    if (v && scooters.some((s) => s.id === v)) {
      openSheet({ scooter: v });
    } else if (window.location.hash === "#booking") {
      openSheet();
    }
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Trip Planner → Booking across pages: it stores the planned length in
  // localStorage and lands on #booking.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("rr_trip_days");
      if (!raw) return;
      localStorage.removeItem("rr_trip_days");
      const n = parseInt(raw, 10);
      if (!Number.isFinite(n) || n <= 0) return;
      const start = isoAddDays(todayInRodrigues(), 1);
      setForm((f) => ({ ...f, start_date: start, end_date: isoAddDays(start, Math.max(0, n - 1)) }));
      setDesiredDays(n);
    } catch {
      /* ignore */
    }
  }, []);

  // ── Referral auto-attribution from the ?ref= link ──
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

  // ── Availability: booked date ranges for the selected vehicle ──
  const [bookedRanges, setBookedRanges] = useState<{ start: string; end: string; confirmed: boolean }[]>([]);
  useEffect(() => {
    if (!form.scooter || !open) {
      if (!form.scooter) setBookedRanges([]);
      return;
    }
    let active = true;
    fetch(`/api/availability?scooter=${encodeURIComponent(form.scooter)}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((d) => { if (active && Array.isArray(d)) setBookedRanges(d); })
      .catch(() => { if (active) setBookedRanges([]); });
    return () => { active = false; };
  }, [form.scooter, open]);

  // Capacity-aware: a day is full when active bookings covering it reach the
  // row's unit count. A new reservation holds its dates immediately.
  const heldCountOn = useCallback(
    (day: string) => bookedRanges.reduce((n, b) => (day >= b.start && day <= b.end ? n + 1 : n), 0),
    [bookedRanges],
  );
  const isFull = useCallback((day: string) => heldCountOn(day) >= capacity, [heldCountOn, capacity]);
  const hasOverlap =
    !!form.start_date && !!effectiveEnd &&
    (() => {
      for (let d = form.start_date; d <= effectiveEnd; d = isoAddDays(d, 1)) {
        if (isFull(d)) return true;
      }
      return false;
    })();

  // ── One more day, said plainly (owner brief, 6 Oct 2026 — improved) ─────
  //
  // The scooter list makes the second day cost Rs 99 and the third Rs 599. A
  // renter who picks one or two days is told that, once, as a fact with its
  // total — never as a banner — and can add the day in one tap. Only when that
  // day is free for this vehicle; cars price linearly, so they never see it.
  const scooterPriced = !!selectedScooter && usesScooterRates(selectedScooter);
  const addDayOffer = (() => {
    if (!breakdown || !scooterPriced || days < 1 || days > 2 || !effectiveEnd) return null;
    const next = scooterTotal(days + 1, rates);
    if (next == null) return null;
    const end = isoAddDays(effectiveEnd, 1);
    if (isFull(end)) return null;
    return { days: days + 1, total: next, extra: next - breakdown.rental, end };
  })();

  // ── Dialog plumbing: scroll lock while open, Esc, focus trap ──────────────
  useEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    const id = requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(id);
      html.style.overflow = prev;
    };
  }, [open]);

  function onDialogKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      if (pickingVehicle) setPickingVehicle(false);
      else closeSheet();
      return;
    }
    if (e.key !== "Tab" || !dialogRef.current) return;
    const nodes = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const dateFmt = useMemo(() => new Intl.DateTimeFormat(DATE_LOCALE[lang], { day: "numeric", month: "short", timeZone: "UTC" }), [lang]);
  function fmtRange(start: string, end: string): string {
    if (!start) return "";
    const a = new Date(`${start}T00:00:00Z`);
    const b = new Date(`${(end || start)}T00:00:00Z`);
    try {
      return start === (end || start) ? dateFmt.format(a) : dateFmt.formatRange(a, b);
    } catch {
      return `${dateFmt.format(a)} – ${dateFmt.format(b)}`;
    }
  }

  const inputCls =
    "w-full rounded-xl border border-dark-border bg-dark px-4 py-3.5 font-dm text-[15px] text-offwhite placeholder:text-muted/60 focus:border-yellow focus:outline-none transition-colors";

  const phoneOk = isValidPhone(form.phone);
  const emailOk = isValidEmail(form.email);
  const emailInvalid = !!form.email && !isValidEmail(form.email);

  async function downloadReceipt() {
    if (!lastBooking) return;
    const short = (lastBooking.bookingId || "").replace(/-/g, "").slice(0, 6).toUpperCase() || Date.now().toString(36).toUpperCase().slice(-6);
    // M220: a customer who asked to pay in cash is not "due" a part-payment —
    // the owner decides how it is paid — so their receipt says what they asked.
    const cashAsked = !!lastBooking.inPerson && !depositPaid;
    // ── FETCHED ON THE TAP (architecture review 2026-09-30, perf item 2) ──
    // The PDF writer and its logo were a static import, so every /browse page
    // downloaded them for a button that exists only after a reservation.
    let saveReceiptPdf: typeof import("@/lib/receipt").downloadReceipt;
    try {
      ({ downloadReceipt: saveReceiptPdf } = await import("@/lib/receipt"));
    } catch (err) {
      console.error("Receipt code failed to load", err);
      return;
    }
    saveReceiptPdf({
      ref: `RR-${short}`,
      heading: depositPaid ? "Deposit receipt" : "Booking receipt",
      customer: lastBooking.name,
      itemLabel: "Vehicle",
      item: lastBooking.scooter,
      // ── THE ARITHMETIC, NOT JUST THE ANSWER (M167) ──────────────────────
      // Every line comes from the same server-priced breakdown the booking
      // was created from; `rate` is rental ÷ days, so a 2-day scooter reads
      // "2 days x Rs 899".
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
              value: lastBooking.delivery > 0 ? `Rs ${lastBooking.delivery.toLocaleString()}` : "Free",
            }]
          : []),
        ...(lastBooking.total ? [{ label: "Total", value: lastBooking.total, strong: true }] : []),
        ...(cashAsked ? [{ label: "Payment", value: "In person, in cash (to be confirmed)" }] : []),
        ...((lastBooking.deposit ?? 0) > 0 && !cashAsked
          ? [{
              label: depositPaid
                ? "Deposit paid"
                : `Deposit due${lastBooking.pct ? ` (${lastBooking.pct}%)` : ""}`,
              value: `Rs ${(lastBooking.deposit ?? 0).toLocaleString()}`,
            }]
          : []),
        ...(lastBooking.balance != null && lastBooking.balance > 0 && !cashAsked
          ? [{ label: "Balance at pickup", value: `Rs ${lastBooking.balance.toLocaleString()}` }]
          : []),
      ],
      note: depositPaid
        ? "Your deposit is received and your booking is confirmed. The balance is settled at pickup. Keep this receipt for your records."
        : cashAsked
          ? "This confirms your booking request. You asked to pay in person — we will tell you whether you can, or whether you need to pay online. Nothing is charged until then."
          : "This confirms your booking request. Pay the deposit to lock it in — the balance is settled at pickup.",
    });
  }

  const ERR = r.err;

  /** Step 1 → 2: the vehicle and the dates must be right first. */
  function toDetails() {
    const fe: { vehicle?: boolean; date?: boolean } = {};
    let firstId: string | null = null;
    const msgs: string[] = [];
    if (!form.scooter) { fe.vehicle = true; msgs.push(ERR.vehicle); firstId ??= "bk-vehicle"; }
    if (!form.start_date || days <= 0) { fe.date = true; msgs.push(ERR.date); firstId ??= "bk-dates-label"; }
    else if (hasOverlap) { fe.date = true; msgs.push(ERR.overlap); firstId ??= "bk-dates-label"; }
    if (msgs.length) {
      setFieldErr(fe);
      setMissingSteps(msgs);
      setSubmitError(msgs[0]);
      if (firstId) document.getElementById(firstId)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setFieldErr({});
    setMissingSteps([]);
    setSubmitError(null);
    setStep("details");
    requestAnimationFrame(() => {
      bodyRef.current?.scrollTo({ top: 0 });
      document.getElementById("bk-name")?.focus({ preventScroll: true });
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (step === "dates") {
      toDetails();
      return;
    }
    // ── EVERYTHING THAT IS STILL MISSING, AT ONCE, AND GO TO THE BOX ─────
    // The checks are ordered the way the sheet reads, so "first error" is the
    // one highest up; the first failing field is scrolled to and focused
    // (M163) — focus opens the keyboard on a phone and is what a screen
    // reader announces.
    const fe: { vehicle?: boolean; date?: boolean; name?: boolean; email?: boolean; phone?: boolean } = {};
    const missing: string[] = [];
    let firstError: string | null = null;
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
    flag(!form.scooter, ERR.vehicle, "vehicle", "bk-vehicle");
    flag(!form.start_date || days <= 0, ERR.date, "date", "bk-dates-label");
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
      // The vehicle and the dates live on step 1.
      if (fe.vehicle || fe.date) setStep("dates");
      requestAnimationFrame(() => {
        const target = firstFieldId ? document.getElementById(firstFieldId) : null;
        if (target) {
          // `center`, not `start`: the sheet's header would otherwise sit on
          // top of the very field we just sent them to.
          target.scrollIntoView({ behavior: "smooth", block: "center" });
          if (typeof (target as HTMLElement).focus === "function") {
            (target as HTMLElement).focus({ preventScroll: true });
          }
        } else {
          formTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
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
        // The payload the API has always taken. The SERVER prices it again
        // from the fleet — these figures are for the owner's alert only.
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
          total_price: totalLabel || null,
          total_amount: breakdown ? breakdown.total : null,
          delivery_fee: breakdown ? breakdown.delivery : null,
          message: form.message || null,
          partner_code: form.partner_code.trim().toUpperCase() || null,
          payment_preference: form.payment_preference,
        }),
      });
      // The server's refusals are actionable ("Those dates were just taken"),
      // so they are shown, not replaced with "something went wrong".
      const resData = (await res.json().catch(() => ({}))) as {
        bookingId?: string; depositAmount?: number; error?: string;
      };
      if (!res.ok) throw new Error(resData.error || "");
      posthog.capture("scooter_booking_requested", {
        scooter_id: form.scooter,
        rental_days: days,
        has_partner_referral: Boolean(form.partner_code.trim()),
        has_deposit: Boolean((breakdown?.deposit ?? resData.depositAmount ?? 0) > 0),
        payment_preference: form.payment_preference,
      });
      setLastBooking({
        scooter: selectedUnit?.label ?? selectedScooter?.name ?? form.scooter,
        range: fmtRange(form.start_date, effectiveEnd),
        days,
        name: form.name,
        email: form.email,
        total: totalLabel,
        bookingId: resData.bookingId,
        deposit: breakdown?.deposit ?? resData.depositAmount ?? 0,
        totalMur: breakdown?.total,
        rate: breakdown ? Math.round(breakdown.rental / Math.max(1, days)) : undefined,
        rental: breakdown?.rental,
        delivery: breakdown?.delivery,
        balance: breakdown?.balance,
        pct: breakdown?.pct,
        inPerson: form.payment_preference === "in_person",
      });
      // ── THE WAY BACK (6 Oct 2026) ──────────────────────────────────────────
      // Closing this sheet used to lose the payment step for good. While an
      // online amount is due, the bar on every page links back to the booking
      // (lib/pending/store.ts); the email stays on this device so
      // /manage-booking can open it without asking again.
      const dueOnline = breakdown?.deposit ?? resData.depositAmount ?? 0;
      if (resData.bookingId && dueOnline > 0 && form.payment_preference !== "in_person") {
        upsertPending({
          kind: "rental",
          ref: bookingReference(String(resData.bookingId)),
          email: form.email,
          title: selectedUnit?.label ?? selectedScooter?.name ?? form.scooter,
          range: fmtRange(form.start_date, effectiveEnd),
          dueMur: dueOnline,
          startDate: form.start_date,
          savedAt: Date.now(),
        });
      }
      setFormState("success");
      setForm({ name: "", email: "", phone: "", scooter: "", start_date: "", end_date: "", pickup_time: "10:00", return_time: "10:00", message: "", partner_code: "", payment_preference: "online" });
      setShowPartnerCode(false);
      setAgreed(false);
      requestAnimationFrame(() => bodyRef.current?.scrollTo({ top: 0 }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setSubmitError(message || ERR.failed);
      setFormState("idle");
      requestAnimationFrame(() => document.getElementById("bk-error")?.scrollIntoView({ behavior: "smooth", block: "center" }));
    }
  }

  // Rodrigues' calendar day, not the device's.
  const today = todayInRodrigues();
  const wa = whatsapp
    ? whatsappHref(whatsapp, `Hi Roule Rodrigues, I'd like to rent ${selectedUnit?.label ?? "a vehicle"}${form.start_date ? ` on ${fmtRange(form.start_date, effectiveEnd)}` : ""}.`)
    : null;
  const title = (selectedScooter?.category ?? category) === "car" ? r.cars : r.scooters;
  const noun = isCar ? r.carNoun : r.scooterNoun;
  const line = (label: React.ReactNode, value: React.ReactNode, strong = false, muted = false) => (
    <div className={`flex items-baseline justify-between gap-4 py-2 ${strong ? "font-semibold text-offwhite" : muted ? "text-muted" : "text-offwhite/85"}`}>
      <dt className="min-w-0">{label}</dt>
      <dd className={`shrink-0 text-right tabular-nums ${strong ? "font-syne text-base font-bold" : ""}`}>{value}</dd>
    </div>
  );

  const sheet = (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100]" onKeyDown={onDialogKey}>
          <motion.div
            className="absolute inset-0 bg-black/70"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: calm ? 0 : 0.2 }}
            onClick={closeSheet}
            aria-hidden
          />
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="rr-sheet-title"
            initial={calm ? { opacity: 0 } : { opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={calm ? { opacity: 0 } : { opacity: 0, y: 40 }}
            transition={{ duration: calm ? 0.12 : 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-x-0 bottom-0 flex h-[min(92dvh,860px)] flex-col overflow-hidden rounded-t-3xl border-t border-white/[0.12] bg-dark-card shadow-[0_-16px_44px_-12px_rgba(0,0,0,0.75)] md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:h-[min(88vh,820px)] md:w-[460px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl md:border"
          >
            {/* ── Header ─────────────────────────────────────────────── */}
            <div className="shrink-0 border-b border-white/[0.08] px-2 pb-1 pt-2">
              <div aria-hidden className="mx-auto mb-1 h-1 w-10 rounded-full bg-white/20 md:hidden" />
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => (formState !== "success" && step === "details" ? setStep("dates") : closeSheet())}
                  aria-label={r.back}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-offwhite/80 transition-colors hover:bg-white/[0.06]"
                >
                  <ChevronLeft size={20} aria-hidden />
                </button>
                <p id="rr-sheet-title" className="font-syne text-base font-bold text-offwhite">
                  {formState === "success" ? r.datesHeld : step === "details" ? r.yourDetails : title}
                </p>
                <button
                  type="button"
                  onClick={closeSheet}
                  aria-label={r.close}
                  data-autofocus
                  className="flex h-11 w-11 items-center justify-center rounded-full text-offwhite/80 transition-colors hover:bg-white/[0.06]"
                >
                  <X size={20} aria-hidden />
                </button>
              </div>
            </div>

            {formState === "success" ? (
              <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5">
                <div className="text-center">
                  <SuccessBurst />
                  <p className="mt-4 font-syne text-lg font-extrabold text-offwhite">{depositPaid ? r.paidTitle : r.datesHeld}</p>
                  <p className="mt-1 font-dm text-sm text-muted">
                    {depositPaid ? r.paidBody : lastBooking?.inPerson ? r.datesHeldCash : r.datesHeldBody}
                  </p>
                </div>
                <div className="mt-5">
                  <BookingTimeline
                    completed={depositPaid ? 3 : 1}
                    labels={lastBooking?.inPerson && !depositPaid ? t.manageBooking.timelineInPersonVehicle : undefined}
                  />
                </div>
                {!depositPaid && (
                  <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left">
                    <p className="font-bebas text-[10px] tracking-[0.25em] text-yellow">{t.booking.checkingTitle}</p>
                    <ol className="mt-2.5 space-y-2">
                      {[
                        t.booking.checkingStep1,
                        t.booking.checkingStep2,
                        lastBooking?.inPerson ? t.booking.checkingStep3InPerson : t.booking.checkingStep3,
                      ].map((s, i) => (
                        <li key={i} className="flex gap-2.5 font-dm text-xs leading-relaxed text-offwhite/80">
                          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-yellow/15 font-syne text-[10px] font-bold text-yellow">
                            {i + 1}
                          </span>
                          {s}
                        </li>
                      ))}
                    </ol>
                    <p className="mt-3 font-dm text-[11px] leading-relaxed text-muted">{t.booking.checkingNote}</p>
                  </div>
                )}
                {/* ── PAY NOW, OR WAIT — BOTH ARE REAL (M161) ───────────────
                    The check above costs nothing and comes first; a customer
                    who wants certainty can pay the amount due now and hold the
                    vehicle (first paid keeps it), with the refund promise in
                    the same breath. Not for a customer who asked to pay in
                    cash (M220). */}
                {!depositPaid && lastBooking?.bookingId && (lastBooking.deposit ?? 0) > 0 && !lastBooking.inPerson && (
                  <>
                    <div className="mt-4 rounded-2xl border border-yellow/25 bg-yellow/[0.04] p-4 text-left">
                      <p className="font-bebas text-[10px] tracking-[0.25em] text-yellow">{t.booking.secureNowTitle}</p>
                      <p className="mt-2 font-dm text-xs leading-relaxed text-offwhite/80">{t.booking.secureNowBody}</p>
                      <p className="mt-2 font-dm text-[11px] leading-relaxed text-muted">{t.booking.secureNowRefund}</p>
                      <div className="mt-3.5">
                        <PayPalDeposit
                          bookingId={lastBooking.bookingId}
                          depositMur={lastBooking.deposit ?? 0}
                          fullMur={lastBooking.totalMur}
                          kind="vehicle"
                          onPaid={() => {
                            setDepositPaid(true);
                            if (lastBooking?.bookingId) removePending(bookingReference(lastBooking.bookingId));
                          }}
                          onFailedChange={setPayPalFailed}
                        />
                      </div>
                    </div>
                    {/* Under the only pay button, and only while it is
                        offered. The deposit is in RUPEES (bookings). */}
                    <PaymentHelp
                      section="rental"
                      reference={lastBooking.bookingId}
                      amount={`Rs ${(lastBooking.deposit ?? 0).toLocaleString()}`}
                      method={payPalFailed ? "paypal" : null}
                      defaultTopic="how_to_pay"
                      emphasis={payPalFailed}
                      className="mt-4"
                    />
                  </>
                )}
                <div className="mt-6 flex flex-col gap-2.5">
                  <button
                    type="button"
                    onClick={downloadReceipt}
                    className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-white/15 font-syne text-sm font-bold text-offwhite/85 transition-colors hover:border-yellow/40 hover:text-yellow"
                  >
                    <Download size={15} aria-hidden /> {r.receipt}
                  </button>
                  <button
                    type="button"
                    onClick={closeSheet}
                    className="min-h-12 w-full rounded-full font-dm text-sm text-muted transition-colors hover:text-offwhite"
                  >
                    {r.done}
                  </button>
                </div>
              </div>
            ) : (
              <form
                id="rr-booking-form"
                ref={formTopRef}
                onSubmit={handleSubmit}
                noValidate
                className="flex min-h-0 flex-1 flex-col"
              >
                <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 pt-4">
                  {step === "dates" ? (
                    <>
                      {desiredDays && (
                        <p className="mb-3 rounded-xl border border-yellow/25 bg-yellow/[0.06] px-3.5 py-2.5 font-dm text-xs text-offwhite/85">
                          {r.tripPrefill(desiredDays)}
                        </p>
                      )}
                      {referredBy && (
                        <p className="mb-3 flex items-center gap-2 font-dm text-xs text-offwhite/70">
                          <BadgeCheck size={14} className="shrink-0 text-yellow" aria-hidden /> {r.referredBy(referredBy)}
                        </p>
                      )}

                      {/* ── Vehicle: full name, one meta line, one price ── */}
                      <button
                        type="button"
                        id="bk-vehicle"
                        onClick={() => setPickingVehicle((v) => !v)}
                        aria-expanded={pickingVehicle}
                        aria-controls="bk-vehicle-list"
                        className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
                          fieldErr.vehicle ? "border-red-500/70" : "border-white/[0.12] hover:border-white/25"
                        }`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block font-dm text-[11px] text-muted">{r.vehicle}</span>
                          <span className="block font-syne text-[15px] font-bold leading-snug text-offwhite">
                            {selectedUnit?.label ?? t.booking.scooterPlaceholder}
                          </span>
                          {selectedScooter && (
                            <span className="block font-dm text-xs text-muted">
                              {(selectedScooter.specs ?? []).slice(0, 3).map((s) => fleetTerm(language, s)).join(" · ")}
                            </span>
                          )}
                        </span>
                        {selectedScooter && (
                          <span className="shrink-0 text-right font-dm text-sm tabular-nums text-offwhite">
                            {convert(rs(vehicleDayRate(selectedScooter, categories)))}
                            <span className="block text-[11px] text-muted">{r.perDay}</span>
                          </span>
                        )}
                        <ChevronDown size={16} aria-hidden className={`shrink-0 text-muted transition-transform ${pickingVehicle ? "rotate-180" : ""}`} />
                      </button>

                      {pickingVehicle && (
                        <ul id="bk-vehicle-list" role="listbox" aria-label={r.vehicle} className="mt-2 divide-y divide-white/[0.06] rounded-2xl border border-white/[0.12]">
                          {units.map((u) => {
                            const s = u.item;
                            const on = u.key === (selectedUnit?.key ?? "");
                            return (
                              <li key={u.key} role="option" aria-selected={on}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setForm((f) => ({ ...f, scooter: s.id }));
                                    setUnitKey(u.key);
                                    setPickingVehicle(false);
                                    setFieldErr((p) => ({ ...p, vehicle: false }));
                                    setSubmitError(null);
                                  }}
                                  className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
                                >
                                  <span className="min-w-0 flex-1">
                                    <span className="block font-dm text-[15px] text-offwhite">{u.label}</span>
                                    {/* Says it, rather than hiding the row: out
                                        today is still bookable for other dates. */}
                                    {s.soldOutToday ? <span className="block font-dm text-xs text-amber-300">{r.outToday}</span> : null}
                                  </span>
                                  <span className="shrink-0 font-dm text-sm tabular-nums text-offwhite/85">
                                    {convert(rs(vehicleDayRate(s, categories)))} <span className="text-muted">{r.perDay}</span>
                                  </span>
                                  {on && <Check size={16} className="shrink-0 text-yellow" aria-hidden />}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}

                      {/* ── Dates ── */}
                      {/* min-h-11: the row is as tall before the first tap as
                          after it, when the 44px Clear target appears. */}
                      <div className="mt-6 flex min-h-11 items-center justify-between">
                        <span id="bk-dates-label" tabIndex={-1} className="font-syne text-[15px] font-bold text-offwhite outline-none">
                          {form.start_date ? fmtRange(form.start_date, effectiveEnd) : r.selectDates}
                          {days > 0 && <span className="ml-2 font-dm text-sm font-normal text-muted">{r.days(days)}</span>}
                        </span>
                        {form.start_date && (
                          <button
                            type="button"
                            onClick={() => setForm((f) => ({ ...f, start_date: "", end_date: "" }))}
                            className="min-h-11 px-2 font-dm text-sm text-offwhite/80 underline underline-offset-4 hover:text-offwhite"
                          >
                            {r.clear}
                          </button>
                        )}
                      </div>
                      <div
                        role="group"
                        aria-labelledby="bk-dates-label"
                        className={`mt-2 rounded-2xl ${fieldErr.date ? "ring-1 ring-red-500/60" : ""}`}
                      >
                        <RangeCalendar
                          start={form.start_date}
                          end={form.end_date}
                          minDate={today}
                          isUnavailable={isFull}
                          lang={lang}
                          onChange={(start, end) => {
                            setForm((f) => ({ ...f, start_date: start, end_date: end }));
                            setDesiredDays(null);
                            setFieldErr((p) => ({ ...p, date: false }));
                            setSubmitError(null);
                          }}
                        />
                      </div>

                      {/* ── Before a range: the scooter list, in the space the
                          line items take once one exists (below the calendar,
                          so nothing above it moves). ── */}
                      {!breakdown && scooterPriced && (
                        <div className="mt-4 border-t border-white/[0.08] font-dm text-sm">
                          <dl className="divide-y divide-white/[0.06]" aria-label={r.rateTable}>
                            {line(r.days(1), convert(rs(rates.oneDay)))}
                            {line(r.days(2), convert(rs(rates.twoDays * 2)))}
                            {line(
                              r.threePlus,
                              <>
                                {convert(rs(rates.threePlus))} <span className="text-muted">{r.perDay}</span>
                              </>,
                            )}
                          </dl>
                          <p className="pt-1 text-xs text-muted">{r.deliveryIncluded}.</p>
                        </div>
                      )}

                      {/* ── Line items: only once a range exists ── */}
                      {breakdown && (
                        <motion.dl
                          key={`${form.scooter}-${days}`}
                          initial={calm ? false : { opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.2 }}
                          className="mt-4 divide-y divide-white/[0.06] border-t border-white/[0.08] font-dm text-sm"
                        >
                          {line(r.rentalLine(noun, days, convert(rs(breakdown.rate))), convert(rs(breakdown.rental)))}
                          {line(r.delivery, breakdown.delivery > 0 ? convert(rs(breakdown.delivery)) : r.included)}
                          {line(r.total, convert(rs(breakdown.total)), true)}
                          {payInPersonChosen ? (
                            line(r.dueAtPickup, convert(rs(breakdown.total)))
                          ) : (
                            <>
                              {line(r.dueNow(breakdown.pct), convert(rs(breakdown.deposit)))}
                              {line(r.dueAtPickup, convert(rs(breakdown.balance)), false, true)}
                            </>
                          )}
                          {hold > 0 && (
                            <div className="py-2">
                              <div className="flex items-baseline justify-between gap-4 text-offwhite/85">
                                <dt>{r.holdAtPickup}</dt>
                                <dd className="tabular-nums">{convert(rs(hold))}</dd>
                              </div>
                              <p className="mt-0.5 text-xs text-muted">{r.holdNote}</p>
                            </div>
                          )}
                        </motion.dl>
                      )}

                      {addDayOffer && (
                        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] py-1 pl-3 pr-1">
                          <p className="font-dm text-xs leading-snug text-offwhite/80">
                            {r.addDayLine(convert(rs(addDayOffer.extra)), addDayOffer.days, convert(rs(addDayOffer.total)))}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setForm((f) => ({ ...f, end_date: addDayOffer.end }));
                              setDesiredDays(null);
                              setFieldErr((p) => ({ ...p, date: false }));
                            }}
                            className="min-h-11 shrink-0 rounded-lg px-3 font-dm text-sm text-offwhite underline underline-offset-4 transition-colors hover:bg-white/[0.04]"
                          >
                            {r.addDay}
                          </button>
                        </div>
                      )}

                      {/* The cancellation terms, at the moment money is asked
                          for. Outside 48 hours the refund is 80% of what was
                          paid in advance, 20% retained — so this states the
                          fee rather than implying there is none. */}
                      {breakdown && (
                        <p className="mt-3 font-dm text-xs leading-relaxed text-muted">
                          {language === "fr"
                            ? "Annulez plus de 48 h avant : 80 % de l'acompte remboursé. Dans les 48 h, non remboursable."
                            : language === "cr"
                              ? "Anile plis ki 48 er avan : 80 % lakont ranbourse. Dan 48 er, pena ranbourseman."
                              : "Cancel more than 48h before and 80% of your deposit is refunded. Inside 48h it is non-refundable."}{" "}
                          <Link href="/legal/refunds" target="_blank" className="text-offwhite/80 underline underline-offset-2 hover:text-offwhite">
                            {language === "fr" ? "Détails" : language === "cr" ? "Detay" : "Details"}
                          </Link>
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="bk-pickup-time" className="mb-1.5 block font-dm text-xs text-muted">{r.pickupTime}</label>
                          <select
                            id="bk-pickup-time"
                            value={form.pickup_time}
                            onChange={(e) => setForm({ ...form, pickup_time: e.target.value })}
                            className={`${inputCls} appearance-none`}
                          >
                            {TIME_SLOTS.map((s) => (
                              <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label htmlFor="bk-return-time" className="mb-1.5 block font-dm text-xs text-muted">{r.returnTime}</label>
                          <select
                            id="bk-return-time"
                            value={form.return_time}
                            onChange={(e) => setForm({ ...form, return_time: e.target.value })}
                            className={`${inputCls} appearance-none`}
                          >
                            {TIME_SLOTS.map((s) => (
                              <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label htmlFor="bk-name" className="mb-1.5 block font-dm text-xs text-muted">{r.name}</label>
                        <input
                          id="bk-name"
                          type="text"
                          autoComplete="name"
                          placeholder={r.namePh}
                          value={form.name}
                          onChange={(e) => { setForm({ ...form, name: e.target.value }); setFieldErr((p) => ({ ...p, name: false })); }}
                          aria-invalid={fieldErr.name || undefined}
                          className={`${inputCls}${fieldErr.name ? " !border-red-500/70" : ""}`}
                          required
                        />
                      </div>
                      <div>
                        <label htmlFor="bk-email" className="mb-1.5 block font-dm text-xs text-muted">{r.email}</label>
                        <input
                          id="bk-email"
                          type="email"
                          autoComplete="email"
                          inputMode="email"
                          aria-required
                          aria-invalid={emailInvalid || fieldErr.email || undefined}
                          placeholder="you@example.com"
                          value={form.email}
                          onChange={(e) => { setForm({ ...form, email: e.target.value }); setFieldErr((p) => ({ ...p, email: false })); }}
                          className={`${inputCls}${emailInvalid || fieldErr.email ? " !border-red-500/60" : ""}`}
                        />
                        {emailInvalid && <p className="mt-1.5 font-dm text-xs text-red-400">{t.common.validEmail}</p>}
                      </div>
                      <div>
                        <label htmlFor="bk-phone" className="mb-1.5 block font-dm text-xs text-muted">{r.phone}</label>
                        <PhoneInput
                          id="bk-phone"
                          value={form.phone}
                          onChange={(full) => { setForm((f) => ({ ...f, phone: full })); setFieldErr((p) => ({ ...p, phone: false })); }}
                          placeholder={r.phonePh}
                          inputClassName={`${inputCls} pl-10${fieldErr.phone ? " !border-red-500/70" : ""}`}
                        />
                      </div>
                      <div>
                        <label htmlFor="bk-message" className="mb-1.5 block font-dm text-xs text-muted">{r.message}</label>
                        <textarea
                          id="bk-message"
                          rows={2}
                          placeholder={
                            // A car is not offered "an extra helmet".
                            category && category !== "scooter"
                              ? t.booking.messagePlaceholderCar
                              : t.booking.messagePlaceholder
                          }
                          value={form.message}
                          onChange={(e) => setForm({ ...form, message: e.target.value })}
                          className={`${inputCls} resize-none`}
                        />
                      </div>

                      {/* Referral code, collapsed: most people have none. */}
                      <div>
                        <button
                          type="button"
                          onClick={() => setShowPartnerCode((v) => !v)}
                          aria-expanded={showPartnerCode}
                          className="flex min-h-11 items-center gap-1.5 font-dm text-sm text-offwhite/80 hover:text-offwhite"
                        >
                          <ChevronDown size={15} aria-hidden className={`transition-transform ${showPartnerCode ? "rotate-180" : ""}`} />
                          {r.referral}
                        </button>
                        {showPartnerCode && (
                          <div className="mt-1">
                            <input
                              id="bk-partner"
                              type="text"
                              aria-label={r.referral}
                              placeholder={r.referralPh}
                              value={form.partner_code}
                              onChange={(e) => setForm({ ...form, partner_code: e.target.value.toUpperCase() })}
                              className={inputCls}
                              maxLength={30}
                            />
                            <p className="mt-1.5 font-dm text-xs text-muted">{r.referralHint}</p>
                          </div>
                        )}
                      </div>

                      {/* M220 — the owner: "people tend to pay on cash by
                          hand". Recorded as said; the owner still decides. */}
                      <label className="flex min-h-11 cursor-pointer items-start gap-3">
                        <input
                          type="checkbox"
                          checked={payInPersonChosen}
                          onChange={(e) => setForm((f) => ({ ...f, payment_preference: e.target.checked ? "in_person" : "online" }))}
                          className="mt-0.5 h-5 w-5 shrink-0 accent-yellow"
                        />
                        <span className="font-dm text-sm text-offwhite/85">
                          {r.payInPerson}
                          <span className="mt-0.5 block text-xs text-muted">{r.payInPersonNote}</span>
                        </span>
                      </label>

                      <label className="flex min-h-11 cursor-pointer items-start gap-3">
                        <input
                          id="bk-agree"
                          type="checkbox"
                          checked={agreed}
                          onChange={(e) => { setAgreed(e.target.checked); if (e.target.checked) setAgreeError(false); }}
                          className="mt-0.5 h-5 w-5 shrink-0 accent-yellow"
                        />
                        <span className={`font-dm text-sm ${agreeError ? "text-red-400" : "text-offwhite/85"}`}>
                          {r.agree}{" "}
                          <Link href="/legal/terms" target="_blank" className="underline underline-offset-2 hover:text-offwhite">
                            {r.agreeLink}
                          </Link>
                        </span>
                      </label>
                    </div>
                  )}

                  {submitError && (
                    <div id="bk-error" role="alert" className="mt-4 flex items-start gap-2 font-dm text-sm text-red-400">
                      <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden />
                      {missingSteps.length > 1 ? (
                        <div>
                          <p className="font-semibold">{r.stillToDo}</p>
                          <ul className="mt-1 list-disc space-y-0.5 pl-4">
                            {missingSteps.map((m) => (
                              <li key={m}>{m}</li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <span>{submitError}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* ── The summary, pinned above the home indicator ───────── */}
                <div className="shrink-0 border-t border-white/[0.08] bg-dark-card px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
                  <div className="flex items-center gap-3">
                    {/* min-h-14 holds the three-line summary and the one-line
                        prompt at one height, so the calendar never moves. */}
                    <div className="flex min-h-14 min-w-0 flex-1 flex-col justify-center">
                      {breakdown ? (
                        <>
                          <p className="truncate font-dm text-xs text-muted">
                            {fmtRange(form.start_date, effectiveEnd)} · {r.days(days)}
                          </p>
                          <p className="font-syne text-lg font-extrabold leading-tight tabular-nums text-offwhite">
                            {convert(rs(breakdown.total))}
                          </p>
                          <p className="font-dm text-xs tabular-nums text-muted">
                            {payInPersonChosen
                              ? `${r.dueAtPickup} ${convert(rs(breakdown.total))}`
                              : `${r.dueNowShort} ${convert(rs(breakdown.deposit))}`}
                          </p>
                        </>
                      ) : (
                        <p className="font-dm text-sm text-muted">{r.selectDates}</p>
                      )}
                    </div>
                    <button
                      type="submit"
                      disabled={formState === "loading"}
                      className="flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-yellow px-7 font-syne text-[15px] font-bold text-dark transition-colors hover:bg-yellow-dark disabled:opacity-60"
                    >
                      {formState === "loading" ? (
                        <>
                          <Loader2 size={16} className="animate-spin" aria-hidden /> {r.sending}
                        </>
                      ) : (
                        r.reserve
                      )}
                    </button>
                  </div>
                  <p className="mt-2 font-dm text-[11px] leading-snug text-muted">
                    {r.payments}
                    {wa && (
                      <>
                        {" "}
                        <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-offwhite/80 underline underline-offset-2 hover:text-offwhite">
                          <MessageCircle size={11} aria-hidden /> {r.messageUs}
                        </a>
                      </>
                    )}
                  </p>
                </div>
              </form>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      {/* The page's FAQ accordion: the rental terms, read from the FAQ the
          owner maintains, server-rendered in place. */}
      {showConditions && conditions?.length ? (
        <section className="mx-auto max-w-5xl px-4 pb-10 pt-2 md:px-6">
          <RentalConditions items={conditions} />
        </section>
      ) : null}
      {mounted && createPortal(sheet, document.body)}
    </>
  );
}
