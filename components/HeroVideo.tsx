"use client";

import { useEffect, useRef, useState } from "react";
import type { HeroVideo } from "@/lib/defaults";
import { parseVideoUrl } from "@/lib/video";

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
  const parsed = parseVideoUrl(current.url);

  // ── No third-party embeds in the hero ─────────────────────────────────────
  //
  // A YouTube/Vimeo iframe used to render here. It was a workaround for a bug
  // that no longer exists: the CSP shipped without a `media-src` directive, so
  // every self-hosted clip was blocked and the layer silently unmounted. The
  // owner reasonably concluded that uploading did not work and pasted a
  // YouTube link, and the embed path was built to make that link play.
  //
  // media-src is fixed, so the workaround now costs more than it buys. An
  // iframe drags in a third-party player and its cookies, cannot be
  // object-covered (it needs the 177vh/56vw hack to fake a background), cannot
  // be paused per-frame the way a <video> element can, ignores Data Saver, and
  // makes the top of the homepage feel like somebody else's product. A hero is
  // the one place the site should not be renting from another brand.
  //
  // An embed link is therefore SKIPPED, not rendered: the hero falls back to
  // the poster, which is a real photograph and a perfectly good hero. Admin
  // tells the owner to upload the file instead.
  if (!parsed.embedUrl || parsed.kind !== "file") return null;

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
      <source src={parsed.embedUrl} />
    </video>
  );
}
