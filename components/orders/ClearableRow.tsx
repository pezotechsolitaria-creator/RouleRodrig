"use client";

import { useState, type ReactNode } from "react";
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
// Shown only on finished items. The database refuses anything still live
// (409, "still_live"), and that refusal is said in words rather than ignored.

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
  copy,
  children,
}: {
  kind: HideKind;
  id: string;
  clearable: boolean;
  copy: Copy;
  children: ReactNode;
}) {
  const [state, setState] = useState<"shown" | "busy" | "cleared">("shown");
  const [note, setNote] = useState<string | null>(null);

  async function send(hidden: boolean): Promise<boolean> {
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
    }
  }

  if (!clearable) return <>{children}</>;

  if (state === "cleared") {
    return (
      <div className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-2">
        <span className="font-dm text-xs text-muted">{copy.clearedItem}</span>
        <button
          type="button"
          onClick={async () => {
            setNote(null);
            if (await send(false)) setState("shown");
          }}
          className="min-h-11 rounded-full px-3 font-dm text-xs font-semibold text-yellow hover:underline"
        >
          {copy.undo}
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-stretch gap-2">
        <div className="min-w-0 flex-1">{children}</div>
        <button
          type="button"
          aria-label={copy.clearItem}
          title={copy.clearItem}
          disabled={state === "busy"}
          onClick={async () => {
            setNote(null);
            setState("busy");
            setState((await send(true)) ? "cleared" : "shown");
          }}
          className="flex w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-dark-card text-muted transition-colors hover:border-red-400/40 hover:text-red-300 disabled:opacity-50"
        >
          <X size={16} aria-hidden />
        </button>
      </div>
      {note && <p className="mt-1 font-dm text-[11px] text-orange-200" role="status">{note}</p>}
    </div>
  );
}
