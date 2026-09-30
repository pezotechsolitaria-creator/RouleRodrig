"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, ChevronDown, Signal, Wifi, Zap, MessageCircle } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import type { PublicPlan } from "@/lib/esim/service";
import { dataLabel, daysLabel, usageHint } from "@/lib/esim/format";
import { formatEur, eurCentsPerGb } from "@/lib/esim/pricing";
import { displayNetworks } from "@/lib/esim/networks";
import { esimFaq } from "@/lib/esim/content";
import { esimTrack } from "@/lib/esim/analytics";
import CheckoutSheet from "./CheckoutSheet";
import CompatChecker from "./CompatChecker";
import { COPY, toUiLang, type UiLang } from "./copy";

// ── The eSIM store ───────────────────────────────────────────────────────────
//
// One screen, read top to bottom by someone deciding whether to trust a
// website with their arrival: what it is (hero), what it costs (the plans, as
// early as possible), how it works, WHY THIS ONE (the network explainer — the
// only thing a generic eSIM site cannot say), will it work on my phone, and
// the questions left over. The plans sit second because price is the first
// thing every eSIM shopper scrolls for.
//
// `lang` is passed by the French page so its SERVER render is French; the
// English page lets the visitor's language choice take over after hydration.

export default function EsimStore({
  plans,
  selling,
  lang: forced,
  whatsapp,
}: {
  plans: PublicPlan[] | null;
  selling: boolean;
  lang?: UiLang;
  whatsapp?: string | null;
}) {
  const { language } = useLanguage();
  const lang: UiLang = forced ?? toUiLang(language);
  const t = COPY[lang];
  const [chosen, setChosen] = useState<PublicPlan | null>(null);

  useEffect(() => {
    esimTrack.viewed({ plans: plans?.length ?? 0, selling, lang });
    // Once per page view, in the language it was first seen in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fromPrice = plans && plans.length ? formatEur(Math.min(...plans.map((p) => p.retail_eur_cents)), lang) : null;
  const widest = plans?.reduce<string[] | null>((acc, p) => (!acc || p.country_codes.length > acc.length ? p.country_codes : acc), null) ?? null;
  const faq = useMemo(() => esimFaq(lang, fromPrice, widest), [lang, fromPrice, widest]);
  const bestPerGb = useMemo(() => {
    const fixed = (plans ?? []).filter((p) => !p.per_day);
    return fixed.length ? Math.min(...fixed.map((p) => eurCentsPerGb(p.retail_eur_cents, p.data_mb) ?? Infinity)) : null;
  }, [plans]);

  function choose(p: PublicPlan) {
    esimTrack.planChosen({ plan: p.name, price_eur: p.retail_eur_cents / 100, badge: p.badge });
    setChosen(p);
  }

  const wa = (whatsapp ?? "").replace(/\D/g, "");

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <header className="relative overflow-hidden border-b border-dark-border px-5 pb-10 pt-6">
        <div aria-hidden className="pointer-events-none absolute -bottom-24 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-[#f97316]/10 blur-3xl" />
        <div className="relative mx-auto max-w-2xl">
          <p className="font-bebas text-xs tracking-[0.3em] text-yellow">{t.eyebrow}</p>
          <h1 className="mt-2 font-syne text-[clamp(1.875rem,8vw,2.75rem)] font-extrabold leading-[1.05] text-offwhite [hyphens:none] [word-break:keep-all]">
            {t.h1}
          </h1>
          <p className="mt-4 max-w-xl font-dm text-[15px] leading-relaxed text-muted">{t.sub}</p>
          <ul className="mt-6 grid grid-cols-2 gap-2.5">
            {t.trust.map((item, i) => {
              const Icon = [Zap, Signal, Wifi, MessageCircle][i] ?? Check;
              return (
                <li key={item} className="flex items-center gap-2 font-dm text-[13px] text-offwhite/90">
                  <Icon size={15} className="shrink-0 text-yellow" aria-hidden />
                  {item}
                </li>
              );
            })}
          </ul>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-5">
        {/* ── Plans ──────────────────────────────────────────────────────── */}
        <section aria-labelledby="esim-plans" className="pt-8">
          <h2 id="esim-plans" className="font-syne text-2xl font-bold text-offwhite">
            {t.plansTitle}
          </h2>
          {fromPrice && <p className="mt-1 font-dm text-xs text-muted">{t.plansNote}</p>}

          {plans === null ? (
            <p className="mt-5 rounded-2xl border border-white/10 px-5 py-6 font-dm text-sm text-muted">{t.loadError}</p>
          ) : plans.length === 0 ? (
            <p className="mt-5 rounded-2xl border border-white/10 px-5 py-6 font-dm text-sm text-muted">{t.noPlans}</p>
          ) : (
            <ul className="mt-5 grid grid-cols-2 gap-3">
              {plans.map((p) => {
                const perGb = eurCentsPerGb(p.retail_eur_cents, p.data_mb);
                const featured = p.badge === "popular";
                const abroad = p.country_codes.length - 1;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => choose(p)}
                      aria-label={`${dataLabel(p.data_mb, lang)}, ${daysLabel(p.validity_days, lang)}, ${formatEur(p.retail_eur_cents, lang)}`}
                      className={`group flex h-full w-full flex-col rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-yellow/60 ${
                        featured
                          ? "border-yellow/50 bg-gradient-to-b from-yellow/[0.10] to-yellow/[0.02]"
                          : "border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] hover:border-yellow/40"
                      }`}
                    >
                      <span className="flex min-h-[18px] items-center">
                        {p.badge && (
                          <span
                            className={`rounded-full px-2 py-0.5 font-bebas text-[10px] tracking-[0.18em] ${
                              featured ? "bg-yellow text-dark" : "border border-white/15 text-offwhite/80"
                            }`}
                          >
                            {(t.badges[p.badge] ?? p.badge).toUpperCase()}
                          </span>
                        )}
                      </span>
                      <span className="mt-3 whitespace-nowrap font-syne text-[1.625rem] font-extrabold leading-none text-offwhite">
                        {dataLabel(p.data_mb, lang)}
                        {p.per_day && <span className="text-base font-bold text-muted"> /{lang === "en" ? "day" : "jour"}</span>}
                      </span>
                      <span className="mt-1.5 font-dm text-sm text-offwhite/80">{daysLabel(p.validity_days, lang)}</span>
                      <span className="mt-2 font-dm text-xs leading-snug text-muted">{usageHint(p, lang)}</span>
                      <span className="mt-auto pt-4">
                        <span className="block font-syne text-xl font-extrabold text-offwhite">{formatEur(p.retail_eur_cents, lang)}</span>
                        <span className="mt-0.5 block font-dm text-[11px] text-muted">
                          {perGb && !p.per_day ? `${formatEur(perGb, lang)} ${t.perGb}` : displayNetworks(p.networks).join(" · ")}
                          {perGb && !p.per_day && perGb === bestPerGb ? " ✓" : ""}
                        </span>
                        {abroad > 0 && <span className="mt-0.5 block font-dm text-[11px] text-muted">{t.abroad(abroad)}</span>}
                        <span
                          className={`mt-3 flex min-h-11 items-center justify-center gap-1.5 rounded-full font-syne text-sm font-bold transition-colors ${
                            featured ? "bg-yellow text-dark group-hover:bg-yellow-dark" : "border border-yellow/30 bg-yellow/10 text-yellow group-hover:bg-yellow/15"
                          }`}
                        >
                          {t.choose} <ArrowRight size={14} aria-hidden />
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ── How it works ──────────────────────────────────────────────── */}
        <section aria-labelledby="esim-how" className="pt-12">
          <h2 id="esim-how" className="font-syne text-2xl font-bold text-offwhite">
            {t.howTitle}
          </h2>
          <ol className="mt-5 space-y-4">
            {t.how.map((s, i) => (
              <li key={s.t} className="flex gap-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-yellow/40 font-syne text-sm font-bold text-yellow">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-syne text-base font-bold text-offwhite">{s.t}</h3>
                  <p className="mt-0.5 font-dm text-sm leading-relaxed text-muted">{s.b}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Why the network matters ───────────────────────────────────── */}
        <section aria-labelledby="esim-net" className="pt-12">
          <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-6">
            <Signal size={22} className="text-yellow" aria-hidden />
            <h2 id="esim-net" className="mt-3 font-syne text-xl font-bold text-offwhite">
              {t.netTitle}
            </h2>
            <p className="mt-2 font-dm text-sm leading-relaxed text-offwhite/85">{t.netBody}</p>
            <p className="mt-3 font-dm text-sm leading-relaxed text-muted">{t.netCoverage}</p>
          </div>
        </section>

        {/* ── Compatibility ─────────────────────────────────────────────── */}
        <section aria-labelledby="esim-compat" className="pt-12">
          <h2 id="esim-compat" className="font-syne text-2xl font-bold text-offwhite">
            {t.compatTitle}
          </h2>
          <div className="mt-5">
            <CompatChecker lang={lang} />
          </div>
        </section>

        {/* ── FAQ ───────────────────────────────────────────────────────── */}
        <section aria-labelledby="esim-faq" className="pt-12">
          <h2 id="esim-faq" className="font-syne text-2xl font-bold text-offwhite">
            {t.faqTitle}
          </h2>
          <div className="mt-4 divide-y divide-white/10 border-y border-white/10">
            {faq.map((f) => (
              <details key={f.q} className="group">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 font-syne text-[15px] font-bold text-offwhite [&::-webkit-details-marker]:hidden">
                  <h3>{f.q}</h3>
                  <ChevronDown size={18} className="shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <p className="pb-4 font-dm text-sm leading-relaxed text-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ── Lost link ─────────────────────────────────────────────────── */}
        <FindMyEsim lang={lang} />

        {/* ── Next steps of the arrival ─────────────────────────────────── */}
        <nav aria-labelledby="esim-also" className="mt-12 rounded-3xl border border-dark-border bg-white/[0.02] p-6">
          <p id="esim-also" className="font-syne text-lg font-bold text-offwhite">
            {t.alsoTitle}
          </p>
          <ul className="mt-3 space-y-1">
            {t.also.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="inline-flex min-h-11 items-center gap-1.5 font-dm text-sm text-yellow/80 transition-colors hover:text-yellow">
                  {l.label} <ArrowRight size={14} aria-hidden />
                </Link>
              </li>
            ))}
            {wa && (
              <li>
                <a
                  href={`https://wa.me/${wa}?text=${encodeURIComponent(lang === "en" ? "Hello! A question about the eSIM." : "Bonjour ! Une question sur l'eSIM.")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-1.5 font-dm text-sm text-yellow/80 transition-colors hover:text-yellow"
                >
                  <MessageCircle size={14} aria-hidden /> {lang === "en" ? "Ask us on WhatsApp" : "Posez-nous la question sur WhatsApp"}
                </a>
              </li>
            )}
          </ul>
        </nav>
      </div>

      {chosen && <CheckoutSheet plan={chosen} lang={lang} selling={selling} onClose={() => setChosen(null)} />}
    </>
  );
}

function FindMyEsim({ lang }: { lang: UiLang }) {
  const t = COPY[lang];
  const router = useRouter();
  const [ref, setRef] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/esim/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref, email }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok && j.url) router.push(j.url);
    else setError(j.error || "Not found.");
  }

  return (
    <section aria-labelledby="esim-find" className="pt-12">
      <h2 id="esim-find" className="font-syne text-xl font-bold text-offwhite">
        {t.findTitle}
      </h2>
      <p className="mt-1 font-dm text-sm text-muted">{t.findBody}</p>
      <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1.4fr_auto]">
        <label>
          <span className="sr-only">{t.findRef}</span>
          <input
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder={t.findRef}
            autoCapitalize="characters"
            required
            className="w-full rounded-xl border border-dark-border bg-dark-card px-4 py-3 font-dm text-base text-offwhite placeholder:text-muted/60 focus:border-yellow focus:outline-none"
          />
        </label>
        <label>
          <span className="sr-only">{t.findEmail}</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t.findEmail}
            required
            className="w-full rounded-xl border border-dark-border bg-dark-card px-4 py-3 font-dm text-base text-offwhite placeholder:text-muted/60 focus:border-yellow focus:outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="min-h-12 rounded-full border border-yellow/30 bg-yellow/10 px-5 font-syne text-sm font-bold text-yellow transition-colors hover:bg-yellow/15 disabled:opacity-60"
        >
          {t.findGo}
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-2 font-dm text-sm text-red-300">
          {error}
        </p>
      )}
    </section>
  );
}
