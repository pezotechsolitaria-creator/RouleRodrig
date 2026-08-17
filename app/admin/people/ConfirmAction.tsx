"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";
import {
  ACTION_RISK,
  confirmWordFor,
  describeAction,
  needsReason,
  type PeopleAction,
  type PersonKind,
} from "@/lib/admin/people";

/**
 * The confirmation, sized to the risk.
 *
 * ── ONE MODAL, FOUR WEIGHTS ───────────────────────────────────────────────
 * The brief's hierarchy — simple confirm, confirm with explanation, confirm
 * with a reason, type the name — is four variations of one conversation, not
 * four components. Splitting it would let them drift, and the drift always goes
 * the same way: the dangerous one ends up the easiest to click.
 *
 * The RISK comes from the action, not from the caller (lib/admin/people.ts →
 * ACTION_RISK), so a screen cannot accidentally offer a one-tap suspend by
 * passing the wrong prop.
 */
export default function ConfirmAction({
  action,
  kind,
  count,
  entityName,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  action: PeopleAction;
  kind: PersonKind;
  count: number;
  /** For destructive actions: the exact words the operator must type. */
  entityName?: string;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const risk = ACTION_RISK[action];
  const { title, body } = describeAction(action, kind, count);
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const firstRef = useRef<HTMLElement>(null);

  // Escape closes, and focus lands inside — a modal a keyboard cannot leave is
  // a trap, and one it cannot reach is decoration.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    firstRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  const reasonRequired = needsReason(action);
  const word = confirmWordFor(action, entityName);
  const ready =
    (!reasonRequired || reason.trim().length >= 3) &&
    (!word || typed.trim().toLowerCase() === word.trim().toLowerCase());

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      {/* Bottom sheet on a phone, centred dialog on a desktop. An ops tool gets
          used standing up in a doorway as often as at a desk. */}
      <div className="w-full max-w-md rounded-t-2xl border border-white/10 bg-dark-card p-5 sm:rounded-2xl">
        <div className="flex items-start gap-3">
          {risk !== "low" && (
            <span
              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                risk === "destructive" ? "bg-red-500/15 text-red-300" : "bg-amber-500/15 text-amber-300"
              }`}
            >
              <AlertTriangle size={16} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="font-syne text-base font-bold text-offwhite">{title}</h2>
            {/* Low risk gets no paragraph: explaining a reversible click is
                noise, and noise is what teaches people to skip the warnings
                that matter. */}
            {risk !== "low" && (
              <p className="mt-1.5 font-dm text-[13px] leading-relaxed text-muted">{body}</p>
            )}
          </div>
          <button
            onClick={() => !busy && onCancel()}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:text-offwhite"
          >
            <X size={16} />
          </button>
        </div>

        {reasonRequired && (
          <label className="mt-4 block">
            <span className="mb-1 block font-dm text-[11px] uppercase tracking-wider text-muted">
              Reason — recorded in the audit trail
            </span>
            <textarea
              ref={firstRef as React.RefObject<HTMLTextAreaElement>}
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. repeated no-shows on assigned deliveries"
              className="w-full rounded-lg border border-white/12 bg-dark px-3 py-2 font-dm text-sm text-offwhite placeholder:text-muted/50 focus:border-yellow focus:outline-none"
            />
          </label>
        )}

        {word && (
          <label className="mt-4 block">
            <span className="mb-1 block font-dm text-[11px] uppercase tracking-wider text-muted">
              Type <span className="text-red-300">{word}</span> to confirm
            </span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              className="w-full rounded-lg border border-white/12 bg-dark px-3 py-2 font-dm text-sm text-offwhite focus:border-red-400 focus:outline-none"
            />
          </label>
        )}

        {error && (
          <p role="alert" className="mt-3 font-dm text-[12px] text-red-300">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={() => !busy && onCancel()}
            className="rounded-full border border-white/12 px-4 py-2 font-dm text-[13px] text-muted hover:text-offwhite"
          >
            Cancel
          </button>
          <button
            onClick={() => ready && !busy && onConfirm(reason.trim())}
            disabled={!ready || busy}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 font-dm text-[13px] font-semibold disabled:opacity-40 ${
              risk === "destructive"
                ? "bg-red-500 text-white"
                : risk === "high"
                  ? "bg-amber-400 text-dark"
                  : "bg-yellow text-dark"
            }`}
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {risk === "destructive" ? "Delete permanently" : title.replace(/\?$/, "")}
          </button>
        </div>
      </div>
    </div>
  );
}
