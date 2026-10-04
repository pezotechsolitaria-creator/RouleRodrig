"use client";

import { useState, useEffect } from "react";
import ModalPortal from "@/components/ModalPortal";
import posthog from "posthog-js";
import { motion } from "framer-motion";
import { X, Loader2, AlertCircle, Send, User, Mail, Users, MessageSquare, Clock, BedDouble, ShieldCheck, Minus, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DEFAULT_CONTENT } from "@/lib/defaults";
import AvailabilityCalendar from "@/components/AvailabilityCalendar";
import PhoneInput from "@/components/PhoneInput";
import { quoteStay } from "@/lib/stay-pricing";
import SuccessBurst from "@/components/SuccessBurst";
import PaymentHelp from "@/components/payments/PaymentHelp";
import { isValidPhone, isValidEmail } from "@/lib/phone";
import { useLanguage } from "@/context/LanguageContext";
import type { RecommendedPlace } from "@/lib/defaults";
import type { PaymentPreference } from "@/lib/bookings/payment-preference";
import { capacityOf, engineHandles, pricingOf, unitsFor } from "@/lib/reservations/listing";
import { computeTotal, formatMur, partySize, type Party } from "@/lib/reservations/policy";

// The published cancellation tiers, read rather than restated. See the block
// that renders them for why this component reads the defaults directly.
const CANCELLATION_TIERS = DEFAULT_CONTENT.refunds?.cancellationTiers ?? [];

type FormState = "idle" | "loading" | "success" | "error";

