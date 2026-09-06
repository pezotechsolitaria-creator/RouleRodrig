"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Loader2 } from "lucide-react";
import { durationText } from "@/lib/services/diary";

export type Settings = {
  trade: string;
  mobile: boolean;
  slotMinutes: number;
  concurrentJobs: number;
  leadHours: number;
  bookingDays: number;
};

export type ServiceRow = {
  variantId: string;
  name: string;
  priceCents: number;
  draft: boolean;
  minutes: number | null;
};

// ── The four numbers that make a diary somebody else's diary ────────────────
//
// These are NOT platform constants, and that is the whole point. A 30-minute
// grid suits a car wash and is useless to a plumber; one bay and four bays are
// different businesses; two hours of notice is right for a mobile valet who has
// to drive there and wrong for a barber next door.
//
// Written as sentences with the number inside them, because "lead_hours: 2" is
// a database column and "at least 2 hours notice" is the thing the provider is
// actually deciding.

const SLOT_CHOICES = [15, 30, 60] as const;

export default function BookingSettings({
  settings,
  services,
  onSaved,
}: {
  settings: Settings;
  services: ServiceRow[];
  onSaved: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [s, setS] = useState(settings);
  const [busy, setBusy] = useState(false);

  async function post(body: unknown, ok: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/merchant/diary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || "That did not go through.");
      toast.success(ok);
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That did not go through.");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "rounded-xl border border-white/12 bg-dark px-3 py-2 font-dm text-sm text-offwhite focus:border-yellow/50 focus:outline-none";

  return (
    <section className="rounded-2xl border border-white/10 bg-dark-card">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-3.5 text-left"
      >
        <span>
          <span className="font-syne text-sm font-bold text-offwhite">How you take bookings</span>
          <span className="mt-0.5 block font-dm text-xs text-muted">
            {s.concurrentJobs === 1 ? "One job at a time" : `${s.concurrentJobs} jobs at once`} ·{" "}
            {s.slotMinutes} min slots · {s.leadHours}h notice · {s.bookingDays} days ahead
          </span>
        </span>
        <ChevronDown size={16} className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="space-y-4 border-t border-white/10 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="font-dm text-xs text-muted">Slots are</span>
              <select
                value={s.slotMinutes}
                onChange={(e) => setS({ ...s, slotMinutes: Number(e.target.value) })}
                className={`mt-1 w-full ${field}`}
              >
                {SLOT_CHOICES.map((m) => (
                  <option key={m} value={m}>
                    {m} minutes apart
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              {/* THE number that makes a service diary different from a food
                  pickup list. Twenty people can collect a curry at 18:30; two
                  cars can be washed at once only if there are two bays. */}
              <span className="font-dm text-xs text-muted">Jobs you can run at once</span>
              <input
                type="number"
                min={1}
                max={20}
                value={s.concurrentJobs}
                onChange={(e) => setS({ ...s, concurrentJobs: Number(e.target.value) })}
                className={`mt-1 w-full ${field}`}
              />
            </label>

            <label className="block">
              <span className="font-dm text-xs text-muted">Least notice you need (hours)</span>
              <input
                type="number"
                min={0}
                max={168}
                value={s.leadHours}
                onChange={(e) => setS({ ...s, leadHours: Number(e.target.value) })}
                className={`mt-1 w-full ${field}`}
              />
            </label>

            <label className="block">
              <span className="font-dm text-xs text-muted">How far ahead people can book (days)</span>
              <input
                type="number"
                min={1}
                max={90}
                value={s.bookingDays}
                onChange={(e) => setS({ ...s, bookingDays: Number(e.target.value) })}
                className={`mt-1 w-full ${field}`}
              />
            </label>
          </div>

          <button
            disabled={busy}
            onClick={() => void post({ action: "settings", ...s }, "Saved.")}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-yellow px-5 font-dm text-sm font-bold text-dark disabled:opacity-40"
          >
            {busy && <Loader2 size={14} className="animate-spin" />} Save
          </button>

          {/* ── How long each one takes ──────────────────────────────────
              Without this every service is one slot long, so a three-hour
              detail would be offered at 16:30 and the provider would spend
              their evening ringing people back. */}
          <div className="border-t border-white/10 pt-4">
            <p className="font-syne text-sm font-bold text-offwhite">How long each service takes</p>
            <p className="mt-0.5 font-dm text-xs text-muted">
              A service with no length set is treated as one slot ({s.slotMinutes} minutes).
            </p>
            {services.length === 0 && (
              <p className="mt-2 font-dm text-sm text-muted">You have not added any services yet.</p>
            )}
            <ul className="mt-2 space-y-2">
              {services.map((svc) => (
                <li key={svc.variantId} className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 font-dm text-sm text-offwhite">
                    {svc.name}
                    {svc.draft && <span className="ml-1.5 font-dm text-xs text-muted">(draft)</span>}
                  </span>
                  <span className="font-dm text-xs tabular-nums text-muted">
                    {svc.minutes ? durationText(svc.minutes) : "not set"}
                  </span>
                  <input
                    type="number"
                    min={5}
                    max={600}
                    step={5}
                    defaultValue={svc.minutes ?? ""}
                    placeholder="min"
                    aria-label={`Minutes for ${svc.name}`}
                    onBlur={(e) => {
                      const raw = e.target.value.trim();
                      const minutes = raw === "" ? null : Number(raw);
                      if (minutes === svc.minutes) return;
                      if (minutes !== null && (!Number.isInteger(minutes) || minutes < 5 || minutes > 600)) {
                        toast.error("Between 5 minutes and 10 hours.");
                        return;
                      }
                      void post(
                        { action: "duration", variantId: svc.variantId, minutes },
                        minutes === null ? "Cleared." : `${durationText(minutes)}.`,
                      );
                    }}
                    className={`w-20 ${field}`}
                  />
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
