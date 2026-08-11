"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Check, X, RotateCcw, Keyboard, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { extractTicketId } from "@/lib/events/ticket-code";

// The scanner staff hold at the door.
//
// ── WHY AN IN-APP SCANNER, WHEN THE PICKUP QR DELIBERATELY AVOIDS ONE ───────
// components/orders/PickupQr.tsx encodes a URL so the merchant's own camera app
// does the work — no permission prompt, no decoder, no dependence on
// BarcodeDetector. That is exactly right for a counter, where one customer is
// served at a time.
//
// A door is not a counter. Two hundred people arrive in twenty minutes, and
// opening a browser tab per guest is unusable. So this scans continuously:
// point, result, next. It uses jsQR — already a dependency, used until now only
// by the pickup QR's round-trip test — over getUserMedia, which iOS Safari does
// support (BarcodeDetector, which it does not, is deliberately not used).
//
// ── WHY IT REDEEMS ON SIGHT ─────────────────────────────────────────────────
// ScanHandoff's rule is "preview, then confirm — never redeem on load", because
// there a stray camera flick could close an order irreversibly. Here the whole
// screen IS the deliberate act: staff opened a scanner at a door in order to
// admit people. A confirm tap per guest would double the queue time and would
// be tapped without reading within about five guests, which is worse than not
// asking. The safeguards are instead: the same code is ignored for a few
// seconds so one ticket held in frame cannot be scanned twice, every outcome is
// shown in a colour and word that carry across a noisy entrance, and a re-scan
// reports honestly rather than silently re-admitting.
const SAME_CODE_COOLDOWN_MS = 4000;

type Outcome = {
  outcome: "admitted" | "already_used" | "void";
  serial: number | null;
  ticketType: string | null;
  holderName: string | null;
  eventName: string | null;
  usedAt: string | null;
  voidReason: string | null;
  eventCancelled: boolean;
  earlyByHours: number | null;
};

type Shown = { kind: "ok"; data: Outcome } | { kind: "error"; message: string };

export default function TicketScanner({ eventName }: { eventName: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  // Codes seen recently, so a ticket held in frame is not scanned repeatedly.
  const recentRef = useRef<Map<string, number>>(new Map());
  const busyRef = useRef(false);

  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const [manual, setManual] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [admitted, setAdmitted] = useState(0);

  const redeem = useCallback(async (raw: string) => {
    const publicId = extractTicketId(raw);
    if (!publicId) {
      setShown({ kind: "error", message: "That code isn't a ticket." });
      return;
    }

    const now = Date.now();
    const last = recentRef.current.get(publicId);
    if (last && now - last < SAME_CODE_COOLDOWN_MS) return;
    recentRef.current.set(publicId, now);

    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const res = await fetch("/api/organizer/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setShown({ kind: "error", message: body.error || "Could not read that ticket." });
        return;
      }
      setShown({ kind: "ok", data: body as Outcome });
      if ((body as Outcome).outcome === "admitted") setAdmitted((n) => n + 1);
      // A short vibration is the only feedback that survives a loud entrance
      // where nobody is looking at the screen between guests.
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate((body as Outcome).outcome === "admitted" ? 60 : [50, 60, 50]);
      }
    } catch {
      setShown({ kind: "error", message: "No connection. The ticket was not admitted." });
    } finally {
      busyRef.current = false;
    }
  }, []);

  const tick = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (w === 0 || h === 0) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    const image = ctx.getImageData(0, 0, w, h);

    void (async () => {
      const { default: jsQR } = await import("jsqr");
      const found = jsQR(image.data, image.width, image.height, {
        inversionAttempts: "dontInvert",
      });
      if (found?.data) void redeem(found.data);
    })();

    rafRef.current = requestAnimationFrame(tick);
  }, [redeem]);

  const start = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // The rear camera. Without this a laptop or a phone in a case opens the
        // selfie camera, which cannot see a ticket held out to you.
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // playsInline matters on iOS: without it the video goes fullscreen and
        // takes over the whole screen the moment it plays.
        await videoRef.current.play();
      }
      setScanning(true);
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      setScanning(false);
      const name = e instanceof DOMException ? e.name : "";
      setCameraError(
        name === "NotAllowedError"
          ? "Camera permission was refused. Allow it in your browser settings, or type codes in by hand."
          : name === "NotFoundError"
            ? "No camera on this device. Type codes in by hand instead."
            : "Could not start the camera. Type codes in by hand instead.",
      );
      setShowManual(true);
    }
  }, [tick]);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  // Release the camera when the page goes away. A scanner left holding the
  // camera keeps the phone's indicator on and drains the battery of the person
  // working the door for the rest of the night.
  useEffect(() => stop, [stop]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-dm text-sm text-muted">
          Admitting to <span className="text-offwhite">{eventName}</span>
          {admitted > 0 && <span className="text-yellow"> · {admitted} in</span>}
        </p>
        <div className="flex gap-2">
          {scanning ? (
            <Button size="sm" variant="outline" onClick={stop}>
              <CameraOff size={14} className="mr-1" /> Stop
            </Button>
          ) : (
            <Button size="sm" onClick={() => void start()}>
              <Camera size={14} className="mr-1" /> Start scanning
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setShowManual((v) => !v)}>
            <Keyboard size={14} />
          </Button>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          className={`aspect-[3/4] w-full object-cover ${scanning ? "" : "opacity-30"}`}
        />
        <canvas ref={canvasRef} className="hidden" />
        {!scanning && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
            <Camera className="text-white/40" size={26} />
            <p className="font-dm text-sm text-white/60">
              Press start, then point at each ticket.
            </p>
          </div>
        )}
        {scanning && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-48 w-48 rounded-2xl border-2 border-yellow/70" />
          </div>
        )}
      </div>

      {cameraError && (
        <p role="alert" className="flex items-start gap-2 font-dm text-sm text-orange-300">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {cameraError}
        </p>
      )}

      {showManual && (
        <div className="rounded-2xl border border-white/10 bg-dark-card p-4">
          <label className="block">
            <span className="font-dm text-xs text-muted">Ticket code</span>
            <Input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Paste or type the code from the ticket"
              className="mt-1"
            />
          </label>
          <Button
            className="mt-3 w-full"
            disabled={!extractTicketId(manual)}
            onClick={() => {
              // A hand-typed code is a deliberate act, so it bypasses the
              // repeat-scan cooldown that exists only to tame a live camera.
              const id = extractTicketId(manual);
              if (id) recentRef.current.delete(id);
              void redeem(manual);
              setManual("");
            }}
          >
            Check this ticket
          </Button>
        </div>
      )}

      {shown && <Result shown={shown} onClear={() => setShown(null)} />}
    </div>
  );
}

