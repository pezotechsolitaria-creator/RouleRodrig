"use client";

import { useState } from "react";
import { Phone, Mail, MapPin, Clock, Send, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { DEFAULT_CONTENT, type ContactContent, type FleetItem } from "@/lib/defaults";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/context/LanguageContext";

type FormState = "idle" | "loading" | "success" | "error";

export default function Contact({
  contact,
  fleet,
}: {
  contact?: ContactContent;
  fleet?: FleetItem[];
}) {
  const { t } = useLanguage();
  const c = contact ?? DEFAULT_CONTENT.contact;
  const scooters = fleet ?? DEFAULT_CONTENT.fleet;

  const [formState, setFormState] = useState<FormState>("idle");
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    scooter: "",
    dates: "",
    message: "",
  });

  const CONTACT_INFO = [
    { icon: Phone, label: "WhatsApp", value: c.phone, href: `https://wa.me/${c.phone.replace(/\D/g, "")}` },
    { icon: Mail, label: "Email", value: c.email, href: `mailto:${c.email}` },
    { icon: MapPin, label: "Location", value: c.location, href: null },
    { icon: Clock, label: "Opening Hours", value: c.hours, href: null },
  ];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormState("loading");

    try {
      const supabase = createClient();
      const { error } = await supabase.from("contact_submissions").insert([
        {
          name: form.name || null,
          email: form.email || null,
          phone: form.phone || null,
          scooter: form.scooter || null,
          dates: form.dates || null,
          message: form.message || null,
        },
      ]);

      if (error) throw error;

      setFormState("success");
      setForm({ name: "", email: "", phone: "", scooter: "", dates: "", message: "" });
      setTimeout(() => setFormState("idle"), 6000);
    } catch {
      setFormState("error");
      setTimeout(() => setFormState("idle"), 5000);
    }
  }

  const inputCls =
    "w-full bg-dark-card border border-dark-border rounded-xl px-4 py-3.5 text-offwhite text-sm font-dm placeholder:text-muted/50 focus:border-yellow focus:outline-none transition-colors";

  return (
    <section id="contact" className="bg-dark py-24 md:py-36" aria-label="Contact us">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7 }}
          className="mb-16"
        >
          <p className="font-bebas text-yellow text-xs tracking-[0.35em] mb-2">{t.contact.eyebrow}</p>
          <h2
            className="font-syne font-extrabold text-offwhite uppercase leading-none break-words"
            style={{ fontSize: "clamp(48px, 8vw, 80px)" }}
          >
            {t.contact.title}
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20">
          {/* Contact info */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.8 }}
          >
            <p className="text-muted font-dm leading-relaxed text-sm md:text-base mb-10 max-w-sm">
              {t.contact.subtitle}
            </p>

            <div className="space-y-5">
              {CONTACT_INFO.map(({ icon: Icon, label, value, href }) => (
                <div key={label} className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-yellow/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Icon size={16} className="text-yellow" />
                  </div>
                  <div>
                    <p className="font-bebas text-muted text-[10px] tracking-[0.25em]">{label}</p>
                    {href ? (
                      <a href={href} className="font-dm text-offwhite text-sm hover:text-yellow transition-colors">
                        {value}
                      </a>
                    ) : (
                      <p className="font-dm text-offwhite text-sm">{value}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Form */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.8, delay: 0.1 }}
          >
            {formState === "success" && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 flex items-start gap-3 bg-green-500/10 border border-green-500/30 rounded-xl px-5 py-4"
              >
                <CheckCircle size={18} className="text-green-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-syne font-bold text-green-400 text-sm">{t.contact.successTitle}</p>
                  <p className="font-dm text-green-400/70 text-xs mt-0.5">{t.contact.successDesc}</p>
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
                  <p className="font-syne font-bold text-red-400 text-sm">{t.contact.errorTitle}</p>
                  <p className="font-dm text-red-400/70 text-xs mt-0.5">{t.contact.errorDesc}</p>
                </div>
              </motion.div>
            )}

            <form className="space-y-4" onSubmit={handleSubmit} aria-label="Contact form" noValidate>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="name" className="font-bebas text-muted text-[10px] tracking-[0.25em] block mb-2">
                    {t.contact.nameLabel}
                  </label>
                  <input
                    id="name" name="name" type="text" autoComplete="name"
                    placeholder="Your name" className={inputCls}
                    value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    disabled={formState === "loading"}
                  />
                </div>
                <div>
                  <label htmlFor="email" className="font-bebas text-muted text-[10px] tracking-[0.25em] block mb-2">
                    {t.contact.emailLabel}
                  </label>
                  <input
                    id="email" name="email" type="email" autoComplete="email"
                    placeholder="your@email.com" className={inputCls}
                    value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                    disabled={formState === "loading"}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="phone" className="font-bebas text-muted text-[10px] tracking-[0.25em] block mb-2">
                    {t.contact.phoneLabel}
                  </label>
                  <input
                    id="phone" name="phone" type="tel" autoComplete="tel"
                    placeholder="+230 XXXX XXXX" className={inputCls}
                    value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    disabled={formState === "loading"}
                  />
                </div>
                <div>
                  <label htmlFor="scooter" className="font-bebas text-muted text-[10px] tracking-[0.25em] block mb-2">
                    {t.contact.scooterLabel}
                  </label>
                  <select
                    id="scooter" name="scooter"
                    className={`${inputCls} appearance-none`}
                    value={form.scooter}
                    onChange={(e) => setForm({ ...form, scooter: e.target.value })}
                    disabled={formState === "loading"}
                  >
                    <option value="">{t.booking.scooterPlaceholder}</option>
                    {scooters.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="dates" className="font-bebas text-muted text-[10px] tracking-[0.25em] block mb-2">
                  {t.contact.datesLabel}
                </label>
                <input
                  id="dates" name="dates" type="text"
                  placeholder={t.contact.datesPlaceholder} className={inputCls}
                  value={form.dates} onChange={(e) => setForm({ ...form, dates: e.target.value })}
                  disabled={formState === "loading"}
                />
              </div>

              <div>
                <label htmlFor="message" className="font-bebas text-muted text-[10px] tracking-[0.25em] block mb-2">
                  {t.contact.messageLabel}
                </label>
                <textarea
                  id="message" name="message" rows={4}
                  placeholder={t.contact.messagePlaceholder}
                  className={`${inputCls} resize-none`}
                  value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })}
                  disabled={formState === "loading"}
                />
              </div>

              <button
                type="submit"
                disabled={formState === "loading" || formState === "success"}
                className="w-full flex items-center justify-center gap-2.5 bg-yellow text-dark font-syne font-bold text-base py-4 rounded-xl hover:bg-yellow-dark transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                aria-label="Send message"
              >
                {formState === "loading" ? (
                  <><Loader2 size={16} className="animate-spin" /> {t.contact.sending}</>
                ) : formState === "success" ? (
                  <><CheckCircle size={16} /> {t.contact.sent}</>
                ) : (
                  <>{t.contact.submit} <Send size={16} /></>
                )}
              </button>
            </form>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
