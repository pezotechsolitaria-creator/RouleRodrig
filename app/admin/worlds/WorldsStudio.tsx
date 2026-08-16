"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarClock,
  Check,
  CloudUpload,
  ExternalLink,
  History,
  Loader2,
  Monitor,
  Plus,
  RotateCcw,
  Smartphone,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import {
  WORLD_META,
  type WorldDoc,
  type WorldSection,
  type WorldId,
  type WorldRevision,
} from "@/lib/world-docs/types";
import CardEditor, { type PickerCatalogue } from "./CardEditor";
import {
  Disclosure,
  Field,
  ImageField,
  LocalizedField,
  RowTools,
  inputCls,
  moveItem,
} from "./fields";
import { CURATED_ICON_KEYS } from "@/components/world-page/icons";

export interface StudioProps {
  scope: { kind: "admin" | "editor"; name: string; worlds: WorldId[] };
  world: WorldId;
  doc: WorldDoc;
  catalogue: PickerCatalogue;
  hasDraft: boolean;
  isLive: boolean;
  publishedAt: string | null;
  scheduledAt: string | null;
  /** Set when the draft store could not be reached — see WorldDocRecord. */
  storageError: string | null;
  revisions: WorldRevision[];
}

const uid = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * The draft preview route, written out as a literal.
 *
 * It is used to build a URL with a query string, and a path that only ever
 * appears inside a template literal is invisible to lib/nav/reachable-pages —
 * the check that stops a page from existing with no way to click into it.
 * Naming it here keeps that check honest instead of quietly exempting a route.
 */
const PREVIEW = { href: "/admin/worlds/preview" } as const;

const SECTION_NAME: Record<WorldSection["type"], string> = {
  cards: "The six photo cards",
  quickAccess: "What are you looking for?",
  featured: "Handpicked for you",
  onlyInRodrigues: "Only in Rodrigues",
  moods: "Choose your mood",
  editors: "From our local editors",
  events: "What's on",
  reviews: "What visitors said",
  concierge: "Concierge invitation",
};

/**
 * Sections whose CONTENT lives elsewhere and which therefore have no editor
 * here beyond their heading and their place on the page.
 *
 * The photo cards and the quick-access grid read the same admin content the
 * homepage does, so they are edited once, in the content studio. Events and
 * reviews are the real ones or none. Saying so is better than showing an empty
 * panel and letting somebody hunt for the missing form.
 */
const SECTION_SOURCE: Partial<Record<WorldSection["type"], string>> = {
  cards: "These belong to THIS world. Adding, renaming or removing one changes nothing on the homepage.",
  quickAccess: "This world's own tiles. Independent of the homepage grid.",
  events: "Pulled live from Events & tickets. The section hides itself when nothing is coming up.",
  reviews: "Real approved reviews only. Nothing to write here — and nothing invented.",
};

/** Where a card's photograph comes from. The catalogue, shared by every world. */
const IMAGE_SOURCES = [
  { value: "scooter", label: "Scooter photos" },
  { value: "car", label: "Car photos" },
  { value: "stays", label: "Stay photos" },
  { value: "exp", label: "Activity photos" },
  { value: "stores", label: "Shop photos" },
  { value: "food", label: "Dish photos" },
  { value: "none", label: "No photo (gradient)" },
];

/** Icon keys the big photo cards understand. */
const CARD_ICONS = [
  "scooter", "car", "stay", "experience", "restaurant", "store", "beach",
  "event", "tiroule", "compass",
];

/** Icon keys the small grid tiles understand. */
const TILE_ICONS = [
  "beach", "hiking", "viewpoint", "fishing", "boat", "massage", "taxi", "plane",
  "restaurant", "store", "event", "map", "planner", "guide", "scooter", "car",
  "stay", "delivery", "compass",
];

