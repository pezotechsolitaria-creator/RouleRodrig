"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowDown, ArrowUp, Car, Carrot, Eye, EyeOff, Fish, Flame, Gift, Hammer, Home,
  Loader2, Lock, Package, Palette, PartyPopper, Plus, RefreshCw, Shirt, Sparkles, Utensils, Wheat,
  Wrench, type LucideIcon,
} from "lucide-react";
import {
  CATEGORY_ICON_KEYS,
  byRailOrder,
  categorySlugFromName,
  categorySlugInput,
  categorySlugProblem,
  type CategoryRow,
} from "@/lib/admin/marketplace-categories";

// ── THE SHELVES DESK (architecture review 2026-09-30, item 5) ───────────────
//
// List, create, rename, reorder and switch on/off the marketplace categories.
// The address is shown but never editable — it is the indexed /shop/c/<slug>
// page — and there is no delete: switching a shelf off hides it and keeps
// every product filed on it, which a delete would silently unfile. The route
// enforces all of this again; this screen only makes it legible.
//
// ONE LIST, IN RAIL ORDER. The first version drew shelves nested under an
// "Inside" picker, but the /shop rail is one flat row (marketplace_home, m96b)
// and reads no parent — so after a nested reorder the shop showed an order this
// screen never did (item 5, follow-up). Now top to bottom here IS left to right
// there, and the arrows move a shelf through that same list.

type Row = CategoryRow & { productCount: number };

// The same pictures components/shop/CategoryStrip.tsx draws for each key, so
// the owner picks what the rail will show. A test renders the strip with every
// key in CATEGORY_ICON_KEYS to prove none falls back to the generic box.
const PREVIEW: Record<string, LucideIcon> = {
  package: Package, fish: Fish, carrot: Carrot, honey: Sparkles, flame: Flame, utensils: Utensils,
  palette: Palette, gift: Gift, wheat: Wheat, home: Home, shirt: Shirt, hammer: Hammer,
  wrench: Wrench, car: Car, sparkles: PartyPopper,
};

const field =
  "min-h-11 rounded-lg border border-dark-border bg-dark px-3 font-dm text-sm text-offwhite focus:border-yellow focus:outline-none";
const chip =
  "inline-flex min-h-11 items-center gap-1.5 rounded-full border border-white/15 px-3 font-dm text-xs text-muted hover:border-yellow/50 hover:text-yellow disabled:opacity-40";

