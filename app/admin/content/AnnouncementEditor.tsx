"use client";

import { Plus, Trash2 } from "lucide-react";
import type { AnnouncementContent, AnnouncementItem } from "@/lib/defaults";
import AnnouncementBar, { announcementMessages } from "@/components/AnnouncementBar";

// ── THE ANNOUNCEMENT BAR, EDITABLE AGAIN ────────────────────────────────────
//
// architecture review 2026-09-30, item 1. app/layout.tsx renders
// <AnnouncementBar announcement={content.announcement} /> on every page, and
// its comment says the admin can write one. It could not: this editor was
// deleted in e9d72b0c (20 Jun 2026) because the BAR was crashing the site, and
// when the bar was fixed and reconnected the editor never came back. So the
// only way to switch it on — or, worse, OFF — was SQL.
//
// Recovered from that commit and adapted:
//   · The preview IS the live component, not a hand-drawn imitation of it, so
//     what the owner sees here is what ships. It sits in its own stacking
//     context (`isolate`) because the real bar is z-[60] and would otherwise
//     slide over the studio's sticky header.
//   · It is drawn TWICE, once in a 375px frame. The bar is one line that cuts
//     the rest off with "…", and most visitors are on phones, where only about
//     the first 35 characters fit (fewer with a link). A single preview the
//     width of this admin column showed a 50-character message whole while
//     phones cut it mid-word (architecture review 2026-09-30, item 1,
//     follow-up). The bar has no breakpoints — only its container's width
//     decides the cut — so the narrow frame reproduces a phone exactly, and no
//     character count has to be guessed or hard-coded here.
//   · The legacy single-message fields (text/link/linkText) are still kept in
//     step with the first message, exactly as before. announcementMessages()
//     falls back to them, so an older blob with no items[] still renders.
//   · It says out loud the two ways the bar can be "on" and show nothing: no
//     message text, or a link with no link text (the bar only draws a link
//     when both are set — components/AnnouncementBar.tsx).
//
// Admin screens are English-only throughout; the bar itself is not translated
// (AnnouncementItem has one text), which is why the note below asks for words
// that work for every visitor.

const COLORS: { value: string; label: string; swatch: string }[] = [
  { value: "yellow", label: "Yellow", swatch: "bg-yellow" },
  { value: "green", label: "Green", swatch: "bg-emerald-500" },
  { value: "blue", label: "Blue", swatch: "bg-sky-500" },
  { value: "red", label: "Red", swatch: "bg-red-500" },
];

const input =
  "w-full bg-[#0e0e0e] border border-[#2a2a2a] rounded-xl px-4 py-3 text-offwhite text-sm font-dm placeholder:text-muted/40 hover:border-[#3a3a3a] focus:border-yellow focus:ring-2 focus:ring-yellow/15 focus:outline-none transition-all";

/** The messages as the editor shows them: at least one row to type into. */
export function editableMessages(a: AnnouncementContent): AnnouncementItem[] {
  if (a.items && a.items.length) return a.items;
  return [{ text: a.text ?? "", link: a.link ?? "", linkText: a.linkText ?? "" }];
}

/** Write a new message list, keeping the legacy single fields on message one. */
export function withMessages(a: AnnouncementContent, next: AnnouncementItem[]): AnnouncementContent {
  return {
    ...a,
    items: next,
    text: next[0]?.text ?? "",
    link: next[0]?.link ?? "",
    linkText: next[0]?.linkText ?? "",
  };
}

