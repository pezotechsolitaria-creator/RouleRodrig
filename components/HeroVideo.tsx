"use client";

import { useEffect, useRef, useState } from "react";
import type { HeroVideo } from "@/lib/defaults";
import { parseVideoUrl, isEmbed } from "@/lib/video";

// ── The hero's moving background ────────────────────────────────────────────
//
// Layered OVER the still, never instead of it. The <Image> underneath keeps
// rendering, and this fades in only once a frame is actually decoded, so every
// path where video cannot work — no clips, a codec the browser refuses, Data
// Saver, a dead connection, reduced-motion — lands on exactly the hero that
// existed before this component, with no gap and no black box.
//
// The scene this has to survive is a traveller on island mobile data. A hero
// video that autoplays 15 MB before the page is usable is a worse hero than a
// photograph, so everything below is about NOT spending that data unless the
// clip will actually be seen.

export default function HeroVideoLayer({
  videos,
  onPlaying,
}: {
  videos?: HeroVideo[];
  /** Fires the moment footage is actually on screen, so the hero can retire
   *  its headline. Deliberately NOT called when the video is merely loaded:
   *  the text must stay put on every path where playback never happens. */
  onPlaying?: (playing: boolean) => void;
}) {
  const list = (videos ?? []).filter((v) => v?.enabled !== false && !!v?.url);
  const ref = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState(false);
  // Starts false and is only turned on after the checks below pass. Rendering
  // no <video> at all is the cheapest possible fallback: no request is made.
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (!list.length) return;

    // 1. Reduced motion. A full-bleed moving background is exactly what this
    //    setting exists to suppress, and it is not a preference to negotiate.
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");

    // 2. Data Saver / metered connection. Chrome exposes both; when the visitor
    //    has told the browser to spend less data, a decorative video is the
    //    first thing that should go.
    const conn = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }).connection;
    const cheap = !conn?.saveData && !/(^|-)2g$/.test(conn?.effectiveType ?? "");

    const decide = () => setAllowed(!calm.matches && cheap);
    decide();
    calm.addEventListener("change", decide);
    return () => calm.removeEventListener("change", decide);
  }, [list.length]);

  // Pause while the hero is off screen. The hero is at the top of a long page,
  // so it spends most of a session scrolled away — decoding frames for nobody
  // is pure battery cost on the phone this site is built for.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) void el.play().catch(() => {});
        else el.pause();
      },
      { rootMargin: "120px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [allowed, index]);

  const current = list.length ? list[index % list.length] : null;
  const parsed = parseVideoUrl(current?.url);
  const embed = !!current && isEmbed(parsed.kind) && !!parsed.embedUrl;

  // ── Ask the embedded player what it is actually doing ────────────────────
  //
  // `controls: 0` hides YouTube's control BAR. It does NOT stop the player
  // drawing its prev / pause / next overlay whenever it is paused, buffering
  // or ended — which is what put three buttons across the middle of the hero.
  // Nothing about styling or z-index can suppress that; it is painted inside a
  // cross-origin iframe.
  //
  // So visibility follows the player's own reported state instead of a guess.
  // enablejsapi=1 lets the page talk to it over postMessage WITHOUT loading
  // YouTube's iframe_api script: send `listening`, and it answers with
  // onStateChange. State 1 is PLAYING; anything else means the poster should be
  // covering it, and the headline should be back.
  useEffect(() => {
    if (!embed) return;
    const win = frameRef.current?.contentWindow;

    const onMessage = (e: MessageEvent) => {
      // Only trust the player's own origin — this listener is on `window`, so
      // any frame or extension on the page could otherwise drive the hero.
      if (!/^https:\/\/(www\.)?youtube(-nocookie)?\.com$/.test(e.origin)) return;
      try {
        const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        const state = data?.info?.playerState;
        if (typeof state !== "number") return;
        const playing = state === 1;
        setReady(playing);
        onPlaying?.(playing);
      } catch {
        /* not a message we understand — ignore rather than break the hero */
      }
    };
    window.addEventListener("message", onMessage);

    // The handshake has to be repeated: the player only starts reporting once
    // it is initialised, and there is no event telling us when that is.
    const hello = window.setInterval(() => {
      frameRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: "listening", id: "rr-hero" }),
        "*",
      );
    }, 400);
    // Stop knocking after 20s. By then it is either talking to us or it never
    // will, and in that case the poster simply stays — which is a good hero.
    const giveUp = window.setTimeout(() => window.clearInterval(hello), 20_000);

    return () => {
      window.removeEventListener("message", onMessage);
      window.clearInterval(hello);
      window.clearTimeout(giveUp);
      void win;
    };
  }, [embed, parsed.embedUrl, onPlaying]);

  if (!allowed || !current) return null;

  // A link we cannot play is skipped rather than rendered. This is the bug the
  // owner hit: a YouTube WATCH page in a <video src> fetches HTML, fails to
  // decode, and unmounted the whole layer with nothing said. A YouTube or Vimeo
  // link plays as an embed; only a genuinely unusable link is dropped, with
  // admin telling the owner so before it ever ships.
  //
  // Pasting a link is kept ON PURPOSE, at the owner's explicit direction. It is
  // the only route that needs no file, no upload and no compression step, and
  // for someone filming on a phone that is the difference between a hero video
  // existing and not. A self-hosted MP4 is still the better result — no
  // third-party player, proper object-cover, pausable per frame — so admin
  // recommends uploading, but it does not refuse the link.
  if (!parsed.embedUrl) return null;

  if (isEmbed(parsed.kind)) {
    return (
      // pointer-events-none is load-bearing, not tidiness: without it a tap
      // lands inside YouTube's player and summons its controls, and on a phone
      // the hero is a large tap target sitting under the reader's thumb.
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* An iframe cannot object-cover. A 16:9 player scaled to whichever
            axis is short, centred, is what makes an embedded background fill a
            full-bleed hero on both a phone (tall) and a desktop (wide) without
            letterboxing. 177.78vh = 16/9 of the viewport height. */}
        <iframe
          key={parsed.embedUrl}
          src={parsed.embedUrl}
          title=""
          allow="autoplay; encrypted-media; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin"
          ref={frameRef}
          // Deliberately NO onLoad reveal. Load means "the document arrived",
          // not "footage is on screen", and revealing on it is what showed
          // YouTube's own chrome. The effect above drives visibility purely
          // from the player's REPORTED state, so the poster covers every
          // moment the player is not actually playing — including the pause,
          // buffer and end states that draw the prev/pause/next overlay.
          className={`absolute left-1/2 top-1/2 h-[56.25vw] min-h-full w-[177.78vh] min-w-full -translate-x-1/2 -translate-y-1/2 border-0 transition-opacity duration-700 ${
            ready ? "opacity-100" : "opacity-0"
          }`}
        />
      </div>
    );
  }

  return (
    <video
      ref={ref}
      key={current.id || current.url}
      // muted + playsInline are what make autoplay legal on iOS and Android at
      // all; without both, mobile Safari refuses and the hero silently keeps
      // the still. autoPlay alone is not enough.
      autoPlay
      muted
      playsInline
      // Only loop a single clip. With several, ending advances to the next so
      // the owner's footage plays as a sequence rather than one clip forever.
      loop={list.length === 1}
      preload="metadata"
      poster={current.poster || undefined}
      aria-hidden="true"
      onCanPlay={() => setReady(true)}
      // `playing` and not `canplay`: a file element knows exactly when frames
      // start, so the headline retires on the real event rather than a guess.
      onPlaying={() => onPlaying?.(true)}
      onEnded={() => { if (list.length > 1) { setReady(false); setIndex((i) => i + 1); } }}
      // A decode failure (a .mov Chrome will not take, a broken upload) unmounts
      // the layer entirely rather than leaving a black rectangle over the photo.
      // The headline comes straight back — it is the hero again from here.
      onError={() => { setAllowed(false); onPlaying?.(false); }}
      className={`absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-700 ${
        ready ? "opacity-100" : "opacity-0"
      }`}
    >
      <source src={parsed.embedUrl} />
    </video>
  );
}
