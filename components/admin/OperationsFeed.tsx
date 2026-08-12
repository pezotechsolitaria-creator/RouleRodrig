"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, AlertCircle, Info, Loader2, CheckCircle2 } from "lucide-react";

// The owner's "what needs me right now" panel.
//
// Derived from live state, not an inbox — see M67. An item vanishes when the
// problem is fixed, which means this panel can never lie to you about the state
// of the business the way a stale unread list does.

type Item = {
  severity: "critical" | "high" | "notice";
  kind: string;
  title: string;
  detail: string;
  link: string;
  id: string;
};
type Feed = { items: Item[]; counts: { critical: number; high: number; notice: number } };

const STYLE: Record<Item["severity"], { dot: string; icon: typeof AlertTriangle; label: string }> = {
  critical: { dot: "text-red-400", icon: AlertTriangle, label: "Critical" },
  high: { dot: "text-orange-300", icon: AlertCircle, label: "High" },
  notice: { dot: "text-blue-300", icon: Info, label: "Notice" },
};

export default function OperationsFeed() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/operations", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not load.");
      setFeed(body as Feed);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load.");
    }
  }, []);

  useEffect(() => {
    void load();
    // A minute is right: the things here (a stalled delivery, a dead worker)
    // change on the order of minutes, not seconds.
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [load]);

  if (error) {
    return <p className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 font-dm text-sm text-red-300">{error}</p>;
  }
  if (!feed) {
    return (
      <div className="flex items-center gap-2 font-dm text-sm text-muted">
        <Loader2 size={14} className="animate-spin" /> Checking operations…
      </div>
    );
  }

  // The calm state is a feature. If this says nothing needs you, nothing does.
  if (feed.items.length === 0) {
    return (
      <div className="flex items-center gap-2.5 rounded-2xl border border-green-500/20 bg-green-500/5 p-4">
        <CheckCircle2 size={18} className="shrink-0 text-green-400" />
        <p className="font-dm text-sm text-green-300">Nothing needs you. Everything is moving.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {(["critical", "high", "notice"] as const).map((s) =>
          feed.counts[s] > 0 ? (
            <span
              key={s}
              className={`rounded-full border border-white/10 px-3 py-1 font-dm text-xs ${STYLE[s].dot}`}
            >
              {STYLE[s].label} — {feed.counts[s]}
            </span>
          ) : null,
        )}
      </div>

      <ul className="space-y-2">
        {feed.items.map((it) => {
          const Icon = STYLE[it.severity].icon;
          return (
            <li key={`${it.kind}:${it.id}`}>
              <Link
                href={it.link}
                className="flex items-start gap-3 rounded-xl border border-white/10 bg-dark-card p-3.5 transition-colors hover:border-yellow/30"
              >
                <Icon size={16} className={`mt-0.5 shrink-0 ${STYLE[it.severity].dot}`} />
                <div className="min-w-0">
                  <p className="font-syne text-sm font-bold">{it.title}</p>
                  <p className="mt-0.5 font-dm text-xs text-muted">{it.detail}</p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
