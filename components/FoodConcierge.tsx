"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { UtensilsCrossed, MessageCircle, Sparkles, Clock, ShieldCheck, MapPin } from "lucide-react";
import type { FoodConciergeContent } from "@/lib/defaults";

/** Build a wa.me link from a raw number/link + a message (mirrors WhatsAppButton). */
function waLink(raw: string, message: string): string | null {
  if (!raw) return null;
  let href: string;
  if (raw.includes("http")) {
    href = raw.split("?")[0];
  } else {
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 7) return null;
    href = `https://wa.me/${digits}`;
  }
  if (/x/i.test(href)) return null; // placeholder like 5XXX
  return `${href}?text=${encodeURIComponent(message)}`;
}

const WhatsAppGlyph = ({ size = 22 }: { size?: number }) => (
  <svg viewBox="0 0 32 32" width={size} height={size} fill="currentColor" aria-hidden="true">
    <path d="M16.003 3C9.38 3 4 8.38 4 15.003c0 2.117.553 4.184 1.604 6.01L4 29l8.166-1.57a11.94 11.94 0 0 0 3.837.63h.003C22.623 28.06 28 22.68 28 16.057 28 9.433 22.626 3 16.003 3zm0 21.84h-.002a9.9 9.9 0 0 1-3.46-.62l-.247-.09-4.846.93.92-4.73-.16-.252a9.86 9.86 0 0 1-1.51-5.245c0-5.46 4.444-9.903 9.91-9.903 2.648 0 5.136 1.032 7.008 2.905a9.84 9.84 0 0 1 2.9 7.006c0 5.46-4.444 9.9-9.9 9.9zm5.43-7.41c-.297-.15-1.758-.868-2.03-.967-.272-.1-.47-.149-.668.149-.198.297-.767.967-.94 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.76-1.653-2.058-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.297-.496.099-.198.05-.372-.025-.521-.074-.149-.668-1.611-.916-2.206-.241-.579-.486-.5-.668-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.073.149.198 2.095 3.2 5.076 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.247-.694.247-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
  </svg>
);

// Popular things to ask — each opens WhatsApp with the craving pre-typed, so a
// first-time visitor instantly understands what the concierge is for.
const CRAVINGS = [
  "🦑 Fresh seafood & octopus curry",
  "🍛 Authentic Creole home cooking",
  "🌅 Sunset dinner with a view",
  "💑 Romantic table for two",
  "🥗 Vegetarian / vegan options",
  "💸 Great food on a budget",
  "🎂 A special celebration",
  "🏝️ Beach shack / street food",
];

