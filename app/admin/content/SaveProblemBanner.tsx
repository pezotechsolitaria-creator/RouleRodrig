"use client";

import { AlertCircle, RefreshCw, X } from "lucide-react";

// ── WHY A SAVE FAILED, IN THE SERVER'S OWN WORDS ────────────────────────────
//
// architecture review 2026-09-30, item 4. The studio's Save used to throw on
// any non-2xx before reading the body and flash "Error" for three seconds. The
// server had already written the reason — "FAQ questions would drop from 12 to
// 0 in one save", "Could not read the current content, so the save was
// refused" — and it was thrown away one line before the owner could see it.
//
// It stays on screen until dismissed or the next save: a reason that vanishes
// while he is reading it is the same as no reason.
//
// A CONFLICT gets its own treatment. Another tab, /admin/legal or a history
// restore wrote the row after this page loaded; saving anyway would put their
// work back the way it was. The only safe move is to reload, which loses this
// page's unsaved edits — so the banner says that plainly rather than offering
// an "overwrite" button that would do exactly what the check exists to stop.

export type SaveProblem = { kind: "conflict" | "refused"; message: string };

export default function SaveProblemBanner({
  problem,
  onReload,
  onDismiss,
}: {
  problem: SaveProblem;
  onReload: () => void;
  onDismiss: () => void;
}) {
  const conflict = problem.kind === "conflict";
  return (
    <div
      role="alert"
      className={`mx-4 mt-4 flex flex-wrap items-start gap-3 rounded-2xl border px-4 py-3 sm:mx-8 ${
        conflict ? "border-amber-400/40 bg-amber-400/10" : "border-red-500/40 bg-red-500/10"
      }`}
    >
      <AlertCircle size={16} className={`mt-0.5 shrink-0 ${conflict ? "text-amber-300" : "text-red-300"}`} />
      <div className="min-w-0 flex-1">
        <p className="font-syne text-sm font-bold text-offwhite">Not saved</p>
        <p className="mt-0.5 font-dm text-sm text-offwhite/85">{problem.message}</p>
        {conflict && (
          <p className="mt-1 font-dm text-xs text-muted">
            Reloading shows what is on the site now. Changes you made on this page since it opened
            will be lost, so note anything you want to redo first.
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {conflict && (
          <button
            type="button"
            onClick={onReload}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-yellow px-4 font-syne text-xs font-bold text-dark hover:bg-yellow-dark"
          >
            <RefreshCw size={13} /> Reload the studio
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss this message"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted hover:text-offwhite"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
