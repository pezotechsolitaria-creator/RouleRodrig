"use client";

import { useState } from "react";
import { ChevronDown, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { CONDITION_LABELS, type ConditionItem } from "@/lib/rental-conditions";

// ── THE TERMS, WHERE THE MONEY IS COMMITTED ─────────────────────────────────
//
// A tourist on /browse/scooter could not learn the minimum age, whether a
// licence was required, what the insurance covered, or who paid for fuel.
// Verified against the live page before this shipped: "licence" appeared zero
// times, "deposit" zero times, "excess" zero times. Every one of those facts
// was already written — in the FAQ the owner edits in admin — and simply lived
// on a different page from the form asking for a name, a phone number and a
// commitment.
//
// This reads those same FAQ entries rather than restating them. A second copy
// is a copy that drifts, and the one on the page nobody edits is the one that
// ends up lying to a customer.
//
// Deliberately not a wall of text: label plus first sentence, expandable.
// Somebody deciding whether they are allowed to rent needs eight short answers,
// not eight paragraphs.

const COPY = {
  en: { title: "BEFORE YOU BOOK", more: "All questions", terms: "Full terms" },
  fr: { title: "AVANT DE RÉSERVER", more: "Toutes les questions", terms: "Conditions complètes" },
  cr: { title: "AVAN OU REZERVE", more: "Tou bann kestion", terms: "Kondision konple" },
};

/** First sentence, so the closed state is scannable. Falls back to the whole
 *  answer when the text carries no sentence break. */
function firstSentence(s: string): string {
  const m = s.match(/^[^.!?]*[.!?]/);
  return (m ? m[0] : s).trim();
}

export default function RentalConditions({ items }: { items: ConditionItem[] }) {
  const { language } = useLanguage();
  const L = COPY[language as keyof typeof COPY] ?? COPY.en;
  const [open, setOpen] = useState<string | null>(null);

  // Nothing rather than an empty panel: an owner who has cleared the FAQ should
  // not get a heading with a blank box under it.
  if (items.length === 0) return null;

  return (
    <div className="bg-dark-card border border-dark-border rounded-2xl p-6">
      <p className="font-bebas text-yellow text-[10px] tracking-[0.3em] mb-4 flex items-center gap-2">
        <ShieldCheck size={13} /> {L.title}
      </p>
      <ul className="divide-y divide-white/5">
        {items.map((item) => {
          const isOpen = open === item.id;
          const short = firstSentence(item.answer);
          const hasMore = short.length < item.answer.trim().length;
          const label = CONDITION_LABELS[item.id];
          return (
            <li key={item.id} className="py-2.5 first:pt-0 last:pb-0">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : item.id)}
                aria-expanded={isOpen}
                className="w-full text-left flex items-start gap-3 group"
              >
                <span className="font-bebas text-[10px] tracking-[0.2em] text-muted shrink-0 w-28 pt-0.5">
                  {label?.[language as keyof typeof label] ?? label?.en ?? item.question}
                </span>
                <span className="font-dm text-xs text-offwhite/80 flex-1 leading-relaxed">
                  {isOpen ? item.answer : short}
                </span>
                {hasMore && (
                  <ChevronDown
                    size={13}
                    aria-hidden
                    className={`shrink-0 mt-0.5 text-muted transition-transform group-hover:text-yellow ${isOpen ? "rotate-180" : ""}`}
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1">
        <Link href="/faq" className="font-dm text-[11px] text-muted underline hover:text-yellow">
          {L.more}
        </Link>
        <Link href="/legal/terms" className="font-dm text-[11px] text-muted underline hover:text-yellow">
          {L.terms}
        </Link>
      </div>
    </div>
  );
}
