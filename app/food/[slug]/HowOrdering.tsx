"use client";

import Link from "next/link";
import { useFoodCopy } from "@/components/food/FoodCopy";
import { useLanguage } from "@/context/LanguageContext";

// ── HOW ORDERING WORKS, ON THE PAGE THAT RANKS FOR THE DISH ─────────────────
//
// SEO audit 2026-09-29 C15. /food states the rules — order a day ahead,
// collect with a code, pay the kitchen in cash — but the dish URLs, which are
// what a search for "grilled lobster Rodrigues" lands on, said none of it.
//
// Nothing here is assumed. Each sentence shows only when the data behind it
// says so: the notice from kitchen_notice_hours(), collection, cash, transfer
// and delivery from the kitchen's own store_payment_options() (the same RPC
// the checkout asks) plus the platform delivery switch. A kitchen whose
// options could not be read gets no payment sentence rather than a guess.
//
// A client leaf only for the language, like the rest of /food: the provider
// starts on "en", so the server HTML carries the English (see FoodCopy.tsx).

export type KitchenTerms = {
  pickup: boolean;
  cash: boolean;
  transfer: boolean;
  delivery: boolean;
};

export default function HowOrdering({
  notice,
  kitchen,
  terms,
}: {
  /** kitchen_notice_hours(); 0 for a walk-up kitchen. */
  notice: number;
  /** "Chez Banane, Rivière Banane" — name and address as the data has them. */
  kitchen: string;
  /** Null when store_payment_options() returned nothing. */
  terms: KitchenTerms | null;
}) {
  const { language } = useLanguage();
  const d = useFoodCopy().dish;
  // The cash sentences say "when you collect", so they need collection too.
  const cash = Boolean(terms?.cash && terms.pickup);
  const transfer = Boolean(terms?.transfer);
  const pay =
    cash && transfer ? d.howPayEither : cash ? d.howPayCash : transfer ? d.howPayTransfer : null;

  // A heading with nothing true under it says nothing (C15): a walk-up kitchen
  // whose options could not be read, or one offering neither collection, a
  // payment the sentences cover, nor delivery, gets no section at all. The two
  // links go with it — they are context for the rules, not a card of their own.
  const items = [
    notice > 0 ? d.howNotice(notice) : null,
    terms?.pickup ? d.howCollect(kitchen) : null,
    pay,
    terms?.delivery ? d.howDelivery : null,
  ].filter((s): s is string => Boolean(s));
  if (items.length === 0) return null;

  return (
    <section className="mt-6 rounded-2xl border border-white/10 bg-dark-card px-4 py-3.5">
      <h2 className="font-syne text-base font-extrabold text-offwhite">{d.howTitle}</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 font-dm text-sm leading-relaxed text-muted">
        {items.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-dm text-xs">
        <Link href="/guide/rodriguan-food" className="text-yellow underline underline-offset-2">
          {d.howGuide}
        </Link>
        {/* `lang` for the label, as FrenchTwinLink does (C15): the English
            copy's label is French, so a screen reader must not read it with
            English rules. The Kreol label is Kreol, so it takes none. */}
        <Link
          href="/fr/manger-a-rodrigues"
          hrefLang="fr"
          lang={language === "cr" ? undefined : "fr"}
          className="text-yellow underline underline-offset-2"
        >
          {d.howFrench}
        </Link>
      </p>
    </section>
  );
}
