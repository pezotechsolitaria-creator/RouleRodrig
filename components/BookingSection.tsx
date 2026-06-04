"use client";

import { useState } from "react";
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
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { FleetItem } from "@/lib/defaults";

type FormState = "idle" | "loading" | "success" | "error";

function daysBetween(a: string, b: string): number {
  if (!a || !b) return 0;
  const diff = new Date(b).getTime() - new Date(a).getTime();
  return Math.max(0, Math.round(diff / 86_400_000));
}

// Extract base daily price number from string like "From Rs 800"
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
  const scooters = (fleet ?? []).filter((s) => s.available !== false);

  const [formState, setFormState] = useState<FormState>("idle");
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    scooter: "",
    start_date: "",
    end_date: "",
    message: "",
  });

  const days = daysBetween(form.start_date, form.end_date);
  const selectedScooter = scooters.find((s) => s.id === form.scooter);
  const estimatedTotal = estimateTotal(selectedScooter, days);

  const inputCls =
    "w-full bg-dark-card border border-dark-border rounded-xl px-4 py-3.5 text-offwhite text-sm font-dm placeholder:text-muted/50 focus:border-yellow focus:outline-none transition-colors";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.scooter || !form.start_date || !form.end_date) return;
    if (days <= 0) return;

    setFormState("loading");
    try {
      const supabase = createClient();
      const { error } = await supabase.from("bookings").insert([
        {
          name: form.name,
          email: form.email || null,
          phone: form.phone || null,
          scooter: form.scooter,
          start_date: form.start_date,
          end_date: form.end_date,
          days,
          total_price: estimatedTotal || null,
          message: form.message || null,
          status: "pending",
        },
      ]);
      if (error) throw error;
      setFormState("success");
      setForm({ name: "", email: "", phone: "", scooter: "", start_date: "", end_date: "", message: "" });
      setTimeout(() => setFormState("idle"), 8000);
    } catch {
      setFormState("error");
      setTimeout(() => setFormState("idle"), 5000);
    }
  }

  const today = new Date().toISOString().split("T")[0];

  return (
    <section id="booking" className="bg-[#0a0a0a] py-24 md:py-36" aria-label="Book a scooter">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7 }}
          className="mb-16"
        >
          <p className="font-bebas text-yellow text-xs tracking-[0.35em] mb-2">RESERVE YOUR RIDE</p>
          <h2
            className="font-syne font-extrabold text-offwhite uppercase leading-none"
            style={{ fontSize: "clamp(48px, 8vw, 80px)" }}
          >
            BOOK ONLINE
          </h2>
          <p className="text-muted font-dm text-sm md:text-base mt-4 max-w-lg">
            Pick your scooter, choose your dates, and we&apos;ll confirm your booking within a few hours.
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
                  <p className="font-syne font-bold text-green-400 text-sm">Booking request sent!</p>
                  <p className="font-dm text-green-400/70 text-xs mt-0.5">
                    We&apos;ll confirm your reservation within a few hours via WhatsApp or email.
                  </p>
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
                  <p className="font-syne font-bold text-red-400 text-sm">Something went wrong</p>
                  <p className="font-dm text-red-400/70 text-xs mt-0.5">
                    Please try again or reach us on WhatsApp.
                  </p>
                </div>
              </motion.div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              {/* Scooter */}
              <div>
                <label className="font-bebas text-muted text-[10px] tracking-[0.25em] block mb-2">
                  SCOOTER <span className="text-yellow">*</span>
                </label>
                <select
                  value={form.scooter}
                  onChange={(e) => setForm({ ...form, scooter: e.target.value })}
                  className={`${inputCls} appearance-none`}
                  disabled={formState === "loading"}
                  required
                >
                  <option value="">Choose a scooter…</option>
                  {scooters.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} — {s.price}
                    </option>
                  ))}
                </select>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bebas text-muted text-[10px] tracking-[0.25em] block mb-2">
                    PICKUP DATE <span className="text-yellow">*</span>
                  </label>
                  <input
                    type="date"
                    min={today}
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                    className={inputCls}
                    disabled={formState === "loading"}
                    required
                  />
                </div>
                <div>
                  <label className="font-bebas text-muted text-[10px] tracking-[0.25em] block mb-2">
                    RETURN DATE <span className="text-yellow">*</span>
                  </label>
                  <input
                    type="date"
                    min={form.start_date || today}
                    value={form.end_date}
                    onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                    className={inputCls}
                    disabled={formState === "loading"}
                    required
                  />
                </div>
              </div>

              {/* Name + Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bebas text-muted text-[10px] tracking-[0.25em] block mb-2">
                    YOUR NAME <span className="text-yellow">*</span>
                  </label>
                  <div className="relative">
                    <User size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted/50" />
                    <input
                      type="text"
                      placeholder="Full name"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className={`${inputCls} pl-10`}
                      disabled={formState === "loading"}
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="font-bebas text-muted text-[10px] tracking-[0.25em] block mb-2">EMAIL</label>
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
                <label className="font-bebas text-muted text-[10px] tracking-[0.25em] block mb-2">PHONE / WHATSAPP</label>
                <div className="relative">
                  <Phone size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted/50" />
                  <input
                    type="tel"
                    placeholder="+230 XXXX XXXX"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className={`${inputCls} pl-10`}
                    disabled={formState === "loading"}
                  />
                </div>
              </div>

              {/* Message */}
              <div>
                <label className="font-bebas text-muted text-[10px] tracking-[0.25em] block mb-2">SPECIAL REQUESTS</label>
                <div className="relative">
                  <MessageSquare size={14} className="absolute left-4 top-4 text-muted/50" />
                  <textarea
                    rows={3}
                    placeholder="Hotel name, delivery address, extra helmet…"
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    className={`${inputCls} pl-10 resize-none`}
                    disabled={formState === "loading"}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={formState === "loading" || formState === "success"}
                className="w-full flex items-center justify-center gap-2.5 bg-yellow text-dark font-syne font-bold text-base py-4 rounded-xl hover:bg-yellow-dark transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {formState === "loading" ? (
                  <><Loader2 size={16} className="animate-spin" /> Sending…</>
                ) : formState === "success" ? (
                  <><CheckCircle size={16} /> Request Sent!</>
                ) : (
                  <>Request Booking <Send size={16} /></>
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
                <p className="font-bebas text-yellow text-[10px] tracking-[0.3em] mb-4">BOOKING SUMMARY</p>
                <dl className="space-y-3">
                  <div className="flex justify-between items-start">
                    <dt className="text-muted font-dm text-xs">Scooter</dt>
                    <dd className="text-offwhite font-dm text-xs text-right font-medium">
                      {selectedScooter ? selectedScooter.name : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between items-start">
                    <dt className="text-muted font-dm text-xs">Pickup</dt>
                    <dd className="text-offwhite font-dm text-xs">
                      {form.start_date
                        ? new Date(form.start_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                        : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between items-start">
                    <dt className="text-muted font-dm text-xs">Return</dt>
                    <dd className="text-offwhite font-dm text-xs">
                      {form.end_date
                        ? new Date(form.end_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                        : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between items-start">
                    <dt className="text-muted font-dm text-xs">Duration</dt>
                    <dd className="text-offwhite font-dm text-xs">
                      {days > 0 ? `${days} day${days !== 1 ? "s" : ""}` : "—"}
                    </dd>
                  </div>
                  {estimatedTotal && (
                    <>
                      <div className="border-t border-dark-border pt-3 flex justify-between items-center">
                        <dt className="text-muted font-dm text-xs">Estimated Total</dt>
                        <dd className="text-yellow font-syne font-bold text-base">{estimatedTotal}</dd>
                      </div>
                      {days >= 3 && (
                        <p className="text-green-400/80 text-xs font-dm">
                          Multi-day discount applied!
                        </p>
                      )}
                    </>
                  )}
                </dl>
              </div>

              {/* Available scooters */}
              <div className="bg-dark-card border border-dark-border rounded-2xl p-6">
                <p className="font-bebas text-yellow text-[10px] tracking-[0.3em] mb-4">FLEET AVAILABILITY</p>
                <div className="space-y-2.5">
                  {(fleet ?? []).map((s) => (
                    <div key={s.id} className="flex items-center justify-between">
                      <span className="text-offwhite/80 font-dm text-xs">{s.name}</span>
                      {s.available !== false ? (
                        <span className="flex items-center gap-1.5 text-green-400 text-[10px] font-bebas tracking-[0.15em]">
                          <BadgeCheck size={12} /> AVAILABLE
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-red-400/70 text-[10px] font-bebas tracking-[0.15em]">
                          <Ban size={12} /> UNAVAILABLE
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* What's included */}
              <div className="bg-dark-card border border-dark-border rounded-2xl p-6">
                <p className="font-bebas text-yellow text-[10px] tracking-[0.3em] mb-4">INCLUDED</p>
                <ul className="space-y-2">
                  {[
                    "Helmet & lock",
                    "Full tank of fuel",
                    "24/7 WhatsApp support",
                    "Free delivery to hotel",
                    "Third-party insurance",
                  ].map((item) => (
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
                  This is a booking <span className="text-offwhite font-medium">request</span>. We&apos;ll confirm availability and send payment details within a few hours.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