function Result({ shown, onClear }: { shown: Shown; onClear: () => void }) {
  if (shown.kind === "error") {
    return (
      <div className="rounded-2xl border-2 border-red-500/60 bg-red-500/10 p-5 text-center">
        <X className="mx-auto text-red-400" size={30} />
        <p className="mt-2 font-syne text-xl font-extrabold text-red-300">NOT VALID</p>
        <p className="mt-1 font-dm text-sm text-red-200/80">{shown.message}</p>
        <Button size="sm" variant="outline" className="mt-3" onClick={onClear}>
          <RotateCcw size={13} className="mr-1" /> Next
        </Button>
      </div>
    );
  }

  const d = shown.data;
  const tone =
    d.outcome === "admitted"
      ? { border: "border-green-500/60", bg: "bg-green-500/10", text: "text-green-300", label: "ADMIT" }
      : d.outcome === "already_used"
        ? { border: "border-orange-400/60", bg: "bg-orange-400/10", text: "text-orange-300", label: "ALREADY USED" }
        : { border: "border-red-500/60", bg: "bg-red-500/10", text: "text-red-300", label: "VOID" };

  return (
    <div className={`rounded-2xl border-2 ${tone.border} ${tone.bg} p-5 text-center`}>
      {d.outcome === "admitted" ? (
        <Check className="mx-auto text-green-400" size={34} />
      ) : (
        <AlertTriangle className={`mx-auto ${tone.text}`} size={30} />
      )}
      <p className={`mt-2 font-syne text-2xl font-extrabold ${tone.text}`}>{tone.label}</p>

      <p className="mt-1 font-dm text-base text-offwhite">
        {d.ticketType ?? "Ticket"}
        {d.serial != null && <span className="text-muted"> · #{d.serial}</span>}
      </p>
      {d.holderName && <p className="font-dm text-sm text-muted">{d.holderName}</p>}

      {d.outcome === "already_used" && d.usedAt && (
        <p className="mt-2 font-dm text-sm text-orange-200/90">
          Scanned at {new Date(d.usedAt).toLocaleTimeString()}. If this is the same person, let them
          through — if not, this ticket has been copied.
        </p>
      )}
      {d.outcome === "void" && (
        <p className="mt-2 font-dm text-sm text-red-200/90">
          {d.voidReason ? `Cancelled: ${d.voidReason}.` : "This ticket was cancelled."} Do not admit.
        </p>
      )}
      {d.eventCancelled && (
        <p className="mt-2 font-dm text-sm text-red-200">This event is cancelled.</p>
      )}
      {d.outcome === "admitted" && (d.earlyByHours ?? 0) > 24 && (
        <p className="mt-2 font-dm text-sm text-orange-200/90">
          Note: this event does not start for another {Math.floor((d.earlyByHours ?? 0) / 24)} day
          {Math.floor((d.earlyByHours ?? 0) / 24) === 1 ? "" : "s"}.
        </p>
      )}

      <Button size="sm" variant="outline" className="mt-3" onClick={onClear}>
        <RotateCcw size={13} className="mr-1" /> Next
      </Button>
    </div>
  );
}
