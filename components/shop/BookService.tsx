"use client";

import { useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, Loader2, Phone } from "lucide-react";
import { centsToShortString } from "@/lib/money";
import {
  SLOT_REASON,
  clockAt,
  dayLabel,
  dayLabelAt,
  durationText,
  todayOnIsland,
} from "@/lib/services/diary";

export type BookableService = {
  variantId: string;
  name: string;
  priceCents: number;
  minutes: number;
};

// ── Booking a tradesperson, as the customer ─────────────────────────────────
//
// The owner: "now let customers book themselves from the storefront."
//
// ── NO ACCOUNT, AND NO BASKET ──────────────────────────────────────────────
// A car wash is not added to a basket and paid for now — it is a time somebody
// promises to keep. The whole flow is: which service, which day, which time,
// your name and number. Four taps and two fields, because the alternative on
// this island is a phone call, and a form longer than the phone call loses.
//
// The times are REAL free times from service_slots, never a clock to type into.
// A picker that lets somebody choose 09:00 and then says "taken" has wasted the
// only thing they came here to do.

export default function BookService({
  storeId,
  storeName,
  storePhone,
  services,
  takesOnlineBookings,
  mobile,
}: {
  storeId: string;
  storeName: string;
  storePhone: string | null;
  services: BookableService[];
  takesOnlineBookings: boolean;
  /** Do they come to you, or do you go to them? */
  mobile: boolean;
}) {
  const [variantId, setVariantId] = useState(services[0]?.variantId ?? "");
  const [day, setDay] = useState(todayOnIsland());
  const [slots, setSlots] = useState<{
    times: { time: string; startsAt: string }[];
    reason: string | null;
    openDates: string[];
  } | null>(null);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ service: string; startsAt: string } | null>(null);

  useEffect(() => {
    if (!variantId) return;
    setSlots(null);
    setStartsAt(null);
    fetch(
      `/api/services?store=${encodeURIComponent(storeId)}&variant=${encodeURIComponent(variantId)}&date=${encodeURIComponent(day)}`,
      { cache: "no-store" },
    )
      .then((r) => r.json())
      .then((d) => setSlots(d))
      .catch(() => setError("Could not check what is free just now."));
  }, [storeId, variantId, day]);

  const service = services.find((s) => s.variantId === variantId) ?? services[0];

  if (services.length === 0) return null;

  // ── Done ─────────────────────────────────────────────────────────────
  // No account, so no "my bookings" page to send them to. The confirmation is
  // the record, and it carries the two things a customer needs afterwards: when
  // to turn up, and the number to ring if they cannot.
  if (done) {
    return (
      <section className="rounded-2xl border border-green-500/30 bg-green-500/[0.07] p-5">
        <p className="flex items-center gap-2 font-syne text-lg font-extrabold text-offwhite">
          <CheckCircle2 size={18} className="text-green-400" /> You are booked in
        </p>
        <p className="mt-1.5 font-dm text-sm text-offwhite/90">
          {done.service} with {storeName}, {dayLabelAt(done.startsAt)} at{" "}
          <span className="font-bold tabular-nums text-yellow">{clockAt(done.startsAt)}</span>.
        </p>
        <p className="mt-2 font-dm text-xs text-muted">
          {mobile
            ? "They come to you. They will ring to agree exactly where."
            : "Come to them at that time."}{" "}
          {storePhone
            ? "To change it or cancel, ring them."
            : // Said only when it is TRUE. This branch used to read "their
              // number is on this page" in exactly the case where the shop has
              // no number anywhere on it — a sentence that sends somebody
              // hunting for something that is not there.
              "To change it or cancel, get a message to them — they have your number and will ring if anything changes."}
        </p>
        {storePhone && (
          <a
            href={`tel:${storePhone.replace(/\s/g, "")}`}
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-white/20 px-4 font-dm text-sm text-offwhite hover:border-yellow/50 hover:text-yellow"
          >
            <Phone size={14} /> {storePhone}
          </a>
        )}
      </section>
    );
  }

  const field =
    "w-full rounded-xl border border-white/12 bg-dark px-3 py-3 font-dm text-sm text-offwhite placeholder:text-muted/60 focus:border-yellow/50 focus:outline-none";

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId,
          variantId,
          startsAt,
          name,
          phone,
          note: note || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "That booking did not go through.");
      setDone({ service: body.service, startsAt: body.startsAt });
    } catch (e) {
      setError(e instanceof Error ? e.message : "That booking did not go through.");
      // The slot may have gone to somebody else while the form was open, so the
      // list is refetched rather than left showing a time that is no longer
      // there — the one thing more annoying than a refusal is the same refusal
      // twice.
      setStartsAt(null);
      fetch(
        `/api/services?store=${encodeURIComponent(storeId)}&variant=${encodeURIComponent(variantId)}&date=${encodeURIComponent(day)}`,
        { cache: "no-store" },
      )
        .then((r) => r.json())
        .then((d) => setSlots(d))
        .catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-dark-card p-4 sm:p-5">
      <h2 className="font-syne text-lg font-extrabold text-offwhite">
        {takesOnlineBookings ? "Book a time" : "When they are free"}
      </h2>
      <p className="mt-0.5 font-dm text-xs text-muted">
        {mobile ? "They come to you." : "You go to them."}{" "}
        {takesOnlineBookings
          ? "Nothing to pay now — you settle it with them."
          : "They take bookings by telephone, so ring to claim one of these."}
      </p>

      {/* ── What ────────────────────────────────────────────────────── */}
      <div className="mt-4 flex flex-wrap gap-2">
        {services.map((s) => {
          const on = s.variantId === variantId;
          return (
            <button
              key={s.variantId}
              onClick={() => setVariantId(s.variantId)}
              aria-pressed={on}
              className={`min-h-11 rounded-xl border px-3 py-2 text-left transition-colors ${
                on ? "border-yellow bg-yellow/10" : "border-white/12 hover:border-yellow/40"
              }`}
            >
              <span className="block font-dm text-sm text-offwhite">{s.name}</span>
              <span className="block font-dm text-xs text-muted">
                Rs {centsToShortString(s.priceCents)} · {durationText(s.minutes)}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── When ────────────────────────────────────────────────────── */}
      <label className="mt-4 block">
        <span className="flex items-center gap-1.5 font-dm text-xs text-muted">
          <CalendarDays size={12} /> Which day?
        </span>
        <input
          type="date"
          value={day}
          min={todayOnIsland()}
          onChange={(e) => setDay(e.target.value)}
          className={`mt-1 ${field}`}
        />
      </label>

      <div className="mt-3">
        {!slots && <p className="font-dm text-xs text-muted">Checking…</p>}
        {slots && slots.times.length === 0 && (
          <p className="font-dm text-sm text-muted">
            {SLOT_REASON[slots.reason ?? ""] ?? "Nothing free that day."}
            {slots.openDates.length > 0 && (
              <>
                {" "}
                Next free:{" "}
                <button
                  onClick={() => setDay(slots.openDates[0])}
                  className="font-bold text-yellow hover:underline"
                >
                  {dayLabel(slots.openDates[0])}
                </button>
                .
              </>
            )}
          </p>
        )}
        {slots && slots.times.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {slots.times.map((t) => (
              <li key={t.startsAt}>
                <button
                  onClick={() => setStartsAt(t.startsAt)}
                  aria-pressed={startsAt === t.startsAt}
                  className={`min-h-11 rounded-full border px-3.5 font-dm text-sm tabular-nums transition-colors ${
                    startsAt === t.startsAt
                      ? "border-yellow bg-yellow/15 text-yellow"
                      : "border-white/15 text-offwhite hover:border-yellow/50"
                  }`}
                >
                  {t.time}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Who ─────────────────────────────────────────────────────── */}
      {takesOnlineBookings ? (
        <>
          <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="Your name"
              aria-label="Your name"
              className={field}
            />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              maxLength={40}
              placeholder="Your phone number"
              aria-label="Your phone number"
              className={field}
            />
          </div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            placeholder="Anything they should know (optional)"
            aria-label="Anything they should know"
            className={`mt-2.5 ${field}`}
          />

          {error && (
            <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 font-dm text-sm text-red-200">
              {error}
            </p>
          )}

          <button
            onClick={() => void submit()}
            disabled={busy || !startsAt || !name.trim() || !phone.trim()}
            className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-yellow px-6 font-syne text-sm font-bold text-dark disabled:opacity-40 sm:w-auto"
          >
            {busy && <Loader2 size={15} className="animate-spin" />}
            {startsAt
              ? `Book ${service ? service.name : ""} at ${clockAt(startsAt)}`
              : "Pick a time"}
          </button>
          {/* Said before they commit, not after: a booking that cannot be
              undone on the website has to say so where the decision is made. */}
          <p className="mt-2 font-dm text-[11px] text-muted">
            To change or cancel afterwards, ring them{storePhone ? ` on ${storePhone}` : ""}.
          </p>
        </>
      ) : (
        storePhone && (
          <a
            href={`tel:${storePhone.replace(/\s/g, "")}`}
            className="mt-4 inline-flex min-h-12 items-center gap-2 rounded-full bg-yellow px-6 font-syne text-sm font-bold text-dark"
          >
            <Phone size={15} /> Ring {storeName}
          </a>
        )
      )}
    </section>
  );
}
