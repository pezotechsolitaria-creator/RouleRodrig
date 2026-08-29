"use client";

import { useLanguage } from "@/context/LanguageContext";
import { foodFaq, foodFaqHeading } from "@/lib/food-faq";

// ── THE ANSWERS, IN THE READER'S LANGUAGE ───────────────────────────────────
//
// A client island inside a server page. app/food/page.tsx renders through <T>
// and has no `language` of its own, and the alternative — shipping English to
// a French reader — is the bug this codebase has already fixed once on /taxi,
// where a Kreol visitor met "FASTEST WAY / Tell us where you're going"
// mid-sentence.
//
// The FAQPage markup stays on the server page in English, because that is what
// a crawler renders. This is the human half.

export default function FoodFaq() {
  const { language } = useLanguage();
  const items = foodFaq(language);

  return (
    <section className="mt-12">
      <h2 className="font-syne text-sm font-extrabold uppercase tracking-wide text-offwhite/80">
        {foodFaqHeading(language)}
      </h2>
      <div className="mt-3 divide-y divide-white/5 border-y border-white/5">
        {items.map((f) => (
          <details key={f.question} className="group py-3">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-dm text-sm text-offwhite/85 transition-colors hover:text-yellow">
              {f.question}
              <span className="shrink-0 text-muted/50 transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-2 max-w-2xl font-dm text-xs leading-relaxed text-muted/70">
              {f.answer}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
