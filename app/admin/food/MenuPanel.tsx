"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import {
  Loader2, Plus, Search, Flame, Star, Trash2, Pencil,
  ImageIcon, AlertTriangle, Ban, Undo2,
} from "lucide-react";
import { centsToDecimalString, toCents } from "@/lib/money";
import { DIETARY_TAGS, DIETARY_LABEL, MEAL_TIMES } from "@/lib/food/types";
import { foodWrite, type AdminDish, type AdminFoodCategory, type AdminKitchen, type AdminVariant } from "./types";

// The dish catalog.
//
// Designed around the two things the operator actually does: add a dish once,
// carefully — and then change its availability constantly. So availability is
// on the LIST (one tap, no form) and everything else is behind Edit.

const DAY_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Sold out until the end of TODAY in Rodrigues, which is what "we've run out" means. */
function endOfIslandDay(): string {
  const now = new Date();
  // Rodrigues is UTC+4 with no DST, so midnight local is 20:00 UTC the day
  // before. Computed rather than hard-coded to a fixed hour so it stays right
  // whichever side of midnight UTC the operator presses the button.
  const islandNow = new Date(now.getTime() + 4 * 3600_000);
  const islandMidnight = Date.UTC(
    islandNow.getUTCFullYear(), islandNow.getUTCMonth(), islandNow.getUTCDate() + 1, 0, 0, 0,
  );
  return new Date(islandMidnight - 4 * 3600_000).toISOString();
}

const emptyDish = (kitchenId: string): DishDraft => ({
  productId: null,
  kitchenId,
  name: "",
  slug: "",
  descriptor: "",
  description: "",
  allergens: "",
  categories: [],
  dietary: [],
  mealTimes: [],
  spiceLevel: 0,
  serves: null,
  prepMinutesMin: null,
  prepMinutesMax: null,
  isSignature: false,
  availableDays: null,
  availableFrom: "",
  availableUntil: "",
  dailyCapacity: null,
  status: "active",
  variants: [{ name: null, price: 0, stock: 0, isActive: true, position: 0 }],
  images: [],
});

type DishDraft = {
  productId: string | null;
  kitchenId: string;
  name: string;
  slug: string;
  descriptor: string;
  description: string;
  allergens: string;
  categories: string[];
  dietary: string[];
  mealTimes: string[];
  spiceLevel: number;
  serves: number | null;
  prepMinutesMin: number | null;
  prepMinutesMax: number | null;
  isSignature: boolean;
  availableDays: number[] | null;
  availableFrom: string;
  availableUntil: string;
  dailyCapacity: number | null;
  status: string;
  variants: AdminVariant[];
  images: string[];
};

