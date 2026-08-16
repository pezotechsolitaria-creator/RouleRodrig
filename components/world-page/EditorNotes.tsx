"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ChevronRight } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { locT, type EditorNote } from "@/lib/world-docs/types";
import SectionHeading from "./SectionHeading";
import Reveal from "./Reveal";

const unopt = (src: string) =>
  src.startsWith("/uploads/") || (src.startsWith("http") && !src.includes("supabase.co"));

/**
 * From our local editors.
 *
 * ── THE ONE TEXT-LED SECTION ──────────────────────────────────────────────
 * Everything above this point is photography. This is deliberately quiet, and
 * it is the section that does most for decision fatigue: each note answers a
 * question the reader was otherwise going to have to work out for themselves.
 *
 * The byline is not decoration. "3 places we'd take a first-time visitor" is a
 * recommendation only if somebody is standing behind it; unsigned, it is a
 * listicle.
 *
 * ── A LIST ON A PHONE, A SPREAD ON A DESKTOP ──────────────────────────────
 * As three stacked blocks with a numeral, a heading, two lines and a CTA each,
 * this cost 670px to carry about forty words. A phone reads three of anything
 * as a LIST — one tap target per row, the question doing the work — so that is
 * what it is now, and the numeral and the byline that made it feel authored are
 * kept rather than the padding that did not. The desktop columns survive
 * untouched; they were never the problem.
 */
export default function EditorNotes({
  id,
  title,
  subtitle,
  seeAll,
  notes,
}: {
  id: string;
  title?: string;
  subtitle?: string;
  seeAll?: string;
  notes: EditorNote[];
}) {
  const { language } = useLanguage();
  const live = notes.filter((n) => n.enabled !== false);
  if (!live.length) return null;

  return (
    <section id={id} className="mx-auto w-full max-w-6xl scroll-mt-20 px-5 lg:px-8">
      <SectionHeading title={title ?? ""} subtitle={subtitle} seeAll={seeAll} />

      {/* ── Phone: a list ── */}
      <div
        className="mt-4 overflow-hidden rounded-2xl lg:hidden"
        style={{ border: "1px solid var(--cur-line)", backgroundColor: "var(--cur-bg-card)" }}
      >
        {live.map((note, i) => (
          <Reveal key={note.id} delay={Math.min(i, 3) * 50}>
            <Link
              href={note.href}
              className="flex items-center gap-3 px-3.5 py-3 focus:outline-none focus-visible:bg-white/[0.04]"
              style={i > 0 ? { borderTop: "1px solid var(--cur-line)" } : undefined}
            >
              <span
                className="rr-cur-eyebrow shrink-0 text-[10px]"
                style={{ color: "var(--cur-faint)" }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className="rr-cur-display block text-[1.05rem] leading-tight"
                  style={{ color: "var(--cur-ivory)" }}
                >
                  {locT(language, note.title)}
                </span>
                <span
                  className="mt-0.5 line-clamp-1 block font-dm text-[11.5px]"
                  style={{ color: "var(--cur-dim)" }}
                >
                  {locT(language, note.body)}
                </span>
              </span>
              <ChevronRight size={15} className="shrink-0" style={{ color: "var(--cur-copper)" }} />
            </Link>
          </Reveal>
        ))}
      </div>

      {/* ── Desktop: a spread ── */}
      <div className="mt-8 hidden lg:grid lg:grid-cols-3 lg:gap-7">
        {live.map((note, i) => (
          <Reveal key={note.id} delay={Math.min(i, 3) * 70}>
            <Link href={note.href} className="group flex h-full flex-col focus:outline-none focus-visible:ring-2">
              {note.image && (
                <span className="relative mb-4 block aspect-[16/9] w-full overflow-hidden rounded-2xl">
                  <Image
                    src={note.image}
                    alt=""
                    fill
                    loading="lazy"
                    sizes="340px"
                    className="object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                    unoptimized={unopt(note.image)}
                  />
                </span>
              )}

              <span className="rr-cur-eyebrow text-[10px]" style={{ color: "var(--cur-faint)" }}>
                {String(i + 1).padStart(2, "0")}
              </span>

              <h3
                className="rr-cur-display mt-1.5 text-[1.5rem]"
                style={{ color: "var(--cur-ivory)" }}
              >
                {locT(language, note.title)}
              </h3>

              <p
                className="mt-2 line-clamp-2 font-dm text-[13px] leading-relaxed"
                style={{ color: "var(--cur-dim)" }}
              >
                {locT(language, note.body)}
              </p>

              <span className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span
                  className="inline-flex items-center gap-1.5 font-dm text-[12px] font-medium"
                  style={{ color: "var(--cur-champagne)" }}
                >
                  {locT(language, note.ctaLabel) ||
                    (language === "fr" ? "Lire" : language === "cr" ? "Lir" : "Read")}
                  <ArrowRight
                    size={13}
                    className="transition-transform duration-300 group-hover:translate-x-1"
                  />
                </span>
                {note.byline && (
                  <span
                    className="font-dm text-[11px] italic"
                    style={{ color: "var(--cur-faint)" }}
                  >
                    — {locT(language, note.byline)}
                  </span>
                )}
              </span>
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
