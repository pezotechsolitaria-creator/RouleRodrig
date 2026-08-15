"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Sun, Moon, ArrowRight } from "lucide-react";
import type { RecommendedPlace } from "@/lib/defaults";
import { defaultMode, matchesMode, type Mode } from "@/lib/time-of-day";
import {
  availableCategories, categoryLabel, EXPERIENCE_CATEGORIES, inCategory,
} from "@/lib/experience-categories";
import { matchesFilter } from "@/lib/experiences";
import { useLanguage } from "@/context/LanguageContext";
import { loc } from "@/lib/localize";
import AutoPhotos from "@/components/AutoPhotos";

// ── The Experiences hub ─────────────────────────────────────────────────────
//
// Everything the owner has listed as an experience, in one place: massages,
// charters, sea trips, hiking guides, tours. The per-vertical pages
// (/experiences/fishing and friends) still exist and still own their search
// intent — this is the door a visitor comes through when they do not yet know
// which of those they want.
//
// ── DAY AND NIGHT DRIVE BOTH THINGS ─────────────────────────────────────────
// Pressing Day shows the daytime activities AND lights the page. Pressing
// Night shows the after-dark ones AND darkens it. The owner's instruction, and
// it is the right one: the mode is not a filter with a decorative skin, it is
// the difference between two ways of being on this island.
//
// ── WHY THE THEME IS SCOPED TO THIS PAGE ────────────────────────────────────
// The palette here is declared as CSS custom properties on THIS component's
// own wrapper, not on <html>. A site-wide light theme was attempted and it
// broke: Tailwind v4's `@theme inline` bakes literal colours into utilities, so
// `bg-dark` cannot be re-pointed at runtime, and the half-converted result put
// white text on a light ground. Scoping it here means the surrounding site is
// untouched by construction — this page cannot make the rest of the app
// unreadable, whatever it does.
//
// Everything below therefore paints from var(--x) rather than from bg-dark /
// text-offwhite. That is deliberate and should stay that way.

// The owner's palettes, verbatim. Dark is the site's existing near-black and
// gold; light is the tropical daylight system specified alongside it. They are
// a PAIR — the accent is gold in both, darkened for light because #F5C842 on
// #F8F9FA is 1.7:1 and unreadable as a text colour, while #D4A017 clears AA.
const PALETTE: Record<Mode, Record<string, string>> = {
  day: {
    "--x-canvas": "#F8F9FA",   // background (main)
    "--x-surface": "#FFFFFF",  // surface / cards
    "--x-surface-2": "#F1F3F5",// surface secondary
    "--x-line": "#E5E7EB",     // borders / dividers
    "--x-ink": "#1A1A1A",      // primary text
    "--x-muted": "#6B7280",    // secondary / muted text
    "--x-accent": "#D4A017",   // accent / brand — gold, kept
    "--x-accent-hover": "#B8860B",
    "--x-accent-ink": "#1A1A1A",
    "--x-icon-idle": "#9CA3AF",
    "--x-success": "#059669",
    "--x-error": "#DC2626",
  },
  night: {
    "--x-canvas": "#0a0a0a",
    "--x-surface": "#111111",
    "--x-surface-2": "#161616",
    "--x-line": "#222222",
    "--x-ink": "#F5F5F0",
    "--x-muted": "#888888",
    "--x-accent": "#F5C842",
    "--x-accent-hover": "#d4a800",
    "--x-accent-ink": "#0a0a0a",
    "--x-icon-idle": "#6B7280",
    "--x-success": "#34D399",
    "--x-error": "#F87171",
  },
};

/** The owner's chosen length for the dusk sequence. */
const DUSK_MS = 1200;

