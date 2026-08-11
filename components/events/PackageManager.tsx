"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Pencil, Eye, EyeOff, ImagePlus, X, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { centsToDecimalString, toCents } from "@/lib/money";
import type { OrganizerPackage } from "@/lib/events/organizer";

// The organiser's package editor.
//
// ── ONE RULE SHAPES THIS WHOLE FORM ─────────────────────────────────────────
// CAPACITY IS TOTAL, NOT REMAINING. An organiser typing "400" means 400 seats
// in the room, not 400 still for sale. The server derives what is already sold
// and refuses to go below it, so this form says so out loud rather than letting
// somebody discover it through an error.
//
// Money is typed as a decimal and converted with toCents() — never
// `parseFloat(x) * 100`, which misrounds (9.995 * 100 === 999.4999999999999).

type Draft = {
  variantId: string | null;
  name: string;
  subtitle: string;
  description: string;
  inclusions: string[];
  imageUrl: string;
  price: string;
  capacity: string;
  minPerOrder: string;
  maxPerOrder: string;
  displayOrder: string;
  isActive: boolean;
};

const EMPTY: Draft = {
  variantId: null, name: "", subtitle: "", description: "", inclusions: [],
  imageUrl: "", price: "", capacity: "", minPerOrder: "1", maxPerOrder: "",
  displayOrder: "0", isActive: true,
};

function toDraft(p: OrganizerPackage): Draft {
  return {
    variantId: p.variantId,
    name: p.name ?? "",
    subtitle: p.subtitle ?? "",
    description: p.description ?? "",
    inclusions: p.inclusions ?? [],
    imageUrl: p.imageUrl ?? "",
    price: centsToDecimalString(p.price),
    // What the organiser sees is TOTAL: what is left plus what is already gone.
    capacity: String(p.remaining + p.sold + p.awaiting),
    minPerOrder: String(p.minPerOrder ?? 1),
    maxPerOrder: p.maxPerOrder != null ? String(p.maxPerOrder) : "",
    displayOrder: "0",
    isActive: p.isActive,
  };
}

