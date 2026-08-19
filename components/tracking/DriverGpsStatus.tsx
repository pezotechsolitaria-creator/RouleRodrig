"use client";

import {
  Loader2, Satellite, SatelliteDish, AlertTriangle, Compass, PauseCircle,
} from "lucide-react";
import type { DriverTrackingState } from "@/lib/tracking/useDriverTracking";

// ── WHY THE DOT IS OR IS NOT THERE, IN THE DRIVER'S WORDS ───────────────────
//
// Shared by the taxi and delivery screens so this wording exists ONCE. It is the
// part most likely to drift and the part that matters most: a driver whose
// location is off is invisible to dispatch and to their customer, and the way
// they normally find out is an angry phone call.
//
// Every state names a CAUSE and, where one exists, a fix. "Location unavailable"
// on its own is what makes a feature feel broken rather than blocked.

export default function DriverGpsStatus({
  tracking, working, hasJob,
}: {
  tracking: DriverTrackingState;
  working: boolean;
  hasJob: boolean;
}) {
  if (!working) return null;

  const banner = (() => {
    switch (tracking.gps) {
      case "paused":
        return {
          tone: "warn" as const,
          icon: <PauseCircle size={16} />,
          title: "Sharing paused — this page isn't in front",
          body: "Your phone stops updating your position when you switch to another app or lock the screen. Your customer can still see where you were last. Come back to this page and it starts again on its own.",
          action: null,
        };
      case "denied":
        return {
          tone: "bad" as const,
          icon: <AlertTriangle size={16} />,
          title: "Location is blocked",
          body: "Roulé Rodrigues can't see where you are, so you won't be offered the jobs nearest you and your customer can't watch you arrive. Tap the padlock or ⓘ next to the web address → Permissions → Location → Allow, then press Try again.",
          action: "Try again",
        };
      case "unsupported":
        return {
          tone: "bad" as const,
          icon: <AlertTriangle size={16} />,
          title: "This phone can't share location",
          body: "You'll still get work — the office will place you by hand — but your customer won't see you moving.",
          action: null,
        };
      case "off_island":
        return {
          tone: "warn" as const,
          icon: <Compass size={16} />,
          title: "You don't look like you're on Rodrigues",
          body: "Your phone is reporting a position far from the island, so it isn't being shared. That's normal on a test phone or with a VPN switched on.",
          action: "Try again",
        };
      case "poor":
        return {
          tone: "warn" as const,
          icon: <Satellite size={16} />,
          title: `Weak signal — accurate to about ${Math.round(tracking.accuracyM ?? 0)} m`,
          body: "Your dot may wander. It usually settles once you're moving and out from under cover.",
          action: null,
        };
      case "prompting":
      case "searching":
        return {
          tone: "info" as const,
          icon: <Loader2 size={16} className="animate-spin" />,
          title: "Finding your position…",
          body: "Say Allow if your phone asks. This can take a few seconds the first time.",
          action: null,
        };
      default:
        return null;
    }
  })();

  const live = tracking.gps === "live";
  const paused = tracking.gps === "paused";

  return (
    <div className="space-y-2.5">
      <div
        className={`flex items-center gap-2.5 rounded-2xl border px-4 py-3 ${
          live ? "border-green-500/30 bg-green-500/[0.07]" : "border-white/10 bg-dark-card"
        }`}
      >
        {live ? (
          <SatelliteDish size={17} className="shrink-0 text-green-400" />
        ) : paused ? (
          <PauseCircle size={17} className="shrink-0 text-yellow" />
        ) : (
          <Satellite size={17} className="shrink-0 text-muted" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block font-dm text-sm font-bold text-offwhite">
            {live
              ? "Roulé Rodrigues can see you"
              : paused
                ? "Paused while you're in another app"
                : "Location not shared yet"}
          </span>
          <span className="block font-dm text-[11px] leading-relaxed text-muted">
            {live
              ? hasJob
                ? "Your customer can watch you on the map."
                : "You'll be offered the jobs nearest you."
              : paused
                ? "Come back to this page to start again."
                : "Keep this page open while you work."}
          </span>
        </span>
      </div>

      {/* ── THE THREE THINGS A DRIVER HAS TO DO ─────────────────────────
          Said once, plainly, and only while they are on duty — which is the
          only time any of it is actionable. A driver on their first day should
          not have to infer this from an error message that has not happened
          yet.

          Deliberately NOT "keep your screen bright": the page has to stay in
          front, but the display can dim, and telling somebody to burn their
          battery for no reason is how the instruction stops being believed. */}
      {live && (
        <ul className="space-y-1.5 rounded-2xl border border-white/10 bg-dark-card px-4 py-3">
          {[
            "Keep this page in front while you're on a job.",
            "Your screen can dim — just don't switch to another app.",
            "If you do, sharing pauses and starts again when you come back.",
          ].map((line) => (
            <li key={line} className="flex items-start gap-2 font-dm text-[11px] leading-relaxed text-muted">
              <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-yellow" />
              {line}
            </li>
          ))}
        </ul>
      )}

      {banner && (
        <div
          className={`rounded-2xl border p-4 ${
            banner.tone === "bad"
              ? "border-orange-400/30 bg-orange-400/[0.07]"
              : banner.tone === "warn"
                ? "border-yellow/30 bg-yellow/[0.06]"
                : "border-white/10 bg-dark-card"
          }`}
        >
          <p className="flex items-center gap-2 font-dm text-sm font-bold text-offwhite">
            <span className={banner.tone === "bad" ? "text-orange-300" : "text-yellow"}>
              {banner.icon}
            </span>
            {banner.title}
          </p>
          <p className="mt-1.5 font-dm text-xs leading-relaxed text-offwhite/75">{banner.body}</p>
          {banner.action && (
            <button
              onClick={tracking.retry}
              className="mt-2.5 rounded-full border border-white/20 px-4 py-2 font-dm text-xs font-bold text-offwhite hover:border-yellow/50 hover:text-yellow"
            >
              {banner.action}
            </button>
          )}
        </div>
      )}

      {tracking.serverError && (
        <p role="status" className="font-dm text-xs text-orange-300">{tracking.serverError}</p>
      )}
    </div>
  );
}
