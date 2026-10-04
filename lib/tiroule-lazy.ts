import type TiRouleGuide from "@/components/TiRouleGuide";

// ── Ti Roulé, fetched when somebody asks for him ────────────────────────────
//
// Architecture review 2026-09-30, perf item 1. The chat guide is 1,509 lines
// plus a hand-written knowledge base, the currency converter and the speech
// helper, and the root layout imported all of it statically — so every page
// on the site paid to download and evaluate a chat that opens only from the
// nav button. The 10 Sep LCP analysis put the site's cost in script
// evaluation, not images, and this was the largest global chunk.
//
// What stays in the first download is this file and components/GlobalTiRoule:
// a listener for the SAME "tiroule:open" event every launcher already fires
// (lib/nav-tabs.ts openTiRoule, the hero button, the world cards). The guide
// module is imported the first time one of them fires, or earlier on idle once
// the visitor has touched the page, so that a first tap is usually instant.
//
// Nothing here renders. The launcher people see is the nav button, which is
// unchanged, and the guide itself was already invisible until opened (the
// layout mounts it with hideFab), so the page is pixel-identical before the
// first open and nothing can shift.

export type TiRouleGuideComponent = typeof TiRouleGuide;
export type TiRouleProps = React.ComponentProps<typeof TiRouleGuide>;

/** The event every Ti Roulé launcher dispatches on window. */
const OPEN_EVENT = "tiroule:open";

let pending: Promise<TiRouleGuideComponent> | null = null;
let loaded: TiRouleGuideComponent | null = null;

/**
 * Imports the guide once. Concurrent callers share one request; a failed one
 * is forgotten so the next tap retries instead of being stuck on a rejected
 * promise for the rest of the visit. A retry only rescues a passing network
 * failure: when a deploy removed the chunk this tab was built against, every
 * retry asks for the same missing file, and only a reload helps — which is
 * why lib/tiroule-launcher.ts tells the visitor so (architecture review
 * 2026-09-30) instead of failing silently.
 */
export function loadTiRouleGuide(): Promise<TiRouleGuideComponent> {
  if (loaded) return Promise.resolve(loaded);
  if (!pending) {
    pending = import("@/components/TiRouleGuide").then(
      (m) => {
        loaded = m.default;
        return m.default;
      },
      (err: unknown) => {
        pending = null;
        throw err;
      },
    );
  }
  return pending;
}

/** The guide if it has already arrived, so a warm open needs no await. */
export function loadedTiRouleGuide(): TiRouleGuideComponent | null {
  return loaded;
}

/** Calls `onOpen` for every "tiroule:open" on `target`. Returns the cleanup. */
export function listenForTiRouleOpen(target: EventTarget, onOpen: () => void): () => void {
  const handler = () => onOpen();
  target.addEventListener(OPEN_EVENT, handler);
  return () => target.removeEventListener(OPEN_EVENT, handler);
}

type Idle = (fn: () => void) => void;

const idle: Idle = (fn) => {
  const w = globalThis as typeof globalThis & {
    requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
  };
  if (typeof w.requestIdleCallback === "function") w.requestIdleCallback(fn, { timeout: 4000 });
  else setTimeout(fn, 1500);
};

/**
 * Runs `warm` once, on an idle moment after the visitor's first tap or key
 * press — never during the page's own load, which is the cost being removed.
 * Skipped under Data Saver, as the hero video is: a visitor rationing data
 * pays for the guide only by opening it.
 */
export function warmAfterFirstInteraction(
  target: EventTarget,
  warm: () => void,
  opts: { saveData?: boolean; schedule?: Idle } = {},
): () => void {
  if (opts.saveData) return () => {};
  const schedule = opts.schedule ?? idle;
  const events = ["pointerdown", "keydown"] as const;
  let done = false;
  const off = () => events.forEach((e) => target.removeEventListener(e, onFirst));
  function onFirst() {
    if (done) return;
    done = true;
    off();
    schedule(warm);
  }
  events.forEach((e) => target.addEventListener(e, onFirst, { passive: true }));
  return off;
}
