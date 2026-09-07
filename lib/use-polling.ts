"use client";

import { useEffect, useRef } from "react";

// ── ONE POLL, DONE THE TWO WAYS THIS REPO LEARNED THE HARD WAY ──────────────
//
// Every polling screen here was written the same way, and the way has two
// faults. Both cost real money on a free plan, and neither fails loudly.
//
// 1. THE DEPENDENCY. The shape was:
//
//      useEffect(() => {
//        void load();
//        const t = setInterval(() => void load(), 15_000);
//        return () => clearInterval(t);
//      }, [load]);
//
//    which re-subscribes whenever `load` changes identity — and its first act
//    is to fetch. On the kitchen screen an upstream hook returned a fresh
//    object every render, so `load` was new every render, so the effect re-ran
//    every render, so it fetched, which set state, which rendered. An unbounded
//    fetch loop throttled only by network latency: 36,915 dashboard calls,
//    36,907 writes and 37,747 auth checks in 24 hours from one propped-up tab.
//    Here the callback is read through a ref and the interval mounts ONCE, so
//    no identity churn upstream can rebuild that loop.
//
// 2. NOBODY IS LOOKING. A hidden tab learns nothing from a poll — there is no
//    one to read the screen — and an admin tab left open over a weekend was
//    billing thousands of requests for numbers nobody saw. This stops while
//    hidden and takes one fresh read on the way back, which is also what a
//    person returning to a tab actually wants.
//
// Deliberately NOT a data-fetching library. The screens own their state and
// their error handling; this owns the clock.

export type PollingOptions = {
  /** Stop entirely — a settled order has nothing left to poll for. */
  enabled?: boolean;
  /**
   * Call `fn` once on mount. Default true.
   *
   * Pass false where the screen already has its own first read that differs
   * from the poll — the driver's screen loads WITH a spinner and then polls
   * silently, and firing the silent one on mount would leave a blank card.
   */
  immediate?: boolean;
};

/**
 * Call `fn` now, then every `intervalMs`, but only while the tab is visible.
 *
 * `fn` may change identity freely — it is read through a ref, so a caller does
 * not have to memoise it correctly for this to be safe. That is the point.
 */
export function usePolling(
  fn: () => void | Promise<void>,
  intervalMs: number,
  { enabled = true, immediate = true }: PollingOptions = {},
): void {
  const latest = useRef(fn);

  // In an effect, not during render: writing a ref while rendering is a side
  // effect in a function React may run twice.
  useEffect(() => {
    latest.current = fn;
  }, [fn]);

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setInterval> | null = null;
    const isVisible = () =>
      typeof document === "undefined" || document.visibilityState === "visible";

    const tick = () => {
      void latest.current();
    };

    const start = () => {
      if (timer || !isVisible()) return;
      timer = setInterval(tick, intervalMs);
    };

    const stop = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };

    const onVisibility = () => {
      if (isVisible()) {
        // One read on the way back. Somebody returning to a tab wants what is
        // true now, not what was true when they left it.
        tick();
        start();
      } else {
        stop();
      }
    };

    // The first read happens even if the tab is already hidden: a screen that
    // mounts in the background should still have something to show when it is
    // brought forward.
    if (immediate) tick();
    start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
    // `fn` is deliberately absent — that is fault 1 above.
  }, [intervalMs, enabled, immediate]);
}
