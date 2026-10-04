"use client";

import { useState } from "react";
import { Check, Lock, X } from "lucide-react";
import type { MapLocation, RecommendedPlace } from "@/lib/defaults";
import { longReadChars, passesLocationGate } from "@/lib/guide/location-page-gate";
import {
  enablePagePatch,
  knownAreas,
  listingOptions,
  pageChecklist,
  slugInput,
  slugProblem,
  staleListingIds,
  suggestSlug,
  toggleListing,
} from "./location-fields";

// ── A PLACE THE REST OF THE SITE CAN POINT AT (architecture review 2026-09-30,
// item 2) ───────────────────────────────────────────────────────────────────
//
// The Island Guide editor had name, description, category, coordinates, photos
// and a story — nothing that let a page link "Port Mathurin" to the guesthouse
// in the village or the boat that leaves from its jetty, and nothing that could
// ever become a page of its own. These are the fields for that, each one
// optional, so every stored place is untouched until the owner fills one in.
//
// The page itself is not the owner's switch alone. lib/guide/location-page-gate
// .ts renders /guide/<slug> only when the place has the depth to justify it —
// long reads in English and French, photos, real coordinates — and the
// checklist here is built from that gate's own refusals, so it can never show
// a tick the page would not honour.
//
// Folded away by default: MapEditor renders every place expanded, and 42 of
// these open at once would bury the fields the owner edits every week.

const input =
  "w-full bg-[#0e0e0e] border border-[#2a2a2a] rounded-xl px-4 py-3 text-offwhite text-sm font-dm placeholder:text-muted/40 hover:border-[#3a3a3a] focus:border-yellow focus:ring-2 focus:ring-yellow/15 focus:outline-none transition-all";
const label = "font-bebas text-muted text-[10px] tracking-[0.25em] mb-1.5 block";

