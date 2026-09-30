"use client";

import { useEffect, useState } from "react";

// ── The hero's status strip ──────────────────────────────────────────────────
// A phone's status bar, the one thing every buyer is picturing: four bars, the
// network name, and — on the home shelf — the real time on Rodrigues. The bars
// light up in turn once (the store's one authored motion moment); the clock is
// the island's actual time, a small true fact rather than decoration.

export default function SignalStrip({
  network,
  place,
  clockLabel,
}: {
  /** "my.t 4G" */
  network: string;
  /** "RODRIGUES", "FRANCE" */
  place: string;
  /** When set, shows Rodrigues' live time with this accessible label. */
  clockLabel?: string;
}) {
  const [time, setTime] = useState<string | null>(null);

  useEffect(() => {
    if (!clockLabel) return;
    const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Indian/Mauritius", hour: "2-digit", minute: "2-digit" });
    const tick = () => setTime(fmt.format(new Date()));
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [clockLabel]);

  return (
    <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.03] py-1.5 pl-3 pr-3.5">
      <span className="flex h-3.5 items-end gap-[3px]" aria-hidden>
        {[5, 8, 11, 14].map((h, i) => (
          <span
            key={h}
            className="rr-esim-bar w-[3px] rounded-[1px] bg-yellow"
            style={{ height: h, animationDelay: `${180 + i * 140}ms` }}
          />
        ))}
      </span>
      <span className="font-bebas text-[13px] leading-none tracking-[0.2em] text-offwhite">
        {network} <span className="text-muted">·</span> {place}
      </span>
      {clockLabel && (
        <span className="font-bebas text-[13px] leading-none tracking-[0.12em] text-muted" aria-label={time ? `${clockLabel} ${time}` : clockLabel}>
          {/* Rendered only after mount: the server does not know the minute
              the reader will see, and a mismatch would break hydration. */}
          {time ?? "--:--"}
        </span>
      )}
    </div>
  );
}
