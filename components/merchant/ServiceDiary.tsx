"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, Loader2, Phone, Plus, StickyNote, X } from "lucide-react";
import {
  STATUS_VOCAB,
  SLOT_REASON,
  clockAt,
  clockRange,
  dayLabel,
  dayLoad,
  durationText,
  todayOnIsland,
  type BookingStatus,
  type Diary,
  type DiaryDay,
} from "@/lib/services/diary";
import BookingSettings, { type ServiceRow, type Settings } from "./BookingSettings";

// ── The diary ───────────────────────────────────────────────────────────────
//
// The owner: "now build the booked slots and calendar for services."
//
// ── WHY A DAY STRIP AND NOT A MONTH GRID ───────────────────────────────────
// A month grid is what a calendar looks like, and it is the wrong shape for
// this. A car wash's diary is open fourteen days, most of the interesting
// detail is TODAY and TOMORROW, and a 7×5 grid on a 375px phone gives each day
// 50px — enough for a number and nothing else, so every single day still has to
// be tapped to find out what is in it. A horizontal strip of days gives each
// one a name, a load bar and a count, and the day you actually want is the
// first one.
//
// ── AND WHY THE PHONE NUMBER IS A LINK ─────────────────────────────────────
// The whole reason a booking exists is so somebody can be told when the
// provider is running late. On a phone that is one tap, and typing an eight
// digit number off a screen while holding a pressure washer is not.

type Payload = Diary & { settings: Settings; services: ServiceRow[] };