export default function FoodConcierge({
  content,
  fallbackWhatsApp = "",
}: {
  content: FoodConciergeContent;
  fallbackWhatsApp?: string;
}) {
  const number = content.whatsapp?.trim() || fallbackWhatsApp;
  const mainLink = useMemo(() => waLink(number, content.prefill) ?? "", [number, content.prefill]);
  const cravingLink = (c: string) =>
    waLink(number, `${content.prefill} ${c.replace(/^[^\p{L}]+/u, "").trim()}`) ?? mainLink;

  const CTA = ({ block = false }: { block?: boolean }) =>
    mainLink ? (
      <a
        href={mainLink}
        target="_blank"
        rel="noopener noreferrer"
        className={`group inline-flex items-center justify-center gap-3 bg-[#25D366] hover:bg-[#20c05c] text-white font-syne font-bold text-base px-8 py-4 rounded-full shadow-[0_10px_36px_rgba(37,211,102,0.4)] transition-all duration-200 hover:scale-[1.03] ${block ? "w-full sm:w-auto" : ""}`}
      >
        <WhatsAppGlyph /> {content.buttonText}
      </a>
    ) : (
      <a
        href="/#contact"
        className="inline-flex items-center justify-center gap-3 bg-yellow text-dark font-syne font-bold text-base px-8 py-4 rounded-full"
      >
        <MessageCircle size={20} /> Contact us
      </a>
    );

  const reassurance = [
    { icon: ShieldCheck, label: "100% free for you" },
    { icon: MapPin, label: "Local experts" },
    { icon: Clock, label: "Fast replies" },
  ];

  return (
    <div className="bg-dark">
      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute -top-24 right-[-10%] w-[55vw] h-[55vw] rounded-full blur-3xl" style={{ background: "radial-gradient(circle, rgba(37,211,102,0.10), transparent 65%)" }} />
          <div className="absolute bottom-[-25%] left-[-10%] w-[50vw] h-[50vw] rounded-full blur-3xl" style={{ background: "radial-gradient(circle, rgba(245,200,66,0.08), transparent 65%)" }} />
        </div>

        <div className="relative max-w-4xl mx-auto px-6 pt-16 pb-14 md:pt-24 md:pb-20 text-center">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 mb-6">
              <UtensilsCrossed size={13} className="text-yellow" />
              <span className="font-bebas text-yellow text-[11px] tracking-[0.3em]">FOOD CONCIERGE</span>
            </div>
            <h1
              className="font-syne font-extrabold text-offwhite leading-[0.95] tracking-tight"
              style={{ fontSize: "clamp(38px, 8vw, 76px)" }}
            >
              {content.title}
            </h1>
            <p className="text-yellow font-syne font-bold text-lg md:text-2xl mt-4">{content.subtitle}</p>
            <p className="text-muted font-dm text-sm md:text-base mt-6 max-w-2xl mx-auto leading-relaxed">
              {content.intro}
            </p>

            <div className="mt-9 flex flex-col items-center gap-5">
              <CTA />
              <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
                {reassurance.map((r) => (
                  <span key={r.label} className="flex items-center gap-1.5 text-offwhite/60 font-dm text-xs">
                    <r.icon size={14} className="text-[#25D366]" /> {r.label}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="border-t border-dark-border bg-dark-card/40">
        <div className="max-w-6xl mx-auto px-6 py-16 md:py-20">
          <div className="text-center mb-12">
            <p className="font-bebas text-yellow text-xs tracking-[0.35em] mb-2">HOW IT WORKS</p>
            <h2 className="font-syne font-extrabold text-offwhite uppercase leading-[0.95]" style={{ fontSize: "clamp(28px, 5vw, 46px)" }}>
              Three easy steps
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6">
            {content.steps.map((s, i) => (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                className="relative bg-dark border border-dark-border rounded-2xl p-7 hover:border-yellow/40 transition-colors"
              >
                <span className="absolute -top-4 left-7 w-9 h-9 rounded-full bg-yellow text-dark font-syne font-extrabold text-sm flex items-center justify-center shadow-lg">
                  {i + 1}
                </span>
                <h3 className="font-syne font-bold text-offwhite text-lg mt-3 mb-2">{s.title}</h3>
                <p className="text-muted font-dm text-sm leading-relaxed">{s.text}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── What you can ask (craving chips → WhatsApp) ── */}
      <section className="border-t border-dark-border">
        <div className="max-w-5xl mx-auto px-6 py-16 md:py-20 text-center">
          <div className="inline-flex items-center gap-2 mb-4">
            <Sparkles size={16} className="text-yellow" />
            <p className="font-bebas text-yellow text-xs tracking-[0.35em]">TAP A CRAVING TO START</p>
          </div>
          <h2 className="font-syne font-extrabold text-offwhite uppercase leading-[0.95] mb-3" style={{ fontSize: "clamp(26px, 5vw, 44px)" }}>
            What are you in the mood for?
          </h2>
          <p className="text-muted font-dm text-sm md:text-base max-w-xl mx-auto mb-9">
            Pick one to open WhatsApp with your request ready to send — or just message us and describe your own.
          </p>
          <div className="flex flex-wrap justify-center gap-2.5">
            {CRAVINGS.map((c) => (
              <a
                key={c}
                href={cravingLink(c)}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-dark-card border border-dark-border hover:border-[#25D366] hover:bg-[#25D366]/10 text-offwhite/85 font-dm text-sm px-4 py-2.5 rounded-full transition-colors"
              >
                {c}
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ── Example conversation (shows visitors exactly how it feels) ── */}
      <section className="border-t border-dark-border bg-dark-card/40">
        <div className="max-w-2xl mx-auto px-6 py-16 md:py-20">
          <div className="text-center mb-10">
            <p className="font-bebas text-yellow text-xs tracking-[0.35em] mb-2">A REAL EXAMPLE</p>
            <h2 className="font-syne font-extrabold text-offwhite uppercase leading-[0.95]" style={{ fontSize: "clamp(26px, 5vw, 44px)" }}>
              How a chat looks
            </h2>
          </div>

          <div className="bg-[#0b141a] border border-white/10 rounded-3xl p-4 sm:p-6 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)]">
            <div className="flex items-center gap-3 pb-4 border-b border-white/5 mb-4">
              <span className="flex items-center justify-center w-10 h-10 rounded-full bg-[#25D366] text-white">
                <WhatsAppGlyph size={20} />
              </span>
              <div className="text-left">
                <p className="font-syne font-bold text-offwhite text-sm leading-tight">Roule Rodrigues — Food Concierge</p>
                <p className="text-[#25D366] font-dm text-xs">online</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-end">
                <p className="max-w-[80%] bg-[#005c4b] text-white font-dm text-sm px-4 py-2.5 rounded-2xl rounded-tr-sm">
                  Hi! We&apos;re 2 near Anse aux Anglais tonight, would love fresh seafood, budget ~Rs 800pp 🦞
                </p>
              </div>
              <div className="flex justify-start">
                <p className="max-w-[85%] bg-[#202c33] text-offwhite font-dm text-sm px-4 py-2.5 rounded-2xl rounded-tl-sm">
                  Perfect 😍 I&apos;ve got two spots you&apos;ll love near you — a family kitchen famous for its octopus curry with a sea view, and a little grill doing the fresh catch of the day. Both in your budget. Want me to book a table for 2 at 7pm?
                </p>
              </div>
              <div className="flex justify-end">
                <p className="max-w-[80%] bg-[#005c4b] text-white font-dm text-sm px-4 py-2.5 rounded-2xl rounded-tr-sm">
                  Yes please, the octopus one! 🙏
                </p>
              </div>
              <div className="flex justify-start">
                <p className="max-w-[85%] bg-[#202c33] text-offwhite font-dm text-sm px-4 py-2.5 rounded-2xl rounded-tl-sm">
                  Done ✅ Table for 2 booked at 7pm — I&apos;ll send you the location and the name to ask for. Enjoy! 🛵
                </p>
              </div>
            </div>
          </div>

          <div className="mt-10 text-center">
            <CTA />
          </div>
        </div>
      </section>
    </div>
  );
}
