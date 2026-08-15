"use client";

import { useEffect, useMemo, useState } from "react";
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
import DuskSequence, { useDusk } from "@/components/DuskSequence";

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
  // Day is the BLUE world, not a white one — the same near-black island in a
  // different light. A white canvas was tried here and rejected on sight, and
  // it also made the photography look washed out, which is most of this page.
  day: {
    "--x-canvas": "#0a0a0a",
    "--x-surface": "#111111",
    "--x-surface-2": "#161616",
    "--x-line": "#222222",
    "--x-ink": "#F5F5F0",
    "--x-muted": "#888888",
    "--x-accent": "#2F80ED",
    "--x-accent-hover": "#5C9CF0",
    "--x-accent-ink": "#FFFFFF",
    "--x-icon-idle": "#6B7280",
    "--x-success": "#34D399",
    "--x-error": "#F87171",
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

export default function ExperiencesHub({ places }: { places: RecommendedPlace[] }) {
  const { language } = useLanguage();
  const fr = language === "fr";
  // ── A STABLE FIRST RENDER, THEN THE ISLAND CLOCK ──────────────────────────
  // This used to initialise from defaultMode() directly, which reads the
  // clock — so the server could render "day" and the client "night" (or either
  // side of the 18:00 boundary), the markup disagreed, and React failed to
  // hydrate. A failed hydration attaches NO event handlers, so the switch
  // rendered perfectly and did nothing at all when pressed.
  //
  // So both sides render "day" — a fixed, agreed starting point — and the real
  // mode is applied in an effect once only the client is running.
  const [mode, setMode] = useState<Mode>("day");
  const [active, setActive] = useState<string | null>(null);
  // The sunset itself lives in components/DuskSequence now, because More plays
  // it too and a cinematic that differs per screen is not a signature. t is
  // 0 = fully day, 1 = fully night; sweep drives only the overlay's visibility.
  const { run, play, jump, clear } = useDusk();

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

  // Correct to the island's actual time after mount. No animation: nobody
  // asked for a transition they did not trigger, and a page that dusks itself
  // on arrival is a page that fought you before you touched it.
  useEffect(() => {
    const real = defaultMode();
    // Reading the clock during render is precisely what broke this component
    // before: server and client disagreed across the 18:00 boundary, hydration
    // failed, and a failed hydration attaches no handlers — so the switch
    // rendered and did nothing. One extra render is the price of it working.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (real === "night") { setMode("night"); jump("night"); }
  }, [jump]);

  function go(next: Mode) {
    if (next === mode) return;
    setActive(null);

    // ── THE CONTENT CHANGES FIRST, ALWAYS ────────────────────────────────
    // The mode used to be set from inside the requestAnimationFrame loop, so
    // the listing and the palette only changed if the animation ran. In a
    // backgrounded tab rAF is suspended — and it never fires at all in a
    // browser pane that is not compositing — so the switch rendered, accepted
    // the press, and did nothing. Pressing Night has to mean "show me the
    // night" whether or not there is a sunset to watch.
    //
    // So the mode commits immediately and the animation is decoration over the
    // top of an already-correct page.
    setMode(next);
    play(next);
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
            reduced-motion variant. Its colours are literals no theme can
            reach, and it is the same component the Appearance control in
            More plays, so the sunset is one thing the whole site shares. */}
        <DuskSequence run={run} onDone={clear} />

        <div className="relative z-10 mx-auto max-w-5xl px-5 pb-28 pt-6">
          <p
            className="font-bebas text-xs tracking-[0.3em]"
            style={{ color: "var(--x-accent)" }}
          >
            {L("EXPERIENCES", "EXPÉRIENCES")}
          </p>
          <h1 className="mt-1.5 font-syne text-2xl font-extrabold leading-tight md:text-3xl">
            {mode === "day"
              ? L("Rodrigues under the sun", "Rodrigues sous le soleil")
              : L("Rodrigues after dark", "Rodrigues après la nuit")}
          </h1>
          <p className="mt-1.5 max-w-2xl font-dm text-sm leading-snug" style={{ color: "var(--x-muted)" }}>
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
            className="mt-4 flex w-full gap-1 rounded-2xl p-1"
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
                  className="flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-xl px-4 font-syne text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
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
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
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
      <div className="relative aspect-square w-full overflow-hidden" style={{ background: "var(--x-line)" }}>
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
