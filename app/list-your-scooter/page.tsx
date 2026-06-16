"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft, Wallet, CalendarCheck, ShieldCheck, Headphones,
  Send, Loader2, CheckCircle, AlertCircle,
} from "lucide-react";

type FormState = "idle" | "loading" | "success" | "error";

const BENEFITS = [
  { icon: Wallet,        title: "Earn from your scooter", text: "Put an idle scooter to work. You set the price; we bring the riders." },
  { icon: CalendarCheck, title: "We handle bookings",     text: "Online booking, availability and confirmations are all managed for you." },
  { icon: ShieldCheck,   title: "You stay in control",    text: "You verify the rider, hand over the scooter, and hold a deposit at pickup." },
  { icon: Headphones,    title: "Local support",          text: "We promote your scooter and support customers in English, French & Kreol." },
];

export default function ListYourScooterPage() {
  const [state, setState] = useState<FormState>("idle");
  const [agreed, setAgreed] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    owner_name: "", phone: "", email: "", location: "", scooters: "", message: "",
  });

  const input =
    "w-full bg-dark-card border border-dark-border rounded-xl px-4 py-3.5 text-offwhite text-sm font-dm placeholder:text-muted/50 focus:border-yellow focus:outline-none transition-colors";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!form.owner_name.trim() || !form.phone.trim()) return setErr("Please enter your name and phone number.");
    if (!agreed) return setErr("Please accept the Scooter Owner Agreement to continue.");

    setState("loading");
    try {
      const res = await fetch("/api/owner-apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Something went wrong.");
      }
      setState("success");
      setForm({ owner_name: "", phone: "", email: "", location: "", scooters: "", message: "" });
      setAgreed(false);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Something went wrong.");
      setState("error");
    }
  }

  return (
    <main className="min-h-screen bg-dark text-offwhite font-dm">
      <div className="max-w-5xl mx-auto px-6 py-10 md:py-16">
        <Link href="/" className="inline-flex items-center gap-2 text-muted hover:text-yellow text-sm transition-colors mb-10">
          <ArrowLeft size={15} /> Roule Rodrigues
        </Link>

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mb-12">
          <p className="font-bebas text-yellow text-xs tracking-[0.35em] mb-2">PARTNER WITH US</p>
          <h1 className="font-syne font-extrabold uppercase leading-[0.95] mb-4" style={{ fontSize: "clamp(34px, 8vw, 72px)" }}>
            List your scooter.<br />Earn money.
          </h1>
          <p className="text-muted font-dm text-sm md:text-base max-w-xl leading-relaxed">
            Own a scooter on Rodrigues? Let it earn when you&rsquo;re not using it. We handle the bookings,
            payments and customers — you keep your scooter busy and get paid.
          </p>
        </motion.div>

        {/* Benefits */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-14">
          {BENEFITS.map((b, i) => (
            <motion.div
              key={b.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="bg-dark-card border border-dark-border rounded-2xl p-5"
            >
              <div className="w-11 h-11 rounded-xl bg-yellow/10 flex items-center justify-center mb-4">
                <b.icon size={20} className="text-yellow" />
              </div>
              <h3 className="font-syne font-bold text-offwhite text-sm mb-1.5">{b.title}</h3>
              <p className="text-muted/80 text-xs leading-relaxed">{b.text}</p>
            </motion.div>
          ))}
        </div>

        {/* Application form */}
        <div className="max-w-xl">
          <h2 className="font-syne font-extrabold text-offwhite text-2xl mb-1">Apply to list</h2>
          <p className="text-muted text-sm mb-7">Tell us about your scooter(s) and we&rsquo;ll be in touch to get you set up.</p>

          {state === "success" ? (
            <div className="flex items-start gap-3 bg-green-500/10 border border-green-500/30 rounded-2xl px-5 py-5">
              <CheckCircle size={20} className="text-green-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-syne font-bold text-green-400">Application received!</p>
                <p className="text-green-400/70 text-sm mt-1">Thank you — we&rsquo;ll contact you shortly to verify your scooter and get your listing live.</p>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4" noValidate>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <input className={input} placeholder="Your name *" value={form.owner_name} onChange={(e) => setForm({ ...form, owner_name: e.target.value })} disabled={state === "loading"} />
                <input className={input} placeholder="Phone / WhatsApp *" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} disabled={state === "loading"} />
                <input className={input} placeholder="Email (optional)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={state === "loading"} />
                <input className={input} placeholder="Your area (e.g. Port Mathurin)" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} disabled={state === "loading"} />
              </div>
              <input className={input} placeholder="Which scooter(s) & how many? (e.g. 2× Burgman 125)" value={form.scooters} onChange={(e) => setForm({ ...form, scooters: e.target.value })} disabled={state === "loading"} />
              <textarea className={`${input} resize-none`} rows={3} placeholder="Anything else we should know?" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} disabled={state === "loading"} />

              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 w-4 h-4 accent-yellow shrink-0" disabled={state === "loading"} />
                <span className="font-dm text-xs leading-snug text-muted">
                  I agree to the{" "}
                  <Link href="/legal/owner-agreement" target="_blank" className="text-yellow hover:underline">Scooter Owner Agreement</Link>.
                </span>
              </label>

              {err && (
                <p className="flex items-center gap-2 text-red-400 text-sm font-dm">
                  <AlertCircle size={14} /> {err}
                </p>
              )}

              <button
                type="submit"
                disabled={state === "loading" || !agreed}
                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-yellow text-dark font-syne font-bold text-sm px-7 py-3.5 rounded-full hover:bg-yellow-dark transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {state === "loading" ? <><Loader2 size={15} className="animate-spin" /> Sending…</> : <>Submit application <Send size={15} /></>}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
