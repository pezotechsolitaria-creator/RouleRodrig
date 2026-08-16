"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { AlertTriangle, Check, Link2, Search } from "lucide-react";
import type { WorldCard, EditorialLabel } from "@/lib/world-docs/types";
import { Disclosure, Field, ImageField, LocalizedField, RowTools, inputCls } from "./fields";

export interface PickerCatalogue {
  places: { id: string; name: string; category: string; serviceType: string | null; isTour: boolean; image: string }[];
  locations: { id: string; name: string; category: string; image: string; hasStory: boolean }[];
  routes: { id: string; name: string; kind: string; image: string }[];
  /** Scooters and cars. */
  fleet: { id: string; name: string; category: string; price: string; image: string }[];
}

/** What a card is pointing at, in words, plus whether that thing still exists. */
export function describeSource(card: WorldCard, cat: PickerCatalogue) {
  const s = card.source;
  if (s.kind === "link") return { label: `Link → ${s.href}`, image: card.image ?? "", missing: false };
  if (s.kind === "place") {
    const p = cat.places.find((x) => x.id === s.id);
    return { label: p ? p.name : "Deleted listing", image: card.image || p?.image || "", missing: !p };
  }
  if (s.kind === "location") {
    const l = cat.locations.find((x) => x.id === s.id);
    return { label: l ? l.name : "Deleted map place", image: card.image || l?.image || "", missing: !l };
  }
  if (s.kind === "route") {
    const r = cat.routes.find((x) => x.id === s.id);
    return { label: r ? r.name : "Deleted route", image: card.image || r?.image || "", missing: !r };
  }
  if (s.kind === "fleet") {
    const v = cat.fleet.find((x) => x.id === s.id);
    return { label: v ? v.name : "Removed vehicle", image: card.image || v?.image || "", missing: !v };
  }
  return { label: `Event · ${s.slug}`, image: card.image ?? "", missing: false };
}

/**
 * Choose what a card points at.
 *
 * ── PICK A REAL THING, DON'T TYPE ONE ─────────────────────────────────────
 * There is no "card title / card photo / card link" trio here, and that is the
 * design. A card that stores its own copy of a stay's name and photo is a card
 * that goes stale the first time the stay is re-photographed, and that keeps
 * selling it after it is deleted. The editor picks the row; the page reads the
 * row. Everything under "Editorial overrides" is optional on top of that.
 */
