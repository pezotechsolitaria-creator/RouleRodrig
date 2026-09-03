"use client";

import { useExperienceWorld } from "@/context/ExperienceWorldContext";
import { useLanguage } from "@/context/LanguageContext";
import { otherWorld, WORLD_COPY, WORLD_PAGE } from "@/lib/worlds";
import WorldSwitchHint, {
  markWorldHintSeen,
} from "@/components/world/WorldSwitchHint";

// ── CHANGE YOUR RODRIGUES ───────────────────────────────────────────────────
//
// Not a settings row. The brief is explicit that this must be discoverable
// without competing with the main navigation, and the difference is in what it
// SAYS: a settings control names a property ("Theme: dark"), whereas this names
// a destination — the world you are not in.
//
// It is a toggle rather than a menu because there are exactly two worlds. A
// select with two options is a button that takes an extra tap.

export default function WorldSwitcher({
  /** Extra classes for the button itself. */
  className = "",
  /** Render the surrounding strip. Off when embedding into an existing row. */
  strip = true,
}: { className?: string; strip?: boolean }) {
  const { world, ready, choose } = useExperienceWorld();
  const { language } = useLanguage();

  // `world` is never null once ready — everyone starts in Authentic since the
  // gateway was removed. The null branch stays as a type guard rather than as
  // a behaviour: this control is now the ONLY way to reach Curated, so it
  // hiding itself would strand the whole world behind nothing.
  if (!ready || world === null) return null;

  const next = otherWorld(world);
  const copy = WORLD_COPY[next];
  const label =
    language === "fr" ? "Changez votre Rodrigues"
    : language === "cr" ? "Sanz ou Rodrigues"
    : "Change your Rodrigues";

  const here = WORLD_COPY[world];

  // ── A DOOR, NOT A SETTING ────────────────────────────────────────────────
  // The first version was a bordered chip reading "CHANGE YOUR RODRIGUES
  // CURATED →" — a settings row wearing a serif. Two problems: it announced the
  // mechanism rather than the destination, and it gave equal weight to the
  // world you are in and the one you are not.
  //
  // This shows the WORLD YOU ARE IN as the subject, with the other offered
  // quietly beside it — the way a good masthead names the section you are
  // reading. The accent comes from the live world token, so the control is
  // painted by whichever world owns the page rather than by a fixed gold.
  const button = (
    <button
      type="button"
      // ── A FULL LOAD, NOT A CLIENT NAVIGATION ──────────────────────────
      // This used `router.push`, and the owner's report was that the switch
      // "stops working" on every inner page. It did, and the cause is the
      // App Router's prefetch cache meeting a conditional redirect:
      //
      //   · "/" is redirected to /curated by middleware for a Curated visitor;
      //   · every inner page carries <Link href="/"> — the brand mark in the
      //     header, the Home tab in the bottom nav — which Next prefetches on
      //     sight;
      //   · that prefetch is made while the cookie still says CURATED, so it
      //     comes back as the curated page and is cached under the key "/";
      //   · pressing AUTHENTIC then pushes "/" and is served that cache. You
      //     land back where you started, and the button looks dead.
      //
      // No amount of prefetch tuning fixes it, because the poisoned entry is
      // written by links this component does not own. A document load bypasses
      // the router cache entirely, and it is the honest thing for this control
      // anyway: a world change swaps the theme, the palette, the layout and the
      // page. Both destinations are statically cached, so it is one fast hop.
      onClick={() => {
        // Somebody who presses this has understood it. Recording that here as
        // well as on dismissal means the hint never greets a visitor who
        // already found the door on their own.
        markWorldHintSeen();
        choose(next);
        window.location.assign(WORLD_PAGE[next]);
      }}
      aria-label={`${label} — ${copy.eyebrow} ${copy.name}`}
      className={`group relative inline-flex min-h-11 items-center gap-2.5 rounded-full px-3.5 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rr-world-accent,#F5C842)]/60 ${className}`}
      style={{
        border: "1px solid var(--rr-world-line, rgba(255,255,255,0.12))",
        background: "color-mix(in srgb, var(--rr-world-accent, #F5C842) 7%, transparent)",
      }}
    >
      {/* WHERE YOU ARE. The world names itself, in its own accent. */}
      <span
        className="font-bebas text-[13px] leading-none tracking-[0.26em]"
        style={{ color: "var(--rr-world-accent, #F5C842)" }}
      >
        {here.eyebrow}
      </span>

      {/* The hairline that separates the two halves — the visual equivalent of
          the word "or", without spending a word on it.

          BOTH the hairline and the destination half hide below 390px. At a
          measured 375px the full pill (≈187px) pushed the header's last icon
          to 406.9px — the account button was clipped off-screen with no
          scroll affordance. The pill stays a working switcher (its aria-label
          names both worlds); what it gives up on a small phone is only the
          preview of the OTHER world, not the control. */}
      <span
        aria-hidden
        className="hidden h-3.5 w-px min-[390px]:block"
        style={{ background: "var(--rr-world-line, rgba(255,255,255,0.18))" }}
      />

      {/* WHERE YOU COULD GO. Quieter, and it brightens on approach so the
          control reveals that it is a door rather than a label. */}
      <span className="hidden items-center gap-1 font-dm text-[10.5px] font-semibold leading-none text-muted transition-colors group-hover:text-offwhite min-[390px]:flex">
        {copy.eyebrow}
        <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
      </span>
    </button>
  );

  // The strip belongs to this component, not to its caller. A caller that
  // wrapped it in a bordered row would draw that border for first-time
  // visitors too — an empty bar above the fold, before any world exists.
  // Whatever decides to render nothing has to own everything that would
  // otherwise be left behind.
  // ── A FRAGMENT, NOT A WRAPPER ────────────────────────────────────────────
  // This was a <span className="relative inline-flex">, added to anchor the
  // hint. It moved the pill, and the owner spotted it immediately.
  //
  // The caller's className is positioning — "mx-auto" on the homepage header,
  // "mr-auto" on the inner-page header — and it is applied to the BUTTON. Those
  // margins only do anything while the button is the direct flex child of the
  // header row. The wrapper took that place, so mx-auto stopped centring
  // anything and the switcher slid out of position on every page carrying it.
  //
  // The hint is position:fixed and never needed an anchor. A fragment adds no
  // element, so the button is the flex child again and the header is exactly
  // what it was.
  const anchored = (
    <>
      {button}
      <WorldSwitchHint other={next} />
    </>
  );

  if (!strip) return anchored;
  return (
    <div className="flex justify-center border-t border-white/10 px-4 py-2">
      {anchored}
    </div>
  );
}
