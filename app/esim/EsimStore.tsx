"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronDown, Lock, MessageCircle, Search, Wifi, Zap } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import type { PublicPlan, LiveDestination } from "@/lib/esim/service";
import { formatEur } from "@/lib/esim/pricing";
import { esimFaq, worldFaq } from "@/lib/esim/content";
import { DESTINATIONS, HOME_CODE, type Destination } from "@/lib/esim/destinations";
import { esimTrack } from "@/lib/esim/analytics";
import CheckoutSheet from "./CheckoutSheet";
import CompatChecker from "./CompatChecker";
import DestinationGrid from "./DestinationGrid";
import Ticket from "./ui/Ticket";
import StickyBar from "./ui/StickyBar";
import { prefersReducedMotion, waLink } from "./ui/scroll";
import { COPY, toUiLang, type UiLang } from "./copy";

// ── The eSIM store — the one-screen edition (M226) ───────────────────────────
//
// MEASURED on the live M225 page at 375×812: 8.8 screens long, a 535px hero,
// the first "Choose" below the fold and the fourth plan ending 1.8 screens
// down. The buyer came to pick a plan, so the page is now built so that the
// promise AND all four plans fit in the first screen, above the floating nav:
//
//   hero      keyword kicker + a two-line promise, one sentence, three facts
//   plans     one-row boarding passes; badge as a tab on the edge, not a line
//   how       three steps across, not down
//   network   one sentence (the my.t vs Chili story, which the FAQ tells in full)
//   FAQ       all closed; the phone checker lives inside its own question
//   then      a sideways row of other countries, a folded order finder, links
//
// The price bar still follows once the plans leave the screen. Nothing on
// the page waits on script or animation to be visible.
//
// `lang` is passed by French pages so their SERVER render is French; English
// pages let the visitor's language choice take over after hydration.
//
// ONE COMPONENT, TWO KINDS OF SHELF (M224): the home shelf keeps the Rodrigues
// network story; other destinations get the same page with their own facts,
// computed from their own shelf.

