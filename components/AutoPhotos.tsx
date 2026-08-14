"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  FADE_MS, HOLD_MS, firstStepDelay, isUnoptimizedSrc, nextPhotoIndex, uniquePhotos,
} from "@/lib/photos";

// ── One photo surface, everywhere ───────────────────────────────────────────
//
// The homepage cards have cycled through their real photos since v1; every
// other card on the site showed the cover and hid the rest behind a "4 photos"
// badge. So a listing with four good photographs sold itself with one, and the
// owner's other three were only ever seen by someone who tapped through.
//
// This is that behaviour, extracted from AppHome's AutoImageCard and made
// shareable, so experiences, tours, stays, restaurants, guides and vehicles all
// present the same way rather than each card type having its own idea.
//
// ── WHAT THIS DELIBERATELY DOES NOT DO ──────────────────────────────────────
//
// It does not animate when it cannot be seen, and it does not animate when the
// visitor has asked for less motion:
//
//   • OFFSCREEN cards are paused. A browse page holds twenty of these, and
//     twenty simultaneous crossfades on a phone on battery — the primary scene
//     for this site — is real power spent compositing frames nobody is looking
//     at. Same reasoning as the paused logo cube in AppHome.
//   • `prefers-reduced-motion` stops the cycling entirely and shows the cover.
//     A grid where every tile changes on its own is precisely the kind of
//     unrequested motion that setting exists to switch off.
//   • Each card starts at a different point in the cycle. Without that, a grid
//     mounted in one render flips in perfect lockstep, which reads as a glitch
//     rather than as photographs.
//
// A single-image listing renders exactly one <Image> and starts no timer — the
// common case stays as cheap as it was.

// The decisions about WHAT is shown live in lib/photos.ts, where they can be
// tested: this component's timing cannot be verified in a hidden browser pane
// (timers throttle and IntersectionObserver stops reporting there), so the
// logic is deliberately not trapped inside the effect.

export default function AutoPhotos({
  images,
  alt,
  sizes,
  priority = false,
  className = "",
  /** Spreads the start of the cycle so a grid doesn't flip all at once. */
  stagger = 0,
}: {
  /** Cover first. Blanks and duplicates are dropped. */
  images: (string | null | undefined)[];
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
  stagger?: number;
}) {
  const imgs = uniquePhotos(images);

  const [idx, setIdx] = useState(0);
  const [onScreen, setOnScreen] = useState(false);
  const hostRef = useRef<HTMLSpanElement>(null);

  // A browser without IntersectionObserver falls back to "always on" — the old
  // behaviour, never a card that has silently stopped. Derived rather than set
  // from inside the effect: `active` affects only the timer and nothing that
  // renders, so there is no markup for it to disagree with on hydration.
  const canObserve = typeof IntersectionObserver !== "undefined";
  const active = canObserve ? onScreen : true;

  // Only run while on screen.
  useEffect(() => {
    if (imgs.length <= 1 || !canObserve) return;
    const el = hostRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), {
      rootMargin: "100px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [imgs.length, canObserve]);

  useEffect(() => {
    if (imgs.length <= 1 || !active) return;
    // Read at run time, not at mount: a visitor can turn the setting on while
    // the page is open, and matchMedia is missing in some embedded webviews.
    const mq =
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;
    if (mq?.matches) return;

    // The first step is offset; every step after it is evenly spaced.
    const start = window.setTimeout(
      () => setIdx((x) => nextPhotoIndex(x, imgs.length)),
      firstStepDelay(stagger),
    );
    const tick = window.setInterval(
      () => setIdx((x) => nextPhotoIndex(x, imgs.length)),
      HOLD_MS,
    );
    return () => {
      window.clearTimeout(start);
      window.clearInterval(tick);
    };
  }, [imgs.length, active, stagger]);

  if (imgs.length === 0) return null;

  return (
    <span ref={hostRef} className="absolute inset-0 block">
      {imgs.map((src, i) => (
        <Image
          key={src}
          src={src}
          // One alt for the set. The photographs are the same subject, so
          // announcing "Photo 2 of 4" on a timer would make a screen reader
          // narrate a slideshow nobody asked it to follow.
          alt={i === 0 ? alt : ""}
          aria-hidden={i === 0 ? undefined : true}
          fill
          sizes={sizes}
          // Only the visible frame is eager; the rest stay lazy so a grid does
          // not fetch every photo of every card at once.
          priority={priority && i === 0}
          loading={i === 0 ? undefined : "lazy"}
          className={`object-cover ${className} ${i === idx ? "opacity-100" : "opacity-0"}`}
          style={{ transition: `opacity ${FADE_MS}ms ease-in-out` }}
          unoptimized={isUnoptimizedSrc(src)}
        />
      ))}
    </span>
  );
}
