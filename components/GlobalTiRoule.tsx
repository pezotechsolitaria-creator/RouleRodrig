"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/context/LanguageContext";
import { isConsole } from "@/lib/nav-scope";
import { resolvePose } from "@/lib/mascot";
import { openTiRoule } from "@/lib/nav-tabs";
import type { TiRouleGuideComponent, TiRouleProps } from "@/lib/tiroule-lazy";
import {
  startTiRouleLauncher,
  type TiRouleLauncher,
  type TiRouleLoadStatus,
} from "@/lib/tiroule-launcher";
import TiRouleLoadNotice from "@/components/TiRouleLoadNotice";

// Mounts Ti Roulé once, site-wide, launched from the bottom-nav button (no
// floating orb). Excluded from the admin area and the /v2 alias.
//
// ── A LISTENER FIRST, THE CHAT WHEN ASKED (architecture review 2026-09-30) ──
// This used to import components/TiRouleGuide statically, which put the whole
// 1,509-line chat and its knowledge base into every page's first download for
// a panel that opens only on request. Now the layout ships this listener, and
// the guide module arrives on the first "tiroule:open" (or on idle after the
// visitor's first touch, see lib/tiroule-lazy.ts). Every launcher keeps
// dispatching the same event, so none of them had to change.
//
// Before the first open this renders nothing, exactly as the guide did with
// hideFab — no launcher of its own, nothing to shift. Once loaded the guide
// stays mounted, so a conversation survives navigation as it always has.
//
// Between the tap and the guide (architecture review 2026-09-30, perf-a11y
// findings): a slow first download shows "Opening Ti Roulé…", and a failed
// one says why and offers Try again (offline) or Reload page (online, most
// likely a tab older than the last deploy, whose chunk no retry can fetch).
// Before, both looked like a dead button. lib/tiroule-launcher.ts keeps the
// state; components/TiRouleLoadNotice.tsx draws it.
export default function GlobalTiRoule(props: Omit<TiRouleProps, "hideFab">) {
  const pathname = usePathname() || "/";
  const { language } = useLanguage();
  // Was its own hardcoded list of three prefixes, so the mascot floated over
  // /driver, /organizer, /partner and /kitchen — every console added after it
  // was written. isConsole() is the shared rule; /v2 stays separate because it
  // is a design sandbox, not a console.
  const onConsole = isConsole(pathname) || pathname.startsWith("/v2");
  // The guide renders nothing without a mascot picture, so an open with none
  // uploaded did nothing before. It still does nothing — without the download.
  const hasMascot = !!resolvePose("welcome", props.poses, props.image);
  const enabled = !onConsole && hasMascot;

  const [Guide, setGuide] = useState<TiRouleGuideComponent | null>(null);
  const [status, setStatus] = useState<TiRouleLoadStatus>("idle");
  // An open that arrived before the guide existed, replayed once it mounts.
  const replayOpen = useRef(false);
  const launcher = useRef<TiRouleLauncher | null>(null);

  useEffect(() => {
    // Once mounted, the guide listens for itself; two listeners would both act.
    if (!enabled || Guide) return;
    const saveData = !!(navigator as Navigator & { connection?: { saveData?: boolean } })
      .connection?.saveData;
    const started = startTiRouleLauncher(window, {
      onReady: (G) => {
        replayOpen.current = true;
        setGuide(() => G);
      },
      onStatus: setStatus,
      saveData,
    });
    launcher.current = started;
    return () => {
      launcher.current = null;
      started.stop();
    };
  }, [enabled, Guide]);

  // A failure notice belongs to the page it was raised on; a download still
  // in progress keeps its pill, since the chat it fetches still opens here.
  useEffect(() => {
    launcher.current?.dismiss();
  }, [pathname]);

  // The guide registers its own listener in its mount effect, and a child's
  // effects run before its parent's — so by the time this runs, re-sending the
  // event reaches the guide's real handler (opening, analytics, the "seen"
  // flag) rather than a copy of that logic kept here.
  useEffect(() => {
    if (Guide && replayOpen.current) {
      replayOpen.current = false;
      openTiRoule();
    }
  }, [Guide]);

  if (!enabled) return null;
  if (!Guide) {
    return (
      <TiRouleLoadNotice
        status={status}
        lang={language}
        onRetry={openTiRoule}
        // The visitor's choice, never automatic: a reload would throw away a
        // half-typed booking form on a page they only asked a question on.
        onReload={() => window.location.reload()}
        onDismiss={() => launcher.current?.dismiss()}
      />
    );
  }
  return <Guide hideFab {...props} />;
}
