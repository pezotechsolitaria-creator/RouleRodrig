"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, MapPin, Clock, Check } from "lucide-react";
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

// Real, widely-available Rodriguan dishes/occasions. The concierge (a human) then
// matches you to what's actually cooking that day — so nothing is ever promised
// that the island doesn't serve.
const CRAVINGS = [
  { emoji: "🐙", label: "Ourite (octopus)" },
  { emoji: "🐟", label: "Fresh fish of the day" },
  { emoji: "🦐", label: "Seafood platter" },
  { emoji: "🍛", label: "Creole home cooking" },
  { emoji: "🌶️", label: "Local snacks & street food" },
  { emoji: "🍰", label: "Rodriguan desserts" },
  { emoji: "🌅", label: "Table by the sea" },
  { emoji: "🎉", label: "Special occasion" },
];

// Two tiers only — no "high / luxury" tier, to avoid friction in the local market.
const BUDGETS = [
  { emoji: "💸", label: "Budget-friendly" },
  { emoji: "💛", label: "Moderate" },
];

export default function FoodConcierge({
  content,
  fallbackWhatsApp = "",
}: {
  content: FoodConciergeContent;
  fallbackWhatsApp?: string;
}) {
  const number = content.whatsapp?.trim() || fallbackWhatsApp;
  const [craving, setCraving] = useState<string | null>(null);
  const [budget, setBudget] = useState<string | null>(null);

  const message = useMemo(() => {
    let m = content.prefill;
    const lines: string[] = [];
    if (craving) lines.push(`• Craving: ${craving}`);
    if (budget) lines.push(`• Budget: ${budget}`);
    if (lines.length) m += `\n\n${lines.join("\n")}`;
    return m;
  }, [content.prefill, craving, budget]);

  const link = waLink(number, message) ?? "/#contact";

  // Log every concierge request (craving + budget) so the admin "Listing Leads"
  // inbox can track demand and commission follow-ups. Fire-and-forget; never
  // blocks opening WhatsApp.
  const logLead = () => {
    try {
      fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          kind: "food_concierge",
          target_name: craving || "Any craving",
          category: "food",
          type: "whatsapp",
          ref: budget || "Any budget",
        }),
      }).catch(() => {});
    } catch {
      /* ignore */
    }
  };

  const reassurance = [
    { icon: ShieldCheck, label: "Free for you" },
    { icon: MapPin, label: "Local experts" },
    { icon: Clock, label: "Fast reply" },
  ];

  const Chip = ({
    active,
    emoji,
    label,
    onClick,
  }: {
    active: boolean;
    emoji: string;
    label: string;
    onClick: () => void;
  }) => (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`relative flex items-center gap-2 rounded-2xl border px-4 py-3 text-left font-dm text-sm transition-all ${
        active
          ? "border-[#25D366] bg-[#25D366]/12 text-offwhite"
          : "border-white/10 bg-white/[0.03] text-offwhite/80 hover:border-white/25 hover:bg-white/[0.06]"
      }`}
    >
      <span className="text-lg leading-none">{emoji}</span>
      <span className="leading-tight">{label}</span>
      {active && (
        <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-[#25D366] text-white">
          <Check size={13} />
        </span>
      )}
    </button>
  );

  return (
    <div className="bg-dark">
      <section className="relative overflow-hidden">
        {/* Ambient glow — desktop only (cheap on mobile) */}
        <div className="pointer-events-none absolute inset-0 hidden md:block" aria-hidden="true">
          <div className="absolute -top-24 right-[-10%] h-[45vw] w-[45vw] rounded-full blur-3xl" style={{ background: "radial-gradient(circle, rgba(37,211,102,0.10), transparent 65%)" }} />
        </div>

        <div className="relative mx-auto max-w-3xl px-6 pt-14 pb-10 md:pt-20 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#25D366]" />
              <span className="font-bebas text-[11px] tracking-[0.3em] text-[#25D366]">FOOD CONCIERGE</span>
            </div>
            <h1 className="font-syne font-extrabold leading-[0.95] tracking-tight text-offwhite" style={{ fontSize: "clamp(36px, 8vw, 68px)" }}>
              {content.title}
            </h1>
            <p className="mx-auto mt-4 max-w-md font-dm text-base text-muted">{content.subtitle}</p>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
              {reassurance.map((r) => (
                <span key={r.label} className="flex items-center gap-1.5 font-dm text-xs text-offwhite/55">
                  <r.icon size={14} className="text-[#25D366]" /> {r.label}
                </span>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Interactive request builder — the whole feature in one tap-friendly card */}
      <section className="px-6 pb-20">
        <div className="mx-auto max-w-2xl rounded-[28px] border border-white/10 bg-dark-card/60 p-5 sm:p-8 shadow-[0_20px_60px_-24px_rgba(0,0,0,0.9)]">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-syne text-lg font-bold text-offwhite">Craving?</h2>
            <span className="font-dm text-xs text-muted">Tap one</span>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {CRAVINGS.map((c) => (
              <Chip key={c.label} active={craving === c.label} emoji={c.emoji} label={c.label} onClick={() => setCraving(craving === c.label ? null : c.label)} />
            ))}
          </div>

          <div className="mt-6 mb-3 flex items-baseline justify-between">
            <h2 className="font-syne text-lg font-bold text-offwhite">Budget</h2>
            <span className="font-dm text-xs text-muted">Optional</span>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {BUDGETS.map((b) => (
              <Chip key={b.label} active={budget === b.label} emoji={b.emoji} label={b.label} onClick={() => setBudget(budget === b.label ? null : b.label)} />
            ))}
          </div>

          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={logLead}
            className="group mt-7 flex w-full items-center justify-center gap-3 rounded-full bg-[#25D366] px-8 py-4 font-syne text-base font-bold text-white shadow-[0_10px_36px_rgba(37,211,102,0.4)] transition-all duration-200 hover:scale-[1.02] hover:bg-[#20c05c]"
          >
            <WhatsAppGlyph /> {content.buttonText}
          </a>
          <p className="mt-3 text-center font-dm text-xs text-muted">
            Not on the list? Just message us — we&apos;ll match you to what&apos;s cooking today.
          </p>
        </div>

        {/* How it works — 3 micro-steps, almost no reading */}
        <div className="mx-auto mt-10 grid max-w-2xl grid-cols-3 gap-3">
          {content.steps.slice(0, 3).map((s, i) => (
            <div key={s.id} className="rounded-2xl border border-white/8 bg-white/[0.02] p-4 text-center">
              <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-yellow font-syne text-sm font-extrabold text-dark">{i + 1}</div>
              <p className="font-syne text-sm font-bold leading-tight text-offwhite">{s.title}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
