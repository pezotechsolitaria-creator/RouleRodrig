"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Plus, Pencil, Phone, MapPin, Clock, RotateCcw, EyeOff, Eye, Trash2, Check, X } from "lucide-react";
import { foodWrite, type AdminKitchen } from "./types";
import RemoveKitchenPanel from "./RemoveKitchenPanel";

// Kitchens and the people who cook in them.
//
// The cooker's name, number and notes are stored in food_kitchen_ops, a table
// with RLS on and NO policy — service-role only. That is not belt-and-braces:
// RLS filters rows and never columns, and a table grant makes column REVOKEs a
// no-op on this database, so a phone number in a publicly-readable table would
// be one `select *` from the anon key away. Splitting the table is the only
// thing that actually protects it, and this panel is the only place it appears.

const label = "block font-bebas text-[11px] tracking-[0.2em] text-muted";
const input =
  "mt-1 w-full rounded-xl border border-white/10 bg-dark px-3 py-2.5 font-dm text-sm text-offwhite placeholder:text-muted focus:border-yellow/50 focus:outline-none";

type Draft = {
  storeId: string | null;
  name: string;
  tagline: string;
  address: string;
  phone: string;
  whatsapp: string;
  lat: string;
  lng: string;
  prepMinutesMin: number;
  prepMinutesMax: number;
  pickupHint: string;
  cookerName: string;
  cookerPhone: string;
  cookerNotes: string;
  status: string;
  offersRrDelivery: boolean;
};

const emptyDraft = (): Draft => ({
  storeId: null,
  name: "",
  tagline: "",
  address: "",
  phone: "",
  whatsapp: "",
  lat: "",
  lng: "",
  prepMinutesMin: 15,
  prepMinutesMax: 30,
  pickupHint: "",
  cookerName: "",
  cookerPhone: "",
  cookerNotes: "",
  status: "active",
  offersRrDelivery: true,
});

