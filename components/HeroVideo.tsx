"use client";

import { useEffect, useRef, useState } from "react";
import type { HeroVideo } from "@/lib/defaults";

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

export default function HeroVideoLayer({ videos }: { videos?: HeroVideo[] }) {
  const list = (videos ?? []).filter((v) => v?.enabled !== false && !!v?.url);
  const ref = useRef<HTMLVideoElement>(null);
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

  if (!allowed || !list.length) return null;
  const current = list[index % list.length];

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
      onEnded={() => { if (list.length > 1) { setReady(false); setIndex((i) => i + 1); } }}
      // A decode failure (a .mov Chrome will not take, a broken upload) unmounts
      // the layer entirely rather than leaving a black rectangle over the photo.
      onError={() => setAllowed(false)}
      className={`absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-700 ${
        ready ? "opacity-100" : "opacity-0"
      }`}
    >
      <source src={current.url} />
    </video>
  );
}
