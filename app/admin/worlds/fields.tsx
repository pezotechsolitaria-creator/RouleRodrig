"use client";

import { useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  ImagePlus,
  Loader2,
  Trash2,
  Eye,
  EyeOff,
  Languages,
} from "lucide-react";
import type { Localized } from "@/lib/world-docs/types";

// Shared form furniture for the world studio.
//
// ── WHY THESE ARE GENERIC ──────────────────────────────────────────────────
// Every text on a world page is trilingual, and every list on one is
// reorderable. Hand-writing an English/French/Creole trio per field is how the
// existing content studio reached 8,500 lines and how translations end up
// missing from the fields nobody remembered. One component means a new field is
// three lines and is trilingual by construction.

export const inputCls =
  "w-full rounded-lg border border-white/12 bg-dark px-3 py-2 font-dm text-sm text-offwhite placeholder:text-muted/50 focus:border-yellow focus:outline-none";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block font-dm text-[11px] font-medium uppercase tracking-wider text-muted">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block font-dm text-[11px] text-muted/70">{hint}</span>}
    </label>
  );
}

/**
 * One text in three languages.
 *
 * French and Creole are folded away by default. Showing all three at once
 * triples the height of every form and buries the field that actually matters —
 * and in practice the owner writes English first and translates in a pass.
 * The toggle shows a dot when a translation exists, so an untranslated field is
 * visible without being opened.
 */
export function LocalizedField({
  label,
  hint,
  value,
  onChange,
  multiline = false,
  placeholder,
}: {
  label: string;
  hint?: string;
  value?: Localized;
  onChange: (next: Localized) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const v = value ?? { en: "" };
  const translated = !!(v.fr?.trim() || v.cr?.trim());
  const Input = multiline ? "textarea" : "input";

  return (
    <div className="block">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-dm text-[11px] font-medium uppercase tracking-wider text-muted">
          {label}
        </span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5 font-dm text-[10px] text-muted hover:border-yellow/40 hover:text-yellow"
        >
          <Languages size={11} />
          FR / CR
          {translated && <span className="h-1.5 w-1.5 rounded-full bg-yellow" />}
        </button>
      </div>
      <Input
        className={inputCls}
        rows={multiline ? 3 : undefined}
        value={v.en}
        placeholder={placeholder}
        onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
          onChange({ ...v, en: e.target.value })
        }
      />
      {open && (
        <div className="mt-2 space-y-2 rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
          <Input
            className={inputCls}
            rows={multiline ? 3 : undefined}
            value={v.fr ?? ""}
            placeholder="Français"
            onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
              onChange({ ...v, fr: e.target.value })
            }
          />
          <Input
            className={inputCls}
            rows={multiline ? 3 : undefined}
            value={v.cr ?? ""}
            placeholder="Kreol"
            onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
              onChange({ ...v, cr: e.target.value })
            }
          />
        </div>
      )}
      {hint && <span className="mt-1 block font-dm text-[11px] text-muted/70">{hint}</span>}
    </div>
  );
}

/**
 * A photo: upload one, or paste a URL.
 *
 * Uses the same /api/admin/upload the content studio uses, so world imagery
 * lands in the same Supabase bucket as everything else rather than in a second
 * media library nobody backs up.
 */
export function ImageField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value?: string;
  onChange: (next: string) => void;
  hint?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      if (!res.ok) {
        setError(res.status === 401 ? "Your session expired — sign in again." : "Upload failed.");
        return;
      }
      const { path } = (await res.json()) as { path: string };
      onChange(path);
    } catch {
      setError("Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Field label={label} hint={hint}>
      <div className="flex items-start gap-3">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-white/12 bg-dark">
          {value ? (
            <Image src={value} alt="" fill className="object-cover" unoptimized />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-muted">
              <ImagePlus size={16} />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <input
            className={inputCls}
            value={value ?? ""}
            placeholder="https://… or upload"
            onChange={(e) => onChange(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/12 px-3 py-1 font-dm text-[11px] text-offwhite hover:border-yellow/50 hover:text-yellow disabled:opacity-50"
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <ImagePlus size={12} />}
              {busy ? "Uploading…" : "Upload"}
            </button>
            {value && (
              <button
                type="button"
                onClick={() => onChange("")}
                className="inline-flex items-center gap-1 rounded-full border border-white/12 px-3 py-1 font-dm text-[11px] text-muted hover:border-red-500/50 hover:text-red-300"
              >
                <Trash2 size={11} /> Clear
              </button>
            )}
          </div>
          {error && <p className="font-dm text-[11px] text-red-300">{error}</p>}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>
    </Field>
  );
}

/**
 * Reorder / show / delete controls for one row of a list.
 *
 * ── BUTTONS AS WELL AS DRAGGING, NOT INSTEAD OF ───────────────────────────
 * HTML5 drag-and-drop does not fire on touch, and this admin is opened on a
 * phone. Arrows are also the only version of "move this" a keyboard or a screen
 * reader can use. Dragging is the fast path; the arrows are the one that always
 * works.
 */
export function RowTools({
  index,
  count,
  onMove,
  onRemove,
  enabled,
  onToggle,
}: {
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  onRemove?: () => void;
  enabled?: boolean;
  onToggle?: () => void;
}) {
  const btn =
    "flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-muted hover:border-yellow/40 hover:text-yellow disabled:opacity-30 disabled:hover:border-white/10 disabled:hover:text-muted";
  return (
    <div className="flex shrink-0 items-center gap-1">
      {onToggle && (
        <button
          type="button"
          onClick={onToggle}
          className={btn}
          aria-label={enabled === false ? "Show this" : "Hide this"}
          title={enabled === false ? "Hidden — click to show" : "Visible — click to hide"}
        >
          {enabled === false ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
      )}
      <button
        type="button"
        onClick={() => onMove(index, index - 1)}
        disabled={index === 0}
        className={btn}
        aria-label="Move up"
      >
        <ChevronUp size={14} />
      </button>
      <button
        type="button"
        onClick={() => onMove(index, index + 1)}
        disabled={index === count - 1}
        className={btn}
        aria-label="Move down"
      >
        <ChevronDown size={14} />
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-muted hover:border-red-500/50 hover:text-red-300"
          aria-label="Remove"
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}

/** The drag handle. Pure affordance — RowTools owns the accessible path. */
export function DragHandle() {
  return (
    <span className="cursor-grab text-muted/50 active:cursor-grabbing" aria-hidden>
      <GripVertical size={15} />
    </span>
  );
}

/** Move an item within an array, returning a new array. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Collapsible group — how the studio keeps a long form navigable. */
export function Disclosure({
  title,
  subtitle,
  defaultOpen = false,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  right?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-dark-card">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={open}
        >
          <ChevronDown
            size={15}
            className={`shrink-0 text-muted transition-transform ${open ? "" : "-rotate-90"}`}
          />
          <span className="min-w-0">
            <span className="block truncate font-syne text-[13px] font-bold text-offwhite">
              {title}
            </span>
            {subtitle && (
              <span className="block truncate font-dm text-[11px] text-muted">{subtitle}</span>
            )}
          </span>
        </button>
        {right}
      </div>
      {open && <div className="space-y-3 border-t border-white/10 p-3">{children}</div>}
    </div>
  );
}