// M240 — the request-to-book words. "Request to book", never "Book now": the
// guest is asking, Roulé confirms, and only then is anything paid.
const ENGINE_COPY = {
  en: {
    eyebrow: "REQUEST TO BOOK",
    who: "WHO'S COMING",
    adults: "Adults",
    children: "Children",
    babies: "Babies",
    each: (p: string) => `${p} each`,
    free: "Free",
    total: "Total",
    quoteLater: "Roulé confirms the price",
    cta: "Request to book",
    note: "Nothing is charged now. Roulé checks availability first, then you choose how to pay.",
    less: "Fewer",
    more: "More",
    upTo: (n: number) => `Up to ${n} people`,
  },
  fr: {
    eyebrow: "DEMANDE DE RÉSERVATION",
    who: "QUI VIENT",
    adults: "Adultes",
    children: "Enfants",
    babies: "Bébés",
    each: (p: string) => `${p} par personne`,
    free: "Gratuit",
    total: "Total",
    quoteLater: "Roulé confirme le prix",
    cta: "Demander à réserver",
    note: "Rien n'est débité maintenant. Roulé vérifie d'abord la disponibilité, puis vous choisissez comment payer.",
    less: "Moins",
    more: "Plus",
    upTo: (n: number) => `Jusqu'à ${n} personnes`,
  },
  cr: {
    eyebrow: "DEMANN REZERVASION",
    who: "KI PE VINI",
    adults: "Adilt",
    children: "Zanfan",
    babies: "Baba",
    each: (p: string) => `${p} sakenn`,
    free: "Gratis",
    total: "Total",
    quoteLater: "Roulé konfirm pri la",
    cta: "Demann pou rezerve",
    note: "Pa pe pran okenn kas aster. Roulé verifie si ena plas avan, apre ou swazir kouma pou pey.",
    less: "Mwins",
    more: "Plis",
    upTo: (n: number) => `Ziska ${n} dimounn`,
  },
} as const;

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 12)}`;
}

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
  const { t, language } = useLanguage();
  const router = useRouter();
  // M240: activities go through the reservation engine — a request Roulé
  // confirms, then a page the guest keeps (/booking/[token]) instead of the
  // "request sent" screen below. Stays and tables keep the old flow for now.
  const engine = engineHandles(place);
  const E = ENGINE_COPY[language as keyof typeof ENGINE_COPY] ?? ENGINE_COPY.en;
  const [party, setParty] = useState<Party>({ adults: 1, children: 0, babies: 0 });
  // One key per opened form: a double tap, a retry or a dropped response all
  // come back as the SAME reservation.
  const [idemKey] = useState(newIdempotencyKey);
  const [engineError, setEngineError] = useState<string | null>(null);
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
  // M220 — how the customer would like to pay. Online by default, so the
  // existing flow is unchanged for anyone who leaves it alone. Only asked of a
  // listing with a price: a request-only listing has nothing to pay online.
  const [payment, setPayment] = useState<PaymentPreference>("online");
  // The engine asks nothing about paying here: the owner's policy decides,
  // and the booking page offers the methods once Roulé has confirmed.
  const hasPrice = !engine && (Number(place.depositAmount) > 0 || (isStay && Number(place.nightlyRate) > 0));
  const payInPerson = hasPrice && payment === "in_person";
  // After a successful request: the created booking + whether a deposit is due,
  // and whether that deposit has been paid (→ confirmed celebration).
  const [result, setResult] = useState<{ bookingId: string; depositAmount: number | null; inPerson?: boolean } | null>(null);
  // Payment now happens after approval, not in this modal, so nothing here
  // sets this any more — it still gates the celebration a returning
  // customer sees on an already-paid booking.
  const [paid] = useState(false);

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
  const qty = engine ? partySize(party) : Math.min(Math.max(1, form.qty), maxQty);
  // The price is the LISTING's (lib/reservations/listing), the same function
  // the server charges with — shown here, never sent from here.
  const pricing = engine ? pricingOf(place) : null;
  const engineTotal = pricing ? computeTotal(pricing, party, 1) : null;
  // Seats or trips (lib/reservations/listing capacityOf): a guided hike for
  // eight is ONE of the day's trips, a seat on the Île aux Cocos boat is one
  // of its 36. The party may not exceed the listing's people-per-trip either.
  const rule = engine ? capacityOf(place) : null;
  const units = rule ? unitsFor(rule, qty) : 0;
  const partyRoom = rule ? (rule.mode === "trips" ? rule.maxParty : Math.min(seatsLeft, rule.maxParty)) : 0;

  // What this stay costs, quoted LIVE and from the same function the server
  // charges with (lib/stay-pricing). The price used to appear only after the
  // guest had already committed — the one thing every accommodation guideline
  // says must be visible before the button, not after it.
  const quote = isStay ? quoteStay(place, form.start, form.end, qty) : null;

  // ── Validity ──
  const dateChosen = isStay ? !!(form.start && form.end) : !!form.start;
  const slotOk = isStay || slots.length === 0 || !!form.slot;
  const capacityOk = isStay ? minRoomsLeft >= qty : rule ? units <= seatsLeft && qty <= rule.maxParty : seatsLeft >= qty;
  const emailOk = isValidEmail(form.email); // email now required (confirmation + receipt)
  const emailInvalid = !!form.email && !isValidEmail(form.email);
  const canSubmit = !!form.name && isValidPhone(form.phone) && emailOk && dateChosen && slotOk && capacityOk && (!engine || party.adults >= 1) && formState !== "loading";

  const inputCls =
    "w-full bg-dark border border-dark-border rounded-xl px-4 py-3 text-offwhite text-sm font-dm placeholder:text-muted/50 focus:border-yellow focus:outline-none transition-colors";

  async function submitEngine() {
    setFormState("loading");
    setEngineError(null);
    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idemKey },
        body: JSON.stringify({
          product_id: place.id,
          date: form.start,
          time: slots.length > 0 ? form.slot : null,
          adults: party.adults,
          children: party.children,
          babies: party.babies,
          name: form.name,
          phone: form.phone,
          email: form.email || null,
          notes: form.message || null,
          locale: language,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.token) throw new Error(typeof j.error === "string" ? j.error : "");
      posthog.capture("reservation_requested", {
        place_id: place.id,
        place_category: place.category,
        seats: qty,
        has_price: engineTotal != null,
      });
      // Stays "loading" while the booking page opens.
      router.push(`/booking/${j.token}`);
    } catch (err) {
      // Stays until the next attempt: the server's sentence ("That date has
      // already passed", "at most 8 people") is the instruction, and a
      // message that vanishes mid-read is no instruction at all.
      setEngineError(err instanceof Error && err.message ? err.message : null);
      setFormState("error");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    if (engine) return submitEngine();
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
          // Only when it was asked: a request-only listing sends nothing.
          payment_preference: hasPrice ? payment : null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "failed");
      posthog.capture("place_reservation_requested", {
        place_id: place.id,
        place_category: place.category,
        quantity: qty,
        has_deposit: Boolean((j.depositAmount ?? 0) > 0),
        payment_preference: hasPrice ? payment : null,
      });
      setResult({ bookingId: j.bookingId, depositAmount: j.depositAmount ?? null, inPerson: payInPerson });
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
    <ModalPortal>
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
      {/* It LOOKED like a dialog and behaved like one, but announced itself as
          a plain div: a screen-reader user got no indication that a dialog had
          opened, and nothing named it. Found by an end-to-end test that could
          not locate it by role either — the same gap, from the other side. */}
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={`Book ${place.name}`}
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
          {isStay ? "BOOK YOUR STAY" : place.category === "restaurant" ? "RESERVE A TABLE" : engine ? E.eyebrow : "BOOK THIS ACTIVITY"}
        </p>
        <h3 className="font-syne font-extrabold text-offwhite text-2xl leading-tight mb-1">{place.name}</h3>
        {place.priceNote && <p className="text-yellow/90 font-dm text-sm mb-4">{place.priceNote}</p>}

        {formState === "success" && paid ? (
          /* ── Paid in full → confirmed celebration ── */
          <div className="py-6 text-center">
            <SuccessBurst size={84} />
            <p className="mt-4 font-syne font-extrabold text-offwhite text-xl mb-1">{t.placeBooking.confirmed} 🎉</p>
            <p className="text-muted font-dm text-sm mb-5">You&apos;re paid up — nothing to settle on the day. See you at {place.name}; we&apos;ll be in touch with the details.</p>
            {whatsapp && (
              <a href={waLink("I just paid for my booking")} target="_blank" rel="noopener noreferrer"
                 className="inline-flex items-center gap-2 bg-green-500 text-white font-syne font-bold text-sm py-2.5 px-5 rounded-xl hover:bg-green-600 transition-colors">
                <MessageSquare size={15} /> {t.placeBooking.whatsappCta}
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
              <p className="mt-4 font-syne font-extrabold text-offwhite text-xl">{t.placeBooking.requestReceived}</p>
              {/* M127. It no longer says "pay below and it's confirmed", because
                  we cannot confirm what we have not checked. The boats and
                  guesthouses are not ours, and taking money for a slot we then
                  cannot get is a refund, a PayPal fee and a lost customer. */}
              {result.inPerson ? (
                // M220: they asked to pay in cash, so the next thing they hear
                // is whether they may, not a payment link — and never a promise
                // that they can: the owner decides.
                <p className="mt-1 text-muted font-dm text-sm">{t.placeBooking.successInPerson}</p>
              ) : (
              <p className="mt-1 text-muted font-dm text-sm">
                We&apos;re checking with {place.name} now — <strong className="text-offwhite">nothing has been charged.</strong>
              </p>
              )}
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
                  {/* "Total to pay now" is false for a cash request (M220). */}
                  <dt className="text-muted">{result.inPerson ? t.placeBooking.totalInPerson : t.placeBooking.totalToPay}</dt>
                  <dd className="text-yellow font-syne font-bold text-right">Rs {result.depositAmount.toLocaleString()}</dd>
                </div>
              </dl>

              {/* What happens next, in the order it happens. A customer told
                  "we are checking" who is given no idea when, or what then, is
                  worse off than one who was simply asked to pay. */}
              <ol className="space-y-2.5 rounded-xl border border-yellow/25 bg-yellow/[0.05] p-4 font-dm text-sm text-offwhite/90">
                <li className="flex gap-2.5">
                  <span className="font-bebas text-yellow">1</span>
                  <span>We check with {place.name} — usually the same day.</span>
                </li>
                <li className="flex gap-2.5">
                  <span className="font-bebas text-yellow">2</span>
                  <span>
                    {form.email
                      ? <>{t.placeBooking.eitherWayEmailPrefix} <strong className="text-offwhite">{form.email}</strong> {t.placeBooking.eitherWaySuffix}</>
                      : <>{t.placeBooking.eitherWay}</>}
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span className="font-bebas text-yellow">3</span>
                  {result.inPerson ? (
                    <span>{t.placeBooking.step3InPerson}</span>
                  ) : (
                  <span>
                    If it&apos;s free, that message has a link to pay{" "}
                    <strong className="text-yellow">Rs {result.depositAmount.toLocaleString()}</strong> and confirm.
                    If it isn&apos;t, we suggest something else — and you&apos;ve paid nothing.
                  </span>
                  )}
                </li>
              </ol>

              {/* Payment help, directly under step 3 — the only place this
                  modal talks about paying. The pill, not the card: this is a
                  dialog with a 90vh cap, and a full card here pushed the steps
                  off screen. "stay" only for a hotel — this modal also books
                  tables, boat trips and massages. place_bookings store RUPEES;
                  this is the same string as the total above. */}
              <div className="mt-4 flex justify-center">
                <PaymentHelp
                  section={isStay ? "stay" : "booking"}
                  variant="compact"
                  reference={result.bookingId}
                  amount={`Rs ${result.depositAmount.toLocaleString()}`}
                  method={null}
                  defaultTopic="how_to_pay"
                />
              </div>

              {whatsapp && (
                <a href={waLink("about my reservation")} target="_blank" rel="noopener noreferrer"
                   className="mt-3 w-full flex items-center justify-center gap-2 text-muted hover:text-yellow font-dm text-sm py-2 transition-colors">
                  <MessageSquare size={15} /> {t.placeBooking.whatsappChat}
                </a>
              )}
              <p className="mt-3 text-muted/50 font-dm text-[11px] text-center">Your reference is {result.bookingId.replace(/-/g, "").slice(0, 6).toUpperCase()}. Keep it — you can check this booking any time at /track.</p>
            </motion.div>
          </div>
        ) : formState === "success" ? (
          /* ── Request-only listing (no price set) → request received ── */
          <div className="py-8 text-center">
            <SuccessBurst />
            <p className="mt-4 font-syne font-bold text-offwhite text-lg mb-1">{t.placeBooking.requestSent}</p>
            <p className="text-muted font-dm text-sm mb-5">We&apos;ll confirm your reservation at {place.name} shortly.</p>
            {whatsapp && (
              <a
                href={waLink("I just requested a reservation")}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-green-500 text-white font-syne font-bold text-sm py-2.5 px-5 rounded-xl hover:bg-green-600 transition-colors"
              >
                <MessageSquare size={15} /> {t.placeBooking.whatsappCta}
              </a>
            )}
            <button onClick={onClose} className="block mx-auto mt-4 text-muted hover:text-yellow text-sm font-dm transition-colors">Close</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            {formState === "error" && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
                <AlertCircle size={16} className="text-red-400 shrink-0" />
                <p className="text-red-400/80 font-dm text-xs">{engineError ?? t.placeBooking.error}</p>
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

            {/* M240 — who's coming. Adults, children and babies, priced from
                the listing; every one of them takes a seat. */}
            {engine && dateChosen && slotOk && (
              <div>
                <p className="font-bebas text-muted text-[10px] tracking-[0.25em] flex items-center gap-1.5 mb-2">
                  <Users size={12} className="text-yellow" /> {E.who}
                </p>
                <div className="divide-y divide-dark-border rounded-xl border border-dark-border">
                  {([
                    ["adults", E.adults, pricing?.perPerson && pricing.unit_mur != null ? E.each(formatMur(pricing.unit_mur)) : null, 1],
                    ["children", E.children, pricing?.perPerson && pricing.unit_mur != null ? E.each(formatMur(pricing.child_mur ?? pricing.unit_mur)) : null, 0],
                    ["babies", E.babies, pricing?.perPerson ? (pricing.baby_mur ? E.each(formatMur(pricing.baby_mur)) : E.free) : null, 0],
                  ] as const).map(([key, label, price, min]) => (
                    <div key={key} className="flex items-center justify-between gap-3 px-3.5 py-2">
                      <div className="min-w-0">
                        <p className="font-dm text-sm text-offwhite">{label}</p>
                        {price && <p className="font-dm text-[11px] text-muted">{price}</p>}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label={`${E.less} — ${label}`}
                          disabled={party[key] <= min || formState === "loading"}
                          onClick={() => setParty((p) => ({ ...p, [key]: Math.max(min, p[key] - 1) }))}
                          className="flex h-10 w-10 items-center justify-center rounded-full border border-dark-border text-offwhite transition-colors hover:border-yellow/50 disabled:opacity-30"
                        >
                          <Minus size={15} />
                        </button>
                        <span className="w-7 text-center font-dm text-lg font-semibold text-offwhite tabular-nums" aria-live="polite">
                          {party[key]}
                        </span>
                        <button
                          type="button"
                          aria-label={`${E.more} — ${label}`}
                          disabled={qty >= partyRoom || formState === "loading"}
                          onClick={() => setParty((p) => ({ ...p, [key]: p[key] + 1 }))}
                          className="flex h-10 w-10 items-center justify-center rounded-full border border-dark-border text-offwhite transition-colors hover:border-yellow/50 disabled:opacity-30"
                        >
                          <Plus size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-muted/50 font-dm text-[11px] mt-1">
                  {rule?.mode === "trips" ? E.upTo(rule.maxParty) : `${partyRoom} ${unitLeftLabel} available`}
                </p>
              </div>
            )}

            {/* Quantity (rooms / party size / people) + guests for hotels */}
            {!engine && dateChosen && slotOk && (
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
                type="text" placeholder={t.placeBooking.yourName} value={form.name}
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
              {emailInvalid && <p className="text-red-400 font-dm text-[11px] mt-1.5">{t.placeBooking.validEmail}</p>}
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
                  <Clock size={12} className="text-yellow" /> {t.placeBooking.arrivalTitle}
                </label>
                <input
                  type="text"
                  placeholder={t.placeBooking.arrivalHint}
                  value={form.arrival}
                  onChange={(e) => setForm({ ...form, arrival: e.target.value })}
                  className={inputCls}
                  disabled={formState === "loading"}
                />
              </div>
            )}
            <textarea
              rows={2} placeholder={t.placeBooking.notes} value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              className={`${inputCls} resize-none`} disabled={formState === "loading"}
            />

            {/* ── HOW WOULD YOU LIKE TO PAY? (M220) ────────────────────────
                The owner: "people tend to pay on cash by hand". This records
                what the customer says; the owner still decides. Online stays
                the default and its flow is unchanged. Asked only of a listing
                with a price — a request-only one has nothing to pay online. */}
            {hasPrice && (
              <fieldset disabled={formState === "loading"}>
                <legend className="font-bebas text-muted text-[10px] tracking-[0.25em] block mb-2">
                  {t.placeBooking.payChoiceLabel}
                </legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {([
                    ["online", t.placeBooking.payChoiceOnline],
                    ["in_person", t.placeBooking.payChoiceInPerson],
                  ] as const).map(([value, label]) => (
                    <label
                      key={value}
                      className={`flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-xl border px-3.5 py-2.5 font-dm text-sm transition-colors ${
                        payment === value
                          ? "border-yellow bg-yellow/10 text-offwhite"
                          : "border-dark-border text-muted hover:border-yellow/40"
                      }`}
                    >
                      <input
                        type="radio"
                        name="place-payment-preference"
                        value={value}
                        checked={payment === value}
                        onChange={() => setPayment(value)}
                        className="h-4 w-4 shrink-0 accent-yellow"
                      />
                      {label}
                    </label>
                  ))}
                </div>
                {/* Activities carry no quote box, so the note that replaces
                    "Paid in full to confirm" is shown here for them. */}
                {payInPerson && !quote && (
                  <p className="mt-1.5 font-dm text-[11px] text-muted/70">{t.placeBooking.inPersonNote}</p>
                )}
              </fieldset>
            )}

            {engine && dateChosen && slotOk && (
              <div className="rounded-xl border border-yellow/20 bg-yellow/5 p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-dm text-sm text-offwhite">{E.total}</span>
                  <span className="font-syne text-lg font-bold text-yellow">{engineTotal != null ? formatMur(engineTotal) : E.quoteLater}</span>
                </div>
                <p className="mt-1 font-dm text-[11px] text-muted/80">{E.note}</p>
              </div>
            )}

            {quote && (
              <div className="rounded-xl border border-yellow/20 bg-yellow/5 p-3">
                {quote.flat ? (
                  // Said plainly rather than dressed up as a nightly price: this
                  // listing genuinely charges one amount however long you stay.
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-dm text-xs text-muted">{t.placeBooking.priceForBooking}</span>
                    <span className="font-syne text-lg font-bold text-yellow">Rs {quote.total.toLocaleString()}</span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-baseline justify-between gap-3 font-dm text-xs text-muted">
                      <span>
                        Rs {quote.rate.toLocaleString()} × {quote.nights} night{quote.nights === 1 ? "" : "s"}
                        {quote.rooms > 1 ? ` × ${quote.rooms} rooms` : ""}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-baseline justify-between gap-3 border-t border-yellow/15 pt-1.5">
                      <span className="font-dm text-sm text-offwhite">Total</span>
                      <span className="font-syne text-lg font-bold text-yellow">Rs {quote.total.toLocaleString()}</span>
                    </div>
                  </>
                )}
                <p className="mt-1 font-dm text-[10px] text-muted/60">
                  {/* M220: "Paid in full to confirm. Nothing further to settle
                      on arrival." is false the moment they pick cash. */}
                  {payInPerson ? t.placeBooking.inPersonNote : t.placeBooking.paidInFull}
                </p>
              </div>
            )}

            {/* The price and "paid in full to confirm" are the only payment
                facts on this form, so the help pill sits right under them. The
                pill, not the card: this is a request form, not the pay step.
                Same rupee string as the total; no booking reference exists yet. */}
            {quote && (
              <div className="-mt-2">
                <PaymentHelp
                  section={isStay ? "stay" : "booking"}
                  variant="compact"
                  reference={null}
                  amount={`Rs ${quote.total.toLocaleString()}`}
                  method={null}
                  defaultTopic="how_to_pay"
                />
              </div>
            )}

            {/* ── WHAT HAPPENS IF THEY CANCEL ──────────────────────────────
                This flow asks for the FULL amount up front — a bigger ask than
                the vehicle flow, which takes 25–50% — and said nothing at all
                about cancelling. The vehicle summary has carried "free
                cancellation up to 48h" with a link since it was written; the
                experience modal, asking for a larger sum and having taken zero
                bookings ever, offered no reassurance whatsoever.

                Read from DEFAULT_CONTENT.refunds rather than retyped, so this
                states the real published policy. The canonical copy stays
                /legal/refunds, linked below; there is no admin editor for these
                tiers today, so the two cannot drift apart without a code change
                that touches this line. */}
            {CANCELLATION_TIERS.length > 0 && (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="mb-1.5 flex items-center gap-1.5 font-bebas text-[10px] tracking-[0.2em] text-muted">
                  <ShieldCheck size={11} /> {t.placeBooking.cancelTitle}
                </p>
                <ul className="space-y-0.5">
                  {CANCELLATION_TIERS.map((t) => (
                    <li key={t.window} className="font-dm text-[11px] leading-snug text-offwhite/70">
                      <span className="text-offwhite/90">{t.window}</span> — {t.outcome}.
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 font-dm text-[11px] text-muted/70">
                  If we or the owner cancel, you are refunded in full.{" "}
                  <Link href="/legal/refunds" target="_blank" className="underline hover:text-yellow">
                    {t.placeBooking.fullPolicy}
                  </Link>
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full flex items-center justify-center gap-2 bg-yellow text-dark font-syne font-bold text-base py-3.5 rounded-xl hover:bg-yellow-dark transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {formState === "loading" ? <><Loader2 size={16} className="animate-spin" /> Sending…</> : <>{engine ? E.cta : t.placeBooking.requestReservation} <Send size={15} /></>}
            </button>
            {!engine && <p className="text-muted/40 font-dm text-[11px] text-center">A request, not a confirmed booking — we&apos;ll confirm availability with you.</p>}
          </form>
        )}
      </motion.div>
    </div>
    </ModalPortal>
  );
}