function when(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The world studio.
 *
 * ── AUTOSAVE IS SAFE HERE, AND ONLY HERE ──────────────────────────────────
 * Typing saves the DRAFT after a short pause. That would be reckless in the
 * content studio, where saving is publishing — but a draft is invisible to the
 * public by construction (see the M104 migration), so the worst an autosave can
 * do is record an unfinished thought that nobody can see. It is also what makes
 * the live preview truthful: the preview renders the saved draft through the
 * real page code, so it cannot drift from what Publish will produce.
 *
 * Publishing stays a deliberate press. Nothing on this screen makes a change
 * public on its own.
 */
export default function WorldsStudio(props: StudioProps) {
  const [doc, setDoc] = useState<WorldDoc>(props.doc);
  const [hasDraft, setHasDraft] = useState(props.hasDraft);
  const [isLive, setIsLive] = useState(props.isLive);
  const [publishedAt, setPublishedAt] = useState(props.publishedAt);
  const [scheduledAt, setScheduledAt] = useState(props.scheduledAt);
  const [revisions, setRevisions] = useState(props.revisions);

  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
  const [pane, setPane] = useState<"edit" | "preview">("edit");
  const [previewKey, setPreviewKey] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");

  // ── What has already been saved ─────────────────────────────────────────
  //
  // A boolean "is this the first render?" flag is NOT enough, and the bug it
  // produces is worth naming: React's StrictMode runs every effect twice in
  // development, so the first pass consumed the flag and the second pass sent a
  // PUT — an autosave of a document nobody had touched, on page load.
  //
  // Comparing against the last saved document instead is correct under any
  // number of re-runs, and it also stops a no-op edit (type a letter, delete
  // it) from writing.
  const lastSaved = useRef(JSON.stringify(props.doc));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // With no store there is nothing to autosave INTO, and an editor typing into
  // a form that silently discards every keystroke is the worst outcome
  // available. The studio becomes a read-only view of the current page with the
  // reason stated at the top.
  const readOnly = !!props.storageError;

  const patch = useCallback((next: Partial<WorldDoc>) => {
    setDoc((d) => ({ ...d, ...next }));
  }, []);

  const setSection = useCallback((id: string, next: Partial<WorldSection>) => {
    setDoc((d) => ({
      ...d,
      sections: d.sections.map((s) => (s.id === id ? ({ ...s, ...next } as WorldSection) : s)),
    }));
  }, []);

  // ── Autosave ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (readOnly) return;
    const payload = JSON.stringify(doc);
    if (payload === lastSaved.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSaving(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/worlds", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ world: props.world, doc }),
        });
        if (!res.ok) {
          const { error: msg } = (await res.json().catch(() => ({}))) as { error?: string };
          setError(msg ?? "The draft could not be saved.");
          return;
        }
        lastSaved.current = payload;
        setHasDraft(true);
        setSavedAt(Date.now());
        // Refresh the preview only after the draft is stored — reloading it
        // sooner would show the previous draft and look like a lost keystroke.
        setPreviewKey((k) => k + 1);
      } catch {
        setError("The draft could not be saved — check your connection.");
      } finally {
        setSaving(false);
      }
    }, 900);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [doc, props.world, readOnly]);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch("/api/admin/worlds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ world: props.world, action, ...extra }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        doc?: WorldDoc;
        hasDraft?: boolean;
        isLive?: boolean;
        publishedAt?: string | null;
        scheduledAt?: string | null;
        revisions?: WorldRevision[];
      };
      if (!res.ok) {
        setError(data.error ?? "That did not work.");
        return;
      }
      if (data.doc) {
        // A rollback or a reset replaces the document under the editor's feet.
        // Moving the baseline with it is what stops the autosave from
        // immediately writing the OLD one back over the new one.
        lastSaved.current = JSON.stringify(data.doc);
        setDoc(data.doc);
      }
      if (data.hasDraft !== undefined) setHasDraft(data.hasDraft);
      if (data.isLive !== undefined) setIsLive(data.isLive);
      if (data.publishedAt !== undefined) setPublishedAt(data.publishedAt);
      if (data.scheduledAt !== undefined) setScheduledAt(data.scheduledAt);
      if (data.revisions) setRevisions(data.revisions);
      setPreviewKey((k) => k + 1);
      if (action === "discard" || action === "rollback" || action === "reset-to-defaults") {
        // These change the document server-side; re-read it so the form and the
        // stored draft cannot disagree.
        const fresh = await fetch(`/api/admin/worlds?world=${props.world}`);
        if (fresh.ok) {
          const j = (await fresh.json()) as { doc?: WorldDoc };
          if (j.doc) {
            lastSaved.current = JSON.stringify(j.doc);
            setDoc(j.doc);
          }
        }
      }
    } finally {
      setBusy(null);
    }
  }

  const status = useMemo(() => {
    if (scheduledAt) return { text: `Release scheduled · ${when(scheduledAt)}`, tone: "amber" as const };
    if (hasDraft) return { text: "Unpublished changes", tone: "amber" as const };
    if (isLive) return { text: `Live · published ${when(publishedAt)}`, tone: "green" as const };
    return { text: "Not published yet — the site is showing the built-in page", tone: "muted" as const };
  }, [hasDraft, isLive, publishedAt, scheduledAt]);

  const previewSrc = `${PREVIEW.href}?world=${props.world}&k=${previewKey}`;

  return (
    <div className="min-h-screen bg-dark pb-16">
      {/* ── Bar ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-dark/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1700px] flex-wrap items-center gap-2 px-4 py-3">
          <Link
            href="/admin"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-muted hover:border-yellow/50 hover:text-yellow"
            aria-label="Back to the Command Center"
          >
            <ArrowLeft size={16} />
          </Link>
          <div className="mr-2">
            <p className="font-syne text-sm font-extrabold text-offwhite">
              Worlds <span className="text-yellow">studio</span>
            </p>
            <p className="font-dm text-[11px] text-muted">
              {props.scope.kind === "admin" ? "Owner" : `Editor · ${props.scope.name}`}
            </p>
          </div>

          {/* World switcher — the admin's own, showing only what this person
              may open. An editor never sees a world they cannot edit. */}
          <div className="flex flex-wrap items-center gap-1.5">
            {props.scope.worlds.map((w) => {
              const active = w === props.world;
              return (
                <Link
                  key={w}
                  href={`/admin/worlds?world=${w}`}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-full border px-3 py-1.5 font-dm text-[11.5px] transition-colors ${
                    active
                      ? "border-yellow/50 bg-yellow/15 text-yellow"
                      : "border-white/12 text-muted hover:border-yellow/40 hover:text-offwhite"
                  }`}
                >
                  {WORLD_META[w].label}
                </Link>
              );
            })}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden items-center gap-1.5 font-dm text-[11px] text-muted sm:flex">
              {saving ? (
                <>
                  <Loader2 size={12} className="animate-spin" /> Saving draft…
                </>
              ) : savedAt ? (
                <>
                  <Check size={12} className="text-green-400" /> Draft saved
                </>
              ) : null}
            </span>

            <Link
              href={WORLD_META[props.world].href}
              target="_blank"
              className="hidden items-center gap-1.5 rounded-full border border-white/12 px-3 py-1.5 font-dm text-[11.5px] text-muted hover:border-yellow/40 hover:text-offwhite sm:flex"
            >
              <ExternalLink size={12} /> Live page
            </Link>

            <button
              onClick={() => void act("publish")}
              disabled={readOnly || !hasDraft || busy === "publish"}
              className="inline-flex items-center gap-1.5 rounded-full bg-yellow px-4 py-2 font-dm text-[12.5px] font-semibold text-dark disabled:opacity-40"
            >
              {busy === "publish" ? <Loader2 size={13} className="animate-spin" /> : <CloudUpload size={13} />}
              Publish
            </button>
          </div>
        </div>

        <div className="mx-auto flex max-w-[1700px] flex-wrap items-center gap-2 px-4 pb-2.5">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-dm text-[11px] ${
              status.tone === "green"
                ? "border-green-500/30 bg-green-500/10 text-green-300"
                : status.tone === "amber"
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
                  : "border-white/12 text-muted"
            }`}
          >
            <Sparkles size={11} /> {status.text}
          </span>

          {hasDraft && (
            <button
              onClick={() => void act("discard")}
              disabled={busy === "discard"}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/12 px-2.5 py-1 font-dm text-[11px] text-muted hover:border-red-500/50 hover:text-red-300"
            >
              <Trash2 size={11} /> Discard draft
            </button>
          )}

          <div className="inline-flex items-center gap-1.5 rounded-full border border-white/12 px-2 py-1">
            <CalendarClock size={11} className="text-muted" />
            <input
              type="datetime-local"
              aria-label="Schedule the release"
              className="bg-transparent font-dm text-[11px] text-offwhite focus:outline-none"
              value={scheduleAt}
              onChange={(e) => setScheduleAt(e.target.value)}
            />
            <button
              onClick={() => void act("schedule", { at: new Date(scheduleAt).toISOString() })}
              disabled={!scheduleAt || !hasDraft || busy === "schedule"}
              className="font-dm text-[11px] text-yellow disabled:opacity-40"
            >
              Schedule
            </button>
          </div>
          {scheduledAt && (
            <button
              onClick={() => void act("cancel-schedule")}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/12 px-2.5 py-1 font-dm text-[11px] text-muted hover:border-yellow/40 hover:text-offwhite"
            >
              Cancel release
            </button>
          )}

          <button
            onClick={() => setShowHistory((h) => !h)}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/12 px-2.5 py-1 font-dm text-[11px] text-muted hover:border-yellow/40 hover:text-offwhite"
          >
            <History size={11} /> History ({revisions.length})
          </button>

          {/* Edit / Preview toggle for narrow screens. */}
          <div className="ml-auto inline-flex rounded-full border border-white/12 p-0.5 xl:hidden">
            {(["edit", "preview"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPane(p)}
                className={`rounded-full px-3 py-1 font-dm text-[11px] capitalize ${
                  pane === p ? "bg-yellow text-dark" : "text-muted"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {props.storageError && (
          <p
            role="alert"
            className="mx-auto flex max-w-[1700px] items-start gap-2 px-4 pb-2 font-dm text-[12px] text-amber-200"
          >
            <TriangleAlert size={13} className="mt-0.5 shrink-0" />
            <span>
              <strong className="font-semibold">Read-only.</strong> {props.storageError}
            </span>
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="mx-auto flex max-w-[1700px] items-center gap-2 px-4 pb-2 font-dm text-[12px] text-red-300"
          >
            <TriangleAlert size={13} /> {error}
          </p>
        )}

        {showHistory && (
          <div className="mx-auto max-w-[1700px] px-4 pb-3">
            <div className="rounded-xl border border-white/10 bg-dark-card p-3">
              <p className="mb-2 font-dm text-[11px] text-muted">
                Every publish keeps the page it replaced. Restoring loads that
                version back into your draft — nothing goes live until you press
                Publish.
              </p>
              {revisions.length === 0 && (
                <p className="font-dm text-xs text-muted">No previous versions yet.</p>
              )}
              <ul className="space-y-1">
                {revisions.map((r) => (
                  <li key={r.id} className="flex items-center gap-2">
                    <span className="font-dm text-[12px] text-offwhite">{when(r.createdAt)}</span>
                    <span className="font-dm text-[11px] text-muted">
                      {r.createdBy ? `· ${r.createdBy}` : ""} {r.label ? `· ${r.label}` : ""}
                    </span>
                    <button
                      onClick={() => void act("rollback", { revisionId: r.id })}
                      disabled={busy === "rollback"}
                      className="ml-auto inline-flex items-center gap-1 rounded-full border border-white/12 px-2.5 py-1 font-dm text-[11px] text-muted hover:border-yellow/40 hover:text-yellow"
                    >
                      <RotateCcw size={11} /> Restore
                    </button>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => void act("reset-to-defaults")}
                className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/12 px-3 py-1.5 font-dm text-[11px] text-muted hover:border-yellow/40 hover:text-offwhite"
              >
                <RotateCcw size={11} /> Start again from the built-in page
              </button>
            </div>
          </div>
        )}
      </header>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="mx-auto grid max-w-[1700px] gap-5 px-4 pt-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,640px)]">
        <div className={pane === "edit" ? "space-y-3" : "hidden space-y-3 xl:block"}>
          <SectionOrder doc={doc} patch={patch} />
          <HeroPanel doc={doc} patch={patch} />
          <QuickActionsPanel doc={doc} patch={patch} />
          <LabelsPanel doc={doc} patch={patch} />

          {doc.sections.map((section) => (
            <SectionPanel
              key={section.id}
              section={section}
              doc={doc}
              catalogue={props.catalogue}
              setSection={setSection}
            />
          ))}

          <SeoPanel doc={doc} patch={patch} />
        </div>

        {/* ── Live preview ───────────────────────────────────────────────
            An iframe of the REAL page, rendered from the saved draft by the
            same components the public site uses. A mock preview drawn in the
            admin would be a second implementation to keep in sync, and the one
            thing a preview must never be is approximately right. */}
        <div className={pane === "preview" ? "" : "hidden xl:block"}>
          <div className="sticky top-[132px]">
            <div className="mb-2 flex items-center gap-2">
              <div className="inline-flex rounded-full border border-white/12 p-0.5">
                <button
                  onClick={() => setDevice("mobile")}
                  aria-pressed={device === "mobile"}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-dm text-[11px] ${
                    device === "mobile" ? "bg-yellow text-dark" : "text-muted"
                  }`}
                >
                  <Smartphone size={12} /> Phone
                </button>
                <button
                  onClick={() => setDevice("desktop")}
                  aria-pressed={device === "desktop"}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-dm text-[11px] ${
                    device === "desktop" ? "bg-yellow text-dark" : "text-muted"
                  }`}
                >
                  <Monitor size={12} /> Desktop
                </button>
              </div>
              <span className="font-dm text-[11px] text-muted">
                Previewing your draft{saving ? " · updating…" : ""}
              </span>
              <Link
                href={previewSrc}
                target="_blank"
                className="ml-auto inline-flex items-center gap-1 font-dm text-[11px] text-muted hover:text-yellow"
              >
                <ExternalLink size={11} /> Open
              </Link>
            </div>

            <div className="overflow-hidden rounded-2xl border border-white/12 bg-[#0a0908]">
              <div
                className="mx-auto origin-top"
                style={
                  device === "mobile"
                    ? { width: 390, height: "72vh" }
                    : // Renders at 1280 and is scaled down, so the desktop
                      // preview shows the real desktop breakpoint rather than a
                      // narrow window that would trigger the mobile layout.
                      { width: 1280, height: "calc(72vh / 0.48)", transform: "scale(0.48)" }
                }
              >
                <iframe
                  key={previewKey}
                  src={previewSrc}
                  title="Curated page preview"
                  className="h-full w-full border-0"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Panels ──────────────────────────────────────────────────────────────────

/**
 * A blank section of each kind.
 *
 * Every one arrives HIDDEN (`enabled: false`). Adding a section is an intent to
 * build one, not to publish an empty heading — and the editor turns it on when
 * it has something in it, from the same eye control that hides it again.
 */
function blankSection(type: WorldSection["type"]): WorldSection {
  const base = { id: uid(type), enabled: false, title: { en: SECTION_NAME[type] } };
  switch (type) {
    case "cards":
      return { ...base, type, items: [] };
    case "quickAccess":
      return { ...base, type, items: [] };
    case "featured":
      return { ...base, type, cards: [], limit: 6 };
    case "onlyInRodrigues":
      return { ...base, type, cards: [] };
    case "moods":
      return { ...base, type, moods: [] };
    case "editors":
      return { ...base, type, notes: [] };
    case "events":
      return { ...base, type, seeAll: "/events" };
    case "reviews":
      return { ...base, type };
    case "concierge":
      return { ...base, type, ctaAction: "tiroule" };
  }
}

const ADDABLE: WorldSection["type"][] = [
  "cards", "quickAccess", "featured", "onlyInRodrigues", "moods", "editors",
  "events", "reviews", "concierge",
];

function SectionOrder({
  doc,
  patch,
}: {
  doc: WorldDoc;
  patch: (n: Partial<WorldDoc>) => void;
}) {
  const [dragging, setDragging] = useState<number | null>(null);

  const move = (from: number, to: number) =>
    patch({ sections: moveItem(doc.sections, from, to) });

  return (
    <Disclosure
      title="Page order"
      subtitle="Drag to rearrange the page, or hide a section entirely"
      defaultOpen
    >
      <ul className="space-y-1.5">
        {doc.sections.map((s, i) => (
          <li
            key={s.id}
            draggable
            onDragStart={() => setDragging(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragging !== null) move(dragging, i);
              setDragging(null);
            }}
            onDragEnd={() => setDragging(null)}
            className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${
              dragging === i ? "border-yellow/50 bg-yellow/5" : "border-white/10 bg-white/[0.02]"
            } ${s.enabled === false ? "opacity-50" : ""}`}
          >
            <span className="cursor-grab text-muted/50 active:cursor-grabbing" aria-hidden>
              ⠿
            </span>
            <span className="min-w-0 flex-1 truncate font-dm text-[12.5px] text-offwhite">
              {s.title?.en?.trim() || SECTION_NAME[s.type]}
            </span>
            <RowTools
              index={i}
              count={doc.sections.length}
              onMove={move}
              // Removing a section is safe here in a way it is not in the
              // content studio: this writes the DRAFT. Nothing a visitor can
              // see changes until Publish, and the version before it is one
              // click away in History.
              onRemove={() => patch({ sections: doc.sections.filter((x) => x.id !== s.id) })}
              enabled={s.enabled !== false}
              onToggle={() =>
                patch({
                  sections: doc.sections.map((x) =>
                    x.id === s.id ? ({ ...x, enabled: x.enabled === false } as WorldSection) : x,
                  ),
                })
              }
            />
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        <span className="font-dm text-[11px] text-muted">Add a section:</span>
        {ADDABLE.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => patch({ sections: [...doc.sections, blankSection(t)] })}
            className="inline-flex items-center gap-1 rounded-full border border-white/12 px-2.5 py-1 font-dm text-[11px] text-muted hover:border-yellow/40 hover:text-offwhite"
          >
            <Plus size={11} /> {SECTION_NAME[t]}
          </button>
        ))}
      </div>

      <p className="font-dm text-[11px] text-muted/70">
        The hero always comes first — a curated page without one is a bug, not a
        layout. A section you add arrives hidden; turn it on with the eye once
        it has something in it.
      </p>
    </Disclosure>
  );
}