export default function MenuPanel({
  kitchens, categories, onChanged,
}: {
  kitchens: AdminKitchen[];
  categories: AdminFoodCategory[];
  onChanged: () => void;
}) {
  const [dishes, setDishes] = useState<AdminDish[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [kitchenFilter, setKitchenFilter] = useState("");
  const [draft, setDraft] = useState<DishDraft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/food/items");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to load the menu.");
      setDishes(body.items);
      setError(null);
    } catch (e) {
      setDishes(null);
      setError(e instanceof Error ? e.message : "Failed to load the menu.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (dishes ?? [])
      .filter((d) => (kitchenFilter ? d.kitchenId === kitchenFilter : true))
      .filter((d) =>
        needle ? `${d.name} ${d.descriptor ?? ""} ${d.kitchenName}`.toLowerCase().includes(needle) : true,
      );
  }, [dishes, q, kitchenFilter]);

  const toggleSoldOut = useCallback(
    async (dish: AdminDish) => {
      const clearing = Boolean(dish.soldOutUntil && new Date(dish.soldOutUntil) > new Date());
      setBusy(dish.productId);
      const result = await foodWrite("/api/admin/food/actions", {
        method: "POST",
        body: JSON.stringify({
          action: "sold_out",
          productId: dish.productId,
          until: clearing ? null : endOfIslandDay(),
          reason: clearing ? "" : "Ran out today",
        }),
      });
      setBusy(null);
      if (!result.ok) { toast.error(result.error); return; }
      toast.success(clearing ? `${dish.name} is back on.` : `${dish.name} marked sold out for today.`);
      void load();
    },
    [load],
  );

  const archive = useCallback(
    async (dish: AdminDish) => {
      if (!confirm(`Take "${dish.name}" off the menu? Past orders keep their record.`)) return;
      setBusy(dish.productId);
      const result = await foodWrite(`/api/admin/food/items?productId=${dish.productId}`, { method: "DELETE" });
      setBusy(null);
      if (!result.ok) { toast.error(result.error); return; }
      toast.success("Taken off the menu.");
      void load();
      onChanged();
    },
    [load, onChanged],
  );

  const save = useCallback(async () => {
    if (!draft) return;
    const payload = {
      ...(draft.productId ? { productId: draft.productId } : {}),
      kitchenId: draft.kitchenId,
      name: draft.name.trim(),
      ...(draft.slug.trim() ? { slug: draft.slug.trim() } : {}),
      descriptor: draft.descriptor,
      description: draft.description,
      allergens: draft.allergens,
      categories: draft.categories,
      dietary: draft.dietary,
      mealTimes: draft.mealTimes,
      spiceLevel: draft.spiceLevel,
      serves: draft.serves,
      prepMinutesMin: draft.prepMinutesMin,
      prepMinutesMax: draft.prepMinutesMax,
      isSignature: draft.isSignature,
      availableDays: draft.availableDays,
      availableFrom: draft.availableFrom || null,
      availableUntil: draft.availableUntil || null,
      dailyCapacity: draft.dailyCapacity,
      status: draft.status,
      variants: draft.variants.map((v, i) => ({
        ...(v.id ? { id: v.id } : {}),
        name: v.name ?? "",
        price: v.price,
        stock: v.stock,
        position: i,
        isActive: v.isActive,
      })),
      images: draft.images,
    };

    setBusy("save");
    const result = await foodWrite("/api/admin/food/items", {
      method: draft.productId ? "PATCH" : "POST",
      body: JSON.stringify(payload),
    });
    setBusy(null);
    if (!result.ok) { toast.error(result.error); return; }
    toast.success(draft.productId ? "Dish saved." : "Dish added to the menu.");
    setDraft(null);
    void load();
    onChanged();
  }, [draft, load, onChanged]);

  if (kitchens.length === 0) {
    return (
      <div className="rounded-2xl border border-yellow/25 bg-yellow/5 px-6 py-10 text-center">
        <p className="font-syne text-lg font-bold text-offwhite">Add a kitchen first</p>
        <p className="mx-auto mt-2 max-w-sm font-dm text-sm text-muted">
          Every dish is cooked somewhere. Create a kitchen in the Kitchens tab and the menu opens up.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search dishes…"
            className="w-full rounded-xl border border-white/10 bg-dark-card py-2.5 pl-9 pr-3 font-dm text-sm text-offwhite placeholder:text-muted focus:border-yellow/50 focus:outline-none"
          />
        </div>
        <select
          value={kitchenFilter}
          onChange={(e) => setKitchenFilter(e.target.value)}
          className="rounded-xl border border-white/10 bg-dark-card px-3 py-2.5 font-dm text-sm text-offwhite"
        >
          <option value="">All kitchens</option>
          {kitchens.map((k) => <option key={k.storeId} value={k.storeId}>{k.name}</option>)}
        </select>
        <button
          onClick={() => setDraft(emptyDish(kitchenFilter || kitchens[0].storeId))}
          className="inline-flex items-center gap-1.5 rounded-xl bg-yellow px-4 py-2.5 font-dm text-sm font-bold text-dark hover:opacity-90"
        >
          <Plus size={15} /> Add a dish
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 font-dm text-sm text-red-200">
          {error}
        </div>
      )}
      {dishes === null && !error && (
        <p className="mt-8 flex items-center gap-2 font-dm text-sm text-muted">
          <Loader2 size={15} className="animate-spin" /> Loading the menu…
        </p>
      )}

      {dishes !== null && visible.length === 0 && (
        <div className="mt-8 rounded-2xl border border-white/10 bg-dark-card px-6 py-10 text-center">
          <p className="font-syne text-lg font-bold text-offwhite">
            {q || kitchenFilter ? "No dishes match" : "The menu is empty"}
          </p>
          <p className="mt-1.5 font-dm text-sm text-muted">
            {q || kitchenFilter ? "Try a different search." : "Add the first dish — customers see it straight away."}
          </p>
        </div>
      )}

      <div className="mt-4 space-y-2.5">
        {visible.map((d) => {
          const soldOut = Boolean(d.soldOutUntil && new Date(d.soldOutUntil) > new Date());
          const off = d.status !== "active" || d.kitchenStatus !== "active";
          return (
            <article
              key={d.productId}
              className={`flex gap-3 rounded-2xl border bg-dark-card p-3 ${
                off ? "border-white/5 opacity-60" : soldOut ? "border-orange-400/30" : "border-white/10"
              }`}
            >
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-dark">
                {d.images[0] ? (
                  <Image src={d.images[0]} alt="" fill sizes="64px" className="object-cover" />
                ) : (
                  <span className="flex h-full items-center justify-center text-muted">
                    <ImageIcon size={18} />
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 font-syne text-sm font-extrabold text-offwhite">
                  <span className="truncate">{d.name}</span>
                  {d.isSignature && <Star size={13} className="shrink-0 text-yellow" fill="currentColor" />}
                  {d.spiceLevel > 0 && (
                    <span className="inline-flex shrink-0 text-orange-400" aria-label={`Spice ${d.spiceLevel} of 3`}>
                      {Array.from({ length: d.spiceLevel }).map((_, i) => <Flame key={i} size={11} />)}
                    </span>
                  )}
                </p>
                <p className="truncate font-dm text-xs text-muted">
                  {d.kitchenName}
                  {d.descriptor ? ` · ${d.descriptor}` : ""}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-dm text-xs">
                  <span className="font-bold text-yellow">Rs {centsToDecimalString(d.price)}</span>
                  <span className={d.stock > 0 ? "text-muted" : "text-orange-300"}>
                    {d.stock > 0 ? `${d.stock} left` : "none left"}
                  </span>
                  {d.availableFrom && (
                    <span className="text-muted">{d.availableFrom.slice(0, 5)}–{d.availableUntil?.slice(0, 5)}</span>
                  )}
                  {d.availableDays?.length ? (
                    <span className="text-muted">{d.availableDays.map((n) => DAY_LABEL[n]).join(" ")}</span>
                  ) : null}
                  {off && <span className="text-muted">· {d.status !== "active" ? d.status : "kitchen off"}</span>}
                  {soldOut && <span className="font-semibold text-orange-300">· sold out today</span>}
                </p>
              </div>

              <div className="flex shrink-0 flex-col gap-1.5">
                <button
                  onClick={() => void toggleSoldOut(d)}
                  disabled={busy === d.productId}
                  title={soldOut ? "Put it back on the menu" : "Mark sold out for today"}
                  className={`rounded-lg border px-2.5 py-1.5 font-dm text-[11px] font-semibold disabled:opacity-50 ${
                    soldOut
                      ? "border-yellow/50 text-yellow hover:bg-yellow/10"
                      : "border-white/15 text-muted hover:border-orange-400/50 hover:text-orange-300"
                  }`}
                >
                  {soldOut ? <Undo2 size={13} /> : <Ban size={13} />}
                </button>
                <button
                  onClick={() => setDraft(toDraft(d))}
                  className="rounded-lg border border-white/15 px-2.5 py-1.5 text-muted hover:text-offwhite"
                  title="Edit"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => void archive(d)}
                  disabled={busy === d.productId}
                  className="rounded-lg border border-white/15 px-2.5 py-1.5 text-muted hover:border-red-500/40 hover:text-red-300 disabled:opacity-50"
                  title="Take off the menu"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {draft && (
        <DishEditor
          draft={draft}
          setDraft={setDraft}
          kitchens={kitchens}
          categories={categories}
          saving={busy === "save"}
          onSave={save}
          onClose={() => setDraft(null)}
        />
      )}
    </div>
  );
}

function toDraft(d: AdminDish): DishDraft {
  return {
    productId: d.productId,
    kitchenId: d.kitchenId,
    name: d.name,
    slug: d.slug,
    descriptor: d.descriptor ?? "",
    description: d.description ?? "",
    allergens: d.allergens ?? "",
    categories: d.categories,
    dietary: d.dietary,
    mealTimes: d.mealTimes,
    spiceLevel: d.spiceLevel,
    serves: d.serves,
    prepMinutesMin: d.prepMinutesMin,
    prepMinutesMax: d.prepMinutesMax,
    isSignature: d.isSignature,
    availableDays: d.availableDays,
    availableFrom: d.availableFrom?.slice(0, 5) ?? "",
    availableUntil: d.availableUntil?.slice(0, 5) ?? "",
    dailyCapacity: d.dailyCapacity,
    status: d.status,
    variants: d.variants.filter((v) => v.isActive),
    images: d.images,
  };
}

const label = "block font-bebas text-[11px] tracking-[0.2em] text-muted";
const input =
  "mt-1 w-full rounded-xl border border-white/10 bg-dark px-3 py-2.5 font-dm text-sm text-offwhite placeholder:text-muted focus:border-yellow/50 focus:outline-none";
const chip = "rounded-full border px-3 py-1.5 font-dm text-xs transition-colors";
const chipOn = `${chip} border-yellow/60 bg-yellow/15 text-yellow`;
const chipOff = `${chip} border-white/10 text-muted hover:border-white/25 hover:text-offwhite`;

function DishEditor({
  draft, setDraft, kitchens, categories, saving, onSave, onClose,
}: {
  draft: DishDraft;
  setDraft: (d: DishDraft) => void;
  kitchens: AdminKitchen[];
  categories: AdminFoodCategory[];
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const set = (patch: Partial<DishDraft>) => setDraft({ ...draft, ...patch });
  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((x) => x !== value) : [...list, value];

  const upload = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Upload failed.");
        setDraft({ ...draft, images: [...draft.images, body.path as string] });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Upload failed.");
      } finally {
        setUploading(false);
      }
    },
    [draft, setDraft],
  );

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-3 sm:p-6">
      <div className="mx-auto max-w-2xl rounded-2xl border border-white/10 bg-dark-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">
              {draft.productId ? "EDIT DISH" : "NEW DISH"}
            </p>
            <h3 className="mt-0.5 font-syne text-xl font-extrabold text-offwhite">
              {draft.name || "Untitled dish"}
            </h3>
          </div>
          <button onClick={onClose} className="font-dm text-sm text-muted hover:text-offwhite">Close</button>
        </div>

        <div className="mt-5 space-y-4">
          {/* ── The photo comes first, because on the customer's screen it IS
              the product and everything else is a caption. ── */}
          <div>
            <span className={label}>PHOTOS</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {draft.images.map((url, i) => (
                <div key={url} className="relative h-20 w-20 overflow-hidden rounded-xl border border-white/10">
                  <Image src={url} alt="" fill sizes="80px" className="object-cover" />
                  {i === 0 && (
                    <span className="absolute inset-x-0 bottom-0 bg-yellow/90 py-0.5 text-center font-bebas text-[9px] tracking-widest text-dark">
                      HERO
                    </span>
                  )}
                  <button
                    onClick={() => set({ images: draft.images.filter((u) => u !== url) })}
                    className="absolute right-0.5 top-0.5 rounded-md bg-black/70 p-1 text-white"
                    aria-label="Remove photo"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
              <label className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-xl border border-dashed border-white/20 text-muted hover:border-yellow/50 hover:text-yellow">
                {uploading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void upload(f);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            <p className="mt-1.5 font-dm text-[11px] text-muted">
              The first photo is what every card on the site shows. JPEG, PNG, WebP or HEIC, up to 4 MB.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <span className={label}>DISH NAME</span>
              <input className={input} value={draft.name} onChange={(e) => set({ name: e.target.value })}
                placeholder="Ourite rougaille" />
            </div>
            <div>
              <span className={label}>COOKED BY</span>
              <select className={input} value={draft.kitchenId} onChange={(e) => set({ kitchenId: e.target.value })}>
                {kitchens.map((k) => <option key={k.storeId} value={k.storeId}>{k.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <span className={label}>ONE-LINE DESCRIPTION</span>
            <input className={input} value={draft.descriptor} onChange={(e) => set({ descriptor: e.target.value })}
              placeholder="Octopus · tomato · thyme · served with rice" />
            <p className="mt-1 font-dm text-[11px] text-muted">
              Read in half a second under the name. Ingredients separated by · work best.
            </p>
          </div>

          <div>
            <span className={label}>FULL DESCRIPTION (OPTIONAL)</span>
            <textarea className={input} rows={3} value={draft.description}
              onChange={(e) => set({ description: e.target.value })} />
          </div>

          {/* ── Sizes are the ONLY option model. A priced choice is a size; a
              paid extra is its own cheap dish. See M50's header. ── */}
          <div>
            <span className={label}>SIZES &amp; PRICES</span>
            <div className="mt-2 space-y-2">
              {draft.variants.map((v, i) => (
                <div key={v.id ?? i} className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[110px] flex-1">
                    <input
                      className={input}
                      placeholder={draft.variants.length > 1 ? "Large" : "Name (optional)"}
                      value={v.name ?? ""}
                      onChange={(e) => {
                        const next = [...draft.variants];
                        next[i] = { ...v, name: e.target.value };
                        set({ variants: next });
                      }}
                    />
                  </div>
                  <div className="w-24">
                    <span className="font-dm text-[10px] text-muted">Rs</span>
                    <input
                      className={input}
                      inputMode="decimal"
                      value={centsToDecimalString(v.price)}
                      onChange={(e) => {
                        const cents = toCents(e.target.value);
                        const next = [...draft.variants];
                        next[i] = { ...v, price: cents ?? 0 };
                        set({ variants: next });
                      }}
                    />
                  </div>
                  <div className="w-24">
                    <span className="font-dm text-[10px] text-muted">Portions today</span>
                    <input
                      className={input}
                      inputMode="numeric"
                      value={v.stock}
                      onChange={(e) => {
                        const next = [...draft.variants];
                        next[i] = { ...v, stock: Math.max(0, parseInt(e.target.value, 10) || 0) };
                        set({ variants: next });
                      }}
                    />
                  </div>
                  {draft.variants.length > 1 && (
                    <button
                      onClick={() => set({ variants: draft.variants.filter((_, j) => j !== i) })}
                      className="rounded-lg border border-white/15 px-2.5 py-2.5 text-muted hover:text-red-300"
                      aria-label="Remove size"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={() =>
                set({
                  variants: [
                    ...draft.variants,
                    { name: "", price: draft.variants[0]?.price ?? 0, stock: 0, isActive: true, position: draft.variants.length },
                  ],
                })
              }
              className="mt-2 inline-flex items-center gap-1.5 font-dm text-xs font-semibold text-yellow hover:underline"
            >
              <Plus size={13} /> Add another size
            </button>
            <p className="mt-1.5 flex items-start gap-1.5 font-dm text-[11px] text-muted">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              One size = one tap to order. Two or more and the customer must choose first, so only add
              sizes that are genuinely different. Paid extras belong on the menu as their own cheap dish.
            </p>
          </div>

          <div>
            <span className={label}>CATEGORIES</span>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {categories.filter((c) => c.isActive).map((c) => (
                <button
                  key={c.slug}
                  onClick={() => set({ categories: toggle(draft.categories, c.slug) })}
                  className={draft.categories.includes(c.slug) ? chipOn : chipOff}
                >
                  {c.emoji} {c.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className={label}>GOOD FOR</span>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {MEAL_TIMES.map((m) => (
                  <button key={m} onClick={() => set({ mealTimes: toggle(draft.mealTimes, m) })}
                    className={draft.mealTimes.includes(m) ? chipOn : chipOff}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className={label}>DIETARY</span>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {DIETARY_TAGS.map((t) => (
                  <button key={t} onClick={() => set({ dietary: toggle(draft.dietary, t) })}
                    className={draft.dietary.includes(t) ? chipOn : chipOff}>
                    {DIETARY_LABEL[t]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <span className={label}>SPICE (0–3)</span>
              <select className={input} value={draft.spiceLevel}
                onChange={(e) => set({ spiceLevel: parseInt(e.target.value, 10) })}>
                <option value={0}>Not spicy</option>
                <option value={1}>Mild</option>
                <option value={2}>Hot</option>
                <option value={3}>Very hot</option>
              </select>
            </div>
            <div>
              <span className={label}>SERVES</span>
              <input className={input} inputMode="numeric" placeholder="1"
                value={draft.serves ?? ""}
                onChange={(e) => set({ serves: e.target.value ? parseInt(e.target.value, 10) : null })} />
            </div>
            <div>
              <span className={label}>RESTOCK EACH MORNING TO</span>
              <input className={input} inputMode="numeric" placeholder="not counted"
                value={draft.dailyCapacity ?? ""}
                onChange={(e) => set({ dailyCapacity: e.target.value ? parseInt(e.target.value, 10) : null })} />
            </div>
          </div>

          <div>
            <span className={label}>SERVED ON</span>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {DAY_LABEL.map((d, i) => {
                const on = draft.availableDays == null || draft.availableDays.includes(i);
                return (
                  <button
                    key={d}
                    onClick={() => {
                      const current = draft.availableDays ?? [0, 1, 2, 3, 4, 5, 6];
                      const next = toggle(current, i).sort();
                      // Every day selected means "no restriction" — stored as
                      // null so the query does not carry a pointless array.
                      set({ availableDays: next.length === 7 ? null : next });
                    }}
                    className={on ? chipOn : chipOff}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
            <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
              <div>
                <span className={label}>SERVED FROM</span>
                <input className={input} type="time" value={draft.availableFrom}
                  onChange={(e) => set({ availableFrom: e.target.value })} />
              </div>
              <div>
                <span className={label}>UNTIL</span>
                <input className={input} type="time" value={draft.availableUntil}
                  onChange={(e) => set({ availableUntil: e.target.value })} />
              </div>
            </div>
            <p className="mt-1.5 font-dm text-[11px] text-muted">
              Leave both blank to serve it all day. The database refuses an order outside this window —
              not just the button.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <span className={label}>PREP FROM (MIN)</span>
              <input className={input} inputMode="numeric" placeholder="kitchen default"
                value={draft.prepMinutesMin ?? ""}
                onChange={(e) => set({ prepMinutesMin: e.target.value ? parseInt(e.target.value, 10) : null })} />
            </div>
            <div>
              <span className={label}>PREP TO (MIN)</span>
              <input className={input} inputMode="numeric" placeholder="kitchen default"
                value={draft.prepMinutesMax ?? ""}
                onChange={(e) => set({ prepMinutesMax: e.target.value ? parseInt(e.target.value, 10) : null })} />
            </div>
            <div>
              <span className={label}>ON THE MENU</span>
              <select className={input} value={draft.status} onChange={(e) => set({ status: e.target.value })}>
                <option value="active">Published</option>
                <option value="draft">Draft (hidden)</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          <div>
            <span className={label}>ALLERGENS (OPTIONAL)</span>
            <input className={input} value={draft.allergens} onChange={(e) => set({ allergens: e.target.value })}
              placeholder="Contains shellfish and peanuts" />
          </div>

          <label className="flex cursor-pointer items-center gap-2.5 font-dm text-sm text-offwhite">
            <input type="checkbox" checked={draft.isSignature}
              onChange={(e) => set({ isSignature: e.target.checked })}
              className="h-4 w-4 accent-[#F5C842]" />
            Signature dish — show it in the &ldquo;Signature dishes&rdquo; row on the Food page
          </label>
        </div>

        <div className="mt-6 flex gap-2">
          <button onClick={onClose}
            className="flex-1 rounded-xl border border-white/15 px-4 py-3 font-dm text-sm text-muted hover:text-offwhite">
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving || !draft.name.trim()}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-yellow px-4 py-3 font-dm text-sm font-bold text-dark disabled:opacity-50"
          >
            {saving && <Loader2 size={15} className="animate-spin" />}
            {draft.productId ? "Save dish" : "Add to the menu"}
          </button>
        </div>
      </div>
    </div>
  );
}
