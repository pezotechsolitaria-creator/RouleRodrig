"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

/** Same ramp as <Eyebrow tone="muted" size="sm">, inlined so the element can be
 *  a real <label htmlFor> rather than a styled wrapper. */
const EYEBROW_LABEL = "font-bebas uppercase text-[10px] tracking-[0.25em] text-muted";

// ── Label + control + error, wired together ─────────────────────────────────
//
// 43 distinct field class strings for ~62 fields, plus 108 raw <input>, 31
// <select> and 13 <textarea> spelled out by hand — including pairs that differ
// only in padding and word order:
//
//   "w-full rounded-xl border border-dark-border bg-dark-card px-4 py-3  ..."  ×4
//   "w-full bg-dark-card border border-dark-border rounded-xl px-4 py-3.5 ..." ×4
//
// Beyond consistency this fixes a real accessibility defect the audit found:
// several labels were bare <label> elements with no htmlFor and inputs with no
// id, so screen readers announced unnamed textboxes and tapping a label did not
// focus its control. Generating the id here makes that impossible to get wrong.
//
// These are the highest-revenue forms in the app (booking and checkout), so the
// error state is part of the primitive rather than something each caller
// remembers: a wrong field is outlined AND named, never silently red.

export const fieldControlClass =
  "w-full rounded-xl border border-dark-border bg-dark-card px-4 py-3 font-dm text-sm text-offwhite " +
  "placeholder:text-muted/50 transition-colors focus:border-yellow focus:outline-none " +
  "disabled:opacity-60 disabled:cursor-not-allowed";

export function Field({
  label,
  required = false,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  /** When set, the control is outlined and the message is announced. */
  error?: string | null;
  hint?: string;
  /** Receives the generated id + aria wiring. */
  children: (props: {
    id: string;
    "aria-invalid": boolean;
    "aria-describedby": string | undefined;
    className: string;
  }) => React.ReactNode;
  className?: string;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className={className}>
      {/* A real <label htmlFor>, not a styled <span>: this is the association
          screen readers use and the one that makes tapping the label focus the
          control. Several existing forms had bare labels with no htmlFor and
          inputs with no id, so their fields announced as unnamed textboxes. */}
      <label htmlFor={id} className={cn(EYEBROW_LABEL, "mb-2 block")}>
        {label}
        {required && <span className="ml-1 text-yellow">*</span>}
      </label>
      {children({
        id,
        "aria-invalid": Boolean(error),
        "aria-describedby": describedBy,
        className: cn(fieldControlClass, error && "border-red-500/60"),
      })}
      {hint && !error && (
        <p id={hintId} className="mt-1.5 font-dm text-[11px] text-muted/70">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 font-dm text-[11px] text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

export default Field;
