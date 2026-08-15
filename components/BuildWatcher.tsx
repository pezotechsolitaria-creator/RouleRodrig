"use client";

import { useEffect } from "react";

// ── A DEVICE THAT IS RUNNING AN OLD BUILD SHOULD SAY SO ─────────────────────
//
// This exists because of a specific, repeated, expensive failure: a fix ships,
// the owner opens the site on a laptop, sees the old thing, and reports it as
// broken. Several rounds went into diagnosing code that was already correct —
// the deployed CSS was verified byte by byte more than once — while the actual
// problem was that one device had not picked the new build up.
//
// A stale device is indistinguishable from a bug by looking at it. So it stops
// being something a person has to notice: the page compares the build it is
// running against the build the server is serving, and if they differ it
// reloads itself once.
//
// ── WHY THIS IS SAFE TO DO WITHOUT ASKING ───────────────────────────────────
// It reloads AT MOST once per browser tab, guarded by sessionStorage, so a
// server that reports something unexpected can never produce a reload loop —
// the worst case is one wasted refresh. It only ever acts when the two build
// ids genuinely disagree, and it does nothing at all in development, where
// both sides read "dev".
//
// It also waits for the tab to be visible. Reloading a background tab throws
// away scroll position and any half-filled form for something nobody is
// looking at.

const ONCE_KEY = "rr_build_reloaded";

export default function BuildWatcher({ commit }: { commit: string }) {
  useEffect(() => {
    if (!commit || commit === "dev") return;

    let cancelled = false;

    const check = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/health?probe=build", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        const live: string | undefined = json?.build?.commit;
        if (!live || live === commit) return;

        // The server moved on. Reload once — and record it against the LIVE
        // build, so a later deploy is still allowed to trigger its own reload.
        if (sessionStorage.getItem(ONCE_KEY) === live) return;
        sessionStorage.setItem(ONCE_KEY, live);

        // A hard reload: the service worker serves hashed assets cache-first,
        // and the point of this is to stop trusting what is already cached.
        window.location.reload();
      } catch {
        // Offline, or the probe is unreachable. Silence is correct — this is a
        // convenience, and it must never interrupt somebody who is mid-booking.
      }
    };

    check();
    const onShow = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onShow);
    // Coming back to a tab hours later is the common case, so the interval is
    // long: this is a safety net, not a poll.
    const id = window.setInterval(check, 15 * 60 * 1000);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onShow);
      window.clearInterval(id);
    };
  }, [commit]);

  return null;
}
