"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Mail, Loader2, CheckCircle, Send } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

export default function WaitlistSection() {
  const { t } = useLanguage();
  const w = t.waitlist;
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError(w.invalid);
      return;
    }
    setState("loading");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "website" }),
      });
      if (!res.ok) throw new Error();
      setState("done");
      setEmail("");
    } catch {
      setState("error");
      setError(w.error);
    }
  }

  return (
    <section className="bg-dark py-20 md:py-28" aria-label="Join the list">
      <div className="max-w-3xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="bg-dark-card border border-yellow/20 rounded-3xl p-8 md:p-12 text-center relative overflow-hidden"
        >
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[200px] pointer-events-none"
            style={{ background: "radial-gradient(ellipse at center, rgba(245,200,66,0.12) 0%, transparent 70%)" }}
            aria-hidden="true"
          />
          <div className="relative">
            <p className="font-bebas text-yellow text-xs tracking-[0.35em] mb-3">{w.eyebrow}</p>
            <h2
              className="font-syne font-extrabold text-offwhite uppercase leading-[0.95] mb-4"
              style={{ fontSize: "clamp(30px, 6vw, 56px)" }}
            >
              {w.title}
            </h2>
            <p className="text-muted font-dm text-sm md:text-base mb-8 max-w-md mx-auto">{w.subtitle}</p>

            {state === "done" ? (
              <div className="flex flex-col items-center gap-2 py-2">
                <CheckCircle size={36} className="text-green-400" />
                <p className="font-syne font-bold text-offwhite text-lg">{w.successTitle}</p>
                <p className="text-muted font-dm text-sm">{w.successDesc}</p>
              </div>
            ) : (
              <form onSubmit={submit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
                <div className="relative flex-1">
                  <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted/50" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={w.placeholder}
                    className="w-full bg-dark border border-dark-border rounded-full pl-11 pr-4 py-3.5 text-offwhite text-sm font-dm placeholder:text-muted/50 focus:border-yellow focus:outline-none transition-colors"
                    disabled={state === "loading"}
                  />
                </div>
                <button
                  type="submit"
                  disabled={state === "loading"}
                  className="flex items-center justify-center gap-2 bg-yellow text-dark font-syne font-bold text-sm px-7 py-3.5 rounded-full hover:bg-yellow-dark disabled:opacity-60 transition-colors whitespace-nowrap"
                >
                  {state === "loading" ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  {w.button}
                </button>
              </form>
            )}
            {error && <p className="text-red-400 font-dm text-xs mt-3">{error}</p>}
            {state !== "done" && (
              <p className="text-muted/40 font-dm text-xs mt-4">{w.privacy}</p>
            )}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