export default function ExperiencesHub({ places }: { places: RecommendedPlace[] }) {
  const { language } = useLanguage();
  const fr = language === "fr";
  const [mode, setMode] = useState<Mode>(() => defaultMode());
  const [active, setActive] = useState<string | null>(null);
  // 0 = fully day, 1 = fully night. Drives the dusk overlay only; the palette
  // itself swaps at the midpoint so text never sits mid-fade against a ground
  // it does not match.
  const [t, setT] = useState(() => (defaultMode() === "night" ? 1 : 0));
  const raf = useRef<number | null>(null);

  const inMode = useMemo(
    () => places.filter((p) => matchesMode(p.timeOfDay, mode)),
    [places, mode],
  );
  const cats = useMemo(() => availableCategories(inMode, matchesFilter), [inMode]);
  const shown = useMemo(
    () => (active ? inMode.filter((p) => inCategory(p, active, matchesFilter)) : inMode),
    [inMode, active],
  );

  // Counted across the whole catalogue, so the number answers "is there
  // anything at night at all" rather than shifting when a chip is pressed.
  const counts = useMemo(
    () => ({
      day: places.filter((p) => matchesMode(p.timeOfDay, "day")).length,
      night: places.filter((p) => matchesMode(p.timeOfDay, "night")).length,
    }),
    [places],
  );

  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); }, []);

  function go(next: Mode) {
    if (next === mode) return;
    setActive(null);
    const from = t;
    const to = next === "night" ? 1 : 0;
    const started = performance.now();
    let flipped = false;
    if (raf.current) cancelAnimationFrame(raf.current);

    const step = (now: number) => {
      const p = Math.min(1, (now - started) / DUSK_MS);
      // easeInOutCubic — the light leaves slowly, then commits.
      const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      const v = from + (to - from) * e;
      setT(v);
      // Swap the palette once the sky has actually turned, so the interface
      // settles INTO the new mode rather than announcing it up front.
      if (!flipped && ((to === 1 && v > 0.55) || (to === 0 && v < 0.45))) {
        flipped = true;
        setMode(next);
      }
      if (p < 1) raf.current = requestAnimationFrame(step);
      else setMode(next);
    };
    raf.current = requestAnimationFrame(step);
  }

  const L = (en: string, f: string) => (fr ? f : en);

  return (
    <div
      style={PALETTE[mode] as React.CSSProperties}
      className="min-h-screen"
    >
      {/* The ground. Painted from the scoped variables, so this page carries
          its own light without the rest of the site knowing. */}
      <div style={{ background: "var(--x-canvas)", color: "var(--x-ink)" }} className="min-h-screen">
        {/* ── The dusk sequence ────────────────────────────────────────────
            1200ms, and it plays for everyone — the owner asked for no
            reduced-motion variant. It is a background crossfade with no
            parallax, spin or scroll-coupling, which is the mildest class of
            motion; it never blocks the tap, because the list underneath is
            already filtered before the first frame. */}
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
          <div
            className="absolute inset-0"
            style={{
              opacity: 1 - t,
              background:
                "linear-gradient(180deg,#7FC4E8 0%,#CFE9F5 45%,#FFE9C2 72%,#F8F9FA 100%)",
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              opacity: t,
              background:
                "linear-gradient(180deg,#0A1330 0%,#1A1030 45%,#2A1608 72%,#0a0a0a 100%)",
            }}
          />
          {/* The horizon burn, strongest mid-transition — this is the beat
              that reads as "sunset" rather than "a fade". */}
          <div
            className="absolute inset-0"
            style={{
              opacity: Math.sin(Math.PI * t) * 0.55,
              background:
                "radial-gradient(90% 45% at 50% 104%, rgba(255,138,60,0.55), transparent 62%)",
            }}
          />
          {/* Whatever the sky is doing, the page has to stay readable, so the
              canvas sits over it at almost full strength. */}
          <div className="absolute inset-0" style={{ background: "var(--x-canvas)", opacity: 0.93 }} />
        </div>

        <div className="relative z-10 mx-auto max-w-5xl px-5 pb-28 pt-10">
          <p
            className="font-bebas text-xs tracking-[0.3em]"
            style={{ color: "var(--x-accent)" }}
          >
            {L("EXPERIENCES", "EXPÉRIENCES")}
          </p>
          <h1 className="mt-3 font-syne text-4xl font-extrabold leading-tight md:text-5xl">
            {mode === "day"
              ? L("Rodrigues under the sun", "Rodrigues sous le soleil")
              : L("Rodrigues after dark", "Rodrigues après la nuit")}
          </h1>
          <p className="mt-3 max-w-2xl font-dm leading-relaxed" style={{ color: "var(--x-muted)" }}>
            {mode === "day"
              ? L(
                  "The lagoon, the ridges and the kitchens — everything this island does between sunrise and sunset.",
                  "Le lagon, les crêtes et les cuisines — tout ce que l'île offre du lever au coucher du soleil.",
                )
              : L(
                  "Sunset trips, night fishing and the quiet hours — what Rodrigues becomes once the light goes.",
                  "Sorties au coucher du soleil, pêche de nuit et heures calmes — Rodrigues une fois la lumière partie.",
                )}
          </p>

          {/* ── The switch ─────────────────────────────────────────────── */}
          <div
            role="group"
            aria-label={L("Day or night", "Jour ou nuit")}
            className="mt-7 flex w-full gap-1 rounded-2xl p-1"
            style={{ background: "var(--x-surface)", border: "1px solid var(--x-line)" }}
          >
            {([
              { key: "day" as const, icon: Sun, label: L("Day", "Jour"), n: counts.day },
              { key: "night" as const, icon: Moon, label: L("Night", "Nuit"), n: counts.night },
            ]).map((o) => {
              const on = mode === o.key;
              return (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => go(o.key)}
                  aria-pressed={on}
                  disabled={o.n === 0}
                  className="flex min-h-[54px] flex-1 items-center justify-center gap-2 rounded-xl px-4 font-syne text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                  style={
                    on
                      ? { background: "var(--x-accent)", color: "var(--x-accent-ink)" }
                      : { color: "var(--x-muted)" }
                  }
                >
                  <o.icon size={17} className="shrink-0" />
                  {o.label}
                  <span className="font-dm text-xs font-normal opacity-75">{o.n}</span>
                </button>
              );
            })}
          </div>

          {/* Category chips, within the mode. */}
          {cats.length > 0 && (
            <div className="mt-4 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <Chip on={active === null} onClick={() => setActive(null)}>
                {L("All", "Tout")}
              </Chip>
              {cats.map((k) => {
                const c = EXPERIENCE_CATEGORIES.find((x) => x.key === k);
                return (
                  <Chip key={k} on={active === k} onClick={() => setActive(active === k ? null : k)}>
                    {c?.emoji} {categoryLabel(k, language)}
                  </Chip>
                );
              })}
            </div>
          )}

          {shown.length === 0 ? (
            <p
              className="mt-10 rounded-2xl p-6 font-dm text-sm"
              style={{ background: "var(--x-surface)", border: "1px solid var(--x-line)", color: "var(--x-muted)" }}
            >
              {mode === "night"
                ? L(
                    "Nothing is listed after dark yet. Try Day — the island is busiest in daylight.",
                    "Rien n'est encore proposé la nuit. Essayez Jour.",
                  )
                : L("Nothing listed yet.", "Rien pour le moment.")}
            </p>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((p, i) => (
                <Card key={p.id} place={p} index={i} language={language} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="shrink-0 rounded-full px-3.5 py-2 font-dm text-xs font-medium transition-colors"
      style={
        on
          ? { background: "var(--x-accent)", color: "var(--x-accent-ink)" }
          : { border: "1px solid var(--x-line)", color: "var(--x-muted)", background: "var(--x-surface)" }
      }
    >
      {children}
    </button>
  );
}

function Card({ place, index, language }: { place: RecommendedPlace; index: number; language: string }) {
  // RecommendedPlace has no translated NAME — only the description is
  // localised — so the name is used as the owner typed it.
  const name = place.name.trim();
  const blurb = loc(language as never, place.description, place.descriptionFr, place.descriptionCr).trim();
  const cover = place.image || place.images?.[0];
  // Every experience already has a home — its vertical marketplace, or the
  // activities list. The hub is a doorway, not a second detail page.
  const href = place.serviceType ? `/experiences/${place.serviceType}` : "/browse/activities";

  return (
    <Link
      href={href}
      className="group flex flex-col overflow-hidden rounded-2xl transition-transform hover:-translate-y-0.5"
      style={{ background: "var(--x-surface)", border: "1px solid var(--x-line)" }}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden" style={{ background: "var(--x-line)" }}>
        {cover && (
          <AutoPhotos
            images={[place.image, ...(place.images ?? [])]}
            alt={name}
            sizes="(max-width:640px) 100vw, 340px"
            stagger={index}
          />
        )}
        {place.timeOfDay === "night" && (
          <span
            className="absolute right-2 top-2 rounded-full px-2 py-1 font-bebas text-[10px] tracking-[0.15em]"
            style={{ background: "var(--x-canvas)", color: "var(--x-ink)" }}
          >
            AFTER DARK
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h2 className="font-syne text-base font-bold">{name}</h2>
        {blurb && (
          <p className="mt-1 line-clamp-2 font-dm text-xs leading-relaxed" style={{ color: "var(--x-muted)" }}>
            {blurb}
          </p>
        )}
        <span
          className="mt-auto inline-flex items-center gap-1.5 pt-3 font-dm text-xs font-semibold"
          style={{ color: "var(--x-accent)" }}
        >
          {place.priceNote?.trim() || "See more"} <ArrowRight size={13} />
        </span>
      </div>
    </Link>
  );
}
