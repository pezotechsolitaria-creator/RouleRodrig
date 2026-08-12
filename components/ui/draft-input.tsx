"use client";

import { useEffect, useRef, useState } from "react";

// ── An input you can actually type in ──────────────────────────────────────
//
// Three separate fields in the admin were unusable in the same way, reported as
// "the keyboard is locked":
//
//   · "separate with commas" ate the comma.  value={list.join(", ")} with
//     onChange parsing back to an array: typing "hat," split to
//     ["hat", ""], filter(Boolean) dropped the empty, join gave "hat".
//   · a price could not take a decimal point. value={centsToDecimalString(n)}
//     with toCents() on change: "12." parses to 1200, renders back as "12".
//   · a coordinate could not take a minus. parseFloat("-") is NaN, `|| 0`
//     turned it into "0" — and Rodrigues is at latitude -19.7, so EVERY valid
//     coordinate here begins with the character the field refused.
//
// The shared cause: the input's value was re-derived from parsed state on every
// keystroke, so any half-typed text that did not parse cleanly was destroyed
// before the next character arrived. It is not a validation bug — the field was
// re-writing what you typed.
//
// The fix is to let text be text while it is being typed. This holds the raw
// string, reports every change upward so nothing is lost, and only re-syncs
// from the parent when the field is NOT focused — so an edit made elsewhere
// still lands, but never mid-word.

export function DraftInput({
  value,
  onChange,
  onBlur,
  className,
  ...rest
}: {
  /** The canonical value, formatted for display. Applied only while unfocused. */
  value: string;
  /** Every keystroke, raw. Parse leniently — this can be "-", "12." or "a,". */
  onChange: (raw: string) => void;
  onBlur?: (raw: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "onBlur">) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);

  // Only accept a value from above when the user is not mid-edit. Without this
  // guard the component reintroduces the very bug it exists to fix.
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);

  return (
    <input
      {...rest}
      className={className}
      value={draft}
      onFocus={(e) => {
        focused.current = true;
        rest.onFocus?.(e);
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        onChange(e.target.value);
      }}
      onBlur={(e) => {
        focused.current = false;
        onBlur?.(e.target.value);
        // Re-sync to the canonical formatting once editing stops: "12." becomes
        // "12.00", " a , b " becomes "a, b". Tidying on blur is welcome;
        // tidying mid-keystroke is what made these fields unusable.
        setDraft(value);
      }}
    />
  );
}

/**
 * Parse a comma list WITHOUT destroying what is being typed.
 *
 * Keeps empty segments out of the saved array but never rewrites the text, so a
 * trailing comma survives long enough to type the next word after it.
 */
export function parseCommaList(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Lenient number parse for a field still being typed.
 *
 * Returns null for text that is not yet a number ("", "-", "12.", "-.") so a
 * caller can leave the previous value alone instead of slamming it to 0 — which
 * is what ate the minus sign on every coordinate on this island.
 */
export function parseLooseNumber(raw: string): number | null {
  const t = raw.trim();
  if (t === "" || t === "-" || t === "." || t === "-." || t.endsWith(".")) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