export default function LocationPageFields({
  place,
  others,
  listings,
  onChange,
}: {
  place: MapLocation;
  /** Every other place on the map — slugs must be unique across them. */
  others: MapLocation[];
  /** content.recommended.items, hidden ones included (this is the editor). */
  listings: RecommendedPlace[];
  onChange: (patch: Partial<MapLocation>) => void;
}) {
  const [refusal, setRefusal] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const locked = place.pageEnabled === true;
  const live = locked && passesLocationGate(place);
  const suggestion = suggestSlug(place.name, others);
  const problem = slugProblem(place, others);
  const checklist = pageChecklist(place);
  const chosen = place.relatedListingIds ?? [];
  const stale = staleListingIds(listings, chosen);
  const q = filter.trim().toLowerCase();
  const options = listingOptions(listings, chosen).filter((o) => o.chosen || !q || o.name.toLowerCase().includes(q));
  const areas = knownAreas(others);
  const areaListId = `areas-${place.id}`;
  const slugId = `slug-${place.id}`;

  function togglePage() {
    setRefusal(null);
    if (locked) {
      if (
        live &&
        !window.confirm(
          `/guide/${place.slug} is a live page. Switching it off takes it down, and links and search ` +
            "results that point at it will stop working. Switch it off?",
        )
      ) {
        return;
      }
      onChange({ pageEnabled: undefined });
      return;
    }
    const r = enablePagePatch(place, others);
    if ("refused" in r) setRefusal(r.refused);
    else onChange(r.patch);
  }

  return (
    <details open={locked || undefined} className="group rounded-xl border border-[#2a2a2a] bg-[#0b0b0b]">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-4 py-2 font-dm text-xs text-muted/80">
        <span>
          <span className="font-bebas text-[11px] tracking-[0.25em] text-yellow">PLACE PAGE &amp; LINKS</span>
          <span className="ml-2">
            {live ? "Own page: live" : locked ? "Own page: asked for" : place.area ? place.area : "area, links, own page"}
          </span>
        </span>
        <span className="text-muted/50 group-open:rotate-180">▾</span>
      </summary>

      <div className="space-y-5 px-4 pb-5 pt-2">
        <div>
          <label htmlFor={`area-${place.id}`} className={label}>VILLAGE OR AREA</label>
          <input
            id={`area-${place.id}`}
            value={place.area ?? ""}
            onChange={(e) => onChange({ area: e.target.value || undefined })}
            list={areaListId}
            placeholder="e.g. Port Mathurin"
            className={input}
          />
          <datalist id={areaListId}>
            {areas.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </div>

        <div>
          <label htmlFor={slugId} className={label}>WEB ADDRESS (SLUG)</label>
          {locked ? (
            <div className="rounded-xl border border-[#2a2a2a] bg-[#0e0e0e] px-4 py-3">
              <p className="flex items-center gap-2 font-dm text-sm text-offwhite">
                <Lock size={13} className="text-yellow" />
                <span id={slugId}>/guide/{place.slug}</span>
              </p>
              <p className="mt-1 font-dm text-[11px] text-muted/70">
                This is a live URL, so it is locked while the page is switched on.
                {live
                  ? " Changing it would break every link and search result that points here."
                  : " It goes live the moment every line of the checklist below is ticked."}
              </p>
            </div>
          ) : (
            <>
              <input
                id={slugId}
                value={place.slug ?? ""}
                onChange={(e) => onChange({ slug: slugInput(e.target.value) || undefined })}
                onBlur={(e) => {
                  const tidy = e.target.value.replace(/-+$/, "");
                  if (tidy !== e.target.value) onChange({ slug: tidy || undefined });
                }}
                placeholder={suggestion || "e.g. port-mathurin"}
                className={input}
              />
              {!place.slug && suggestion && (
                <button
                  type="button"
                  onClick={() => onChange({ slug: suggestion })}
                  className="mt-1 inline-flex min-h-11 items-center font-dm text-xs text-yellow/90 hover:text-yellow"
                >
                  Use “{suggestion}”
                </button>
              )}
              <p className="mt-1 font-dm text-[11px] text-muted/60">
                Suggested from the name. It is the place&apos;s #anchor on its guide page and, if it
                ever gets its own page, /guide/{place.slug || suggestion || "…"}.
              </p>
            </>
          )}
          {problem && <p className="mt-1 font-dm text-xs text-amber-300">{problem}</p>}
        </div>

        <div className="space-y-3 rounded-xl border border-[#2a2a2a] p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-syne text-sm font-bold text-offwhite">Give this place its own page</p>
              <p className="mt-0.5 font-dm text-[11px] text-muted/70">
                {live
                  ? `Live at /guide/${place.slug} once you save.`
                  : locked
                  ? "Asked for. The page appears only when every line below is ticked."
                  : "Off. The list below shows what a page would still need."}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={locked}
              aria-label={`Give ${place.name || "this place"} its own page`}
              onClick={togglePage}
              className="flex h-11 w-14 shrink-0 items-center justify-center"
            >
              <span className={`relative h-6 w-11 rounded-full transition-colors ${locked ? "bg-yellow" : "bg-[#2a2a2a]"}`}>
                <span
                  className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${
                    locked ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </span>
            </button>
          </div>
          {refusal && <p className="font-dm text-xs text-amber-300">{refusal}</p>}
          <ul className="space-y-1.5" aria-label="What the page needs">
            {checklist.map((line) => (
              <li key={line.label} className="flex items-start gap-2 font-dm text-xs">
                {line.ok ? (
                  <Check size={14} className="mt-px shrink-0 text-green-400" aria-label="done" />
                ) : (
                  <X size={14} className="mt-px shrink-0 text-muted/50" aria-label="still needed" />
                )}
                <span className={line.ok ? "text-offwhite/85" : "text-muted"}>{line.label}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <label htmlFor={`longread-${place.id}`} className={label}>LONG READ — ENGLISH</label>
          <textarea
            id={`longread-${place.id}`}
            value={place.longRead ?? ""}
            onChange={(e) => onChange({ longRead: e.target.value || undefined })}
            rows={6}
            className={`${input} resize-y`}
          />
          <p className="mt-1 font-dm text-[11px] text-muted/60">
            Your own words, one paragraph per line. Counts as{" "}
            {longReadChars(place.longRead, place.story).toLocaleString("en-US")} characters with the
            story above.
          </p>
        </div>

        <div>
          <label htmlFor={`longread-fr-${place.id}`} className={label}>LONG READ — FRENCH</label>
          <textarea
            id={`longread-fr-${place.id}`}
            value={place.longReadFr ?? ""}
            onChange={(e) => onChange({ longReadFr: e.target.value || undefined })}
            rows={6}
            className={`${input} resize-y`}
          />
          <p className="mt-1 font-dm text-[11px] text-muted/60">
            Counts as {longReadChars(place.longReadFr, place.storyFr).toLocaleString("en-US")} characters
            with the French story.
          </p>
        </div>

        <div>
          <p className={label}>BOOK NEAR HERE — LISTINGS AT OR FROM THIS PLACE</p>
          <p className="mb-2 font-dm text-[11px] text-muted/60">
            Only what you tick here is linked. Nothing is guessed from names or distance.
          </p>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Find a stay, activity or service…"
            aria-label="Find a listing"
            className={input}
          />
          <ul className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-[#1e1e1e]">
            {options.map((o) => (
              <li key={o.id}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 font-dm text-sm text-offwhite/85 hover:bg-white/[0.03]">
                  <input
                    type="checkbox"
                    checked={o.chosen}
                    onChange={() => onChange({ relatedListingIds: toggleListing(place.relatedListingIds, o.id) })}
                    className="h-4 w-4 accent-yellow"
                  />
                  <span className="min-w-0 flex-1 truncate">{o.name}</span>
                  {o.hidden && <span className="font-dm text-[11px] text-muted/50">hidden</span>}
                </label>
              </li>
            ))}
            {options.length === 0 && (
              <li className="px-3 py-3 font-dm text-xs text-muted/50">No listing matches.</li>
            )}
          </ul>
          {stale.map((id) => (
            <p key={id} className="mt-2 flex items-center gap-2 font-dm text-xs text-amber-300">
              A linked listing no longer exists ({id}).
              <button
                type="button"
                onClick={() => onChange({ relatedListingIds: toggleListing(place.relatedListingIds, id) })}
                className="inline-flex min-h-11 items-center underline"
              >
                Remove
              </button>
            </p>
          ))}
        </div>
      </div>
    </details>
  );
}
