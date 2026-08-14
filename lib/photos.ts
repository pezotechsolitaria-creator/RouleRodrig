// The pure half of the auto-cycling photo card (components/AutoPhotos.tsx).
//
// Separate so it can be tested: the component's timing cannot be verified in a
// hidden browser pane — timers throttle and IntersectionObserver stops
// reporting there — so the parts that decide WHAT is shown live here, where a
// test can check them deterministically.

/** Long enough to look at a photo, short enough to see the next one. */
export const HOLD_MS = 3400;
export const FADE_MS = 900;

/**
 * The photo list a card should actually show.
 *
 * Callers pass `[item.image, ...(item.images ?? [])]` because the content model
 * carries a cover AND a gallery, and the cover is usually ALSO the first
 * gallery entry. Without de-duplication that card crossfades its first photo
 * into an identical copy of itself — which does not look like a gallery, it
 * looks like the slideshow has stalled.
 *
 * Blanks are dropped too: an unset cover is `""` in this content model, not
 * undefined, and an empty src renders a broken frame.
 */
export function uniquePhotos(images: (string | null | undefined)[]): string[] {
  return Array.from(
    new Set(images.filter((s): s is string => typeof s === "string" && s.trim() !== "")),
  );
}

/** Wraps at the end, so the gallery loops rather than stopping on the last. */
export function nextPhotoIndex(current: number, total: number): number {
  if (total <= 1) return 0;
  return (current + 1) % total;
}

/**
 * How long THIS card waits before its first change.
 *
 * A grid mounts in one render, so without an offset every card flips at the
 * same instant — which reads as a page glitch rather than as photographs.
 * Spread over four steps: enough to break the lockstep, not so much that a
 * card near the end sits still while its neighbours move.
 */
export function firstStepDelay(stagger: number): number {
  const safe = Number.isFinite(stagger) ? Math.abs(Math.trunc(stagger)) : 0;
  return HOLD_MS + (safe % 4) * 500;
}

/** Next's optimizer is only configured for Supabase; pass anything else through. */
export function isUnoptimizedSrc(src: string): boolean {
  return src.startsWith("/uploads/") || (src.startsWith("http") && !src.includes("supabase.co"));
}