/** "Orange, SFR and Bouygues" / "Orange, SFR et Bouygues". */
function listOf(items: string[], lang: UiLang): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} ${lang === "en" ? "and" : "et"} ${items[items.length - 1]}`;
}

/** Operator names for a non-home shelf, as the plans report them there. */
function worldNetworks(plans: PublicPlan[] | null, withType = false): string[] {
  const seen = new Map<string, string>();
  for (const p of plans ?? []) {
    for (const n of p.networks ?? []) {
      const key = n.name.trim().toLowerCase();
      if (key && !seen.has(key)) seen.set(key, withType && n.type ? `${n.name.trim()} ${n.type}` : n.name.trim());
    }
  }
  return [...seen.values()];
}

/** Four bars that light up in turn: the network, "found". */
function SignalBars({ className = "" }: { className?: string }) {
  return (
    <span className={`flex h-3 items-end gap-[2px] ${className}`} aria-hidden>
      {[4, 6, 9, 12].map((h, i) => (
        <span key={h} className="rr-esim-bar w-[2.5px] rounded-[1px] bg-yellow" style={{ height: h, animationDelay: `${160 + i * 130}ms` }} />
      ))}
    </span>
  );
}

export default function EsimStore({
  plans,
  selling,
  lang: forced,
  whatsapp,
  destination = DESTINATIONS[0],
  live = [],
}: {
  plans: PublicPlan[] | null;
  selling: boolean;
  lang?: UiLang;
  whatsapp?: string | null;
  /** The shelf being shown. Defaults to Mauritius & Rodrigues. */
  destination?: Destination;
  /** Destinations with plans on sale, for the "other destinations" row. */
  live?: LiveDestination[];
}) {
  const home = destination.code === HOME_CODE;
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
  const place = { name: lang === "en" ? destination.en : destination.fr, inPlace: lang === "en" ? destination.enIn : destination.frIn };
  const nets = useMemo(() => (home ? [] : worldNetworks(plans)), [home, plans]);
  const netsTyped = useMemo(() => (home ? [] : worldNetworks(plans, true)), [home, plans]);
  const faq = useMemo(
    () => (home ? esimFaq(lang, fromPrice, widest) : worldFaq(lang, place, fromPrice, nets)),
    // place is derived from destination + lang.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [home, lang, fromPrice, widest, nets, destination.code],
  );
  // The featured pass: the owner's pick, else the shelf's best value.
  const featuredId = useMemo(
    () => (plans ?? []).find((p) => p.badge === "popular")?.id ?? (plans ?? []).find((p) => p.badge === "best_value")?.id ?? null,
    [plans],
  );
  const helpHref = waLink(whatsapp, t.helpMsgGeneric);
  const network = home ? "my.t 4G" : (netsTyped[0] ?? t.world.localNetworks);

  function choose(p: PublicPlan) {
    esimTrack.planChosen({ plan: p.name, price_eur: p.retail_eur_cents / 100, badge: p.badge });
    setChosen(p);
  }

  /** "Will my phone work?" opens its own FAQ answer (with the model search)
   *  and brings it into view; focus goes to the question, not the page top. */
  function openCompat() {
    const d = document.getElementById("esim-compat") as HTMLDetailsElement | null;
    if (!d) return;
    d.open = true;
    d.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    d.querySelector("summary")?.focus({ preventScroll: true });
  }

  return (
    <>
      {/* ── Hero: the promise, in a quarter of the screen ────────────────── */}
      <header id="esim-hero" className="relative overflow-hidden px-5 pb-5 pt-5">
        <div aria-hidden className="pointer-events-none absolute -top-32 left-1/2 h-64 w-[34rem] -translate-x-1/2 rounded-full bg-yellow/[0.07] blur-3xl" />
        <div className="relative mx-auto max-w-2xl">
          {!selling && (
            <p className="mb-3 inline-flex rounded-full border border-yellow/40 bg-yellow/10 px-3 py-1 font-bebas text-[13px] leading-none tracking-[0.2em] text-yellow">
              {t.soonPill.toUpperCase()}
            </p>
          )}
          <h1 className="font-syne text-offwhite">
            <span className="block font-bebas text-[14px] font-normal leading-none tracking-[0.22em] text-yellow">
              {home ? t.h1Kicker : t.world.h1Kicker(place.name)}
            </span>
            <span className="sr-only"> — </span>
            <span className="mt-2.5 block text-[1.875rem] font-extrabold leading-[1.05] tracking-[-0.02em] [text-wrap:balance] sm:text-[2.75rem]">
              {t.h1}
            </span>
          </h1>
          <p className="mt-2.5 max-w-[52ch] font-dm text-sm leading-relaxed text-offwhite/70">{home ? t.sub : t.world.sub(place.name, place.inPlace)}</p>
          {/* gap 10px: the French row needs 338px at 12px, and the page has 335. */}
          <ul className="mt-3.5 flex flex-wrap gap-x-2.5 gap-y-1.5 font-dm text-[12px] text-offwhite/80">
            <li className="flex items-center gap-1.5 whitespace-nowrap">
              <Zap size={13} className="text-yellow" aria-hidden /> {t.micro[0]}
            </li>
            <li className="flex items-center gap-1.5 whitespace-nowrap">
              <SignalBars /> {network}
            </li>
            <li className="flex items-center gap-1.5 whitespace-nowrap">
              <Wifi size={13} className="text-yellow" aria-hidden /> {t.micro[2]}
            </li>
          </ul>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-5">
        {/* ── Plans: all of them in the first screen ─────────────────────── */}
        <section id="esim-plans" aria-labelledby="esim-plans-title" className="scroll-mt-20 pt-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <h2 id="esim-plans-title" className="font-syne text-[1.125rem] font-bold leading-tight text-offwhite">
              {selling ? t.plansTitle : t.plansTitleSoon}
            </h2>
            <button
              type="button"
              onClick={openCompat}
              className="-my-2 min-h-11 font-dm text-[13px] text-offwhite/70 underline decoration-white/25 underline-offset-4 transition-colors hover:text-offwhite hover:decoration-yellow/60"
            >
              {t.heroCompat}
            </button>
          </div>

          {plans === null ? (
            <p className="mt-4 rounded-2xl border border-white/10 px-5 py-6 font-dm text-sm text-muted">{t.loadError}</p>
          ) : plans.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-white/10 px-5 py-6 font-dm text-sm text-muted">{t.noPlans}</p>
          ) : (
            <>
              {/* 14px between passes: a badge tab rises 8px above its pass. */}
              <ul className="mt-4 space-y-3.5">
                {plans.map((p) => (
                  <Ticket key={p.id} plan={p} lang={lang} featured={p.id === featuredId} onChoose={choose} cta={selling ? undefined : t.soonCta} />
                ))}
              </ul>
              <p className="mt-3 flex items-center gap-1.5 font-dm text-[12px] text-muted">
                <Lock size={12} aria-hidden /> {selling ? t.plansNote : t.plansNoteSoon}
              </p>
            </>
          )}
        </section>

        {/* ── How it works: three steps across ─────────────────────────────── */}
        <section id="esim-how" aria-labelledby="esim-how-title" className="scroll-mt-20 pt-9">
          <h2 id="esim-how-title" className="font-bebas text-[13px] font-normal tracking-[0.24em] text-muted">
            {t.howTitle.toUpperCase()}
          </h2>
          <ol className="mt-3 grid grid-cols-3 gap-3">
            {t.how.map((s, i) => (
              <li key={s.t} className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-yellow/40 font-syne text-xs font-bold text-yellow">
                    {i + 1}
                  </span>
                  {i < t.how.length - 1 && <span aria-hidden className="flex-1 border-t border-dashed border-yellow/30" />}
                </span>
                <p className="mt-2 font-syne text-[13px] font-bold leading-tight text-offwhite">{s.t}</p>
                <p className="mt-1 font-dm text-[12px] leading-snug text-offwhite/60">{s.b}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ── The network, in one sentence ─────────────────────────────────── */}
        {(home || nets.length > 0) && (
          <p id="esim-net" className="mt-7 flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 font-dm text-[13px] leading-snug text-offwhite/70">
            <SignalBars className="mt-[3px] shrink-0" />
            <span>
              {home ? (
                <>
                  <b className="font-semibold text-offwhite">{t.trustStrong}</b> {t.trustRest}
                </>
              ) : (
                t.world.netBody(listOf(nets.slice(0, 4), lang), place.inPlace, nets.length > 1)
              )}
            </span>
          </p>
        )}

        {/* ── FAQ: everything closed until asked ──────────────────────────── */}
        <section id="esim-faq" aria-labelledby="esim-faq-title" className="rr-esim-faq scroll-mt-20 pt-10">
          <h2 id="esim-faq-title" className="font-syne text-[1.125rem] font-bold leading-tight text-offwhite">
            {t.faqTitle}
          </h2>
          <div className="mt-3 divide-y divide-white/10 border-y border-white/10">
            {faq.map((f) => (
              <details key={f.q} id={f.id === "compat" ? "esim-compat" : undefined} className="group scroll-mt-20">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-3 font-syne text-[14px] font-bold leading-snug text-offwhite transition-colors hover:text-yellow [&::-webkit-details-marker]:hidden">
                  <h3>{f.q}</h3>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 transition-[transform,border-color] duration-300 group-open:rotate-180 group-open:border-yellow/40">
                    <ChevronDown size={15} className="text-offwhite/70" aria-hidden />
                  </span>
                </summary>
                <div className="pb-4 pr-2">
                  <p className="max-w-[62ch] pr-7 font-dm text-sm leading-relaxed text-offwhite/65">{f.a}</p>
                  {f.id === "compat" && (
                    <div className="mt-3">
                      <CompatChecker lang={lang} searchOnly />
                    </div>
                  )}
                </div>
              </details>
            ))}
          </div>
        </section>

        {/* ── Other destinations — Mauritius first, the world second ──────── */}
        <DestinationGrid lang={lang} live={live} current={destination} />

        {/* ── Lost link, folded ──────────────────────────────────────────── */}
        {/* Nobody can have bought one before sales open (M229). */}
        {selling && <FindMyEsim lang={lang} />}

        {/* ── Onward ────────────────────────────────────────────────────── */}
        <nav aria-labelledby="esim-also" className="mt-8">
          <p id="esim-also" className="font-bebas text-[12px] tracking-[0.24em] text-muted">
            {(home ? t.alsoTitle : t.world.alsoTitle).toUpperCase()}
          </p>
          <ul className="mt-2.5 flex flex-wrap gap-2">
            {(home ? t.also : t.world.also).map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-white/12 px-4 font-dm text-[13px] text-offwhite/85 transition-colors hover:border-yellow/40 hover:text-yellow"
                >
                  {l.label} <ArrowRight size={13} aria-hidden className="text-muted" />
                </Link>
              </li>
            ))}
            {helpHref && (
              <li>
                <a
                  href={helpHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-yellow/30 px-4 font-dm text-[13px] text-yellow/90 transition-colors hover:bg-yellow/10"
                >
                  <MessageCircle size={14} aria-hidden /> {t.help}
                </a>
              </li>
            )}
          </ul>
        </nav>
      </div>

      <StickyBar
        from={!selling ? t.soonPill : fromPrice ? t.barFrom(fromPrice) : t.heroCtaNoPrice}
        sub={home ? `my.t 4G · ${t.barQr}` : t.barSub}
        cta={selling ? t.barCta : t.soonCta}
        helpHref={helpHref}
        helpLabel={t.help}
        hidden={chosen !== null}
      />

      {chosen && (
        <CheckoutSheet
          plan={chosen}
          lang={lang}
          selling={selling}
          destination={destination}
          whatsapp={whatsapp ?? null}
          onClose={() => setChosen(null)}
        />
      )}
    </>
  );
}

function FindMyEsim({ lang }: { lang: UiLang }) {
  const t = COPY[lang];
  const router = useRouter();
  const box = useRef<HTMLDetailsElement>(null);
  const [ref, setRef] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The install page's "Find my eSIM" links to /esim#esim-find: arrive with
  // the form already open.
  useEffect(() => {
    if (window.location.hash === "#esim-find" && box.current) {
      box.current.open = true;
      box.current.scrollIntoView({ block: "center" });
    }
  }, []);

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
    <div className="rr-esim-faq mt-8">
      <details ref={box} id="esim-find" className="group scroll-mt-20 rounded-2xl border border-white/10 bg-white/[0.02]">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2.5 font-dm text-sm">
            <Search size={15} className="shrink-0 text-muted" aria-hidden />
            <span>
              <span className="font-semibold text-offwhite">{t.findTitle}</span> <span className="text-offwhite/60">{t.findGo}</span>
            </span>
          </span>
          <ChevronDown size={15} className="shrink-0 text-offwhite/60 transition-transform duration-300 group-open:rotate-180" aria-hidden />
        </summary>
        <div className="px-4 pb-4">
          <p className="font-dm text-[13px] text-offwhite/65">{t.findBody}</p>
          <form onSubmit={submit} className="mt-3 grid gap-2.5 sm:grid-cols-[1fr_1.4fr_auto]">
            <label>
              <span className="sr-only">{t.findRef}</span>
              <input
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                placeholder={t.findRef}
                autoCapitalize="characters"
                required
                className="w-full rounded-xl border border-dark-border bg-dark-card px-4 py-3 font-dm text-base text-offwhite placeholder:text-muted/70 focus:border-yellow focus:outline-none"
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
                className="w-full rounded-xl border border-dark-border bg-dark-card px-4 py-3 font-dm text-base text-offwhite placeholder:text-muted/70 focus:border-yellow focus:outline-none"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-yellow/35 px-5 font-syne text-sm font-bold text-yellow transition-colors hover:bg-yellow/10 disabled:opacity-60"
            >
              <Search size={15} aria-hidden /> {t.findGo}
            </button>
          </form>
          {error && (
            <p role="alert" className="mt-2 font-dm text-sm text-red-300">
              {error}
            </p>
          )}
        </div>
      </details>
    </div>
  );
}
