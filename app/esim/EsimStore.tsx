"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, ChevronDown, CreditCard, House, MessageCircle, PlaneLanding, Search } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import type { PublicPlan, LiveDestination } from "@/lib/esim/service";
import { formatEur } from "@/lib/esim/pricing";
import { displayNetworks } from "@/lib/esim/networks";
import { esimFaq, worldFaq } from "@/lib/esim/content";
import { DESTINATIONS, HOME_CODE, type Destination } from "@/lib/esim/destinations";
import { esimTrack } from "@/lib/esim/analytics";
import CheckoutSheet from "./CheckoutSheet";
import CompatChecker from "./CompatChecker";
import DestinationGrid from "./DestinationGrid";
import SignalStrip from "./ui/SignalStrip";
import SectionNav from "./ui/SectionNav";
import Ticket from "./ui/Ticket";
import NetworkBoard from "./ui/NetworkBoard";
import StickyBar from "./ui/StickyBar";
import { scrollToSection, waLink } from "./ui/scroll";
import { COPY, toUiLang, type UiLang } from "./copy";

// ── The eSIM store — boarding-pass edition (M225) ────────────────────────────
//
// One long page read on a phone by someone deciding whether to trust a website
// with their arrival. The design is a travel document system, because that is
// what the product is: the thing that gets you onto the network when you land.
//
//   hero          a phone status strip (network + Rodrigues time), the promise,
//                 ONE gold action ("See plans · from €x")
//   section rail  sticky chips + reading progress, docked under the header
//   plans         boarding passes — body = what you get, stub = what it costs
//   how           a three-stop route line
//   network       a departures board (the store's reason to exist, on MU)
//   phone check   *#06# first, then the model list
//   FAQ           opens smoothly; below-the-fold sections defer their paint
//   price bar     follows you once the plans are out of view, above the nav
//
// `lang` is passed by French pages so their SERVER render is French; English
// pages let the visitor's language choice take over after hydration.
//
// ONE COMPONENT, TWO KINDS OF SHELF (M224): the home shelf keeps the Rodrigues
// network story; other destinations get the same experience with their own
// facts, computed from their own shelf.

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
  /** Destinations with plans on sale, for the "other destinations" grid. */
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
  const code = home ? "RRG" : destination.code;
  const helpHref = waLink(whatsapp, t.helpMsgGeneric);
  const hasDest = live.some((l) => l.code !== destination.code);

  const sections = useMemo(
    () => [
      { id: "esim-plans", label: t.chips.plans },
      { id: "esim-how", label: t.chips.how },
      ...(home || nets.length ? [{ id: "esim-net", label: t.chips.net }] : []),
      { id: "esim-compat", label: t.chips.compat },
      { id: "esim-faq", label: t.chips.faq },
      ...(hasDest ? [{ id: "esim-destinations", label: t.chips.dest }] : []),
    ],
    [t, home, nets.length, hasDest],
  );

  function choose(p: PublicPlan) {
    esimTrack.planChosen({ plan: p.name, price_eur: p.retail_eur_cents / 100, badge: p.badge });
    setChosen(p);
  }

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <header id="esim-hero" className="relative overflow-hidden px-5 pb-8 pt-5">
        <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 h-80 w-[40rem] -translate-x-1/2 rounded-full bg-yellow/[0.07] blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-[#f97316]/[0.09] blur-3xl" />
        <div className="relative mx-auto max-w-2xl">
          <SignalStrip
            network={home ? "my.t 4G" : (netsTyped[0] ?? t.world.localNetworks)}
            place={(home ? "Rodrigues" : place.name).toUpperCase()}
            clockLabel={home ? t.islandTime : undefined}
          />
          <h1 className="mt-6 max-w-[22ch] font-syne text-[clamp(1.875rem,7.6vw,3.25rem)] font-extrabold leading-[1.02] tracking-[-0.02em] text-offwhite [hyphens:none] [text-wrap:balance] [word-break:keep-all]">
            {home ? t.h1 : t.world.h1(place.inPlace)}
          </h1>
          <p className="mt-4 max-w-[58ch] font-dm text-[15px] leading-relaxed text-offwhite/70">{home ? t.sub : t.world.sub(place.name, place.inPlace)}</p>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
            <button
              type="button"
              onClick={() => scrollToSection("esim-plans")}
              className="inline-flex min-h-12 items-center gap-2 rounded-full bg-yellow px-6 font-syne text-sm font-bold text-dark shadow-[0_10px_30px_-10px_rgba(245,200,66,0.55)] transition-[background-color,transform] duration-200 hover:bg-yellow-dark active:scale-[0.98]"
            >
              {fromPrice ? t.heroCta(fromPrice) : t.heroCtaNoPrice}
              <ArrowRight size={16} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => scrollToSection("esim-compat")}
              className="min-h-11 font-dm text-sm text-offwhite/80 underline decoration-white/25 underline-offset-[6px] transition-colors hover:text-offwhite hover:decoration-yellow/60"
            >
              {t.heroCompat}
            </button>
          </div>
          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 font-dm text-[13px] text-offwhite/75">
            {[t.trust[0], t.trust[2], t.trust[3]].map((item) => (
              <li key={item} className="flex items-center gap-1.5">
                <Check size={14} className="shrink-0 text-yellow/80" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </header>

      <SectionNav sections={sections} label={lang === "en" ? "On this page" : "Sur cette page"} />

      <div className="mx-auto max-w-2xl px-5">
        {/* ── Plans ──────────────────────────────────────────────────────── */}
        <section id="esim-plans" aria-labelledby="esim-plans-title" className="scroll-mt-32 pt-9">
          <div className="flex items-end justify-between gap-4">
            <h2 id="esim-plans-title" className="font-syne text-[1.625rem] font-bold leading-tight text-offwhite">
              {t.plansTitle}
            </h2>
          </div>
          {fromPrice && <p className="mt-1.5 font-dm text-[13px] text-muted">{t.plansNote}</p>}

          {plans === null ? (
            <p className="mt-6 rounded-2xl border border-white/10 px-5 py-6 font-dm text-sm text-muted">{t.loadError}</p>
          ) : plans.length === 0 ? (
            <p className="mt-6 rounded-2xl border border-white/10 px-5 py-6 font-dm text-sm text-muted">{t.noPlans}</p>
          ) : (
            <PrintedList>
              {plans.map((p, i) => (
                <Ticket
                  key={p.id}
                  plan={p}
                  lang={lang}
                  code={code}
                  index={i}
                  featured={p.id === featuredId}
                  networks={home ? displayNetworks(p.networks) : worldNetworks([p], true)}
                  onChoose={choose}
                />
              ))}
            </PrintedList>
          )}
        </section>

        {/* ── How it works: a three-stop route ───────────────────────────── */}
        <section id="esim-how" aria-labelledby="esim-how-title" className="scroll-mt-32 pt-16">
          <h2 id="esim-how-title" className="font-syne text-[1.625rem] font-bold leading-tight text-offwhite">
            {t.howTitle}
          </h2>
          <ol className="relative mt-7 space-y-7 before:absolute before:bottom-6 before:left-[1.375rem] before:top-6 before:border-l before:border-dashed before:border-yellow/30">
            {t.how.map((s, i) => {
              const Icon = [CreditCard, House, PlaneLanding][i] ?? CreditCard;
              return (
                <li key={s.t} className="relative flex gap-4">
                  <span className="relative z-[1] flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-yellow/40 bg-dark text-yellow">
                    <Icon size={18} aria-hidden />
                  </span>
                  <div className="pt-1">
                    <h3 className="font-syne text-[17px] font-bold text-offwhite">{s.t}</h3>
                    <p className="mt-1 max-w-[52ch] font-dm text-sm leading-relaxed text-offwhite/65">{s.b}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        {/* ── The network ────────────────────────────────────────────────── */}
        {(home || nets.length > 0) && (
          <section id="esim-net" aria-labelledby="esim-net-title" className="scroll-mt-32 pt-16">
            <NetworkBoard
              lang={lang}
              home={home}
              networks={netsTyped.slice(0, 5)}
              title={home ? t.netTitle : t.world.netTitle(place.inPlace)}
              body={home ? t.netBody : t.world.netBody(listOf(nets.slice(0, 4), lang), place.inPlace)}
              footnote={home ? `${t.boardNote} ${t.netCoverage}` : undefined}
            />
          </section>
        )}

        {/* ── Phone check ────────────────────────────────────────────────── */}
        <section id="esim-compat" aria-labelledby="esim-compat-title" className="rr-esim-defer scroll-mt-32 pt-16">
          <h2 id="esim-compat-title" className="font-syne text-[1.625rem] font-bold leading-tight text-offwhite">
            {t.compatTitle}
          </h2>
          <div className="mt-6">
            <CompatChecker lang={lang} />
          </div>
        </section>

        {/* ── FAQ ────────────────────────────────────────────────────────── */}
        <section id="esim-faq" aria-labelledby="esim-faq-title" className="rr-esim-defer rr-esim-faq scroll-mt-32 pt-16">
          <h2 id="esim-faq-title" className="font-syne text-[1.625rem] font-bold leading-tight text-offwhite">
            {t.faqTitle}
          </h2>
          <div className="mt-5 divide-y divide-white/10 border-y border-white/10">
            {faq.map((f) => (
              <details key={f.q} className="group">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3.5 font-syne text-[15px] font-bold text-offwhite transition-colors hover:text-yellow [&::-webkit-details-marker]:hidden">
                  <h3>{f.q}</h3>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 transition-[transform,border-color] duration-300 group-open:rotate-180 group-open:border-yellow/40">
                    <ChevronDown size={16} className="text-offwhite/70" aria-hidden />
                  </span>
                </summary>
                <p className="max-w-[62ch] pb-5 pr-10 font-dm text-sm leading-relaxed text-offwhite/65">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ── Other destinations — Mauritius first, the world second ──────── */}
        <div className="rr-esim-defer">
          <DestinationGrid lang={lang} live={live} current={destination} />
        </div>

        {/* ── Lost link ─────────────────────────────────────────────────── */}
        <FindMyEsim lang={lang} />

        {/* ── Onward ────────────────────────────────────────────────────── */}
        <nav aria-labelledby="esim-also" className="mt-14 border-t border-white/10 pt-8">
          <p id="esim-also" className="font-bebas text-[12px] tracking-[0.24em] text-muted">
            {(home ? t.alsoTitle : t.world.alsoTitle).toUpperCase()}
          </p>
          <ul className="mt-3 divide-y divide-white/[0.07]">
            {(home ? t.also : t.world.also).map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="group flex min-h-12 items-center justify-between gap-3 font-dm text-[15px] text-offwhite/85 transition-colors hover:text-yellow">
                  {l.label} <ArrowRight size={16} aria-hidden className="text-muted transition-[transform,color] group-hover:translate-x-0.5 group-hover:text-yellow" />
                </Link>
              </li>
            ))}
            {helpHref && (
              <li>
                <a href={helpHref} target="_blank" rel="noopener noreferrer" className="group flex min-h-12 items-center justify-between gap-3 font-dm text-[15px] text-offwhite/85 transition-colors hover:text-yellow">
                  <span className="flex items-center gap-2">
                    <MessageCircle size={16} aria-hidden /> {t.help}
                  </span>
                  <ArrowRight size={16} aria-hidden className="text-muted transition-[transform,color] group-hover:translate-x-0.5 group-hover:text-yellow" />
                </a>
              </li>
            )}
          </ul>
        </nav>
      </div>

      <StickyBar
        from={fromPrice ? t.barFrom(fromPrice) : t.heroCtaNoPrice}
        sub={home ? `my.t 4G · ${t.barSub}` : t.barSub}
        cta={t.barCta}
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

/** The ticket list. Its entrance is pure CSS (see .rr-esim-ticket in
 *  globals.css): scroll-driven, so nothing here can leave it hidden. */
function PrintedList({ children }: { children: React.ReactNode }) {
  return <ul className="rr-esim-tickets mt-6 space-y-3.5">{children}</ul>;
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
    <section id="esim-find" aria-labelledby="esim-find-title" className="scroll-mt-32 pt-16">
      <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-5">
        <h2 id="esim-find-title" className="font-syne text-lg font-bold text-offwhite">
          {t.findTitle}
        </h2>
        <p className="mt-1 font-dm text-sm text-offwhite/65">{t.findBody}</p>
        <form onSubmit={submit} className="mt-4 grid gap-2.5 sm:grid-cols-[1fr_1.4fr_auto]">
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
    </section>
  );
}
