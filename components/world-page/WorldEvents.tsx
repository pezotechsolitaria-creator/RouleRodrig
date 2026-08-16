"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Ticket } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { centsToDecimalString } from "@/lib/money";
import type { PromoEvent } from "@/components/EventsPromo";
import SectionHeading from "./SectionHeading";
import Reveal from "./Reveal";

const unopt = (src: string) =>
  src.startsWith("/uploads/") || (src.startsWith("http") && !src.includes("supabase.co"));

function when(iso: string, locale: string) {
  const d = new Date(iso);
  return {
    day: d.toLocaleDateString(locale, { day: "numeric", timeZone: "Indian/Mauritius" }),
    month: d
      .toLocaleDateString(locale, { month: "short", timeZone: "Indian/Mauritius" })
      .replace(".", "")
      .toUpperCase(),
  };
}

/**
 * What is on.
 *
 * ── IT SELLS, IT DOES NOT LIST ────────────────────────────────────────────
 * The one thing an events section has to say is that the ticket is BOUGHT
 * here — not on a poster with a phone number. So every card carries the date,
 * the venue, the price it starts from, and the word "tickets". A visitor who
 * does not already know this platform sells them reads a listings page and
 * never taps it.
 *
 * ── AND IT DISAPPEARS ─────────────────────────────────────────────────────
 * Nothing renders when there is no upcoming event. An empty "What's on"
 * heading is worse than no section: it advertises that the island has nothing
 * happening, on a page whose whole job is to say the opposite.
 */
export default function WorldEvents({
  id,
  title,
  subtitle,
  seeAll,
  events,
}: {
  id: string;
  title?: string;
  subtitle?: string;
  seeAll?: string;
  events: PromoEvent[];
}) {
  const { language } = useLanguage();
  if (!events.length) return null;
  const locale = language === "fr" ? "fr-FR" : "en-GB";

  return (
    <section id={id} className="scroll-mt-20">
      <div className="mx-auto w-full max-w-6xl px-5 lg:px-8">
        <SectionHeading title={title ?? ""} subtitle={subtitle} seeAll={seeAll ?? "/events"} />
      </div>

      <div className="mx-auto max-w-6xl">
        <div className="rr-cur-rail mt-4 flex gap-2.5 overflow-x-auto px-5 pb-2 lg:mt-6 lg:grid lg:grid-cols-3 lg:gap-4 lg:overflow-visible lg:px-8 lg:pb-0">
          {events.map((e, i) => {
            const d = when(e.startsAt, locale);
            return (
              <Reveal
                key={e.slug}
                delay={Math.min(i, 3) * 55}
                className="w-[70vw] max-w-[17rem] shrink-0 lg:w-auto lg:max-w-none"
              >
                <Link
                  href={`/events/${e.slug}`}
                  className="rr-cur-card group relative isolate flex aspect-[5/3] flex-col justify-end overflow-hidden rounded-2xl focus:outline-none focus-visible:ring-2"
                  style={{ backgroundColor: "var(--cur-bg-raised)" }}
                >
                  {e.coverUrl ? (
                    <Image
                      src={e.coverUrl}
                      alt=""
                      fill
                      loading="lazy"
                      sizes="(max-width: 1024px) 70vw, 340px"
                      className="-z-10 object-cover"
                      unoptimized={unopt(e.coverUrl)}
                    />
                  ) : (
                    <span className="absolute inset-0 -z-10" style={{ background: "var(--cur-fallback)" }} />
                  )}
                  <span
                    className="pointer-events-none absolute inset-0 -z-10"
                    style={{
                      backgroundImage:
                        "linear-gradient(to top, rgba(8,7,6,0.95) 6%, rgba(10,8,6,0.45) 55%, rgba(8,7,6,0.25))",
                    }}
                  />

                  {/* The date, as a torn-off calendar corner. */}
                  <span
                    className="absolute left-3 top-3 flex flex-col items-center rounded-xl px-2.5 py-1.5 backdrop-blur-md"
                    style={{
                      border: "1px solid var(--cur-line-strong)",
                      backgroundColor: "rgba(10,9,8,0.55)",
                    }}
                  >
                    <span
                      className="rr-cur-display text-[1.15rem] leading-none"
                      style={{ color: "var(--cur-champagne)" }}
                    >
                      {d.day}
                    </span>
                    <span
                      className="rr-cur-eyebrow mt-0.5 text-[7.5px]"
                      style={{ color: "var(--cur-ivory)", letterSpacing: "0.16em" }}
                    >
                      {d.month}
                    </span>
                  </span>

                  {e.soldOut && (
                    <span
                      className="rr-cur-eyebrow absolute right-3 top-3 rounded-full px-2 py-0.5 text-[8px] backdrop-blur-md"
                      style={{ backgroundColor: "rgba(10,9,8,0.6)", color: "var(--cur-dim)" }}
                    >
                      {language === "fr" ? "Complet" : "Sold out"}
                    </span>
                  )}

                  <span className="relative p-3.5">
                    <span
                      className="rr-cur-display line-clamp-2 block text-[1.1rem] leading-tight"
                      style={{ color: "#FFFCF7" }}
                    >
                      {e.name}
                    </span>
                    <span className="mt-1.5 flex items-center justify-between gap-2">
                      <span
                        className="inline-flex items-center gap-1.5 font-dm text-[11px] font-medium"
                        style={{ color: "var(--cur-champagne)" }}
                      >
                        <Ticket size={12} />
                        {language === "fr" ? "Billets" : "Tickets"}
                        <ArrowRight
                          size={11}
                          className="transition-transform duration-300 group-hover:translate-x-1"
                        />
                      </span>
                      {e.fromPrice != null && !e.soldOut && (
                        <span className="truncate font-dm text-[11px]" style={{ color: "var(--cur-peach)" }}>
                          {language === "fr" ? "dès" : "from"} Rs {centsToDecimalString(e.fromPrice)}
                        </span>
                      )}
                    </span>
                  </span>
                </Link>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