export default function PackageManager({
  storeId,
  packages,
}: {
  storeId: string;
  packages: OrganizerPackage[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(p: OrganizerPackage) {
    setBusy(`v-${p.variantId}`);
    try {
      const res = await fetch("/api/organizer/packages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, variantId: p.variantId, isActive: !p.isActive }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "That didn't work.");
      toast.success(p.isActive ? "Package hidden" : "Package visible");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bebas text-[11px] tracking-[0.3em] text-yellow">TICKET PACKAGES</h2>
        <Button size="sm" onClick={() => setDraft({ ...EMPTY })}>
          <Plus size={14} className="mr-1" /> Add package
        </Button>
      </div>

      {packages.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-white/10 bg-dark-card p-8 text-center">
          <Ticket className="mx-auto text-muted" size={22} />
          <p className="mt-3 font-syne text-base font-bold text-offwhite">No packages yet</p>
          <p className="mx-auto mt-1 max-w-sm font-dm text-sm text-muted">
            Nobody can buy a ticket until this event has at least one. Create Standard first, then add
            VIP or Early Bird if you want tiers.
          </p>
          <Button className="mt-4" onClick={() => setDraft({ ...EMPTY })}>
            <Plus size={15} className="mr-1.5" /> Create the first package
          </Button>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {packages.map((p) => (
            <div key={p.variantId} className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-dark-card p-3">
              <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-xl bg-white/[0.04]">
                {p.imageUrl ? (
                  <Image src={p.imageUrl} alt="" fill sizes="96px" className="object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center"><ImagePlus size={16} className="text-white/20" /></div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-syne text-base font-bold text-offwhite">
                  {p.name} {!p.isActive && <span className="font-dm text-xs font-normal text-muted">(hidden)</span>}
                </p>
                <p className="font-dm text-sm text-yellow">Rs {centsToDecimalString(p.price)}</p>
                <p className="font-dm text-xs text-muted">
                  {p.sold} sold · {p.awaiting} awaiting · {p.remaining} left
                  {" · "}capacity {p.remaining + p.sold + p.awaiting}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setDraft(toDraft(p))}>
                  <Pencil size={13} className="mr-1" /> Edit
                </Button>
                <Button size="sm" variant="outline" disabled={busy === `v-${p.variantId}`} onClick={() => void toggle(p)}>
                  {busy === `v-${p.variantId}` ? <Loader2 size={13} className="animate-spin" />
                    : p.isActive ? <EyeOff size={13} /> : <Eye size={13} />}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {draft && (
        <PackageForm
          storeId={storeId}
          draft={draft}
          setDraft={setDraft}
          onDone={() => { setDraft(null); router.refresh(); }}
        />
      )}
    </>
  );
}

function PackageForm({
  storeId, draft, setDraft, onDone,
}: {
  storeId: string;
  draft: Draft;
  setDraft: (d: Draft | null) => void;
  onDone: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inc, setInc] = useState("");

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft({ ...draft, [k]: v });

  const priceCents = toCents(draft.price || "0");
  const capacity = Number.parseInt(draft.capacity || "", 10);
  const nameOk = draft.name.trim().length > 0;
  const priceOk = priceCents !== null;
  const capOk = Number.isFinite(capacity) && capacity >= 0;
  const canSave = nameOk && priceOk && capOk && !saving && !uploading;

  const blocked = !nameOk ? "Give the package a name."
    : !priceOk ? "That price isn't a valid amount."
    : !capOk ? "Enter how many tickets exist for this package."
    : null;

  async function uploadImage(file: File) {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("storeId", storeId);
      fd.set("file", file);
      const res = await fetch("/api/organizer/packages", { method: "PUT", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not upload that image.");
      set("imageUrl", body.url as string);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not upload that image.");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!canSave || priceCents === null) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/organizer/packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId,
          variantId: draft.variantId,
          name: draft.name.trim(),
          subtitle: draft.subtitle.trim() || undefined,
          description: draft.description.trim() || undefined,
          inclusions: draft.inclusions,
          imageUrl: draft.imageUrl || undefined,
          price: priceCents,
          capacity,
          minPerOrder: Number.parseInt(draft.minPerOrder || "1", 10) || 1,
          maxPerOrder: draft.maxPerOrder ? Number.parseInt(draft.maxPerOrder, 10) : null,
          displayOrder: Number.parseInt(draft.displayOrder || "0", 10) || 0,
          isActive: draft.isActive,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not save that package.");
      toast.success(draft.variantId ? "Package updated" : "Package created");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that package.");
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
      role="dialog" aria-modal="true" aria-label={draft.variantId ? "Edit package" : "New package"}
      onClick={(e) => { if (e.target === e.currentTarget) setDraft(null); }}
    >
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-dark p-5 sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-syne text-lg font-extrabold text-offwhite">
            {draft.variantId ? "Edit package" : "New package"}
          </h2>
          <button onClick={() => setDraft(null)} aria-label="Close"
            className="flex h-11 w-11 items-center justify-center rounded-full text-muted hover:text-yellow">
            <X size={18} />
          </button>
        </div>

        {/* Image */}
        <div className="mt-4">
          <label className="mb-1.5 block font-dm text-xs text-muted">Package image</label>
          <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
            {draft.imageUrl ? (
              <Image src={draft.imageUrl} alt="" fill sizes="32rem" className="object-cover" />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-1 text-muted">
                <ImagePlus size={22} />
                <span className="font-dm text-xs">JPG, PNG or WebP · up to 4 MB</span>
              </div>
            )}
            {uploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <Loader2 size={20} className="animate-spin text-yellow" />
              </div>
            )}
          </div>
          <input
            type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadImage(f); }}
            className="mt-2 block w-full font-dm text-xs text-muted file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-4 file:py-2 file:font-dm file:text-xs file:text-offwhite hover:file:bg-white/15"
          />
          <p className="mt-1 font-dm text-[11px] text-muted">
            Give each tier its own picture — VIP should not look like Standard.
          </p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Name" required>
            <input value={draft.name} onChange={(e) => set("name", e.target.value)} maxLength={60}
              placeholder="VIP" className={inputCls} />
          </Field>
          <Field label="Price (Rs)" required>
            <input value={draft.price} onChange={(e) => set("price", e.target.value)} inputMode="decimal"
              placeholder="600.00" className={inputCls} />
          </Field>
          <Field label="Short line" hint="Shown on the card">
            <input value={draft.subtitle} onChange={(e) => set("subtitle", e.target.value)} maxLength={120}
              placeholder="Priority entrance" className={inputCls} />
          </Field>
          <Field label="Total capacity" required hint="Seats in the room, not seats left">
            <input value={draft.capacity} onChange={(e) => set("capacity", e.target.value)} inputMode="numeric"
              placeholder="80" className={inputCls} />
          </Field>
          <Field label="Min per order">
            <input value={draft.minPerOrder} onChange={(e) => set("minPerOrder", e.target.value)} inputMode="numeric"
              className={inputCls} />
          </Field>
          <Field label="Max per order" hint="Blank = no limit">
            <input value={draft.maxPerOrder} onChange={(e) => set("maxPerOrder", e.target.value)} inputMode="numeric"
              placeholder="4" className={inputCls} />
          </Field>
        </div>

        <div className="mt-3">
          <Field label="Description" hint="Shown when they open the package">
            <Textarea value={draft.description} onChange={(e) => set("description", e.target.value)}
              rows={3} maxLength={2000} placeholder="The best view in the house…" />
          </Field>
        </div>

        {/* Inclusions */}
        <div className="mt-3">
          <label className="mb-1.5 block font-dm text-xs text-muted">
            What&apos;s included <span className="text-muted/70">— one per line, this is what sells the tier</span>
          </label>
          {draft.inclusions.length > 0 && (
            <ul className="mb-2 space-y-1">
              {draft.inclusions.map((item, i) => (
                <li key={i} className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-3 py-1.5">
                  <span className="min-w-0 font-dm text-sm text-offwhite">{item}</span>
                  <button onClick={() => set("inclusions", draft.inclusions.filter((_, j) => j !== i))}
                    aria-label={`Remove ${item}`}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:text-red-400">
                    <X size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <input
              value={inc} onChange={(e) => setInc(e.target.value)} maxLength={120}
              onKeyDown={(e) => {
                if (e.key === "Enter" && inc.trim()) {
                  e.preventDefault();
                  if (draft.inclusions.length < 12) set("inclusions", [...draft.inclusions, inc.trim()]);
                  setInc("");
                }
              }}
              placeholder="Complimentary drink" className={inputCls}
            />
            <Button type="button" variant="outline" disabled={!inc.trim() || draft.inclusions.length >= 12}
              onClick={() => { set("inclusions", [...draft.inclusions, inc.trim()]); setInc(""); }}>
              Add
            </Button>
          </div>
        </div>

        <label className="mt-4 flex cursor-pointer items-center gap-2.5 font-dm text-sm text-offwhite">
          <input type="checkbox" checked={draft.isActive} onChange={(e) => set("isActive", e.target.checked)}
            className="accent-yellow" />
          Visible to customers
        </label>

        {error && <p role="alert" className="mt-3 font-dm text-sm text-red-400">{error}</p>}
        {blocked && !error && <p role="status" className="mt-3 font-dm text-xs text-yellow/90">{blocked}</p>}

        <Button size="xl" className="mt-4 w-full" disabled={!canSave} onClick={() => void save()}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : draft.variantId ? "Save changes" : "Create package"}
        </Button>
        {draft.variantId && (
          <p className="mt-2 text-center font-dm text-[11px] text-muted">
            Changing the price never changes what somebody already bought.
          </p>
        )}
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-dark-border bg-dark px-4 py-3 font-dm text-sm text-offwhite placeholder:text-muted/50 focus:border-yellow focus:outline-none";

function Field({ label, hint, required, children }: {
  label: string; hint?: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block font-dm text-xs text-muted">
        {label} {required && <span className="text-yellow">*</span>}
        {hint && <span className="text-muted/70"> — {hint}</span>}
      </label>
      {children}
    </div>
  );
}
