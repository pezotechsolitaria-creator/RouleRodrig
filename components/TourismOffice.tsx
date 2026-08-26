"use client";

import { Phone, ExternalLink, MapPin, Mail } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { loc } from "@/lib/localize";

// ── THE RODRIGUES TOURISM OFFICE, LINKED HONESTLY ───────────────────────────
//
// The owner asked for an "Official Partner" / "In partnership with" badge.
// This is not that, and the difference is deliberate.
//
// "Official Partner" is a statement about a RELATIONSHIP. Published under the
// name of a government body it says: they have agreed to this. If that
// agreement does not exist in writing, the claim is false, it is made about a
// public authority, and it is the kind of thing a small business receives a
// letter about. Reproducing their logo says the same thing a second time —
// a mark used beside your own reads as endorsement, and permission to use one
// is a thing you are given, not a thing you assume.
//
// What the owner actually wants from it — that a visitor sees the island's
// real tourism office, trusts the site more for it, and can call somebody who
// knows the answer — needs none of that. A public body's website, hotline,
// address and published email are public information; citing them and linking
// out is ordinary, correct, and requires nobody's permission.
//
// So this says what is TRUE: here is the official tourism office, here is how
// to reach it. It reads as helpful rather than as an advertisement, which is
// also the brief.
//
// IF a written agreement exists, the change is one string: swap `blurb` for
// "Official partner of Roulé Rodrigues" and add their supplied logo above the
// name, with alt text of their name — never the word "logo".
//
// ── WHY IT IS NOT WARM ORANGE ───────────────────────────────────────────────
// Every amber control on this site is something Roulé does for you. This is
// somebody else, and it leaves the site. Muted with a single amber chevron
// keeps it clearly theirs, keeps it from competing with a real CTA, and is the
// reason it can sit on every page without becoming noise.

const SITE = "https://discover-rodrigues.com/";
const TEL_HREF = "tel:+2308320866";
const TEL_TEXT = "+230 832 0866";
const EMAIL = "info@rodriguestourismoffice.org";
const ADDRESS = "Rue de la Solidarité, Port Mathurin";

export default function TourismOffice({
  variant = "compact",
}: {
  /**
   * `compact` — one quiet line for the footer, on every page.
   * `full`    — a card for /emergency and /more, where somebody is actively
   *             looking for help and the hotline is the point.
   */
  variant?: "compact" | "full";
}) {
  const { language } = useLanguage();

  const name = loc(
    language,
    "Rodrigues Tourism Office",
    "Office du Tourisme de Rodrigues",
    "Biro Tourism Rodrigues",
  );
  const blurb = loc(
    language,
    "Official visitor information and support",
    "Informations et assistance officielles aux visiteurs",
    "Informasion ek led ofisiel pou bann viziter",
  );
  const visit = loc(
    language,
    "Visit official site",
    "Site officiel",
    "Sit ofisiel",
  );
  const call = loc(
    language,
    "Call the Tourism Office",
    "Appeler l'Office du Tourisme",
    "Apel Biro Tourism",
  );
  // Said once, for a screen reader, so an external link is never a surprise.
  const opensNew = loc(
    language,
    "opens their website in a new tab",
    "ouvre leur site dans un nouvel onglet",
    "ouver zot sit dan enn nouvo tab",
  );

  if (variant === "compact") {
    return (
      <section
        aria-labelledby="rto-compact"
        className="flex flex-col items-center gap-1.5 text-center"
      >
        <p id="rto-compact" className="font-dm text-xs text-muted">
          <span className="text-offwhite/80">{name}</span>
          <span className="mx-1.5 text-muted/40" aria-hidden="true">
            ·
          </span>
          {blurb}
        </p>
        <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <a
            href={SITE}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${visit} — ${name}, ${opensNew}`}
            className="inline-flex items-center gap-1.5 font-dm text-xs text-muted transition-colors hover:text-yellow"
          >
            {visit}
            <ExternalLink size={11} aria-hidden="true" />
          </a>
          <a
            href={TEL_HREF}
            aria-label={`${call}, ${TEL_TEXT}`}
            className="inline-flex items-center gap-1.5 font-dm text-xs text-muted transition-colors hover:text-yellow"
          >
            <Phone size={11} aria-hidden="true" />
            {TEL_TEXT}
          </a>
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="rto-full"
      className="rounded-2xl border border-dark-border bg-dark-card/60 p-4"
    >
      <h2 id="rto-full" className="font-syne text-base font-bold text-offwhite">
        {name}
      </h2>
      <p className="mt-1 font-dm text-sm text-muted">{blurb}</p>

      <div className="mt-3 flex flex-col gap-1.5 font-dm text-xs text-muted">
        <p className="flex items-start gap-2">
          <MapPin size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          {ADDRESS}
        </p>
        <a
          href={`mailto:${EMAIL}`}
          className="flex items-start gap-2 transition-colors hover:text-yellow"
        >
          <Mail size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          {EMAIL}
        </a>
      </div>

      {/* Both 48px tall. The hotline is the reason somebody opens this on a
          phone, so it is a real target, not a text link. */}
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <a
          href={TEL_HREF}
          aria-label={`${call}, ${TEL_TEXT}`}
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-yellow/40 bg-yellow/[0.07] px-4 font-dm text-sm font-semibold text-yellow transition-colors hover:bg-yellow/[0.12]"
        >
          <Phone size={15} aria-hidden="true" />
          {TEL_TEXT}
        </a>
        <a
          href={SITE}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${visit} — ${name}, ${opensNew}`}
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-dark-border px-4 font-dm text-sm text-offwhite transition-colors hover:border-yellow/50 hover:text-yellow"
        >
          {visit}
          <ExternalLink size={14} aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
