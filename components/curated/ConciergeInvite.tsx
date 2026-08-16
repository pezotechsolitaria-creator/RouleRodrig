"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Sparkles } from "lucide-react";
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
 * that opens a conversation says "we're here". The reader has just spent a
 * page being shown things by an editor — the close should be that editor
 * offering to keep going, not an enquiry queue.
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
    "group inline-flex min-h-12 items-center gap-2.5 rounded-full px-7 py-3.5 font-dm text-sm font-medium transition-transform duration-300 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2";
  const ctaStyle = {
    backgroundColor: "var(--cur-champagne)",
    color: "var(--cur-on-accent)",
    boxShadow: "0 20px 44px -20px rgba(227,200,162,0.7)",
  } as const;

  return (
    <section id={id} className="mx-auto w-full max-w-6xl scroll-mt-24 px-5 lg:px-8">
      <Reveal>
        <div
          className="relative isolate overflow-hidden rounded-[1.75rem] px-6 py-12 text-center lg:px-16 lg:py-20"
          style={{
            border: "1px solid var(--cur-line)",
            background: "var(--cur-invite)",
          }}
        >
          {avatar ? (
            <Image
              src={avatar}
              alt=""
              width={112}
              height={112}
              sizes="112px"
              className="mx-auto mb-6 h-20 w-20 rounded-full object-cover lg:h-24 lg:w-24"
              style={{ border: "1px solid var(--cur-line-strong)" }}
              unoptimized={unopt(avatar)}
            />
          ) : (
            <span
              className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full"
              style={{
                border: "1px solid var(--cur-line-strong)",
                backgroundColor: "color-mix(in srgb, var(--cur-champagne) 12%, transparent)",
              }}
            >
              <Sparkles size={22} style={{ color: "var(--cur-champagne)" }} />
            </span>
          )}

          {eyebrow && <p className="rr-cur-eyebrow">{eyebrow}</p>}

          <h2
            className="rr-cur-display mx-auto mt-4 max-w-2xl text-[clamp(1.9rem,6vw,3.2rem)]"
            style={{ color: "var(--cur-ivory)" }}
          >
            {title}
          </h2>

          {body && (
            <p
              className="mx-auto mt-5 max-w-xl font-dm text-sm leading-relaxed lg:text-base"
              style={{ color: "var(--cur-dim)" }}
            >
              {body}
            </p>
          )}

          <div className="mt-9">
            {section.ctaAction === "link" && section.ctaHref ? (
              <Link href={section.ctaHref} className={ctaClasses} style={ctaStyle}>
                {cta}
                <ArrowRight
                  size={16}
                  className="transition-transform duration-300 group-hover:translate-x-1"
                />
              </Link>
            ) : (
              <button type="button" onClick={openTiRoule} className={ctaClasses} style={ctaStyle}>
                {cta}
                <ArrowRight
                  size={16}
                  className="transition-transform duration-300 group-hover:translate-x-1"
                />
              </button>
            )}
          </div>

          {reassurance && (
            <p
              className="mt-4 font-dm text-[12px]"
              style={{ color: "var(--cur-faint)" }}
            >
              {reassurance}
            </p>
          )}
        </div>
      </Reveal>
    </section>
  );
}