function SourcePicker({
  card,
  cat,
  onChange,
}: {
  card: WorldCard;
  cat: PickerCatalogue;
  onChange: (source: WorldCard["source"]) => void;
}) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();

  const rows = useMemo(() => {
    const all = [
      ...cat.places.map((p) => ({
        key: `place:${p.id}`,
        source: { kind: "place", id: p.id } as WorldCard["source"],
        name: p.name,
        kind:
          p.category === "hotel"
            ? "Stay"
            : p.category === "restaurant"
              ? "Table"
              : p.serviceType
                ? p.serviceType
                : p.isTour
                  ? "Tour"
                  : "Activity",
        image: p.image,
      })),
      ...cat.locations.map((l) => ({
        key: `location:${l.id}`,
        source: { kind: "location", id: l.id } as WorldCard["source"],
        name: l.name,
        kind: l.category,
        image: l.image,
      })),
      ...cat.routes.map((r) => ({
        key: `route:${r.id}`,
        source: { kind: "route", id: r.id } as WorldCard["source"],
        name: r.name,
        kind: r.kind === "hike" ? "Trail" : "Ride",
        image: r.image,
      })),
      ...cat.fleet.map((v) => ({
        key: `fleet:${v.id}`,
        source: { kind: "fleet", id: v.id } as WorldCard["source"],
        name: v.name,
        kind: v.category === "car" ? "Car" : "Scooter",
        image: v.image,
      })),
    ];
    if (!query) return all;
    return all.filter((r) => `${r.name} ${r.kind}`.toLowerCase().includes(query));
  }, [cat, query]);

  const currentKey =
    card.source.kind === "link" ? "link" : `${card.source.kind}:${"id" in card.source ? card.source.id : ""}`;

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          className={`${inputCls} pl-8`}
          placeholder="Search stays, activities, beaches, trails, vehicles…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-white/10 bg-dark p-1">
        {rows.length === 0 && (
          <p className="p-3 font-dm text-xs text-muted">Nothing matches “{q}”.</p>
        )}
        {rows.map((r) => {
          const active = currentKey === r.key;
          return (
            <button
              key={r.key}
              type="button"
              onClick={() => onChange(r.source)}
              className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors ${
                active ? "bg-yellow/12" : "hover:bg-white/[0.05]"
              }`}
            >
              <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded bg-white/5">
                {r.image && <Image src={r.image} alt="" fill className="object-cover" unoptimized />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate font-dm text-[12.5px] ${active ? "text-yellow" : "text-offwhite"}`}>
                  {r.name}
                </span>
                <span className="block font-dm text-[10.5px] uppercase tracking-wider text-muted">
                  {r.kind}
                </span>
              </span>
              {active && <Check size={14} className="shrink-0 text-yellow" />}
            </button>
          );
        })}
      </div>

      {/* The escape hatch: a card that leads to a guide page or an in-app hub
          rather than to a catalogue row. It needs its own title and photo,
          which is exactly why it is the last option rather than the first. */}
      <button
        type="button"
        onClick={() => onChange({ kind: "link", href: card.source.kind === "link" ? card.source.href : "/food" })}
        className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 font-dm text-xs transition-colors ${
          card.source.kind === "link"
            ? "border-yellow/40 bg-yellow/10 text-yellow"
            : "border-white/12 text-muted hover:border-yellow/40 hover:text-offwhite"
        }`}
      >
        <Link2 size={13} /> An editorial card that links anywhere
      </button>

      {card.source.kind === "link" && (
        <Field label="Destination" hint="Any path on the site, e.g. /food or /guide/beaches">
          <input
            className={inputCls}
            value={card.source.href}
            onChange={(e) => onChange({ kind: "link", href: e.target.value })}
          />
        </Field>
      )}
    </div>
  );
}

export default function CardEditor({
  card,
  index,
  count,
  cat,
  labels,
  onChange,
  onMove,
  onRemove,
}: {
  card: WorldCard;
  index: number;
  count: number;
  cat: PickerCatalogue;
  labels: EditorialLabel[];
  onChange: (next: WorldCard) => void;
  onMove: (from: number, to: number) => void;
  onRemove: () => void;
}) {
  const info = describeSource(card, cat);
  const status = card.status ?? "published";
  const set = (patch: Partial<WorldCard>) => onChange({ ...card, ...patch });

  return (
    <Disclosure
      title={card.title?.en?.trim() || info.label}
      subtitle={
        info.missing
          ? "⚠ Points at something that no longer exists — this card will not appear"
          : status === "published"
            ? info.label
            : status === "draft"
              ? `Hidden draft · ${info.label}`
              : `Scheduled · ${info.label}`
      }
      right={
        <div className="flex items-center gap-2">
          <span className="relative hidden h-8 w-12 overflow-hidden rounded bg-white/5 sm:block">
            {info.image && <Image src={info.image} alt="" fill className="object-cover" unoptimized />}
          </span>
          <RowTools index={index} count={count} onMove={onMove} onRemove={onRemove} />
        </div>
      }
    >
      {info.missing && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 font-dm text-[11.5px] text-amber-200">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          The listing this card pointed at has been deleted. The page simply
          leaves it out — pick something else below, or remove the card.
        </p>
      )}

      <Field label="What is this card about?">
        <SourcePicker card={card} cat={cat} onChange={(source) => set({ source })} />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <LocalizedField
          label="Category pill"
          hint="PRIVATE · GASTRONOMY · LAGOON. Leave empty for none."
          value={card.category}
          onChange={(category) => set({ category })}
        />
        <Field label="Editorial labels" hint="Keep these rare — a label on every card means nothing.">
          <div className="flex flex-wrap gap-1.5">
            {labels.map((l) => {
              const on = (card.labels ?? []).includes(l.id);
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() =>
                    set({
                      labels: on
                        ? (card.labels ?? []).filter((x) => x !== l.id)
                        : [...(card.labels ?? []), l.id],
                    })
                  }
                  className={`rounded-full border px-2.5 py-1 font-dm text-[10.5px] uppercase tracking-wider transition-colors ${
                    on
                      ? "border-yellow/50 bg-yellow/15 text-yellow"
                      : "border-white/12 text-muted hover:border-yellow/40"
                  }`}
                >
                  {l.text.en}
                </button>
              );
            })}
            {labels.length === 0 && (
              <span className="font-dm text-[11px] text-muted">
                No labels yet — add some in the Labels panel.
              </span>
            )}
          </div>
        </Field>
      </div>

      <Disclosure title="Editorial overrides" subtitle="Optional — the listing's own words are used when these are empty">
        <LocalizedField label="Title" value={card.title} onChange={(title) => set({ title })} />
        <LocalizedField
          label="Blurb"
          multiline
          hint="Only shown on the large feature card."
          value={card.blurb}
          onChange={(blurb) => set({ blurb })}
        />
        <ImageField
          label="Photo override"
          hint="Empty uses the listing's own cover photo — usually the right answer."
          value={card.image}
          onChange={(image) => set({ image })}
        />
        <Field label="Destination override" hint="Empty sends people where the listing lives.">
          <input
            className={inputCls}
            value={card.href ?? ""}
            placeholder="/browse/stays"
            onChange={(e) => set({ href: e.target.value || undefined })}
          />
        </Field>
      </Disclosure>

      <Field label="Visibility">
        <div className="flex flex-wrap items-center gap-1.5">
          {(["published", "draft", "scheduled"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => set({ status: s })}
              className={`rounded-full border px-3 py-1 font-dm text-[11px] capitalize transition-colors ${
                status === s
                  ? "border-yellow/50 bg-yellow/15 text-yellow"
                  : "border-white/12 text-muted hover:border-yellow/40"
              }`}
            >
              {s === "published" ? "Live" : s}
            </button>
          ))}
          {status === "scheduled" && (
            <input
              type="datetime-local"
              className={`${inputCls} w-auto`}
              value={card.publishAt ? card.publishAt.slice(0, 16) : ""}
              onChange={(e) =>
                set({ publishAt: e.target.value ? new Date(e.target.value).toISOString() : undefined })
              }
            />
          )}
        </div>
      </Field>
    </Disclosure>
  );
}