export default function ServiceDiary() {
  const [data, setData] = useState<Payload | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/merchant/diary", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not open your diary.");
      setData(body as Payload);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open your diary.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const today = todayOnIsland();
  const day: DiaryDay | null = useMemo(() => {
    if (!data) return null;
    return data.calendar.find((d) => d.date === (picked ?? today)) ?? data.calendar[0] ?? null;
  }, [data, picked, today]);

  async function setStatus(bookingId: string, status: BookingStatus) {
    setBusy(true);
    try {
      const res = await fetch("/api/merchant/diary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "status", bookingId, status }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "That did not go through.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That did not go through.");
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <p className="flex items-center gap-2 py-10 font-dm text-sm text-muted">
        <Loader2 size={15} className="animate-spin" /> Opening your diary…
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Fourteen days, side by side ────────────────────────────────
          Scrolls horizontally on a phone; every chip is a 64px target. The
          load bar is the point: it is how a provider sees at a glance that
          Saturday is nearly gone while Wednesday is empty. */}
      <div className="-mx-4 overflow-x-auto px-4 pb-1">
        <ul className="flex gap-2">
          {data.calendar.map((d) => {
            const load = dayLoad(d, data.concurrentJobs);
            const active = d.date === day?.date;
            const held = d.bookings.filter((b) => STATUS_VOCAB[b.status].holdsTime).length;
            return (
              <li key={d.date}>
                <button
                  onClick={() => setPicked(d.date)}
                  aria-pressed={active}
                  className={`flex w-[76px] shrink-0 flex-col items-center gap-1 rounded-xl border px-2 py-2 transition-colors ${
                    active
                      ? "border-yellow bg-yellow/10"
                      : "border-white/12 hover:border-yellow/40"
                  }`}
                >
                  <span className={`font-dm text-[11px] ${active ? "text-yellow" : "text-muted"}`}>
                    {d.date === today ? "Today" : dayLabel(d.date).replace(/,/, "")}
                  </span>
                  <span className="font-syne text-sm font-bold text-offwhite">
                    {d.isClosed ? "—" : held || "0"}
                  </span>
                  {/* A closed day gets no bar at all. An empty bar would read
                      as "nobody booked", which is a different problem. */}
                  <span className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                    {load != null && (
                      <span
                        className={`block h-full rounded-full ${load >= 1 ? "bg-red-400" : "bg-yellow"}`}
                        style={{ width: `${Math.max(4, load * 100)}%` }}
                      />
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {day && (
        <section className="rounded-2xl border border-white/10 bg-dark-card p-4">
          <header className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-syne text-lg font-extrabold text-offwhite">
              {day.date === today ? "Today" : dayLabel(day.date)}
            </h2>
            <p className="font-dm text-xs text-muted">
              {day.isClosed
                ? "Closed"
                : `Open ${(day.opensAt ?? "").slice(0, 5)}–${(day.closesAt ?? "").slice(0, 5)}` +
                  (day.bookedMinutes > 0 ? ` · ${durationText(day.bookedMinutes)} booked` : "")}
            </p>
          </header>

          {day.bookings.length === 0 && (
            <p className="mt-3 font-dm text-sm text-muted">
              {day.isClosed ? "You are closed this day." : "Nothing booked yet."}
            </p>
          )}

          <ul className="mt-3 space-y-2">
            {day.bookings.map((b) => {
              const v = STATUS_VOCAB[b.status];
              return (
                <li
                  key={b.id}
                  className={`rounded-xl border border-white/10 p-3 ${v.holdsTime ? "" : "opacity-55"}`}
                >
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="font-syne text-sm font-bold tabular-nums text-yellow">
                      {clockRange(b.startsAt, b.endsAt)}
                    </span>
                    <span className="font-dm text-sm text-offwhite">{b.service}</span>
                    {!v.holdsTime && (
                      <span className="rounded-full border border-white/20 px-2 font-bebas text-[9px] tracking-[0.15em] text-muted">
                        {v.label.toUpperCase()}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 font-dm text-xs text-muted">
                    <span className="text-offwhite/80">{b.customerName}</span>
                    {/* One tap, because the reason to open a booking is almost
                        always to ring the person in it. */}
                    <a
                      href={`tel:${b.customerPhone.replace(/\s/g, "")}`}
                      className="inline-flex items-center gap-1 hover:text-yellow"
                    >
                      <Phone size={11} /> {b.customerPhone}
                    </a>
                    {b.source === "customer" && <span>booked online</span>}
                  </p>
                  {b.note && (
                    <p className="mt-1 flex items-start gap-1.5 font-dm text-xs text-muted/80">
                      <StickyNote size={11} className="mt-0.5 shrink-0" /> {b.note}
                    </p>
                  )}

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(b.status === "booked"
                      ? (["done", "no_show", "cancelled"] as BookingStatus[])
                      : (["booked"] as BookingStatus[])
                    ).map((next) => (
                      <button
                        key={next}
                        disabled={busy}
                        onClick={() => void setStatus(b.id, next)}
                        className="min-h-9 rounded-full border border-white/15 px-3 font-dm text-xs text-muted transition-colors hover:border-yellow/50 hover:text-yellow disabled:opacity-40"
                      >
                        {STATUS_VOCAB[next].action}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>

          <button
            onClick={() => setAdding((a) => !a)}
            className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-full border border-yellow/40 px-4 font-dm text-sm text-yellow transition-colors hover:bg-yellow/10"
          >
            {adding ? <X size={14} /> : <Plus size={14} />}
            {adding ? "Close" : "Take a booking"}
          </button>

          {adding && (
            <AddBooking
              services={data.services}
              date={day.date}
              lastDate={data.calendar[data.calendar.length - 1]?.date ?? day.date}
              onDone={async () => {
                setAdding(false);
                await load();
              }}
            />
          )}
        </section>
      )}

      <BookingSettings
        settings={data.settings}
        services={data.services}
        onSaved={load}
      />
    </div>
  );
}

// ── Taking a booking over the telephone ─────────────────────────────────────
//
// This is the form that matters most. A car wash on Rodrigues will be told
// "Tuesday morning?" down the phone while the customer is standing in front of
// them, and the diary has to keep up with that conversation — so the times are
// REAL free times fetched from service_slots, not a clock the provider types
// into and finds out later was double-booked.
function AddBooking({
  services,
  date,
  lastDate,
  onDone,
}: {
  services: ServiceRow[];
  date: string;
  /** The last day the diary is open, so the picker cannot reach past it. */
  lastDate: string;
  onDone: () => Promise<void>;
}) {
  const [variantId, setVariantId] = useState(services[0]?.variantId ?? "");
  const [day, setDay] = useState(date);
  const [slots, setSlots] = useState<{ times: { time: string; startsAt: string }[]; reason: string | null; openDates: string[] } | null>(null);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!variantId) return;
    setSlots(null);
    setStartsAt(null);
    fetch(`/api/merchant/diary?slots=${encodeURIComponent(variantId)}&date=${encodeURIComponent(day)}`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((d) => setSlots(d))
      .catch(() => toast.error("Could not check what is free."));
  }, [variantId, day]);

  async function submit() {
    if (!startsAt) return;
    setBusy(true);
    try {
      const res = await fetch("/api/merchant/diary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "book",
          variantId,
          startsAt,
          customerName: name,
          customerPhone: phone,
          note: note || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "That did not go through.");
      toast.success("Booked.");
      await onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That did not go through.");
    } finally {
      setBusy(false);
    }
  }

  if (services.length === 0) {
    return (
      <p className="mt-3 rounded-xl border border-white/10 p-3 font-dm text-sm text-muted">
        Add a service first — the diary needs to know what is being booked and
        how long it takes.
      </p>
    );
  }

  const field =
    "w-full rounded-xl border border-white/12 bg-dark px-3 py-2.5 font-dm text-sm text-offwhite placeholder:text-muted/60 focus:border-yellow/50 focus:outline-none";

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-white/10 p-3">
      <label className="block">
        <span className="font-dm text-xs text-muted">What are they having done?</span>
        <select value={variantId} onChange={(e) => setVariantId(e.target.value)} className={`mt-1 ${field}`}>
          {services.map((s) => (
            <option key={s.variantId} value={s.variantId}>
              {s.name}
              {s.minutes ? ` · ${durationText(s.minutes)}` : ""}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="font-dm text-xs text-muted">Which day?</span>
        <input
          type="date"
          value={day}
          min={todayOnIsland()}
          // Past the end of the diary the slot finder returns nothing at all,
          // and "nothing free that day" would be the wrong reason — the day is
          // not full, it is beyond how far ahead this business takes bookings.
          max={lastDate}
          onChange={(e) => setDay(e.target.value)}
          className={`mt-1 ${field}`}
        />
      </label>

      <div>
        <p className="flex items-center gap-1.5 font-dm text-xs text-muted">
          <CalendarDays size={12} /> Free times
        </p>
        {!slots && <p className="mt-1 font-dm text-xs text-muted">Checking…</p>}
        {slots && slots.times.length === 0 && (
          <p className="mt-1 font-dm text-xs text-muted">
            {/* The RPC says WHY, and it matters: "closed" and "fully booked"
                lead the provider to two different sentences on the phone. */}
            {SLOT_REASON[slots.reason ?? ""] ?? "Nothing free that day."}
          </p>
        )}
        {slots && slots.times.length > 0 && (
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {slots.times.map((t) => (
              <li key={t.startsAt}>
                <button
                  onClick={() => setStartsAt(t.startsAt)}
                  aria-pressed={startsAt === t.startsAt}
                  className={`min-h-10 rounded-full border px-3 font-dm text-sm tabular-nums transition-colors ${
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

      <label className="block">
        <span className="font-dm text-xs text-muted">Who is it for?</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={`mt-1 ${field}`} />
      </label>
      <label className="block">
        <span className="font-dm text-xs text-muted">Their phone number</span>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          inputMode="tel"
          maxLength={40}
          className={`mt-1 ${field}`}
        />
      </label>
      <label className="block">
        <span className="font-dm text-xs text-muted">Anything to remember (optional)</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className={`mt-1 ${field}`} />
      </label>

      <button
        onClick={() => void submit()}
        disabled={busy || !startsAt || !name.trim() || !phone.trim()}
        className="inline-flex min-h-11 items-center gap-2 rounded-full bg-yellow px-5 font-dm text-sm font-bold text-dark disabled:opacity-40"
      >
        {busy && <Loader2 size={14} className="animate-spin" />}
        {startsAt ? `Book ${clockAt(startsAt)}` : "Pick a time"}
      </button>
    </div>
  );
}