async function send(method: "POST" | "PATCH", body: Record<string, unknown>): Promise<boolean> {
  try {
    const r = await fetch("/api/admin/categories", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const b = (await r.json().catch(() => ({}))) as { error?: string };
    if (!r.ok) {
      toast.error(
        r.status === 401
          ? "Your admin session has expired — sign in again. Nothing was saved."
          : b.error || `That was not saved (error ${r.status}).`,
      );
      return false;
    }
    return true;
  } catch {
    toast.error("Could not reach the server — you appear to be offline. Nothing was saved.");
    return false;
  }
}

const EMPTY_DRAFT = { name: "", slug: "", slugTouched: false, icon: "package", active: true };

/**
 * `initialRows` lets a caller that already has the list (a server render, or a
 * test rendering the real desk) skip the loading state; the desk still reloads
 * from the route on mount, so it never shows stale rows for long.
 */
export default function CategoriesDesk({ initialRows }: { initialRows?: Row[] }) {
  const [rows, setRows] = useState<Row[] | null>(initialRows ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>(() =>
    Object.fromEntries((initialRows ?? []).map((c) => [c.id, c.name])),
  );
  const [draft, setDraft] = useState(EMPTY_DRAFT);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const r = await fetch("/api/admin/categories");
      const b = (await r.json().catch(() => ({}))) as { categories?: Row[]; error?: string };
      if (!r.ok || !b.categories) throw new Error(b.error || `Could not load the categories (error ${r.status}).`);
      setRows(b.categories);
      setNames(Object.fromEntries(b.categories.map((c) => [c.id, c.name])));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load the categories.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(id: string, body: Record<string, unknown>, key: string, done?: string): Promise<boolean> {
    setBusy(id + key);
    const ok = await send("PATCH", { id, ...body });
    setBusy(null);
    if (ok) {
      if (done) toast.success(done);
      await load();
    }
    return ok;
  }

  async function rename(c: Row) {
    const name = (names[c.id] ?? "").trim();
    if (!name || name === c.name) {
      setNames((n) => ({ ...n, [c.id]: c.name }));
      return;
    }
    // A refused rename must not leave the refused name sitting in the box,
    // looking saved.
    if (!(await patch(c.id, { name }, "name", "Renamed. The address stays the same."))) {
      setNames((n) => ({ ...n, [c.id]: c.name }));
    }
  }

  async function toggleActive(c: Row) {
    if (
      c.is_active &&
      c.productCount > 0 &&
      !window.confirm(
        `${c.productCount} ${c.productCount === 1 ? "product is" : "products are"} filed on ${c.name}. ` +
          `Switching it off hides the shelf and /shop/c/${c.slug}; the products stay filed on it and come ` +
          "back when you switch it on. Switch it off?",
      )
    ) {
      return;
    }
    await patch(c.id, { isActive: !c.is_active }, "active", c.is_active ? "Switched off." : "Switched on.");
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!rows) return;
    const slug = draft.slugTouched ? draft.slug : categorySlugFromName(draft.name);
    const problem = categorySlugProblem(slug, rows);
    if (!draft.name.trim()) return void toast.error("Give the shelf a name.");
    if (problem) return void toast.error(problem);
    setBusy("new");
    const ok = await send("POST", {
      name: draft.name.trim(),
      slug,
      icon: draft.icon,
      isActive: draft.active,
    });
    setBusy(null);
    if (ok) {
      toast.success(`Added. Its page is /shop/c/${slug}.`);
      setDraft(EMPTY_DRAFT);
      await load();
    }
  }

  if (loadError) {
    return (
      <div role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5">
        <p className="flex items-center gap-2 font-dm text-sm text-red-300">
          <AlertTriangle size={15} /> {loadError}
        </p>
        <button type="button" onClick={() => void load()} className={`mt-3 ${chip}`}>
          <RefreshCw size={12} /> Try again
        </button>
      </div>
    );
  }

  if (!rows) {
    return (
      <p className="flex items-center gap-2 font-dm text-sm text-muted">
        <Loader2 size={15} className="animate-spin" /> Loading categories…
      </p>
    );
  }

  // The rail's own sort, parent ignored as the rail ignores it — the same list
  // reorderWrites() moves a shelf through.
  const ordered = [...rows].sort(byRailOrder);

  const newSlug = draft.slugTouched ? draft.slug : categorySlugFromName(draft.name);
  const newSlugProblem = draft.name.trim() ? categorySlugProblem(newSlug, rows) : null;

  return (
    <div className="space-y-6">
      <p className="font-dm text-xs text-muted">
        Top to bottom here is left to right on the /shop rail. Switched-off shelves, and shelves with
        nothing filed on them yet, are left out there.
      </p>
      <ul className="space-y-3">
        {ordered.map((c, index) => {
          const Icon = PREVIEW[c.icon ?? ""] ?? Package;
          return (
            <li
              key={c.id}
              className={`rounded-2xl border p-4 ${
                c.is_active ? "border-white/10 bg-dark-card" : "border-white/5 bg-dark-card/40"
              }`}
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 text-offwhite/80">
                  <Icon size={18} />
                </span>
                <input
                  value={names[c.id] ?? c.name}
                  onChange={(e) => setNames((n) => ({ ...n, [c.id]: e.target.value }))}
                  onBlur={() => void rename(c)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  maxLength={80}
                  aria-label={`Name of ${c.name}`}
                  className={`${field} min-w-[180px] flex-1`}
                />
                <button
                  type="button"
                  onClick={() => void toggleActive(c)}
                  disabled={busy === c.id + "active"}
                  aria-label={c.is_active ? `Switch ${c.name} off` : `Switch ${c.name} on`}
                  className={chip}
                >
                  {busy === c.id + "active" ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : c.is_active ? (
                    <EyeOff size={12} />
                  ) : (
                    <Eye size={12} />
                  )}
                  {c.is_active ? "Switch off" : "Switch on"}
                </button>
                <button
                  type="button"
                  onClick={() => void patch(c.id, { move: "up" }, "move")}
                  disabled={index === 0 || busy === c.id + "move"}
                  aria-label={`Move ${c.name} up`}
                  className={`${chip} w-11 justify-center px-0`}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => void patch(c.id, { move: "down" }, "move")}
                  disabled={index === ordered.length - 1 || busy === c.id + "move"}
                  aria-label={`Move ${c.name} down`}
                  className={`${chip} w-11 justify-center px-0`}
                >
                  <ArrowDown size={14} />
                </button>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 font-dm text-xs text-muted">
                <span className="inline-flex items-center gap-1.5" title="Fixed when the shelf was created.">
                  <Lock size={11} /> /shop/c/{c.slug}
                </span>
                <span>
                  {c.productCount} {c.productCount === 1 ? "product" : "products"}
                  {!c.is_active && " · switched off"}
                </span>
                <label className="inline-flex items-center gap-2">
                  Icon
                  <select
                    value={c.icon ?? ""}
                    onChange={(e) => void patch(c.id, { icon: e.target.value || null }, "icon", "Icon changed.")}
                    className={field}
                  >
                    {!c.icon && <option value="">none</option>}
                    {c.icon && !(CATEGORY_ICON_KEYS as readonly string[]).includes(c.icon) && (
                      <option value={c.icon}>{c.icon} (not drawn — shows a box)</option>
                    )}
                    {CATEGORY_ICON_KEYS.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </li>
          );
        })}
      </ul>

      <form onSubmit={create} className="space-y-3 rounded-2xl border border-white/10 bg-dark-card p-4">
        <p className="font-syne text-sm font-bold text-offwhite">Add a shelf</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block font-dm text-xs text-muted">
            Name
            <input
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              maxLength={80}
              placeholder="e.g. Beach & snorkel"
              className={`${field} mt-1 w-full`}
            />
          </label>
          <label className="block font-dm text-xs text-muted">
            Web address — fixed once added
            <input
              value={newSlug}
              onChange={(e) => setDraft((d) => ({ ...d, slug: categorySlugInput(e.target.value), slugTouched: true }))}
              maxLength={60}
              placeholder="made from the name"
              className={`${field} mt-1 w-full`}
            />
          </label>
          <label className="block font-dm text-xs text-muted">
            Icon
            <select
              value={draft.icon}
              onChange={(e) => setDraft((d) => ({ ...d, icon: e.target.value }))}
              className={`${field} mt-1 w-full`}
            >
              {CATEGORY_ICON_KEYS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex min-h-11 items-center gap-2 font-dm text-xs text-muted">
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(e) => setDraft((d) => ({ ...d, active: e.target.checked }))}
            className="h-4 w-4 accent-yellow"
          />
          Switched on (it still only appears on /shop once something is filed on it)
        </label>
        {draft.name.trim() && (
          <p className={`font-dm text-xs ${newSlugProblem ? "text-amber-300" : "text-muted"}`}>
            {newSlugProblem ?? `Its page will be /shop/c/${newSlug}.`}
          </p>
        )}
        <button
          type="submit"
          disabled={busy === "new" || !draft.name.trim() || Boolean(newSlugProblem)}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-yellow px-5 font-syne text-sm font-bold text-dark hover:bg-yellow-dark disabled:opacity-40"
        >
          {busy === "new" ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add shelf
        </button>
      </form>
    </div>
  );
}
