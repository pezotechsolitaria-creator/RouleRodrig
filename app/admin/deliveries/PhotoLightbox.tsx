"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  RotateCw,
  X,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from "lucide-react";

// ── Looking closely at a photograph of somebody's car ───────────────────────
//
// The owner: "add zoom and rotate to the photo viewer."
//
// Fit-to-screen was enough to see there IS a photo and useless for the only
// thing this viewer is for — deciding whether the scratch somebody is
// complaining about is already in the pickup shot. That is a question about
// forty pixels of a wing panel.
//
// ── WHY ROTATE IS NOT A NICETY ─────────────────────────────────────────────
// These are taken one-handed at a car by a driver who is not thinking about
// which way up the phone is, and a sideways photograph of a door is very hard
// to compare against an upright one. Ninety degrees at a time, because that is
// the only rotation a phone actually produces.
//
// ── NO LIBRARY ─────────────────────────────────────────────────────────────
// A CSS transform, pointer events and about eighty lines. Pulling in a
// lightbox package for this would add more to the admin bundle than the whole
// vehicle feature weighs.

const MIN = 1;
const MAX = 6;
const STEP = 0.5;

export default function PhotoLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  // Pointer bookkeeping for drag-to-pan and pinch. A ref, not state: these
  // change on every pointermove and re-rendering on each would make the drag
  // stutter on exactly the mid-range phone this is used on.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragged = useRef(false);
  const pinchStart = useRef<{ dist: number; scale: number } | null>(null);

  // True while a finger or button is down. State rather than reading the
  // pointer ref during render — a ref is not readable there, and the only
  // thing this drives is whether the transform eases.
  const [interacting, setInteracting] = useState(false);

  const reset = useCallback(() => {
    setScale(1);
    setRotation(0);
    setPan({ x: 0, y: 0 });
  }, []);

  // A new photograph starts fresh — carrying a 4x zoom onto the next one would
  // open it somewhere in the middle of a door with no way to tell where. Done
  // with a `key` at the call site rather than an effect here: a new photo IS a
  // new viewer, and resetting in an effect meant a second render every time.

  const zoomTo = useCallback((next: number) => {
    const clamped = Math.min(MAX, Math.max(MIN, Number(next.toFixed(2))));
    setScale(clamped);
    // Back to fit means back to centre: a pan left over from a zoom that is no
    // longer applied strands the image off-screen.
    if (clamped === MIN) setPan({ x: 0, y: 0 });
  }, []);

  // Keyboard, because this is also opened on a laptop while somebody is on the
  // phone to a customer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "+" || e.key === "=") zoomTo(scale + STEP);
      else if (e.key === "-" || e.key === "_") zoomTo(scale - STEP);
      else if (e.key === "r" || e.key === "R") setRotation((r) => (r + 90) % 360);
      else if (e.key === "0") reset();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, zoomTo, scale, reset]);

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragged.current = false;
    setInteracting(true);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchStart.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale };
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && pinchStart.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchStart.current.dist > 0) {
        dragged.current = true;
        zoomTo(pinchStart.current.scale * (dist / pinchStart.current.dist));
      }
      return;
    }

    // One finger pans, but only once there is something to pan around.
    if (pointers.current.size === 1 && scale > 1) {
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragged.current = true;
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 0) setInteracting(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/95"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
    >
      {/* ── The controls ────────────────────────────────────────────────
          A bar, not a hover overlay: this is used on a phone, where there is
          no hover, and every one of these is a 44px target. */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-white/10 px-3 py-2">
        <button
          onClick={() => zoomTo(scale - STEP)}
          disabled={scale <= MIN}
          aria-label="Zoom out"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 text-offwhite disabled:opacity-30"
        >
          <ZoomOut size={17} />
        </button>
        <button
          onClick={() => zoomTo(scale + STEP)}
          disabled={scale >= MAX}
          aria-label="Zoom in"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 text-offwhite disabled:opacity-30"
        >
          <ZoomIn size={17} />
        </button>
        <button
          onClick={() => setRotation((r) => (r + 90) % 360)}
          aria-label="Rotate 90 degrees"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 text-offwhite"
        >
          <RotateCw size={17} />
        </button>
        <button
          onClick={reset}
          disabled={scale === 1 && rotation === 0 && pan.x === 0 && pan.y === 0}
          aria-label="Fit to screen"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 text-offwhite disabled:opacity-30"
        >
          <Maximize2 size={17} />
        </button>

        <span className="ml-1 font-dm text-xs tabular-nums text-muted">
          {Math.round(scale * 100)}%
        </span>

        <button
          onClick={onClose}
          aria-label="Close"
          className="ml-auto inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 text-offwhite hover:border-yellow/50"
        >
          <X size={18} />
        </button>
      </div>

      {/* ── The photograph ──────────────────────────────────────────────
          touch-none so the browser's own pinch-zoom does not fight this one,
          which on a phone otherwise scales the whole admin page instead. */}
      <div
        className="relative flex-1 touch-none overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => (scale > 1 ? reset() : zoomTo(2))}
        onWheel={(e) => zoomTo(scale + (e.deltaY < 0 ? STEP : -STEP))}
        onClick={() => {
          // Tapping the backdrop closes — but a pan that ENDS on the backdrop
          // is not a tap, and closing there would throw away the position
          // somebody just dragged to.
          if (!dragged.current) onClose();
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          onClick={(e) => e.stopPropagation()}
          className="absolute left-1/2 top-1/2 max-h-full max-w-full select-none object-contain"
          style={{
            transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${scale}) rotate(${rotation}deg)`,
            // No easing while a finger is down, or the image lags behind it.
            transition: interacting ? "none" : "transform 120ms ease-out",
            cursor: scale > 1 ? "grab" : "default",
          }}
        />
      </div>

      <p className="shrink-0 px-3 py-2 text-center font-dm text-[11px] text-muted">
        Pinch or scroll to zoom · double-tap to fit · R rotates
      </p>
    </div>
  );
}
