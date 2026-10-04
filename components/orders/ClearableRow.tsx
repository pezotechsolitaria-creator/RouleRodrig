"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import type { HideKind } from "@/lib/hide/kinds";

// ── CLEAR A FINISHED ITEM FROM MY LIST (M234) ──────────────────────────────
//
// The row's own link stays exactly as it was; the clear control sits BESIDE
// it, never inside it — a button inside an <a> is invalid HTML and steals the
// tap meant for the link.
//
// Cleared is a state of THIS row, not a page reload: the row turns into
// "Cleared from your list · Undo" until the next visit, when the server no
// longer lists it. No toast host exists on public pages, and an Undo the
// customer can still see is better than one that vanished with a refresh.
//
// Focus and announcements (review, 4 Oct 2026): the control that was pressed
// disappears in both directions, so focus is moved to its replacement — Undo
// after a clear, the clear button after an Undo — instead of falling to <body>
// at the top of a long history; and the outcome is said in a polite live
// region, so a screen-reader user hears that it worked.
//
// Shown only on finished items. The database refuses anything still live
// (409, "still_live"), and every refusal or failure is said in words, in
// whichever state the row is in.

type Copy = {
  clearItem: string;
  clearedItem: string;
  undo: string;
  clearStillLive: string;
  clearFailed: string;
};

export default function ClearableRow({
  kind,
  id,
  clearable,
  reserveSpace = false,
  copy,
  children,
}: {
  kind: HideKind;
  id: string;
  clearable: boolean;
  /** Keep an empty 44px column on a row that cannot be cleared, so a list
   *  mixing both keeps its cards the same width. */
  reserveSpace?: boolean;
  copy: Copy;
  children: ReactNode;
}) {
  const [state, setState] = useState<"shown" | "cleared">("shown");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // Where focus goes after the state flips; null on first render.
  const [focusTarget, setFocusTarget] = useState<"undo" | "clear" | null>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  const clearRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (focusTarget === "undo") undoRef.current?.focus();
    if (focusTarget === "clear") clearRef.current?.focus();
  }, [focusTarget, state]);

  async function send(hidden: boolean): Promise<boolean> {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/hide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id, hidden }),
      });
      if (res.ok) return true;
      const body = (await res.json().catch(() => ({}))) as { reason?: string };
      setNote(body.reason === "still_live" ? copy.clearStillLive : copy.clearFailed);
      return false;
    } catch {
      setNote(copy.clearFailed);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const noteLine = note && (
    <p className="mt-1 font-dm text-[11px] text-orange-200" role="status">{note}</p>
  );

  if (!clearable) {
    if (!reserveSpace) return <>{children}</>;
    return (
      <div className="flex items-stretch gap-2">
        <div className="min-w-0 flex-1">{children}</div>
        <div className="w-11 shrink-0" aria-hidden />
      </div>
    );
  }

  if (state === "cleared") {
    return (
      <div>
        <div className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-2">
          <span className="font-dm text-xs text-muted" role="status" aria-live="polite">
            {copy.clearedItem}
          </span>
          <button
            ref={undoRef}
            type="button"
            disabled={busy}
            onClick={async () => {
              if (await send(false)) {
                setState("shown");
                setFocusTarget("clear");
              }
            }}
            className="min-h-11 rounded-full px-3 font-dm text-xs font-semibold text-yellow hover:underline disabled:opacity-50"
          >
            {copy.undo}
          </button>
        </div>
        {noteLine}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-stretch gap-2">
        <div className="min-w-0 flex-1">{children}</div>
        <button
          ref={clearRef}
          type="button"
          aria-label={copy.clearItem}
          title={copy.clearItem}
          disabled={busy}
          onClick={async () => {
            if (await send(true)) {
              setState("cleared");
              setFocusTarget("undo");
            }
          }}
          className="flex w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-dark-card text-muted transition-colors hover:border-red-400/40 hover:text-red-300 disabled:opacity-50"
        >
          <X size={16} aria-hidden />
        </button>
      </div>
      {noteLine}
    </div>
  );
}
