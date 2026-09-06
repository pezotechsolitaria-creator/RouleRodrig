"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import { Camera, ChevronDown, Loader2, MapPin, X } from "lucide-react";

// ── The pictures somebody took of a customer's car ──────────────────────────
//
// The owner: "add the photos to admin so i can see them."
//
// The panel already said "3 photos at pickup", which answers whether the
// handover was documented and not the question anybody actually opens this
// with: DOES THE SCRATCH THEY ARE COMPLAINING ABOUT APPEAR IN THE PICKUP PHOTO?
//
// So pickup and return are drawn one above the other with their times, and the
// point of the screen is the comparison. Splitting them across two views would
// have been the same as not building it.
//
// ── SIGNED, AND ONLY WHEN ASKED ────────────────────────────────────────────
// The bucket is private. The route mints signed URLs valid for five minutes at
// the moment somebody presses this, so nothing here is a link that keeps
// working — a lasting URL to a photograph of somebody's car is a thing that
// ends up forwarded.

type EventRow = {
  event: "collected" | "returned";
  recordedAt: string;
  note: string | null;
  lat: number | null;
  lng: number | null;
  driverName: string | null;
  urls: string[];
};

type Payload = {
  plate: string | null;
  vehicle: string | null;
  events: EventRow[];
};

const TITLE: Record<string, string> = {
  collected: "At pickup",
  returned: "When it came back",
};

function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Indian/Mauritius",
  });
}

export default function VehiclePhotos({
  requestId,
  photoCount,
}: {
  requestId: string;
  /** What the board already knows, so the button can say it before loading. */
  photoCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/deliveries?vehiclePhotos=${encodeURIComponent(requestId)}`,
        { cache: "no-store" },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not open those photos.");
      setData(body as Payload);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open those photos.");
    } finally {
      setBusy(false);
    }
  }, [requestId]);

  function toggle() {
    const next = !open;
    setOpen(next);
    // Re-fetched on every open, not cached: the signed URLs expire after five
    // minutes, and a second look at a stale set would show broken images.
    if (next) void load();
  }

  return (
    <div className="mt-2.5">
      <button
        onClick={toggle}
        aria-expanded={open}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/15 px-3 font-dm text-xs text-muted transition-colors hover:border-yellow/40 hover:text-yellow"
      >
        <Camera size={12} className="shrink-0" />
        {open ? "Hide photos" : `See the ${photoCount} pickup photo${photoCount === 1 ? "" : "s"}`}
        <ChevronDown
          size={12}
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="mt-2">
          {busy && !data && (
            <p className="flex items-center gap-2 font-dm text-xs text-muted">
              <Loader2 size={13} className="animate-spin" /> Loading…
            </p>
          )}
          {error && (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 font-dm text-xs text-red-200">
              {error}
            </p>
          )}

          {data?.events.map((e) => (
            <section key={e.event} className="mt-2">
              <p className="flex flex-wrap items-baseline gap-x-2 font-dm text-xs">
                <span className="font-syne font-bold text-offwhite">
                  {TITLE[e.event] ?? e.event}
                </span>
                <span className="text-muted">{when(e.recordedAt)}</span>
                {e.driverName && <span className="text-muted">· {e.driverName}</span>}
                {e.lat != null && e.lng != null && (
                  <a
                    href={`https://www.google.com/maps?q=${e.lat},${e.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-muted hover:text-yellow"
                  >
                    <MapPin size={11} /> where
                  </a>
                )}
              </p>
              {e.note && (
                <p className="mt-0.5 font-dm text-xs text-muted/80">{e.note}</p>
              )}

              <div className="mt-1.5 flex flex-wrap gap-2">
                {e.urls.map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setZoom(u)}
                    className="relative h-24 w-32 overflow-hidden rounded-lg border border-white/12 transition-colors hover:border-yellow/50"
                  >
                    <Image
                      src={u}
                      alt={`${TITLE[e.event] ?? e.event} photo`}
                      fill
                      sizes="128px"
                      className="object-cover"
                      // Signed, short-lived and external: Next's optimiser
                      // would cache a URL that is about to stop working.
                      unoptimized
                    />
                  </button>
                ))}
                {e.urls.length === 0 && (
                  <p className="font-dm text-xs text-red-300">
                    The photos for this handover could not be opened.
                  </p>
                )}
              </div>
            </section>
          ))}

          {data && data.events.length === 0 && (
            <p className="font-dm text-xs text-muted">
              Nothing has been photographed for this car yet.
            </p>
          )}
        </div>
      )}

      {/* Full size. A thumbnail is enough to see there IS a photo and not
          enough to settle whether a panel was already dented. */}
      {zoom && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setZoom(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Photograph of the car"
        >
          <button
            onClick={() => setZoom(null)}
            aria-label="Close"
            className="absolute right-4 top-4 rounded-full border border-white/20 p-2 text-offwhite hover:border-yellow/50"
          >
            <X size={18} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={zoom}
            alt="Photograph of the car"
            className="max-h-full max-w-full rounded-lg object-contain"
          />
        </div>
      )}
    </div>
  );
}
