"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ChevronLeft, ChevronRight, History, Loader2, RefreshCw, RotateCcw } from "lucide-react";
import { sectionLabel, type CollectionCount } from "@/lib/admin/content-history";

// ── THE HISTORY DESK (architecture review 2026-09-30, item 6) ───────────────
//
// Newest first, ten to a page. Each snapshot says which sections of the site
// differ from now; Restore opens a confirm step that names those sections and
// every collection whose size would change ("Island guide places 42 → 38"),
// because that one line is what stops the wrong day being restored. The route
// copies today's content into this list before it writes, so the confirm step
// can say truthfully that a restore is undoable.

type Snapshot = { id: string; createdAt: string; changed: string[]; counts: CollectionCount[] };
type Page = { page: number; hasMore: boolean; current: { version: string }; snapshots: Snapshot[] };

const chip =
  "inline-flex min-h-11 items-center gap-1.5 rounded-full border border-white/15 px-3 font-dm text-xs text-muted hover:border-yellow/50 hover:text-yellow disabled:opacity-40";

export function formatSnapshotTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    timeZone: "Indian/Mauritius",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function RestoreConfirm({
  snapshot,
  busy,
  onConfirm,
  onCancel,
}: {
  snapshot: Snapshot;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div role="alertdialog" aria-label="Confirm restore" className="mt-3 space-y-3 rounded-xl border border-amber-400/40 bg-amber-400/5 p-4">
      <p className="font-syne text-sm font-bold text-offwhite">
        Put the website back to {formatSnapshotTime(snapshot.createdAt)}?
      </p>
      <div className="font-dm text-xs text-offwhite/85">
        <p>These sections will change: {snapshot.changed.map(sectionLabel).join(", ")}.</p>
        {snapshot.counts.length > 0 && (
          <ul className="mt-2 space-y-0.5">
            {snapshot.counts.map((c) => (
              <li key={c.key}>
                {c.label}: {c.now} now → {c.then} after the restore
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="font-dm text-xs text-muted">
        Today&apos;s content is copied into this list first, so you can come back to it. Any content
        studio tab that is open now will ask to be reloaded before it saves.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-yellow px-5 font-syne text-sm font-bold text-dark hover:bg-yellow-dark disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} Restore this version
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className={chip}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function ContentHistoryDesk() {
  const [page, setPage] = useState(0);
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/content-history?page=${p}`);
      const b = (await r.json().catch(() => ({}))) as Page & { error?: string };
      if (!r.ok) throw new Error(b.error || `Could not load the history (error ${r.status}).`);
      setData(b);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the history.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  async function restore(s: Snapshot) {
    if (!data) return;
    setRestoring(true);
    try {
      const r = await fetch("/api/admin/content-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: s.id, expectedVersion: data.current.version }),
      });
      const b = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        toast.error(
          r.status === 401
            ? "Your admin session has expired — sign in again. Nothing was restored."
            : b.error || `The restore failed (error ${r.status}). Nothing was changed.`,
        );
        if (r.status === 409) await load(page);
        return;
      }
      toast.success(`Restored the version from ${formatSnapshotTime(s.createdAt)}. Today's content is saved at the top of this list.`);
      setConfirming(null);
      setPage(0);
      await load(0);
    } catch {
      toast.error("Could not reach the server — you appear to be offline. Nothing was restored.");
    } finally {
      setRestoring(false);
    }
  }

  if (error) {
    return (
      <div role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5">
        <p className="flex items-center gap-2 font-dm text-sm text-red-300">
          <AlertTriangle size={15} /> {error}
        </p>
        <button type="button" onClick={() => void load(page)} className={`mt-3 ${chip}`}>
          <RefreshCw size={12} /> Try again
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <p className="flex items-center gap-2 font-dm text-sm text-muted">
        <Loader2 size={15} className="animate-spin" /> Loading the history…
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {data.snapshots.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-dark-card p-6 text-center">
          <History size={28} className="mx-auto text-muted/40" />
          <p className="mt-2 font-dm text-sm text-muted">
            {page === 0 ? "No copies yet. One is taken each night the content has changed." : "No older copies."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {data.snapshots.map((s) => {
            const same = s.changed.length === 0;
            return (
              <li key={s.id} className="rounded-2xl border border-white/10 bg-dark-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-syne text-sm font-bold text-offwhite">{formatSnapshotTime(s.createdAt)}</p>
                    <p className="mt-1 font-dm text-xs text-muted">
                      {same
                        ? "Identical to the website as it is now."
                        : `Differs from now in: ${s.changed.map(sectionLabel).join(", ")}`}
                    </p>
                  </div>
                  {!same && confirming !== s.id && (
                    <button type="button" onClick={() => setConfirming(s.id)} className={chip}>
                      <RotateCcw size={12} /> Restore…
                    </button>
                  )}
                </div>
                {confirming === s.id && (
                  <RestoreConfirm
                    snapshot={s}
                    busy={restoring}
                    onConfirm={() => void restore(s)}
                    onCancel={() => setConfirming(null)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0 || loading}
          className={chip}
        >
          <ChevronLeft size={14} /> Newer
        </button>
        <span className="font-dm text-xs text-muted">
          {loading ? <Loader2 size={13} className="animate-spin" /> : `Page ${page + 1}`}
        </span>
        <button
          type="button"
          onClick={() => setPage((p) => p + 1)}
          disabled={!data.hasMore || loading}
          className={chip}
        >
          Older <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
