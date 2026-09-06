"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2, Info } from "lucide-react";
import {
  currentPushState,
  enablePush,
  disablePush,
  type PushState,
  type PushTarget,
} from "@/lib/push/subscribe";

// Turning on the alert that makes the work findable.
//
// Written for the driver console — without it a driver only sees an offer while
// the page is open, and offers expire — and reused verbatim by /organizer, which
// had no way to subscribe at all. The permission dance, the denied state and the
// "reopen it in browser settings" instructions are the same problem on both
// screens, and a second copy is a second place for the denied branch to rot.
//
// `target` picks which endpoint registers the device; `title` and the two lines
// of copy are all that differ between audiences.
export default function AlertsToggle({
  target,
  title = "Job alerts",
  onCopy = "Your phone will ring for a new job even with the app closed.",
  offCopy = "Turn these on or you'll only see jobs while this page is open.",
}: {
  target?: PushTarget;
  title?: string;
  onCopy?: string;
  offCopy?: string;
} = {}) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void currentPushState().then(setState);
  }, []);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (state === "on") {
        setState(await disablePush(target));
      } else {
        const result = await enablePush(target);
        setState(result.state);
        if (result.error) setError(result.error);
      }
    } finally {
      setBusy(false);
    }
  }

  // Nothing to offer on a browser that cannot receive push, and a dead switch is
  // worse than no switch.
  if (state === null || state === "unsupported") return null;

  const on = state === "on";
  const denied = state === "denied";

  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-dark-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-syne text-sm font-bold">
            {on ? <Bell size={15} className="text-yellow" /> : <BellOff size={15} className="text-muted" />}
            {title} {on ? "on" : "off"}
          </p>
          <p className="mt-0.5 font-dm text-xs text-muted">
            {on ? onCopy : offCopy}
          </p>
        </div>
        {!denied && (
          <button
            onClick={() => void toggle()}
            disabled={busy}
            aria-pressed={on}
            className={`min-h-[44px] shrink-0 rounded-full px-5 font-syne text-sm font-bold transition-colors disabled:opacity-50 ${
              on ? "border border-white/20 text-offwhite" : "bg-yellow text-dark"
            }`}
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : on ? "Turn off" : "Turn on"}
          </button>
        )}
      </div>

      {denied && (
        // Permission cannot be re-requested once denied — the only route back is
        // the browser's own settings, so say where instead of showing a button
        // that will silently do nothing.
        <p className="mt-3 flex items-start gap-2 font-dm text-xs text-orange-300">
          <Info size={14} className="mt-0.5 shrink-0" />
          You blocked notifications for this site. Reopen them in your browser settings — tap the padlock in the
          address bar, then Notifications, then Allow.
        </p>
      )}

      {error && <p className="mt-3 font-dm text-xs text-red-400">{error}</p>}
    </div>
  );
}
