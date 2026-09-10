"use client";

import { useLanguage } from "@/context/LanguageContext";
import { loc } from "@/lib/localize";

// ── THE SECTIONS UNDER A CATEGORY LISTING ───────────────────────────────────
//
// /browse/stays, /browse/tours and /browse/getting-around each carried 550-740
// words under a single heading. After the h1 fix that heading became the page's
// <h1>, which left them with NO h2 at all: no sectioning for Google to read,
// and nothing for a featured snippet to point at.
//
// Every sentence rendered here is taken from the live listings or from what the
// site already publishes elsewhere — the prices are the real ones on the cards,
// the Île aux Cocos description is the operator's own, and the taxi paragraph is
// the answer already given on /taxi. Nothing is written to fill space, which is
// the rule the stays copy was written under in the first place.
//
// French alongside, because these three pages all have a French twin and a
// visitor can switch language without leaving the page. A section that reverts
// to English mid-page reads as broken.
export type CategoryNote = {
  h2: string;
  h2Fr?: string;
  body: string;
  bodyFr?: string;
};

export default function CategoryNotes({ notes }: { notes: CategoryNote[] }) {
  const { language } = useLanguage();
  if (notes.length === 0) return null;

  return (
    <div className="mx-auto max-w-5xl px-4 pt-2 md:px-6">
      {/* One column, generous line height: this is read on a phone, usually
          standing up, often on island data. */}
      <div className="space-y-7 border-t border-white/10 pt-8">
        {notes.map((n) => (
          <section key={n.h2}>
            <h2 className="font-syne text-lg font-extrabold leading-tight text-offwhite md:text-xl">
              {loc(language, n.h2, n.h2Fr)}
            </h2>
            <p className="mt-2 max-w-2xl font-dm text-[15px] leading-relaxed text-muted">
              {loc(language, n.body, n.bodyFr)}
            </p>
          </section>
        ))}
      </div>
    </div>
  );
}