function HeroPanel({ doc, patch }: { doc: WorldDoc; patch: (n: Partial<WorldDoc>) => void }) {
  const hero = doc.hero;
  const set = (p: Partial<WorldDoc["hero"]>) => patch({ hero: { ...hero, ...p } });
  const images = hero.images ?? [];

  return (
    <Disclosure title="Hero" subtitle="The signature moment" defaultOpen>
      <LocalizedField label="Eyebrow" value={hero.eyebrow} onChange={(eyebrow) => set({ eyebrow })} />
      <div className="grid gap-3 sm:grid-cols-2">
        <LocalizedField label="Headline" value={hero.headline} onChange={(headline) => set({ headline })} />
        <LocalizedField
          label="Headline — italic ending"
          hint="Set in italic champagne. Keep it to a word or two."
          value={hero.headlineAccent}
          onChange={(headlineAccent) => set({ headlineAccent })}
        />
      </div>
      <LocalizedField
        label="Supporting line"
        multiline
        value={hero.subheadline}
        onChange={(subheadline) => set({ subheadline })}
      />
      <Field
        label="Show the button"
        hint="Turn it off for a hero that carries a video, or one where the photograph and the sentence are the whole point."
      >
        <label className="flex items-center gap-2 font-dm text-[13px] text-offwhite">
          <input
            type="checkbox"
            checked={hero.ctaEnabled !== false}
            onChange={(e) => set({ ctaEnabled: e.target.checked })}
          />
          {hero.ctaEnabled === false ? "Hidden" : "Shown"}
        </label>
      </Field>

      {hero.ctaEnabled !== false && (
        <div className="grid gap-3 sm:grid-cols-2">
          <LocalizedField label="Button label" value={hero.ctaLabel} onChange={(ctaLabel) => set({ ctaLabel })} />
          <Field label="Button goes to" hint="#curated-featured scrolls to the first section.">
            <input className={inputCls} value={hero.ctaHref} onChange={(e) => set({ ctaHref: e.target.value })} />
          </Field>
        </div>
      )}

      <Field
        label="Hero stills"
        hint="Leave empty and the page borrows the site's hero photo and the island's best-photographed places."
      >
        <div className="space-y-2">
          {images.map((src, i) => (
            <div key={`${src}-${i}`} className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <ImageField
                  label={`Still ${i + 1}`}
                  value={src}
                  onChange={(v) =>
                    set({ images: images.map((x, j) => (j === i ? v : x)).filter(Boolean) })
                  }
                />
              </div>
              <div className="pt-6">
                <RowTools
                  index={i}
                  count={images.length}
                  onMove={(from, to) => set({ images: moveItem(images, from, to) })}
                  onRemove={() => set({ images: images.filter((_, j) => j !== i) })}
                />
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => set({ images: [...images, ""] })}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/12 px-3 py-1.5 font-dm text-[11px] text-muted hover:border-yellow/40 hover:text-offwhite"
          >
            <Plus size={12} /> Add a still
          </button>
        </div>
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Video loop (optional)" hint="Plays muted over the still. The still stays the fallback.">
          <input
            className={inputCls}
            value={hero.video ?? ""}
            placeholder="https://…/clip.mp4"
            onChange={(e) => set({ video: e.target.value || undefined })}
          />
        </Field>
        <Field label="Seconds between stills" hint="0 turns the cross-fade off.">
          <input
            type="number"
            min={0}
            max={30}
            className={inputCls}
            value={hero.intervalSeconds ?? 7}
            onChange={(e) => set({ intervalSeconds: Number(e.target.value) })}
          />
        </Field>
      </div>
    </Disclosure>
  );
}

function QuickActionsPanel({
  doc,
  patch,
}: {
  doc: WorldDoc;
  patch: (n: Partial<WorldDoc>) => void;
}) {
  const qa = doc.quickActions;
  const items = qa.items;
  const set = (next: Partial<typeof qa>) => patch({ quickActions: { ...qa, ...next } });

  return (
    <Disclosure
      title="Quick actions"
      subtitle={`${items.filter((i) => i.enabled !== false).length} tiles under the hero`}
      right={
        <button
          type="button"
          onClick={() => set({ enabled: qa.enabled === false })}
          className={`rounded-full border px-2.5 py-1 font-dm text-[10.5px] ${
            qa.enabled === false
              ? "border-white/12 text-muted"
              : "border-yellow/40 bg-yellow/10 text-yellow"
          }`}
        >
          {qa.enabled === false ? "Hidden" : "Shown"}
        </button>
      }
    >
      {items.map((item, i) => (
        <div key={item.id} className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
          <div className="mb-2 flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate font-dm text-[12px] text-offwhite">
              {item.label.en || "Untitled"}
            </span>
            <RowTools
              index={i}
              count={items.length}
              onMove={(from, to) => set({ items: moveItem(items, from, to) })}
              onRemove={() => set({ items: items.filter((_, j) => j !== i) })}
              enabled={item.enabled !== false}
              onToggle={() =>
                set({
                  items: items.map((x, j) =>
                    j === i ? { ...x, enabled: x.enabled === false } : x,
                  ),
                })
              }
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <LocalizedField
              label="Label"
              value={item.label}
              onChange={(label) => set({ items: items.map((x, j) => (j === i ? { ...x, label } : x)) })}
            />
            <Field label="Icon">
              <select
                className={inputCls}
                value={item.icon}
                onChange={(e) =>
                  set({ items: items.map((x, j) => (j === i ? { ...x, icon: e.target.value } : x)) })
                }
              >
                {CURATED_ICON_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Goes to">
              <input
                className={inputCls}
                value={item.href}
                onChange={(e) =>
                  set({ items: items.map((x, j) => (j === i ? { ...x, href: e.target.value } : x)) })
                }
              />
            </Field>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          set({
            items: [
              ...items,
              { id: uid("qa"), label: { en: "New tile" }, icon: "compass", href: "/explore", enabled: true },
            ],
          })
        }
        className="inline-flex items-center gap-1.5 rounded-full border border-white/12 px-3 py-1.5 font-dm text-[11px] text-muted hover:border-yellow/40 hover:text-offwhite"
      >
        <Plus size={12} /> Add a tile
      </button>
    </Disclosure>
  );
}

function LabelsPanel({ doc, patch }: { doc: WorldDoc; patch: (n: Partial<WorldDoc>) => void }) {
  const labels = doc.labels;
  return (
    <Disclosure title="Editorial labels" subtitle={`${labels.length} in the library`}>
      <p className="font-dm text-[11px] text-muted/70">
        A label only means something while it is scarce. “Ti Roulé pick” on one
        card in six is a recommendation; on four of six it is decoration.
      </p>
      {labels.map((l, i) => (
        <div key={l.id} className="flex items-end gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
          <div className="min-w-0 flex-1">
            <LocalizedField
              label="Label text"
              value={l.text}
              onChange={(text) => patch({ labels: labels.map((x, j) => (j === i ? { ...x, text } : x)) })}
            />
          </div>
          <div className="w-28">
            <Field label="Weight">
              <select
                className={inputCls}
                value={l.tone}
                onChange={(e) =>
                  patch({
                    labels: labels.map((x, j) =>
                      j === i ? { ...x, tone: e.target.value as typeof l.tone } : x,
                    ),
                  })
                }
              >
                <option value="pick">Loud</option>
                <option value="warm">Warm</option>
                <option value="quiet">Quiet</option>
              </select>
            </Field>
          </div>
          <RowTools
            index={i}
            count={labels.length}
            onMove={(from, to) => patch({ labels: moveItem(labels, from, to) })}
            onRemove={() => patch({ labels: labels.filter((_, j) => j !== i) })}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          patch({ labels: [...labels, { id: uid("lbl"), text: { en: "New label" }, tone: "quiet" }] })
        }
        className="inline-flex items-center gap-1.5 rounded-full border border-white/12 px-3 py-1.5 font-dm text-[11px] text-muted hover:border-yellow/40 hover:text-offwhite"
      >
        <Plus size={12} /> Add a label
      </button>
    </Disclosure>
  );
}

function SectionPanel({
  section,
  doc,
  catalogue,
  setSection,
}: {
  section: WorldSection;
  doc: WorldDoc;
  catalogue: PickerCatalogue;
  setSection: (id: string, next: Partial<WorldSection>) => void;
}) {
  const set = (next: Partial<WorldSection>) => setSection(section.id, next);

  const head = (
    <>
      <LocalizedField label="Heading" value={section.title} onChange={(title) => set({ title })} />
      <LocalizedField
        label="Sub-heading"
        multiline
        value={section.subtitle}
        onChange={(subtitle) => set({ subtitle })}
      />
      {section.type !== "concierge" && (
        <Field
          label="“See all” link"
          hint="A curated section shows a handful on purpose. This is where the reader who wanted the tenth one goes. Leave empty for no link."
        >
          <input
            className={inputCls}
            value={section.seeAll ?? ""}
            placeholder="/browse/tours"
            onChange={(e) => set({ seeAll: e.target.value } as Partial<WorldSection>)}
          />
        </Field>
      )}
    </>
  );

  return (
    <Disclosure
      title={section.title?.en?.trim() || SECTION_NAME[section.type]}
      subtitle={section.enabled === false ? "Hidden" : SECTION_NAME[section.type]}
    >
      {SECTION_SOURCE[section.type] && (
        <p className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5 font-dm text-[11.5px] text-muted">
          {SECTION_SOURCE[section.type]}
        </p>
      )}
      {head}

      {section.type === "cards" && (
        <div className="space-y-2">
          {section.items.map((c, i) => (
            <Disclosure
              key={c.id}
              title={c.label.en || "Untitled card"}
              subtitle={c.enabled === false ? "Hidden" : c.href || "No destination"}
              right={
                <RowTools
                  index={i}
                  count={section.items.length}
                  onMove={(from, to) =>
                    set({ items: moveItem(section.items, from, to) } as Partial<WorldSection>)
                  }
                  onRemove={() =>
                    set({ items: section.items.filter((_, j) => j !== i) } as Partial<WorldSection>)
                  }
                  enabled={c.enabled !== false}
                  onToggle={() =>
                    set({
                      items: section.items.map((x, j) =>
                        j === i ? { ...x, enabled: x.enabled === false } : x,
                      ),
                    } as Partial<WorldSection>)
                  }
                />
              }
            >
              <LocalizedField
                label="Label"
                value={c.label}
                onChange={(label) =>
                  set({
                    items: section.items.map((x, j) => (j === i ? { ...x, label } : x)),
                  } as Partial<WorldSection>)
                }
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Icon">
                  <select
                    className={inputCls}
                    value={c.icon}
                    onChange={(e) =>
                      set({
                        items: section.items.map((x, j) => (j === i ? { ...x, icon: e.target.value } : x)),
                      } as Partial<WorldSection>)
                    }
                  >
                    {CARD_ICONS.map((k) => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Photos from" hint="The catalogue supplies the picture.">
                  <select
                    className={inputCls}
                    value={c.imageSource}
                    onChange={(e) =>
                      set({
                        items: section.items.map((x, j) =>
                          j === i ? { ...x, imageSource: e.target.value } : x,
                        ),
                      } as Partial<WorldSection>)
                    }
                  >
                    {IMAGE_SOURCES.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Goes to">
                <input
                  className={inputCls}
                  value={c.href ?? ""}
                  placeholder="/browse/stays"
                  onChange={(e) =>
                    set({
                      items: section.items.map((x, j) => (j === i ? { ...x, href: e.target.value } : x)),
                    } as Partial<WorldSection>)
                  }
                />
              </Field>
              <ImageField
                label="Pinned photo (optional)"
                hint="Overrides the catalogue photo for this card only."
                value={c.image}
                onChange={(image) =>
                  set({
                    items: section.items.map((x, j) => (j === i ? { ...x, image } : x)),
                  } as Partial<WorldSection>)
                }
              />
              <label className="flex items-center gap-2 font-dm text-[12px] text-offwhite">
                <input
                  type="checkbox"
                  checked={!!c.popular}
                  onChange={(e) =>
                    set({
                      items: section.items.map((x, j) =>
                        j === i ? { ...x, popular: e.target.checked } : x,
                      ),
                    } as Partial<WorldSection>)
                  }
                />
                Show a “Popular” badge
              </label>
            </Disclosure>
          ))}
          <button
            type="button"
            onClick={() =>
              set({
                items: [
                  ...section.items,
                  {
                    id: uid("wc"),
                    label: { en: "New card" },
                    icon: "compass",
                    imageSource: "none",
                    href: "/explore",
                    action: "link" as const,
                    enabled: true,
                  },
                ],
              } as Partial<WorldSection>)
            }
            className="inline-flex items-center gap-1.5 rounded-full border border-white/12 px-3 py-1.5 font-dm text-[11px] text-muted hover:border-yellow/40 hover:text-offwhite"
          >
            <Plus size={12} /> Add a card
          </button>
        </div>
      )}

      {section.type === "quickAccess" && (
        <div className="space-y-2">
          {section.items.map((q, i) => (
            <div key={q.id} className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
              <div className="mb-2 flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-dm text-[12px] text-offwhite">
                  {q.label.en || "Untitled"}
                </span>
                <RowTools
                  index={i}
                  count={section.items.length}
                  onMove={(from, to) =>
                    set({ items: moveItem(section.items, from, to) } as Partial<WorldSection>)
                  }
                  onRemove={() =>
                    set({ items: section.items.filter((_, j) => j !== i) } as Partial<WorldSection>)
                  }
                  enabled={q.enabled !== false}
                  onToggle={() =>
                    set({
                      items: section.items.map((x, j) =>
                        j === i ? { ...x, enabled: x.enabled === false } : x,
                      ),
                    } as Partial<WorldSection>)
                  }
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <LocalizedField
                  label="Label"
                  value={q.label}
                  onChange={(label) =>
                    set({
                      items: section.items.map((x, j) => (j === i ? { ...x, label } : x)),
                    } as Partial<WorldSection>)
                  }
                />
                <Field label="Icon">
                  <select
                    className={inputCls}
                    value={q.icon}
                    onChange={(e) =>
                      set({
                        items: section.items.map((x, j) => (j === i ? { ...x, icon: e.target.value } : x)),
                      } as Partial<WorldSection>)
                    }
                  >
                    {TILE_ICONS.map((k) => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Goes to">
                  <input
                    className={inputCls}
                    value={q.href}
                    onChange={(e) =>
                      set({
                        items: section.items.map((x, j) => (j === i ? { ...x, href: e.target.value } : x)),
                      } as Partial<WorldSection>)
                    }
                  />
                </Field>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              set({
                items: [
                  ...section.items,
                  { id: uid("wq"), label: { en: "New tile" }, icon: "compass", href: "/explore", enabled: true },
                ],
              } as Partial<WorldSection>)
            }
            className="inline-flex items-center gap-1.5 rounded-full border border-white/12 px-3 py-1.5 font-dm text-[11px] text-muted hover:border-yellow/40 hover:text-offwhite"
          >
            <Plus size={12} /> Add a tile
          </button>
        </div>
      )}

      {(section.type === "featured" || section.type === "onlyInRodrigues") && (
        <>
          {section.type === "featured" && (
            <Field
              label="How many cards"
              hint="Fewer, better. Under six is the point of a curated page."
            >
              <input
                type="number"
                min={3}
                max={12}
                className={inputCls}
                value={section.limit ?? 6}
                onChange={(e) => set({ limit: Number(e.target.value) } as Partial<WorldSection>)}
              />
            </Field>
          )}
          <div className="space-y-2">
            {section.cards.map((card, i) => (
              <CardEditor
                key={card.id}
                card={card}
                index={i}
                count={section.cards.length}
                cat={catalogue}
                labels={doc.labels}
                onChange={(next) =>
                  set({
                    cards: section.cards.map((c, j) => (j === i ? next : c)),
                  } as Partial<WorldSection>)
                }
                onMove={(from, to) =>
                  set({ cards: moveItem(section.cards, from, to) } as Partial<WorldSection>)
                }
                onRemove={() =>
                  set({ cards: section.cards.filter((_, j) => j !== i) } as Partial<WorldSection>)
                }
              />
            ))}
            <button
              type="button"
              onClick={() =>
                set({
                  cards: [
                    ...section.cards,
                    {
                      id: uid("card"),
                      source: catalogue.places[0]
                        ? { kind: "place" as const, id: catalogue.places[0].id }
                        : { kind: "link" as const, href: "/explore" },
                      status: "draft" as const,
                    },
                  ],
                } as Partial<WorldSection>)
              }
              className="inline-flex items-center gap-1.5 rounded-full border border-white/12 px-3 py-1.5 font-dm text-[11px] text-muted hover:border-yellow/40 hover:text-offwhite"
            >
              <Plus size={12} /> Add a card
            </button>
          </div>
        </>
      )}

      {section.type === "moods" && (
        <div className="space-y-2">
          {section.moods.map((m, i) => (
            <Disclosure
              key={m.id}
              title={m.title.en || "Untitled mood"}
              subtitle={m.enabled === false ? "Hidden" : m.href}
              right={
                <RowTools
                  index={i}
                  count={section.moods.length}
                  onMove={(from, to) =>
                    set({ moods: moveItem(section.moods, from, to) } as Partial<WorldSection>)
                  }
                  onRemove={() =>
                    set({ moods: section.moods.filter((_, j) => j !== i) } as Partial<WorldSection>)
                  }
                  enabled={m.enabled !== false}
                  onToggle={() =>
                    set({
                      moods: section.moods.map((x, j) =>
                        j === i ? { ...x, enabled: x.enabled === false } : x,
                      ),
                    } as Partial<WorldSection>)
                  }
                />
              }
            >
              <LocalizedField
                label="Mood"
                value={m.title}
                onChange={(title) =>
                  set({
                    moods: section.moods.map((x, j) => (j === i ? { ...x, title } : x)),
                  } as Partial<WorldSection>)
                }
              />
              <LocalizedField
                label="The day, in one sentence"
                multiline
                value={m.blurb}
                onChange={(blurb) =>
                  set({
                    moods: section.moods.map((x, j) => (j === i ? { ...x, blurb } : x)),
                  } as Partial<WorldSection>)
                }
              />
              <ImageField
                label="Photo"
                hint="Empty picks an island photograph for you."
                value={m.image}
                onChange={(image) =>
                  set({
                    moods: section.moods.map((x, j) => (j === i ? { ...x, image } : x)),
                  } as Partial<WorldSection>)
                }
              />
              <Field label="Goes to">
                <input
                  className={inputCls}
                  value={m.href}
                  onChange={(e) =>
                    set({
                      moods: section.moods.map((x, j) => (j === i ? { ...x, href: e.target.value } : x)),
                    } as Partial<WorldSection>)
                  }
                />
              </Field>
            </Disclosure>
          ))}
          <button
            type="button"
            onClick={() =>
              set({
                moods: [
                  ...section.moods,
                  {
                    id: uid("mood"),
                    title: { en: "New mood" },
                    blurb: { en: "" },
                    href: "/explore",
                    enabled: true,
                  },
                ],
              } as Partial<WorldSection>)
            }
            className="inline-flex items-center gap-1.5 rounded-full border border-white/12 px-3 py-1.5 font-dm text-[11px] text-muted hover:border-yellow/40 hover:text-offwhite"
          >
            <Plus size={12} /> Add a mood
          </button>
        </div>
      )}

      {section.type === "editors" && (
        <div className="space-y-2">
          {section.notes.map((n, i) => (
            <Disclosure
              key={n.id}
              title={n.title.en || "Untitled note"}
              subtitle={n.enabled === false ? "Hidden" : n.href}
              right={
                <RowTools
                  index={i}
                  count={section.notes.length}
                  onMove={(from, to) =>
                    set({ notes: moveItem(section.notes, from, to) } as Partial<WorldSection>)
                  }
                  onRemove={() =>
                    set({ notes: section.notes.filter((_, j) => j !== i) } as Partial<WorldSection>)
                  }
                  enabled={n.enabled !== false}
                  onToggle={() =>
                    set({
                      notes: section.notes.map((x, j) =>
                        j === i ? { ...x, enabled: x.enabled === false } : x,
                      ),
                    } as Partial<WorldSection>)
                  }
                />
              }
            >
              <LocalizedField
                label="Question or promise"
                value={n.title}
                onChange={(title) =>
                  set({
                    notes: section.notes.map((x, j) => (j === i ? { ...x, title } : x)),
                  } as Partial<WorldSection>)
                }
              />
              <LocalizedField
                label="Answer, in two lines"
                multiline
                value={n.body}
                onChange={(body) =>
                  set({
                    notes: section.notes.map((x, j) => (j === i ? { ...x, body } : x)),
                  } as Partial<WorldSection>)
                }
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <LocalizedField
                  label="Link label"
                  value={n.ctaLabel}
                  onChange={(ctaLabel) =>
                    set({
                      notes: section.notes.map((x, j) => (j === i ? { ...x, ctaLabel } : x)),
                    } as Partial<WorldSection>)
                  }
                />
                <Field label="Goes to">
                  <input
                    className={inputCls}
                    value={n.href}
                    onChange={(e) =>
                      set({
                        notes: section.notes.map((x, j) => (j === i ? { ...x, href: e.target.value } : x)),
                      } as Partial<WorldSection>)
                    }
                  />
                </Field>
              </div>
              <LocalizedField
                label="Signed by"
                hint="An unsigned recommendation is a listicle."
                value={n.byline}
                onChange={(byline) =>
                  set({
                    notes: section.notes.map((x, j) => (j === i ? { ...x, byline } : x)),
                  } as Partial<WorldSection>)
                }
              />
              <ImageField
                label="Photo (optional)"
                value={n.image}
                onChange={(image) =>
                  set({
                    notes: section.notes.map((x, j) => (j === i ? { ...x, image } : x)),
                  } as Partial<WorldSection>)
                }
              />
            </Disclosure>
          ))}
          <button
            type="button"
            onClick={() =>
              set({
                notes: [
                  ...section.notes,
                  {
                    id: uid("note"),
                    title: { en: "New note" },
                    body: { en: "" },
                    href: "/explore",
                    enabled: true,
                  },
                ],
              } as Partial<WorldSection>)
            }
            className="inline-flex items-center gap-1.5 rounded-full border border-white/12 px-3 py-1.5 font-dm text-[11px] text-muted hover:border-yellow/40 hover:text-offwhite"
          >
            <Plus size={12} /> Add a note
          </button>
        </div>
      )}

      {section.type === "concierge" && (
        <>
          <LocalizedField
            label="Eyebrow"
            value={section.eyebrow}
            onChange={(eyebrow) => set({ eyebrow } as Partial<WorldSection>)}
          />
          <LocalizedField
            label="Invitation"
            multiline
            value={section.body}
            onChange={(body) => set({ body } as Partial<WorldSection>)}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <LocalizedField
              label="Button label"
              value={section.ctaLabel}
              onChange={(ctaLabel) => set({ ctaLabel } as Partial<WorldSection>)}
            />
            <Field label="Button behaviour">
              <select
                className={inputCls}
                value={section.ctaAction ?? "tiroule"}
                onChange={(e) =>
                  set({ ctaAction: e.target.value as "tiroule" | "link" } as Partial<WorldSection>)
                }
              >
                <option value="tiroule">Open the Ti Roulé chat</option>
                <option value="link">Go to a page</option>
              </select>
            </Field>
          </div>
          {section.ctaAction === "link" && (
            <Field label="Goes to">
              <input
                className={inputCls}
                value={section.ctaHref ?? ""}
                onChange={(e) => set({ ctaHref: e.target.value } as Partial<WorldSection>)}
              />
            </Field>
          )}
          <LocalizedField
            label="Reassurance line"
            value={section.reassurance}
            onChange={(reassurance) => set({ reassurance } as Partial<WorldSection>)}
          />
          <ImageField
            label="Concierge portrait"
            hint="Empty uses the Ti Roulé artwork from Branding."
            value={section.avatar}
            onChange={(avatar) => set({ avatar } as Partial<WorldSection>)}
          />
        </>
      )}
    </Disclosure>
  );
}

function SeoPanel({ doc, patch }: { doc: WorldDoc; patch: (n: Partial<WorldDoc>) => void }) {
  return (
    <Disclosure title="Search engines" subtitle="How this page appears on Google">
      <Field label="Title">
        <input
          className={inputCls}
          value={doc.seo?.title ?? ""}
          onChange={(e) => patch({ seo: { ...doc.seo, title: e.target.value } })}
        />
      </Field>
      <Field label="Description" hint="Around 155 characters is what Google shows.">
        <textarea
          rows={3}
          className={inputCls}
          value={doc.seo?.description ?? ""}
          onChange={(e) => patch({ seo: { ...doc.seo, description: e.target.value } })}
        />
      </Field>
    </Disclosure>
  );
}
