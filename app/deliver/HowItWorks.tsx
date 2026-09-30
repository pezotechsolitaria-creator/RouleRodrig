"use client";

import { ChevronRight } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { DELIVER_COPY } from "@/lib/delivery/copy.i18n";
import { formatFee } from "@/lib/delivery/request-status";

// ── WHAT DELIVER ANYTHING IS, FOR SOMEBODY WHO HAS NOT STARTED THE FORM ─────
//
// SEO audit 2026-09-29 C14. The page rendered 438 characters — a title and the
// first screen of a form — so neither a crawler nor an answer engine could say
// what this service is: a reverse auction where drivers quote and you choose.
// The explainer cards that used to say so were removed on purpose (they cost
// 821px of scroll above and below the form — see app/deliver/page.tsx).
//
// A CLOSED <details> is the answer to both: it is one row high, it is in the
// server HTML (a client component still server-renders — the provider starts on
// "en", exactly as DeliverTitle notes), and it needs no state to open.
//
// Every word but the money rule is READ from the form's own keys: the job types
// from `what.kind`, the promises from `review.promises`. The cash limit is
// delivery_settings.cash_limit_cents, read by the page; null prints no figure.

export default function HowItWorks({ cashLimitCents }: { cashLimitCents: number | null }) {
  const { language } = useLanguage();
  const c = DELIVER_COPY[language];
  const kinds = [c.what.kind.package, c.what.kind.shop, c.what.kind.errand];

  return (
    // mt-2, the spacing the form's own wrapper uses: closed, this row is
    // 8 + 48 + 2 = 58px on every step of a flow measured down to zero scroll
    // (lib/nav-scope.ts). mt-6 made it 74px (C14 review). Re-measure all four
    // screens at 375x812, English and French, before relying on the slack.
    <details className="group mt-1 rounded-2xl border border-white/10 bg-dark-card">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 font-dm text-sm font-semibold text-offwhite transition-colors hover:text-yellow">
        <ChevronRight
          size={15}
          aria-hidden
          className="shrink-0 text-muted transition-transform group-open:rotate-90"
        />
        <h2 className="inline">{c.explainer.title}</h2>
      </summary>

      <div className="space-y-4 px-4 pb-4 font-dm text-sm leading-relaxed text-muted">
        <section>
          <h3 className="font-semibold text-offwhite">{c.explainer.kindsTitle}</h3>
          <ul className="mt-1 space-y-1">
            {kinds.map((k) => (
              <li key={k.title}>
                <span className="text-offwhite">{k.title}</span> — {k.body}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3 className="font-semibold text-offwhite">{c.explainer.promisesTitle}</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {c.review.promises.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>

        <section>
          <h3 className="font-semibold text-offwhite">{c.explainer.moneyTitle}</h3>
          <p className="mt-1">{c.explainer.money}</p>
          {cashLimitCents != null && cashLimitCents > 0 && (
            <p className="mt-1">{c.explainer.cashLimit(formatFee(cashLimitCents))}</p>
          )}
        </section>
      </div>
    </details>
  );
}
