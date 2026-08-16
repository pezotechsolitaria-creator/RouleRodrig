"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ConciergeBell } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { locT, type ConciergeSection } from "@/lib/world-docs/types";
import { openTiRoule } from "@/lib/nav-tabs";
import Reveal from "./Reveal";

const unopt = (src: string) =>
  src.startsWith("/uploads/") || (src.startsWith("http") && !src.includes("supabase.co"));

/**
 * The invitation.
 *
 * ── NOT A FORM ────────────────────────────────────────────────────────────
 * There is no name field, no email field and no "how many nights?" select. A
 * form says "fill this in and someone will get back to you"; a single button
 * that opens a conversation says "we're here". The reader has just spent a page
 * being shown things by an editor — the close should be that editor offering to
 * keep going, not an enquiry queue.
 *
 * ── A BAND, NOT A CURTAIN CALL ────────────────────────────────────────────
 * This was a 522px centred panel: a portrait, an eyebrow, a 3.2rem headline, a
 * paragraph, a button and a reassurance line, each on its own row. Full-height
 * drama at the END of a page is drama nobody scrolls to, and the reader who
 * does arrive has already decided whether they want help — what they need at
 * that moment is the button, not the pitch. It is now a single band with the
 * face on the left, the offer in the middle and the button on the right.
 *
 * The CTA reuses the site-wide Ti Roulé chat rather than inventing a curated
 * one, so the concierge here is the same assistant, with the same history, that
 * the bottom nav opens everywhere else.
 */
export default function ConciergeInvite({
  id,
  section,
  mascot,
}: {
  id: string;
  section: ConciergeSection;
  /** The owner's Ti Roulé artwork from branding, if any. */
  mascot?: string;
}) {
  const { language } = useLanguage();

  const eyebrow = locT(language, section.eyebrow);
  const title = locT(language, section.title);
  const body = locT(language, section.body);
  const cta =
    locT(language, section.ctaLabel) ||
    (language === "fr" ? "Demander à Ti Roulé" : "Ask Ti Roulé");
  const reassurance = locT(language, section.reassurance);
  const avatar = section.avatar || mascot;

  const ctaClasses =
    "group inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full px-5 py-2.5 font-dm text-[13px] font-medium transition-transform duration-300 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 sm:w-auto";
  const ctaStyle = {
    backgroundColor: "var(--cur-champagne)",
    color: "var(--cur-on-accent)",
    boxShadow: "0 14px 32px -16px rgba(227,200,162,0.7)",
  } as const;

  const arrow = (
    <ArrowRight size={15} className="transition-transform duration-300 group-hover:translate-x-1" />
  );

  return (
    <section id={id} className="mx-auto w-full max-w-6xl scroll-mt-20 px-5 lg:px-8">
      <Reveal>
        <div
          className="relative isolate overflow-hidden rounded-2xl p-4 lg:rounded-3xl lg:p-7"
          style={{
            border: "1px solid var(--cur-line)",
            background: "var(--cur-invite)",
          }}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
            <div className="flex min-w-0 flex-1 items-start gap-3.5">
              {avatar ? (
                <Image
                  src={avatar}
                  alt=""
                  width={96}
                  height={96}
                  sizes="64px"
                  className="h-12 w-12 shrink-0 rounded-full object-cover lg:h-16 lg:w-16"
                  style={{ border: "1px solid var(--cur-line-strong)" }}
                  unoptimized={unopt(avatar)}
                />
              ) : (
                <span
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full lg:h-16 lg:w-16"
                  style={{
                    border: "1px solid var(--cur-line-strong)",
                    backgroundColor:
                      "color-mix(in srgb, var(--cur-champagne) 12%, transparent)",
                  }}
                >
                  <ConciergeBell size={20} style={{ color: "var(--cur-champagne)" }} />
                </span>
              )}

              <div className="min-w-0">
                {eyebrow && <p className="rr-cur-eyebrow text-[9px]">{eyebrow}</p>}
                <h2
                  className="rr-cur-display mt-1 text-[clamp(1.3rem,5vw,2rem)]"
                  style={{ color: "var(--cur-ivory)" }}
                >
                  {title}
                </h2>
                {body && (
                  <p
                    className="mt-1.5 max-w-lg font-dm text-[12.5px] leading-snug lg:text-sm"
                    style={{ color: "var(--cur-dim)" }}
                  >
                    {body}
                  </p>
                )}
              </div>
            </div>

            <div className="shrink-0 sm:text-right">
              {section.ctaAction === "link" && section.ctaHref ? (
                <Link href={section.ctaHref} className={ctaClasses} style={ctaStyle}>
                  {cta}
                  {arrow}
                </Link>
              ) : (
                <button type="button" onClick={openTiRoule} className={ctaClasses} style={ctaStyle}>
                  {cta}
                  {arrow}
                </button>
              )}
              {reassurance && (
                <p
                  className="mt-2 max-w-[15rem] font-dm text-[11px] leading-snug sm:ml-auto"
                  style={{ color: "var(--cur-faint)" }}
                >
                  {reassurance}
                </p>
              )}
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
