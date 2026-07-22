"use client";

import { Check } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

// Compact booking-lifecycle timeline shown on the confirmation. `completed` = how
// many steps are done; the next step pulses as "current". Kept honest: only the
// stages we actually track (request → deposit → confirmed → pick-up/enjoy).
const LABELS: Record<string, string[]> = {
  en: ["Request sent", "Deposit", "Confirmed", "Pick-up"],
  fr: ["Demande envoyée", "Acompte", "Confirmé", "Retrait"],
  cr: ["Demann fini", "Depo", "Konfirmen", "Ranmas"],
};

export default function BookingTimeline({
  completed = 1,
  labels,
}: {
  completed?: number;
  labels?: string[];
}) {
  const { language } = useLanguage();
  const steps = labels ?? LABELS[language] ?? LABELS.en;

  return (
    <ol className="flex w-full">
      {steps.map((label, i) => {
        const done = i < completed;
        const active = i === completed;
        return (
          <li key={label} className="flex flex-1 flex-col items-center">
            <div className="flex w-full items-center">
              <span className={`h-0.5 flex-1 ${i === 0 ? "opacity-0" : i <= completed ? "bg-yellow/60" : "bg-white/12"}`} />
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-syne font-bold transition-colors ${
                  done
                    ? "border-yellow bg-yellow text-dark"
                    : active
                    ? "border-yellow text-yellow ring-2 ring-yellow/25"
                    : "border-white/15 text-muted/50"
                }`}
              >
                {done ? <Check size={13} /> : i + 1}
              </span>
              <span className={`h-0.5 flex-1 ${i === steps.length - 1 ? "opacity-0" : i < completed ? "bg-yellow/60" : "bg-white/12"}`} />
            </div>
            <span className={`mt-1.5 text-center text-[9px] font-dm leading-tight ${done || active ? "text-offwhite/85" : "text-muted/40"}`}>
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
