"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
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
 * Everything above this point is photography. This is deliberately quiet: a
 * numeral, a serif question, two lines, a byline. It gives the page a breath
 * before the concierge invitation, and it is the section that does the most for
 * decision fatigue — each note answers a question the reader was going to have
 * to work out for themselves.
 *
 * The byline is not decoration. "3 places we'd take a first-time visitor" is a
 * recommendation only if somebody is standing behind it; unsigned, it is a
 * listicle.
 */
export default function EditorNotes({
  id,
  title,
  subtitle,
  notes,
}: {
  id: string;
  title?: string;
  subtitle?: string;
  notes: EditorNote[];
}) {
  const { language } = useLanguage();
  const live = notes.filter((n) => n.enabled !== false);
  if (!live.length) return null;

  return (
    <section id={id} className="mx-auto w-full max-w-6xl scroll-mt-24 px-5 lg:px-8">
      <SectionHeading title={title ?? ""} subtitle={subtitle} />

      <div className="mt-8 lg:mt-11 lg:grid lg:grid-cols-3 lg:gap-7">
        {live.map((note, i) => (
          <Reveal key={note.id} delay={Math.min(i, 3) * 80}>
            <Link
              href={note.href}
              className="group flex h-full flex-col border-t py-6 focus:outline-none focus-visible:ring-2 lg:border-t-0 lg:py-0"
              style={{ borderColor: "var(--cur-line)" }}
            >
              {note.image && (
                <span className="relative mb-4 block aspect-[16/9] w-full overflow-hidden rounded-2xl">
                  <Image
                    src={note.image}
                    alt=""
                    fill
                    loading="lazy"
                    sizes="(max-width: 1024px) 92vw, 340px"
                    className="object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                    unoptimized={unopt(note.image)}
                  />
                </span>
              )}

              <span
                className="rr-cur-eyebrow text-[10px]"
                style={{ color: "var(--cur-faint)" }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>

              <h3
                className="rr-cur-display mt-2 text-[clamp(1.3rem,4.6vw,1.6rem)]"
                style={{ color: "var(--cur-ivory)" }}
              >
                {locT(language, note.title)}
              </h3>

              <p
                className="mt-2.5 font-dm text-[13.5px] leading-relaxed"
                style={{ color: "var(--cur-dim)" }}
              >
                {locT(language, note.body)}
              </p>

              <span className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span
                  className="inline-flex items-center gap-1.5 font-dm text-[12.5px] font-medium"
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
                    className="font-dm text-[11.5px] italic"
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
