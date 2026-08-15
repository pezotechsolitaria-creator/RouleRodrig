"use client";

import { useEffect, useState } from "react";
import { useExperienceWorld } from "@/context/ExperienceWorldContext";
import { useLanguage } from "@/context/LanguageContext";
import { WORLD_COPY, WORLDS, type World } from "@/lib/worlds";

// ── THE GATEWAY ─────────────────────────────────────────────────────────────
//
// The first thing a new visitor meets. Its whole job is to make one idea land
// in about two seconds: this site lets me choose how I want to experience
// Rodrigues.
//
// ── WHY IT IS PHOTOGRAPHY AND ALMOST NO WORDS ───────────────────────────────
// The two worlds are a feeling, not a feature list. A paragraph explaining the
// difference would be read by nobody and would make the choice feel like a
// settings screen — which the brief rules out by name. Two images, two names,
// two promises, two buttons.
//
// ── THE ONE THING IT MUST NEVER DO ──────────────────────────────────────────
// Block anybody. It renders only when the provider is READY and the visitor has
// no stored world, so a returning visitor never sees it — not even for a frame,
// because `ready` gates the whole component rather than `world` alone. If
// localStorage is unreadable the choice simply cannot be remembered and the
// gateway appears again next time; nothing breaks.
//
// SEO: this mounts client-side only, so crawlers receive the homepage exactly
// as they did before. The gateway is a visitor experience, not a wall in front
// of the content, and it never changes the URL.

// ── THE PHOTOGRAPHS ARE THE OWNER'S, NOT MINE ───────────────────────────────
// The two sides carry whatever the owner has published. They are passed in
// rather than hard-coded because this is the most important image on the site
// and it must be changeable from the admin panel without a deploy — and
// because inventing content to make a design look populated is exactly what
// this project forbids.
//
// The fallback is the real OG image, which always exists. A missing photograph
// must degrade to a darker panel with legible type, never to a broken image.
const FALLBACK = "/og-image.jpg";

const POSITION: Record<World, string> = {
  authentic: "center 55%",
  curated: "center 45%",
};

export default function ExperienceGateway({
  images,
}: {
  /** Admin-supplied cover for each world. Either may be absent. */
  images?: Partial<Record<World, string | undefined>>;
}) {
  const { world, ready, choose } = useExperienceWorld();
  const { language } = useLanguage();
  const [leaving, setLeaving] = useState<World | null>(null);
  const [hovered, setHovered] = useState<World | null>(null);

  // The document should not scroll behind a full-screen gateway.
  const open = ready && world === null && leaving === null;
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!ready || world !== null) return null;

  const tri = (t: [string, string, string]) =>
    language === "fr" ? t[1] : language === "cr" ? t[2] : t[0];

  function pick(w: World) {
    // The choice commits FIRST and the exit animation plays over the top of an
    // already-correct page. Every animation on this site that gated its result
    // behind a transition ended up looking broken on a phone, where the frame
    // budget is smaller and timers are throttled.
    setLeaving(w);
    choose(w);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Choose how you want to experience Rodrigues"
      className="fixed inset-0 z-[80] flex flex-col md:flex-row"
      style={{ background: "#0B0B0B" }}
    >
      {WORLDS.map((w) => {
        const copy = WORLD_COPY[w];
        const isOther = hovered !== null && hovered !== w;
        return (
          <button
            key={w}
            type="button"
            onClick={() => pick(w)}
            onMouseEnter={() => setHovered(w)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(w)}
            onBlur={() => setHovered(null)}
            aria-label={tri(copy.cta)}
            className="group relative flex-1 overflow-hidden text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70"
            style={{
              // Hover expands the hovered side and lets the other recede. Grow
              // is on flex, which the compositor handles without reflowing the
              // photograph, and it is a restrained 1.14 rather than a lurch.
              flexGrow: hovered === null ? 1 : hovered === w ? 1.14 : 0.86,
              transition: "flex-grow 700ms cubic-bezier(0.22,0.61,0.36,1)",
            }}
          >
            <div
              aria-hidden
              className="absolute inset-0 bg-cover"
              style={{
                backgroundImage: `url(${images?.[w] || FALLBACK})`,
                backgroundPosition: POSITION[w],
                // The recede is light and slow: the far side dims and pulls
                // back a little rather than disappearing.
                transform: hovered === w ? "scale(1.06)" : "scale(1.01)",
                filter: isOther ? "brightness(0.42) saturate(0.7)" : "brightness(0.66)",
                transition: "transform 900ms cubic-bezier(0.22,0.61,0.36,1), filter 600ms ease",
              }}
            />
            {/* A floor for the type, so a headline never lands on a bright
                patch of sky and vanishes. */}
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg, rgba(11,11,11,0.15) 0%, rgba(11,11,11,0.30) 45%, rgba(11,11,11,0.88) 100%)",
              }}
            />

            <div className="relative flex h-full flex-col justify-end p-7 md:p-12">
              <p
                className="font-bebas text-xs tracking-[0.42em]"
                style={{ color: w === "curated" ? "#C9A227" : "#E8D9C0" }}
              >
                {copy.eyebrow}
              </p>
              <p className="font-syne text-[clamp(2rem,7vw,4.25rem)] font-extrabold leading-[0.92] text-white">
                {copy.name}
              </p>
              <p className="mt-3 max-w-sm font-dm text-sm text-white/85 md:text-base">
                {tri(copy.promise)}
              </p>

              <span
                className="mt-6 inline-flex w-fit items-center gap-2 rounded-full border px-5 py-3 font-dm text-[13px] font-bold text-white transition-all duration-500"
                style={{
                  borderColor: hovered === w ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.35)",
                  background: hovered === w ? "rgba(255,255,255,0.14)" : "transparent",
                }}
              >
                {tri(copy.cta)}
                <span aria-hidden>→</span>
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
