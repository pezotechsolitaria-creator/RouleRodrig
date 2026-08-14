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

// How long the poster keeps covering an embedded player AFTER it reports
// PLAYING. YouTube's prev/pause/next overlay stays painted for a beat once
// playback begins, so revealing on the PLAYING event alone still showed the
// buttons. Set from the owner's own timing on a real phone, not from theory:
// 4000 -> 2500 -> 3750 -> 3900, settled by watching the real player rather than
// by reasoning about it. 2500 uncovered the video slightly too early.
const REVEAL_HOLD_MS = 3900;

// How long the poster then takes to dissolve into the footage. Also tuned on a
// real phone, and it went the wrong way once: 150 -> 260 -> 180. 150ms was
// quick but POPPED, because the still and the video's first frame differ in
// brightness. 260ms dissolved properly but read as the background lingering.
// 180ms with ease-out moves immediately — so it reads as fast — while still
// being long enough not to snap. Both playback paths below use the same value:
// to a visitor they are the same moment, and they must not drift apart.
const FADE_CLASS = "transition-opacity duration-[180ms] ease-out";

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
  // Pending reveal, so a state change can cancel it before it fires.
  const revealTimer = useRef<number | null>(null);
  // Whether the player has ever answered the handshake. Some embed builds
  // simply never do, and without this the poster would sit there forever and
  // the owner's video would never appear at all — a worse failure than the one
  // the hold exists to prevent.
  //
  // ANY answer counts, deliberately, including "unstarted" and "buffering".
  // This is not a claim that the video is playing — it is the narrower question
  // the safety net needs: is anyone home? A player that talks to us is one
  // whose real state we can follow, so the net must stand down and let the
  // handshake drive. Relaxing this to mean "has really played" was tried and
  // reverted: it lets the net uncover a player that answered but never started,
  // which is a hero with YouTube's thumbnail and play button painted across it.
  const heard = useRef(false);
  // Whether this player has EVER genuinely played. Hiding on a non-playing
  // state is right once footage has been running — the chrome comes back — but
  // wrong before it ever starts: YouTube sits in CUED and would then suppress
  // the video permanently, which is exactly how the hero went blank.
  const everPlayed = useRef(false);
  // Whether it is playing RIGHT NOW. A separate question from everPlayed, and
  // both are needed: everPlayed decides whether a non-playing state is worth
  // HIDING for, this decides whether the player needs RESTARTING. The clip that
  // started fine and stopped ten seconds later is only visible to the second.
  const playingNow = useRef(false);
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
        heard.current = true;

        playingNow.current = state === 1;

        if (state === 1) {
          // PLAYING is necessary but NOT sufficient. YouTube keeps its
          // prev/pause/next overlay painted for a moment AFTER playback has
          // started, so revealing the instant it reports playing still showed
          // the buttons — which is exactly what the owner kept seeing.
          //
          // The poster therefore holds for a further REVEAL_HOLD_MS, measured
          // by the owner on a real phone rather than guessed. The cost is a
          // couple of extra seconds of a photograph nobody minds looking at;
          // the benefit is that the player is never uncovered while it still
          // has chrome drawn on it.
          //
          // Guarded so repeated PLAYING reports (the player sends them on every
          // loop) cannot stack timers.
          everPlayed.current = true;
          if (revealTimer.current === null) {
            revealTimer.current = window.setTimeout(() => {
              revealTimer.current = null;
              setReady(true);
              onPlaying?.(true);
            }, REVEAL_HOLD_MS);
          }
        } else {
          // Paused, buffering, ended, cued — any of these can put the overlay
          // back, so the poster returns immediately and any pending reveal is
          // cancelled. Hiding is instant while showing waits: the asymmetry is
          // the whole point.
          if (revealTimer.current !== null) {
            window.clearTimeout(revealTimer.current);
            revealTimer.current = null;
          }
          // Only ever hide something that was genuinely playing. Before the
          // first PLAYING this branch would fight the absolute deadline below
          // and win every time, because a cued player keeps reporting.
          if (everPlayed.current) {
            setReady(false);
            onPlaying?.(false);
          }
        }
      } catch {
        /* not a message we understand — ignore rather than break the hero */
      }
    };
    window.addEventListener("message", onMessage);

    // The handshake has to be repeated: the player only starts reporting once
    // it is initialised, and there is no event telling us when that is.
    const hello = window.setInterval(() => {
      const w = frameRef.current?.contentWindow;
      if (!w) return;
      w.postMessage(JSON.stringify({ event: "listening", id: "rr-hero" }), "*");
    }, 400);

    // ── Keep it playing, for as long as the hero is on the page ──────────
    //
    // Two separate things stop this video, and both were live on the site:
    //
    //   · autoplay REFUSED. The <video> path earns autoplay legally through
    //     muted + playsInline. An embedded player has no such attributes to
    //     set — `autoplay=1` in the URL is a request, and a browser declines it
    //     on a page the visitor has not touched yet. The refusal is silent: no
    //     error, no event, just a player reporting unstarted forever.
    //   · playing, then PAUSING on its own a few seconds in, which is the one
    //     the owner described — the hero video stops.
    //
    // Neither had anything watching for it. A muted video may still be started
    // programmatically inside a frame carrying allow="autoplay", which is what
    // this is, so the fix for both is the same: whenever the player is not
    // playing, ask it to. Re-playing a playing video is a no-op, which is what
    // makes this safe to repeat.
    //
    // Every 2s rather than on the 400ms knock: this outlives the handshake and
    // runs for the whole life of the hero, so it must be cheap. Skipped on a
    // hidden tab — resuming video for a visitor who is not looking is exactly
    // the mobile data this component exists to protect.
    const watchdog = window.setInterval(() => {
      if (playingNow.current) return;
      if (document.visibilityState !== "visible") return;
      frameRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func: "playVideo", args: [] }),
        "*",
      );
    }, 2000);
    // Stop knocking after 20s. By then it is either talking to us or it never
    // will, and in that case the poster simply stays — which is a good hero.
    const giveUp = window.setTimeout(() => window.clearInterval(hello), 20_000);


    return () => {
      window.removeEventListener("message", onMessage);
      window.clearInterval(hello);
      window.clearInterval(watchdog);
      window.clearTimeout(giveUp);
      if (revealTimer.current !== null) {
        window.clearTimeout(revealTimer.current);
        revealTimer.current = null;
      }
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
          // Safety net for players that never answer `listening`. Waits longer
          // than the hold, then reveals only if we have heard nothing at all —
          // so a talkative player is always driven by its real state, and a
          // silent one still eventually shows the video instead of stranding
          // the visitor on the poster.
          onLoad={() => {
            // ── The deadline, for a player that never speaks ────────────────
            //
            // This guard has now been removed once and put back, and the round
            // trip is the useful part.
            //
            // It was removed because YouTube answers the handshake while CUED
            // or BUFFERING, so `heard` went true, autoplay was then deferred,
            // PLAYING never arrived, and the guard had disabled the only other
            // way out — the hero sat blank with the right video loaded behind
            // it. Revealing unconditionally fixed that.
            //
            // But unconditional has its own casualty, and it is the iPhone.
            // iOS refuses inline autoplay for an embedded player far more
            // firmly than a desktop browser does, so there the deadline
            // uncovers a player that is NOT playing — YouTube's thumbnail, its
            // big play button, its title and "Watch on YouTube" painted across
            // the hero. That is what "the video does not display on iPhone"
            // looks like, and it is strictly worse than the photograph it
            // replaced.
            //
            // What changed since is the watchdog above: a player that is not
            // playing is now asked to play, every 2s, for as long as the hero
            // is on screen. So "answered but idle" is no longer a permanent
            // state that needs escaping — it resolves itself wherever playback
            // is possible at all. Where it does not resolve, the player
            // genuinely cannot autoplay, and the right answer there is the
            // poster: a clean, deliberate photo hero, not third-party chrome.
            //
            // So the deadline goes back to its narrow job — rescuing a player
            // that never answers at all — and everything else is driven by the
            // player's real state.
            window.setTimeout(() => {
              if (heard.current) return;
              setReady(true);
              onPlaying?.(true);
            }, REVEAL_HOLD_MS + 2000);
          }}
          // Deliberately NO onLoad reveal. Load means "the document arrived",
          // not "footage is on screen", and revealing on it is what showed
          // YouTube's own chrome. The effect above drives visibility purely
          // from the player's REPORTED state, so the poster covers every
          // moment the player is not actually playing — including the pause,
          // buffer and end states that draw the prev/pause/next overlay.
          className={`absolute left-1/2 top-1/2 h-[56.25vw] min-h-full w-[177.78vh] min-w-full -translate-x-1/2 -translate-y-1/2 border-0 ${FADE_CLASS} ${
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
      className={`absolute inset-0 h-full w-full object-cover object-center ${FADE_CLASS} ${
        ready ? "opacity-100" : "opacity-0"
      }`}
    >
      <source src={parsed.embedUrl} />
    </video>
  );
}
