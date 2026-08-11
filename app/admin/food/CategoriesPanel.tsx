"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Pencil, Eye, EyeOff } from "lucide-react";
import { foodWrite, type AdminFoodCategory } from "./types";

// The food taxonomy.
//
// Its own table, not public.categories — that one is the marketplace product
// tree feeding /shop's filter bar, and putting "Ourite" in it would surface
// food categories in the shop directory (the M42 leak, again).
//
// A category with no dishes in it is never shown to a customer: food_home()
// omits empty ones. So the dish count on each row is the honest answer to "is
// this category real yet", and an operator can add aspirational categories
// without breaking the customer's screen.

const label = "block font-bebas text-[11px] tracking-[0.2em] text-muted";
const input =
  "mt-1 w-full rounded-xl border border-white/10 bg-dark px-3 py-2.5 font-dm text-sm text-offwhite placeholder:text-muted focus:border-yellow/50 focus:outline-none";

type Draft = {
  id: string | null;
  slug: string;
  name: string;
  nameFr: string;
  nameCr: string;
  emoji: string;
  position: number;
};

export default function CategoriesPanel({
  categories, reload,
}: {
  categories: AdminFoodCategory[];
  reload: () => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const toggle = useCallback(
    async (c: AdminFoodCategory) => {
      setBusy(c.id);
      const res = await foodWrite("/api/admin/food/categories", {
        method: "PATCH",
        body: JSON.stringify({ id: c.id, isActive: !c.isActive }),
      });
      setBusy(null);
      if (!res.ok) { toast.error(res.error); return; }
      reload();
    },
    [reload],
  );

  const save = useCallback(async () => {
    if (!draft) return;
    setBusy("save");
    const res = await foodWrite("/api/admin/food/categories", {
      method: draft.id ? "PATCH" : "POST",
      body: JSON.stringify({
        ...(draft.id ? { id: draft.id } : {}),
        slug: draft.slug.trim() || draft.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        name: draft.name.trim(),
        nameFr: draft.nameFr,
        nameCr: draft.nameCr,
        emoji: draft.emoji,
        position: draft.position,
      }),
    });
    setBusy(null);
    if (!res.ok) { toast.error(res.error); return; }
    toast.success(draft.id ? "Category saved." : "Category added.");
    setDraft(null);
    reload();
  }, [draft, reload]);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="font-dm text-sm text-muted">
          Categories with no dishes are hidden from customers automatically.
        </p>
        <button
          onClick={() =>
            setDraft({ id: null, slug: "", name: "", nameFr: "", nameCr: "", emoji: "", position: (categories.at(-1)?.position ?? 0) + 10 })
          }
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-yellow px-4 py-2.5 font-dm text-sm font-bold text-dark hover:opacity-90"
        >
          <Plus size={15} /> Add
        </button>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {categories.map((c) => (
          <article
            key={c.id}
            className={`flex items-center gap-3 rounded-2xl border bg-dark-card px-4 py-3 ${
              c.isActive ? "border-white/10" : "border-white/5 opacity-50"
            }`}
          >
            <span className="text-xl" aria-hidden>{c.emoji ?? "🍽"}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-syne text-sm font-bold text-offwhite">{c.name}</p>
              <p className="font-dm text-xs text-muted">
                {c.dishCount} dish{c.dishCount === 1 ? "" : "es"}
                {c.dishCount === 0 && " · hidden from customers"}
              </p>
            </div>
            <button
              onClick={() => void toggle(c)}
              disabled={busy === c.id}
              className="rounded-lg border border-white/15 px-2 py-1.5 text-muted hover:text-offwhite disabled:opacity-50"
              aria-label={c.isActive ? `Hide ${c.name}` : `Show ${c.name}`}
            >
              {c.isActive ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
            <button
              onClick={() =>
                setDraft({
                  id: c.id, slug: c.slug, name: c.name,
                  nameFr: c.nameFr ?? "", nameCr: c.nameCr ?? "",
                  emoji: c.emoji ?? "", position: c.position,
                })
              }
              className="rounded-lg border border-white/15 px-2 py-1.5 text-muted hover:text-offwhite"
              aria-label={`Edit ${c.name}`}
            >
              <Pencil size={13} />
            </button>
          </article>
        ))}
      </div>

      {draft && (
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/80 p-3 sm:items-center sm:p-6">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-dark-card p-5">
            <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">
              {draft.id ? "EDIT CATEGORY" : "NEW CATEGORY"}
            </p>
            <div className="mt-4 space-y-3.5">
              <div className="grid grid-cols-[64px_1fr] gap-3">
                <div>
                  <span className={label}>EMOJI</span>
                  <input className={`${input} text-center text-xl`} value={draft.emoji}
                    onChange={(e) => setDraft({ ...draft, emoji: e.target.value })} placeholder="🐙" />
                </div>
                <div>
                  <span className={label}>NAME</span>
                  <input className={input} value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Octopus" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className={label}>FRENCH</span>
                  <input className={input} value={draft.nameFr}
                    onChange={(e) => setDraft({ ...draft, nameFr: e.target.value })} placeholder="Ourite" />
                </div>
                <div>
                  <span className={label}>CREOLE</span>
                  <input className={input} value={draft.nameCr}
                    onChange={(e) => setDraft({ ...draft, nameCr: e.target.value })} placeholder="Ourit" />
                </div>
              </div>
              <div>
                <span className={label}>ORDER ON SCREEN</span>
                <input className={input} inputMode="numeric" value={draft.position}
                  onChange={(e) => setDraft({ ...draft, position: parseInt(e.target.value, 10) || 0 })} />
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <button onClick={() => setDraft(null)}
                className="flex-1 rounded-xl border border-white/15 px-4 py-3 font-dm text-sm text-muted hover:text-offwhite">
                Cancel
              </button>
              <button onClick={() => void save()} disabled={busy === "save" || !draft.name.trim()}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-yellow px-4 py-3 font-dm text-sm font-bold text-dark disabled:opacity-50">
                {busy === "save" && <Loader2 size={15} className="animate-spin" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
