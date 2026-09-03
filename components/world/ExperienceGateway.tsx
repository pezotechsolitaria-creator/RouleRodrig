"use client";

import { useEffect, useState } from "react";
import { useExperienceWorld } from "@/context/ExperienceWorldContext";
import { useLanguage } from "@/context/LanguageContext";
import { WORLD_COPY, WORLDS, type World } from "@/lib/worlds";

// ── NOT CURRENTLY MOUNTED ───────────────────────────────────────────────────
// Removed from app/layout.tsx on the owner's instruction. A full-screen
// question in front of the homepage taxes every visitor — including the one who
// came to rent a scooter — to serve a preference most of them do not have yet.
// Everyone now starts in Authentic and discovers Curated from the switcher in
// the header, which is the right order: see the island first, be offered the
// other way of seeing it second.
//
// Kept rather than deleted because it is finished, tested against its own
// failure modes, and the obvious thing to reach for if a first-run moment is
// ever wanted again — a seasonal splash, or an entry point from a campaign
// link. Nothing imports it today; mounting it is a deliberate act.
//
// NOTE: branding.gatewayAuthenticImage / gatewayCuratedImage in /admin feed
// ONLY this component, so those two uploaders currently control nothing that
// renders. They are worth removing if the gateway is not coming back.
//
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

// ── EACH SIDE IS ALREADY ITS OWN WORLD ──────────────────────────────────────
// The gateway is the only moment a visitor sees both worlds at once, so it is
// the only place the difference can be SHOWN rather than described. Two
// identical panels with different words would be a menu; the choice has to look
// like a choice before either label is read.
//
// Authentic is warm — sunlit, sand and terracotta, the photograph left bright
// and open. Curated is cool and held back — near-black, desaturated, bronze,
// far more negative space and much wider letter-spacing. The brief's two visual
// systems, compressed into one screen.
const SKIN: Record<World, {
  position: string;
  /** Colour laid over the photograph, so the two grounds read differently. */
  wash: string;
  /** Bottom-up scrim; Curated's is deeper because its world is darker. */
  scrim: string;
  accent: string;
  /** Curated is restrained; Authentic is open and warm. */
  filter: string;
  dimmedFilter: string;
  tracking: string;
}> = {
  authentic: {
    position: "center 55%",
    wash: "linear-gradient(180deg, rgba(196,120,64,0.20) 0%, rgba(120,66,40,0.30) 100%)",
    scrim:
      "linear-gradient(180deg, rgba(28,18,12,0.10) 0%, rgba(28,18,12,0.34) 48%, rgba(24,15,10,0.90) 100%)",
    accent: "#F0D9B5",
    filter: "brightness(0.78) saturate(1.12)",
    dimmedFilter: "brightness(0.46) saturate(0.85)",
    tracking: "0.30em",
  },
  curated: {
    position: "center 45%",
    wash: "linear-gradient(180deg, rgba(11,11,11,0.30) 0%, rgba(11,11,11,0.55) 100%)",
    scrim:
      "linear-gradient(180deg, rgba(11,11,11,0.32) 0%, rgba(11,11,11,0.58) 45%, rgba(11,11,11,0.96) 100%)",
    accent: "#C9A227",
    filter: "brightness(0.56) saturate(0.62) contrast(1.06)",
    dimmedFilter: "brightness(0.34) saturate(0.45)",
    tracking: "0.52em",
  },
};

export default function ExperienceGateway({
  images,
}: {
  /** Admin-supplied cover for each world. Either may be absent. */
  images?: Partial<Record<World, string | undefined>>;
}) {
  const { t } = useLanguage();
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
      aria-label={t.common.chooseExperience}
      className="fixed inset-0 z-[80] flex flex-col md:flex-row"
      style={{ background: "#0B0B0B" }}
    >
      {WORLDS.map((w) => {
        const copy = WORLD_COPY[w];
        const isOther = hovered !== null && hovered !== w;
        const skin = SKIN[w];
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
                backgroundPosition: skin.position,
                // The recede is light and slow: the far side dims and pulls
                // back a little rather than disappearing.
                transform: hovered === w ? "scale(1.06)" : "scale(1.01)",
                filter: isOther ? skin.dimmedFilter : skin.filter,
                transition: "transform 900ms cubic-bezier(0.22,0.61,0.36,1), filter 600ms ease",
              }}
            />
            {/* A floor for the type, so a headline never lands on a bright
                patch of sky and vanishes. */}
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                background: skin.wash,
              }}
            />
            <div aria-hidden className="absolute inset-0" style={{ background: skin.scrim }} />

            <div className={`relative flex h-full flex-col justify-end ${w === "curated" ? "p-8 md:p-16" : "p-7 md:p-12"}`}>
              <p
                className="font-bebas text-xs"
                style={{ color: skin.accent, letterSpacing: skin.tracking }}
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
                  borderColor: hovered === w ? skin.accent : "rgba(255,255,255,0.34)",
                  background: hovered === w ? "rgba(255,255,255,0.12)" : "transparent",
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