export default function KitchensPanel({
  kitchens, reload,
}: {
  kitchens: AdminKitchen[];
  reload: () => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Which kitchen's remove panel is open. Only one at a time — this is not a
  // decision to make in two places at once.
  const [removing, setRemoving] = useState<string | null>(null);

  const restock = useCallback(
    async (k: AdminKitchen) => {
      setBusy(k.storeId);
      const res = await foodWrite("/api/admin/food/actions", {
        method: "POST",
        body: JSON.stringify({ action: "restock_day", storeId: k.storeId }),
      });
      setBusy(null);
      if (!res.ok) { toast.error(res.error); return; }
      const n = (res.data as { restocked?: number } | null)?.restocked ?? 0;
      toast.success(n === 0 ? "Everything was already at capacity." : `Restocked ${n} dish${n === 1 ? "" : "es"}.`);
      reload();
    },
    [reload],
  );

  const setStatus = useCallback(
    async (k: AdminKitchen, status: string) => {
      setBusy(k.storeId);
      const res = await foodWrite("/api/admin/food/kitchens", {
        method: "PATCH",
        body: JSON.stringify({ storeId: k.storeId, status }),
      });
      setBusy(null);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success(status === "active" ? `${k.name} is visible to customers again.` : `${k.name} is hidden.`);
      reload();
    },
    [reload],
  );

  // Removing a kitchen now opens a panel rather than a window.prompt. The prompt
  // asked for the name while telling the operator almost nothing — it could not
  // say how many orders were about to go, or what they were worth, because it
  // had not asked. RemoveKitchenPanel asks first, then offers both options and
  // describes each one. See lib/admin/kitchen-delete.ts for the wording.

  const save = useCallback(async () => {
    if (!draft) return;
    const payload = {
      ...(draft.storeId ? { storeId: draft.storeId } : {}),
      name: draft.name.trim(),
      tagline: draft.tagline,
      address: draft.address,
      phone: draft.phone,
      whatsapp: draft.whatsapp,
      lat: draft.lat.trim() ? Number(draft.lat) : null,
      lng: draft.lng.trim() ? Number(draft.lng) : null,
      prepMinutesMin: draft.prepMinutesMin,
      prepMinutesMax: draft.prepMinutesMax,
      pickupHint: draft.pickupHint,
      cookerName: draft.cookerName,
      cookerPhone: draft.cookerPhone,
      cookerNotes: draft.cookerNotes,
      status: draft.status as "draft" | "active" | "paused",
      offersRrDelivery: draft.offersRrDelivery,
    };
    setBusy("save");
    const res = await foodWrite("/api/admin/food/kitchens", {
      method: draft.storeId ? "PATCH" : "POST",
      body: JSON.stringify(payload),
    });
    setBusy(null);
    if (!res.ok) { toast.error(res.error); return; }
    toast.success(draft.storeId ? "Kitchen saved." : "Kitchen created.");
    setDraft(null);
    reload();
  }, [draft, reload]);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="font-dm text-sm text-muted">
          {kitchens.length === 0
            ? "No kitchens yet."
            : `${kitchens.length} kitchen${kitchens.length === 1 ? "" : "s"}`}
        </p>
        <button
          onClick={() => setDraft(emptyDraft())}
          className="inline-flex items-center gap-1.5 rounded-xl bg-yellow px-4 py-2.5 font-dm text-sm font-bold text-dark hover:opacity-90"
        >
          <Plus size={15} /> Add a kitchen
        </button>
      </div>

      {kitchens.length === 0 && (
        <div className="mt-6 rounded-2xl border border-yellow/25 bg-yellow/5 px-6 py-10 text-center">
          <p className="font-syne text-lg font-bold text-offwhite">Start with one cooker</p>
          <p className="mx-auto mt-2 max-w-md font-dm text-sm text-muted">
            A kitchen is a person who cooks and a place to collect from. They never sign in, never see a
            dashboard and never install anything — you manage their menu here and ring them when an order
            lands.
          </p>
        </div>
      )}

      <div className="mt-4 space-y-2.5">
        {kitchens.map((k) => (
          <article key={k.storeId} className="rounded-2xl border border-white/10 bg-dark-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-syne text-base font-extrabold text-offwhite">
                  {k.name}
                  <span
                    className={`ml-2 rounded-full px-2 py-0.5 font-dm text-[10px] font-semibold ${
                      k.status === "active"
                        ? "bg-green-500/15 text-green-300"
                        : "bg-white/10 text-muted"
                    }`}
                  >
                    {k.status === "active" ? "Live" : k.status}
                  </span>
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-dm text-xs text-muted">
                  <span className="inline-flex items-center gap-1">
                    <Clock size={12} /> {k.prepMinutesMin}–{k.prepMinutesMax} min
                  </span>
                  <span>{k.liveDishCount} of {k.dishCount} dishes live</span>
                  {k.address && (
                    <span className="inline-flex items-center gap-1"><MapPin size={12} /> {k.address}</span>
                  )}
                </p>
                {/* ── Can a customer actually order from this kitchen? ────────
                    Four facts decide it, every one of them already knowable and
                    none of them ever shown together. That is how four kitchens
                    came to be built, stocked with dishes, and completely
                    invisible: each screen showed its own piece and nobody had
                    the whole sentence.

                    Only shown while something is missing. A kitchen that is
                    trading does not need a checklist telling it so. */}
                {(() => {
                  const steps = [
                    { ok: k.liveDishCount > 0, label: "Dishes published" },
                    { ok: k.hasPayment !== false, label: "A way to pay" },
                    { ok: k.hasHours !== false, label: "Opening hours" },
                    { ok: k.status === "active", label: "Kitchen set live" },
                    // THE FIFTH FACT, added because its absence cost a day of
                    // trading. store_is_visible() also requires the MERCHANT to
                    // be approved, and archiving one (from /admin/subscriptions)
                    // suspends it. Nothing on this screen said so, so setting a
                    // kitchen live here succeeded, changed nothing, and could be
                    // repeated forever — the audit log shows four attempts in
                    // six minutes while /food served the concierge form.
                    { ok: !k.merchantArchived, label: "Owner account active" },
                  ];
                  const missing = steps.filter((s) => !s.ok);
                  if (missing.length === 0) return null;
                  return (
                    <div className="mt-2.5 rounded-xl border border-orange-400/40 bg-orange-400/[0.07] p-3">
                      <p className="font-syne text-sm font-bold text-orange-200">
                        Customers cannot order from this kitchen yet
                      </p>
                      <ul className="mt-1.5 space-y-1">
                        {steps.map((s) => (
                          <li
                            key={s.label}
                            className={`flex items-center gap-1.5 font-dm text-xs ${
                              s.ok ? "text-muted" : "text-orange-200"
                            }`}
                          >
                            {s.ok ? <Check size={12} /> : <X size={12} />} {s.label}
                          </li>
                        ))}
                      </ul>
                      {/* Says where to go, because this one cannot be fixed
                          from this screen — and a checklist item nobody can act
                          on is how the last four attempts were wasted. */}
                      {k.merchantArchived && (
                        <p className="mt-2 font-dm text-xs leading-relaxed text-orange-200">
                          The owner account for this kitchen is archived, so it stays hidden even when
                          set live. Restore it under{" "}
                          <Link href="/admin/subscriptions" className="font-bold underline">
                            Merchants
                          </Link>{" "}
                          first.
                        </p>
                      )}

                      {/* The last step is one tap, right here. It was the step
                          that got missed on every kitchen, and it lived on a
                          different screen from the three before it. Never shown
                          while the owner account is archived — the tap would
                          report success and change nothing. */}
                      {k.status !== "active" && missing.length === 1 && !k.merchantArchived && (
                        <button
                          onClick={() => void setStatus(k, "active")}
                          disabled={busy !== null}
                          className="mt-2.5 w-full rounded-xl bg-yellow py-2 font-syne text-sm font-bold text-dark disabled:opacity-50"
                        >
                          Everything else is ready — set {k.name} live
                        </button>
                      )}
                    </div>
                  );
                })()}

                {(k.cookerName || k.cookerPhone) && (
                  <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-2 py-1 font-dm text-xs text-offwhite">
                    <span className="font-bebas text-[10px] tracking-widest text-yellow">COOKER</span>
                    {k.cookerName}
                    {k.cookerPhone && (
                      <a href={`tel:${k.cookerPhone}`} className="inline-flex items-center gap-1 text-yellow hover:underline">
                        <Phone size={11} /> {k.cookerPhone}
                      </a>
                    )}
                  </p>
                )}
                {k.cookerNotes && (
                  <p className="mt-1 font-dm text-xs text-muted">{k.cookerNotes}</p>
                )}
              </div>

              <div className="flex shrink-0 flex-wrap gap-1.5">
                <button
                  onClick={() => void restock(k)}
                  disabled={busy === k.storeId}
                  title="Restock every dish to its daily count"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-2 font-dm text-[11px] text-muted hover:text-yellow disabled:opacity-50"
                >
                  <RotateCcw size={13} /> Restock
                </button>
                <button
                  onClick={() => void setStatus(k, k.status === "active" ? "paused" : "active")}
                  disabled={busy === k.storeId}
                  title={k.status === "active" ? "Hide this kitchen and all its dishes" : "Show it again"}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-2 font-dm text-[11px] text-muted hover:text-offwhite disabled:opacity-50"
                >
                  {k.status === "active" ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
                <button
                  onClick={() =>
                    setDraft({
                      storeId: k.storeId,
                      name: k.name,
                      tagline: k.tagline ?? "",
                      address: k.address ?? "",
                      phone: k.phone ?? "",
                      whatsapp: k.whatsapp ?? "",
                      lat: k.lat?.toString() ?? "",
                      lng: k.lng?.toString() ?? "",
                      prepMinutesMin: k.prepMinutesMin,
                      prepMinutesMax: k.prepMinutesMax,
                      pickupHint: k.pickupHint ?? "",
                      cookerName: k.cookerName ?? "",
                      cookerPhone: k.cookerPhone ?? "",
                      cookerNotes: k.cookerNotes ?? "",
                      status: k.status,
                      // The kitchen's actual setting, not a hardcoded true.
                      offersRrDelivery: k.offersRrDelivery,
                    })
                  }
                  className="rounded-lg border border-white/15 px-2.5 py-2 text-muted hover:text-offwhite"
                  aria-label={`Edit ${k.name}`}
                >
                  <Pencil size={13} />
                </button>
                <button
                  type="button"
                  disabled={busy === k.storeId}
                  onClick={() => setRemoving(removing === k.storeId ? null : k.storeId)}
                  className="rounded-lg border border-red-500/25 px-2.5 py-2 text-red-300 hover:border-red-500 hover:bg-red-500/10 disabled:opacity-50"
                  aria-label={`Remove ${k.name}`}
                  aria-expanded={removing === k.storeId}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
            {k.pickupHint && (
              <p className="mt-2 rounded-xl bg-white/5 px-3 py-2 font-dm text-xs text-muted">
                Collection: {k.pickupHint}
              </p>
            )}
            {removing === k.storeId && (
              <RemoveKitchenPanel
                kitchen={k}
                onClose={() => setRemoving(null)}
                onHide={async () => {
                  // "paused", not "hidden". kitchenPatchSchema accepts only
                  // draft | active | paused (lib/schemas/food.ts:70), so the old
                  // "hidden" was rejected 400 and the operator was told "Invalid
                  // input." immediately after agreeing to hide the kitchen. Same
                  // value the eye button and the editor dropdown already send.
                  await setStatus(k, "paused");
                  setRemoving(null);
                }}
                onDone={() => {
                  setRemoving(null);
                  reload();
                }}
              />
            )}
          </article>
        ))}
      </div>

      {draft && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-3 sm:p-6">
          <div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-dark-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">
                  {draft.storeId ? "EDIT KITCHEN" : "NEW KITCHEN"}
                </p>
                <h3 className="mt-0.5 font-syne text-xl font-extrabold text-offwhite">
                  {draft.name || "Untitled kitchen"}
                </h3>
              </div>
              <button onClick={() => setDraft(null)} className="font-dm text-sm text-muted hover:text-offwhite">
                Close
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <span className={label}>KITCHEN NAME (CUSTOMERS SEE THIS)</span>
                <input className={input} value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Chez Marie" />
              </div>
              <div>
                <span className={label}>WHERE TO COLLECT FROM</span>
                <input className={input} value={draft.address}
                  onChange={(e) => setDraft({ ...draft, address: e.target.value })}
                  placeholder="Port Mathurin, near the market" />
              </div>
              <div>
                <span className={label}>COLLECTION LANDMARK</span>
                <input className={input} value={draft.pickupHint}
                  onChange={(e) => setDraft({ ...draft, pickupHint: e.target.value })}
                  placeholder="Green gate beside the church" />
                <p className="mt-1 font-dm text-[11px] text-muted">
                  Half the collection points on this island have no street address. A landmark beats one.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className={label}>PREP FROM (MIN)</span>
                  <input className={input} inputMode="numeric" value={draft.prepMinutesMin}
                    onChange={(e) => setDraft({ ...draft, prepMinutesMin: parseInt(e.target.value, 10) || 0 })} />
                </div>
                <div>
                  <span className={label}>PREP TO (MIN)</span>
                  <input className={input} inputMode="numeric" value={draft.prepMinutesMax}
                    onChange={(e) => setDraft({ ...draft, prepMinutesMax: parseInt(e.target.value, 10) || 0 })} />
                </div>
              </div>
              <p className="-mt-2 font-dm text-[11px] text-muted">
                A range, never a single number. Every dish here inherits it unless it says otherwise.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className={label}>GPS LATITUDE</span>
                  <input className={input} inputMode="decimal" value={draft.lat}
                    onChange={(e) => setDraft({ ...draft, lat: e.target.value })} placeholder="-19.6835" />
                </div>
                <div>
                  <span className={label}>GPS LONGITUDE</span>
                  <input className={input} inputMode="decimal" value={draft.lng}
                    onChange={(e) => setDraft({ ...draft, lng: e.target.value })} placeholder="63.4200" />
                </div>
              </div>

              {/* M95 — PUBLIC, and deliberately directly above the PRIVATE
                  block so the difference is impossible to miss. Since M89 every
                  order is a bank transfer, which a visitor holding a foreign
                  card cannot make; this number is that customer's only way
                  through, and the one they call when an order goes wrong. */}
              <div>
                <span className={label}>PUBLIC WHATSAPP — SHOWN ON EVERY DISH</span>
                <input
                  className={input}
                  value={draft.whatsapp}
                  onChange={(e) => setDraft({ ...draft, whatsapp: e.target.value })}
                  placeholder="+230 5xxx xxxx"
                  inputMode="tel"
                />
                <p className="mt-1 font-dm text-[11px] leading-snug text-muted">
                  Customers tap this to message the kitchen — essential for tourists with no local
                  bank account. Leave empty to hide the button.
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-dark p-3.5">
                <p className="font-bebas text-[11px] tracking-[0.25em] text-yellow">PRIVATE — THE COOKER</p>
                <p className="mt-1 font-dm text-[11px] text-muted">
                  Never shown to customers and never readable by the public API. This is who you ring.
                </p>
                <div className="mt-3 space-y-3">
                  <div>
                    <span className={label}>COOKER&apos;S NAME</span>
                    <input className={input} value={draft.cookerName}
                      onChange={(e) => setDraft({ ...draft, cookerName: e.target.value })} />
                  </div>
                  <div>
                    <span className={label}>COOKER&apos;S PHONE</span>
                    <input className={input} value={draft.cookerPhone}
                      onChange={(e) => setDraft({ ...draft, cookerPhone: e.target.value })} />
                  </div>
                  <div>
                    <span className={label}>OPERATIONAL NOTES</span>
                    <textarea className={input} rows={2} value={draft.cookerNotes}
                      onChange={(e) => setDraft({ ...draft, cookerNotes: e.target.value })}
                      placeholder="Call before 7am. No fish on Mondays." />
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <span className={label}>VISIBILITY</span>
                  <select className={input} value={draft.status}
                    onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                    <option value="active">Visible to customers</option>
                    <option value="paused">Hidden</option>
                    <option value="draft">Draft</option>
                  </select>
                </div>
                <label className="flex cursor-pointer items-end gap-2.5 pb-3 font-dm text-sm text-offwhite">
                  <input type="checkbox" checked={draft.offersRrDelivery}
                    onChange={(e) => setDraft({ ...draft, offersRrDelivery: e.target.checked })}
                    className="h-4 w-4 accent-[#2F80ED]" />
                  We deliver from here
                </label>
              </div>
            </div>

            <div className="mt-6 flex gap-2">
              <button onClick={() => setDraft(null)}
                className="flex-1 rounded-xl border border-white/15 px-4 py-3 font-dm text-sm text-muted hover:text-offwhite">
                Cancel
              </button>
              <button
                onClick={() => void save()}
                disabled={busy === "save" || !draft.name.trim()}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-yellow px-4 py-3 font-dm text-sm font-bold text-dark disabled:opacity-50"
              >
                {busy === "save" && <Loader2 size={15} className="animate-spin" />}
                {draft.storeId ? "Save kitchen" : "Create kitchen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
