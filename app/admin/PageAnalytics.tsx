"use client";

import { useEffect, useState } from "react";
import { BarChart3, Loader2, AlertTriangle } from "lucide-react";
import type { PageReport, SectionRow } from "@/lib/analytics/pages";

// ── WHICH PARTS OF THE SITE ARE WORKING ─────────────────────────────────────
//
// Reads back the $pageview data PostHog has been collecting all along, rolled
// up into parts of the BUSINESS rather than URLs, and paired with the enquiries
// in lead_events over the same window.
//
// The screen is arranged around the question the owner actually asked — which
// pages work most and least — so the three blocks are: busiest, quietest, and
// the one that earns the screen its place, "looked at, never acted on". A page
// that everyone visits and nobody uses is invisible in a top-ten list, and it
// is the only kind of finding that tells you what to change.

type Payload =
  | ({ ok: true; leadsByKind: Record<string, number> } & PageReport)
  | { ok: false; reason: string; detail: string };

const WINDOWS = [7, 30, 90];

export default function PageAnalytics() {
  const [days, setDays] = useState(30);
  // The answer is stored WITH the window it answers, so `loading` is derived
  // rather than a second piece of state that can disagree with the first — and
  // a late reply for 7 days cannot overwrite a fresh one for 30.
  const [result, setResult] = useState<{
    days: number;
    payload: Payload;
  } | null>(null);
  const loading = !result || result.days !== days;
  const data = result?.payload ?? null;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let payload: Payload;
      try {
        const res = await fetch(`/api/admin/analytics/pages?days=${days}`, {
          cache: "no-store",
        });
        payload = (await res.json()) as Payload;
      } catch {
        payload = {
          ok: false,
          reason: "network",
          detail: "Could not load analytics.",
        };
      }
      if (!cancelled) setResult({ days, payload });
    })();
    return () => {
      cancelled = true;
    };
  }, [days]);

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-syne text-base font-extrabold">
          <BarChart3 size={16} className="text-yellow" /> Which pages are
          working
        </h2>
        <div className="flex gap-1" role="group" aria-label="Time window">
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setDays(w)}
              aria-pressed={days === w}
              className={`min-h-9 rounded-lg border px-3 font-dm text-xs font-semibold transition-colors ${
                days === w
                  ? "border-yellow bg-yellow/[0.12] text-yellow"
                  : "border-white/15 text-muted hover:text-offwhite"
              }`}
            >
              {w}d
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <p className="mt-3 flex items-center gap-2 rounded-2xl border border-white/10 bg-dark-card px-5 py-8 font-dm text-sm text-muted">
          <Loader2 size={15} className="animate-spin" /> Reading the last {days}{" "}
          days…
        </p>
      )}

      {!loading && data && !data.ok && (
        <div className="mt-3 rounded-2xl border border-yellow/30 bg-yellow/[0.06] px-5 py-4">
          <p className="flex items-start gap-2 font-dm text-sm text-offwhite">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-yellow" />
            {data.detail}
          </p>
        </div>
      )}

      {!loading && data && data.ok && data.totalViews === 0 && (
        <p className="mt-3 rounded-2xl border border-white/10 bg-dark-card px-5 py-8 text-center font-dm text-sm text-muted">
          No page views recorded in the last {days} days.
        </p>
      )}

      {!loading && data && data.ok && data.totalViews > 0 && (
        <div className="mt-3 space-y-4">
          <p className="font-dm text-xs text-muted">
            <span className="font-bold text-offwhite tabular-nums">
              {data.totalViews.toLocaleString("en-GB")}
            </span>{" "}
            page views in {days} days, grouped by part of the business.
          </p>

          {/* The finding, first — it is the reason to open this screen. */}
          {data.attentionWithoutAction.length > 0 && (
            <div className="rounded-2xl border border-orange-400/30 bg-orange-400/[0.06] p-4">
              <h3 className="font-syne text-sm font-bold text-orange-200">
                Looked at, never acted on
              </h3>
              <p className="mt-1 font-dm text-xs text-orange-100/70">
                Real traffic, no enquiries in {days} days. These are the pages
                worth changing first.
              </p>
              <ul className="mt-2.5 space-y-1.5">
                {data.attentionWithoutAction.map((s) => (
                  <li
                    key={s.section}
                    className="flex items-baseline justify-between gap-3 font-dm text-sm"
                  >
                    <span className="min-w-0 truncate text-offwhite">
                      {s.section}
                    </span>
                    <span className="shrink-0 tabular-nums text-orange-200">
                      {s.views.toLocaleString("en-GB")} views · 0 enquiries
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Ranked
              title="Busiest"
              rows={data.busiest}
              total={data.totalViews}
            />
            <Ranked
              title="Quietest"
              rows={data.quietest}
              total={data.totalViews}
              note="Pages people reach, but rarely. A page with no views at all is not listed — that is usually a navigation problem, not a content one."
            />
          </div>
        </div>
      )}
    </section>
  );
}

function Ranked({
  title,
  rows,
  total,
  note,
}: {
  title: string;
  rows: SectionRow[];
  total: number;
  note?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-dark-card p-4">
      <h3 className="font-syne text-sm font-bold text-offwhite">{title}</h3>
      <ul className="mt-2.5 space-y-2">
        {rows.map((s) => {
          const pct = total > 0 ? Math.round((s.views / total) * 100) : 0;
          return (
            <li key={s.section}>
              <div className="flex items-baseline justify-between gap-3 font-dm text-[13px]">
                <span className="min-w-0 truncate text-offwhite/90">
                  {s.section}
                </span>
                <span className="shrink-0 tabular-nums text-muted">
                  {s.views.toLocaleString("en-GB")}
                  {/* null means this section has no enquiry route at all —
                      different from nobody enquiring, and never shown as 0%. */}
                  {s.leadsPerHundred !== null && (
                    <span
                      className={
                        s.leads > 0 ? " text-green-300" : " text-orange-300"
                      }
                    >
                      {" · "}
                      {s.leads} enq
                    </span>
                  )}
                </span>
              </div>
              <div
                className="mt-1 h-1 rounded-full bg-white/10"
                aria-hidden="true"
              >
                <div
                  className="h-full rounded-full bg-yellow/70"
                  style={{ width: `${Math.max(2, pct)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      {note && <p className="mt-2.5 font-dm text-[11px] text-muted">{note}</p>}
    </div>
  );
}
