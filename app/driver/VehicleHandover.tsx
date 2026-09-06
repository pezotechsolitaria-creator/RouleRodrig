"use client";

import { useRef, useState } from "react";
import { Camera, CarFront, CheckCircle2, Loader2, X } from "lucide-react";

// ── Photographing somebody's car before you drive it away ───────────────────
//
// This is the only screen on the platform where the person tapping is about to
// take possession of something worth more than everything else on the site,
// and where "it already had that scratch" is an argument nobody can settle
// later without a picture taken now.
//
// So the button does not say "collected". It says take photos, and it cannot be
// pressed until there is at least one — the same rule the RPC enforces and a
// table CHECK backs, because a handover record with no photograph is worse than
// none: it looks like proof.
//
// ── WHY IT IS NOT A "MARK AS DONE" TICK ────────────────────────────────────
// The custody state the owner sees is DERIVED from these two rows — collected
// with no return means the car is out. There is deliberately no status field
// for anybody to set by hand, so what the admin board shows can never drift
// from what a driver actually did at the car.

type Props = {
  requestId: string;
  plate: string | null;
  /** Which handover is next. Null when both are already recorded. */
  next: "collected" | "returned" | null;
  onDone: () => void;
};

export default function VehicleHandover({ requestId, plate, next, onDone }: Props) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!next) {
    return (
      <p className="mt-3 flex items-center gap-2 rounded-xl border border-green-500/25 bg-green-500/[0.06] px-3.5 py-2.5 font-dm text-xs text-green-300">
        <CheckCircle2 size={14} className="shrink-0" />
        Car collected and returned — both handovers are photographed.
      </p>
    );
  }

  async function addPhoto(file: File) {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/delivery-requests/photo", { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.path) throw new Error(body.error || "Could not save that photo.");
      setPhotos((p) => [...p, body.path as string].slice(0, 6));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that photo.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function submit() {
    if (busy || photos.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      // Where the car changed hands, when the browser will say. Best effort:
      // a refused permission must never block the driver from recording the
      // handover, which is the part that matters.
      const at = await new Promise<{ lat?: number; lng?: number }>((resolve) => {
        if (!navigator.geolocation) return resolve({});
        const done = (v: { lat?: number; lng?: number }) => resolve(v);
        navigator.geolocation.getCurrentPosition(
          (p) => done({ lat: p.coords.latitude, lng: p.coords.longitude }),
          () => done({}),
          { timeout: 4000, maximumAge: 60_000 },
        );
      });

      const res = await fetch("/api/driver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "vehicle_custody",
          requestId,
          event: next,
          photos,
          ...at,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not record that.");
      setPhotos([]);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record that.");
    } finally {
      setBusy(false);
    }
  }

  const collecting = next === "collected";

  return (
    <div className="mt-3 rounded-xl border border-yellow/30 bg-yellow/[0.05] p-3.5">
      <p className="flex items-center gap-2 font-syne text-sm font-bold text-offwhite">
        <CarFront size={15} className="text-yellow" />
        {collecting ? "Before you drive away" : "Before you hand it back"}
        {plate && <span className="font-dm text-xs text-muted">· {plate}</span>}
      </p>
      <p className="mt-1 font-dm text-xs text-muted">
        {collecting
          ? "Photograph the car from a few angles, including any damage you can see. This is what protects you if anything is questioned later."
          : "Photograph it again now it is back, so the state you returned it in is on record."}
      </p>

      {photos.length > 0 && (
        <ul className="mt-2.5 flex flex-wrap gap-1.5">
          {photos.map((p) => (
            <li
              key={p}
              className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-dark px-2.5 py-1 font-dm text-[11px] text-muted"
            >
              <Camera size={11} className="text-yellow/80" />
              photo
              <button
                type="button"
                onClick={() => setPhotos((v) => v.filter((x) => x !== p))}
                aria-label="Remove this photo"
                className="ml-0.5 text-muted hover:text-red-300"
              >
                <X size={11} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        // The rear camera, straight away. A driver standing at a car should not
        // be sent into a gallery to find a picture they have not taken yet.
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void addPhoto(f);
        }}
      />

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading || photos.length >= 6}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-white/20 px-4 font-syne text-sm font-bold text-offwhite disabled:opacity-50"
        >
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
          {photos.length === 0 ? "Take a photo" : "Another"}
        </button>

        <button
          type="button"
          onClick={() => void submit()}
          // Disabled until there is evidence. The whole feature is this rule.
          disabled={busy || photos.length === 0}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-yellow px-4 font-syne text-sm font-bold text-dark disabled:opacity-40"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
          {collecting ? "I have the car" : "Car returned"}
        </button>
      </div>

      {photos.length === 0 && (
        <p className="mt-2 font-dm text-[11px] text-muted">
          At least one photo is needed before this can be recorded.
        </p>
      )}
      {error && <p className="mt-2 font-dm text-xs text-red-400">{error}</p>}
    </div>
  );
}
