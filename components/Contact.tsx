"use client";

import { Phone, Mail, MapPin, Clock, Send } from "lucide-react";
import { motion } from "framer-motion";
import { DEFAULT_CONTENT, type ContactContent, type FleetItem } from "@/lib/defaults";

export default function Contact({
  contact,
  fleet,
}: {
  contact?: ContactContent;
  fleet?: FleetItem[];
}) {
  const c = contact ?? DEFAULT_CONTENT.contact;
  const scooters = fleet ?? DEFAULT_CONTENT.fleet;

  const CONTACT_INFO = [
    { icon: Phone, label: "WhatsApp", value: c.phone, href: `https://wa.me/${c.phone.replace(/\D/g, "")}` },
    { icon: Mail, label: "Email", value: c.email, href: `mailto:${c.email}` },
    { icon: MapPin, label: "Location", value: c.location, href: null },
    { icon: Clock, label: "Opening Hours", value: c.hours, href: null },
  ];

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
          <p className="font-bebas text-yellow text-xs tracking-[0.35em] mb-2">GET IN TOUCH</p>
          <h2
            className="font-syne font-extrabold text-offwhite uppercase leading-none"
            style={{ fontSize: "clamp(48px, 8vw, 80px)" }}
          >
            CONTACT US
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
              Ready to explore Rodrigues on two wheels? Reach out via WhatsApp for the fastest
              response, or fill out the form and we&apos;ll get back to you within a few hours.
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
                      <a
                        href={href}
                        className="font-dm text-offwhite text-sm hover:text-yellow transition-colors"
                      >
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
          <motion.form
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="space-y-4"
            onSubmit={(e) => e.preventDefault()}
            aria-label="Contact form"
            noValidate
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="name" className="font-bebas text-muted text-[10px] tracking-[0.25em] block mb-2">
                  NAME
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  placeholder="Your name"
                  className="w-full bg-dark-card border border-dark-border rounded-xl px-4 py-3.5 text-offwhite text-sm font-dm placeholder:text-muted/50 focus:border-yellow focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label htmlFor="email" className="font-bebas text-muted text-[10px] tracking-[0.25em] block mb-2">
                  EMAIL
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="your@email.com"
                  className="w-full bg-dark-card border border-dark-border rounded-xl px-4 py-3.5 text-offwhite text-sm font-dm placeholder:text-muted/50 focus:border-yellow focus:outline-none transition-colors"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="phone" className="font-bebas text-muted text-[10px] tracking-[0.25em] block mb-2">
                  PHONE
                </label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="+230 XXXX XXXX"
                  className="w-full bg-dark-card border border-dark-border rounded-xl px-4 py-3.5 text-offwhite text-sm font-dm placeholder:text-muted/50 focus:border-yellow focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label htmlFor="scooter" className="font-bebas text-muted text-[10px] tracking-[0.25em] block mb-2">
                  SCOOTER
                </label>
                <select
                  id="scooter"
                  name="scooter"
                  className="w-full bg-dark-card border border-dark-border rounded-xl px-4 py-3.5 text-offwhite text-sm font-dm focus:border-yellow focus:outline-none transition-colors appearance-none"
                  defaultValue=""
                >
                  <option value="" disabled>Select a scooter</option>
                  {scooters.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="dates" className="font-bebas text-muted text-[10px] tracking-[0.25em] block mb-2">
                RENTAL DATES
              </label>
              <input
                id="dates"
                name="dates"
                type="text"
                placeholder="e.g. 15 Jan – 22 Jan"
                className="w-full bg-dark-card border border-dark-border rounded-xl px-4 py-3.5 text-offwhite text-sm font-dm placeholder:text-muted/50 focus:border-yellow focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label htmlFor="message" className="font-bebas text-muted text-[10px] tracking-[0.25em] block mb-2">
                MESSAGE
              </label>
              <textarea
                id="message"
                name="message"
                rows={4}
                placeholder="Any questions or special requests?"
                className="w-full bg-dark-card border border-dark-border rounded-xl px-4 py-3.5 text-offwhite text-sm font-dm placeholder:text-muted/50 focus:border-yellow focus:outline-none transition-colors resize-none"
              />
            </div>

            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2.5 bg-yellow text-dark font-syne font-bold text-base py-4 rounded-xl hover:bg-yellow-dark transition-colors"
              aria-label="Send message"
            >
              Send Message <Send size={16} />
            </button>
          </motion.form>
        </div>
      </div>
    </section>
  );
}