/** Owner-facing notes on why a message will not look the way he expects. */
export function messageWarning(m: AnnouncementItem): string | null {
  const link = m.link?.trim() ?? "";
  const linkText = m.linkText?.trim() ?? "";
  if (!m.text?.trim() && (link || linkText)) return "This message has no text, so it will be skipped.";
  if (link && !linkText) return "Add link text too — without it the link is not shown.";
  if (linkText && !link) return "Add where the link goes too — without it the link is not shown.";
  if (link && !/^(\/|#|https?:\/\/)/.test(link)) {
    return "Links should start with / (a page on this site), # or https://.";
  }
  return null;
}

export default function AnnouncementEditor({
  announcement,
  onChange,
}: {
  announcement: AnnouncementContent;
  onChange: (next: AnnouncementContent) => void;
}) {
  const a = announcement;
  const items = editableMessages(a);
  const live = announcementMessages(a);
  const setItems = (next: AnnouncementItem[]) => onChange(withMessages(a, next));
  const updateItem = (i: number, patch: Partial<AnnouncementItem>) =>
    setItems(items.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-[#2a2a2a] bg-[#0d0d0d] p-5">
        <div className="min-w-0">
          <p className="font-syne text-sm font-bold text-offwhite">Show the announcement bar</p>
          <p className="mt-0.5 font-dm text-xs text-muted">
            {a.active
              ? live.length > 0
                ? "On — it shows at the top of every page once you save."
                : "On, but there is no message yet — nothing shows until you write one."
              : "Off — nothing shows on the site."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={a.active}
          aria-label="Show the announcement bar on the website"
          onClick={() => onChange({ ...a, active: !a.active })}
          className="flex h-11 w-14 shrink-0 items-center justify-center"
        >
          <span className={`relative h-6 w-11 rounded-full transition-colors ${a.active ? "bg-yellow" : "bg-[#2a2a2a]"}`}>
            <span
              className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${
                a.active ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </span>
        </button>
      </div>

      <div>
        <p className="mb-2 font-bebas text-[10px] tracking-[0.25em] text-muted">
          {a.active ? "PREVIEW" : "PREVIEW — NOT LIVE WHILE SWITCHED OFF"}
        </p>
        {live.length > 0 ? (
          <div className="space-y-3">
            <div>
              <p className="mb-1.5 font-bebas text-[10px] tracking-[0.25em] text-muted/70">ON A PHONE</p>
              {/* A ring, not a border, so the bar inside gets the full 375px a phone gives it. */}
              <div
                data-preview="phone"
                className="isolate w-[375px] max-w-full overflow-hidden rounded-xl ring-1 ring-[#2a2a2a]"
              >
                <AnnouncementBar announcement={{ ...a, active: true }} />
              </div>
            </div>
            <div>
              <p className="mb-1.5 font-bebas text-[10px] tracking-[0.25em] text-muted/70">
                ON A TABLET OR COMPUTER
              </p>
              <div data-preview="wide" className="isolate overflow-hidden rounded-xl border border-[#2a2a2a]">
                <AnnouncementBar announcement={{ ...a, active: true }} />
              </div>
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[#2a2a2a]">
            <p className="px-4 py-3 font-dm text-xs text-muted/60">Write a message below to see it here.</p>
          </div>
        )}
      </div>

      <div>
        <p className="mb-2 font-bebas text-[10px] tracking-[0.25em] text-muted">
          MESSAGES {items.length > 1 ? "— THEY TAKE TURNS EVERY FEW SECONDS" : ""}
        </p>
        <p className="mb-3 font-dm text-xs text-muted/70">
          Phones show one line and cut the rest off with “…”. Put the important words first, and
          check the phone preview above.
        </p>
        <div className="space-y-3">
          {items.map((m, i) => {
            const warning = messageWarning(m);
            return (
              <div key={i} className="space-y-3 rounded-xl border border-[#2a2a2a] bg-[#0d0d0d] p-4">
                <div className="flex items-center justify-between">
                  <span className="font-bebas text-[10px] tracking-[0.25em] text-yellow">MESSAGE {i + 1}</span>
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setItems(items.filter((_, idx) => idx !== i))}
                      aria-label={`Remove message ${i + 1}`}
                      className="flex h-11 w-11 items-center justify-center text-muted/50 transition-colors hover:text-red-400"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <input
                  value={m.text}
                  onChange={(e) => updateItem(i, { text: e.target.value })}
                  maxLength={140}
                  aria-label={`Message ${i + 1} text`}
                  placeholder="e.g. Ferry delayed — call us"
                  className={input}
                />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <input
                    value={m.link}
                    onChange={(e) => updateItem(i, { link: e.target.value })}
                    aria-label={`Message ${i + 1} link`}
                    placeholder="Link, e.g. /browse/scooter (optional)"
                    className={input}
                  />
                  <input
                    value={m.linkText}
                    onChange={(e) => updateItem(i, { linkText: e.target.value })}
                    maxLength={40}
                    aria-label={`Message ${i + 1} link text`}
                    placeholder="Link text, e.g. See scooters"
                    className={input}
                  />
                </div>
                {warning && <p className="font-dm text-xs text-amber-300">{warning}</p>}
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setItems([...items, { text: "", link: "", linkText: "" }])}
          className="mt-3 inline-flex min-h-11 items-center gap-2 font-dm text-xs text-muted/70 transition-colors hover:text-yellow"
        >
          <Plus size={13} /> Add another message
        </button>
      </div>

      <div>
        <p className="mb-2 font-bebas text-[10px] tracking-[0.25em] text-muted">COLOUR</p>
        <div className="flex gap-2" role="radiogroup" aria-label="Bar colour">
          {COLORS.map((c) => {
            const on = (a.bgColor || "yellow") === c.value;
            return (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={c.label}
                onClick={() => onChange({ ...a, bgColor: c.value })}
                className="flex h-11 w-11 items-center justify-center"
              >
                <span
                  className={`h-7 w-7 rounded-full ${c.swatch} ${
                    on ? "ring-2 ring-white ring-offset-2 ring-offset-[#080808]" : ""
                  }`}
                />
              </button>
            );
          })}
        </div>
      </div>

      <p className="font-dm text-xs text-muted/60">
        The bar is the same for every visitor, whatever language they chose, so keep it short and
        plain. Click Save changes to publish; switch it off here to take it down.
      </p>
    </div>
  );
}
