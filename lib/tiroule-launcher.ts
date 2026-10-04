import {
  listenForTiRouleOpen,
  loadTiRouleGuide,
  loadedTiRouleGuide,
  warmAfterFirstInteraction,
  type TiRouleGuideComponent,
} from "@/lib/tiroule-lazy";

// ── A tap on Ti Roulé always gets an answer (architecture review 2026-09-30) ──
//
// Perf-a11y findings on the lazy split. Once the guide stopped shipping in the
// layout bundle, the first tap had to download it, and the layout showed
// nothing while it did: on island data, or under Data Saver (where nothing is
// warmed early), the nav button looked dead. A failed download was worse. Its
// only trace was console.error, and when the cause is a deploy that removed
// the chunk this tab was built against, every retry asks for the same missing
// file. Before the split that failure could not happen at all.
//
// So the open is a small state machine that GlobalTiRoule renders:
//
//   waiting  asked, not slow yet: an EMPTY live region is mounted, so the text
//            that may follow is announced (a region inserted together with
//            its text is not reliably read out)
//   loading  still downloading after SHOW_LOADING_AFTER_MS: "Opening…"
//   offline  failed with the browser offline: try again once back online
//   failed   failed while online: most likely a stale tab after a deploy, so
//            the notice offers a reload, which only the visitor may trigger
//            (an automatic one would throw away a half-typed booking form)
//
// It lives here rather than in the component so the whole path (the event the
// launchers fire, the shared loader, the timers) runs in a test without a DOM.

export type TiRouleLoadStatus = "idle" | "waiting" | "loading" | "offline" | "failed";

/** A warm or quick load opens before this, so it never flashes a pill. */
export const SHOW_LOADING_AFTER_MS = 300;

export interface TiRouleLauncherOptions {
  /** An open was asked for and the guide is here. Called once per request. */
  onReady: (guide: TiRouleGuideComponent) => void;
  onStatus: (status: TiRouleLoadStatus) => void;
  /** Data Saver: never fetch the guide before somebody opens it. */
  saveData?: boolean;
  isOffline?: () => boolean;
  /** Seams for tests; the defaults are the real shared loader. */
  load?: () => Promise<TiRouleGuideComponent>;
  loaded?: () => TiRouleGuideComponent | null;
  schedule?: (fn: () => void) => void;
}

export interface TiRouleLauncher {
  /** Clears a failure notice. A download in progress keeps its pill. */
  dismiss: () => void;
  /** Stops listening, drops any late result and clears the status. */
  stop: () => void;
}

const browserOffline = () =>
  typeof navigator !== "undefined" && navigator.onLine === false;

export function startTiRouleLauncher(
  target: EventTarget,
  opts: TiRouleLauncherOptions,
): TiRouleLauncher {
  const load = opts.load ?? loadTiRouleGuide;
  const loaded = opts.loaded ?? loadedTiRouleGuide;
  const isOffline = opts.isOffline ?? browserOffline;

  let last: TiRouleLoadStatus = "idle";
  let inFlight = false;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const emit = (status: TiRouleLoadStatus) => {
    if (status === last) return;
    last = status;
    opts.onStatus(status);
  };
  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const open = () => {
    const ready = loaded();
    if (ready) {
      clearTimer();
      emit("idle");
      opts.onReady(ready);
      return;
    }
    // Every launcher tap while one download runs shares it (the loader does
    // too); the first tap's request is the one that opens the chat.
    if (inFlight) return;
    inFlight = true;
    if (last === "idle") {
      emit("waiting");
      timer = setTimeout(() => {
        timer = null;
        emit("loading");
      }, SHOW_LOADING_AFTER_MS);
    } else {
      // "Try again" from a failure notice: the person is watching the pill,
      // so it answers at once instead of vanishing for 300ms.
      emit("loading");
    }
    load().then(
      (guide) => {
        inFlight = false;
        clearTimer();
        if (stopped) return;
        emit("idle");
        opts.onReady(guide);
      },
      (err: unknown) => {
        inFlight = false;
        clearTimer();
        if (stopped) return;
        console.error("Ti Roulé failed to load", err);
        emit(isOffline() ? "offline" : "failed");
      },
    );
  };

  const offOpen = listenForTiRouleOpen(target, open);
  // The early fetch stays silent: nobody asked yet, so a failure here is
  // nobody's dead tap, and the loader forgets it for the real open to retry.
  const offWarm = warmAfterFirstInteraction(target, () => void load().catch(() => {}), {
    saveData: opts.saveData,
    schedule: opts.schedule,
  });

  return {
    dismiss: () => {
      if (last === "offline" || last === "failed") emit("idle");
    },
    stop: () => {
      stopped = true;
      clearTimer();
      offOpen();
      offWarm();
      emit("idle");
    },
  };
}
