"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, AlertTriangle, EyeOff, Trash2, X, Check } from "lucide-react";
import { foodWrite, type AdminKitchen } from "./types";
import {
  deleteConsequences,
  hideConsequences,
  recommendedChoice,
  confirmMatches,
  deleteButtonLabel,
  whyBlocked,
  type KitchenDeletePreview,
  type RemovalChoice,
} from "@/lib/admin/kitchen-delete";

// ── REMOVING A KITCHEN ──────────────────────────────────────────────────────
//
// This replaces a window.prompt. The prompt asked the operator to type the name
// while telling them almost nothing — it could not say how many orders were
// about to go, or how much money they represented, because it had not asked.
//
// So this panel asks first. It loads the real numbers, then offers the two
// options side by side and describes both, because an operator who cannot tell
// the safe option from the loud one will pick the loud one. Hide is
// recommended whenever there is a record to lose; it is a recommendation, not a
// rule. The owner asked to be able to delete permanently, and they can.
//
// The typed name is checked again in the database. This panel is a courtesy,
// not the control.

export default function RemoveKitchenPanel({
  kitchen,
  onHide,
  onDone,
  onClose,
}: {
  kitchen: AdminKitchen;
  onHide: () => void;
  onDone: () => void;
  onClose: () => void;
}) {
  const [preview, setPreview] = useState<KitchenDeletePreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [choice, setChoice] = useState<RemovalChoice>("hide");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await foodWrite(
        `/api/admin/food/kitchens?preview=${encodeURIComponent(kitchen.storeId)}`,
      );
      if (!alive) return;
      if (!res.ok) {
        setLoadError(res.error);
        return;
      }
      const p = res.data as KitchenDeletePreview;
      setPreview(p);
      setChoice(recommendedChoice(p));
    })();
    return () => {
      alive = false;
    };
  }, [kitchen.storeId]);

  const purge = useCallback(async () => {
    setBusy(true);
    const res = await foodWrite(
      `/api/admin/food/kitchens?storeId=${encodeURIComponent(kitchen.storeId)}` +
        `&mode=purge&confirm=${encodeURIComponent(typed)}`,
      { method: "DELETE" },
    );
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    const done = res.data as { files?: string[] } | null;
    toast.success(`${kitchen.name} is gone for good.`);
    // Rows vanish with the cascade; uploaded files do not. Saying so beats
    // reporting a cleanup that never happened.
    if (done?.files?.length) {
      toast.message(
        `${done.files.length} uploaded photo${done.files.length === 1 ? "" : "s"} or receipt${done.files.length === 1 ? "" : "s"} are still in storage.`,
        { description: "Clear them from Supabase Storage when convenient." },
      );
    }
    onDone();
  }, [kitchen.name, kitchen.storeId, typed, onDone]);

  const blocked = preview ? whyBlocked(preview) : [];
  const canPress = !!preview && preview.can_delete && confirmMatches(typed, kitchen.name) && !busy;

  return (
    <div className="mt-3 rounded-2xl border border-white/10 bg-dark/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <h4 className="font-syne text-base font-bold text-offwhite">Remove {kitchen.name}</h4>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-lg p-1.5 text-muted transition hover:bg-white/5 hover:text-offwhite"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {loadError && (
        <p className="mt-3 font-dm text-sm text-red-300">{loadError}</p>
      )}

      {!preview && !loadError && (
        <p className="mt-4 flex items-center gap-2 font-dm text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking what this kitchen holds…
        </p>
      )}

      {preview && (
        <>
          <p className="mt-2 font-dm text-sm text-muted">Choose what should happen.</p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {/* ── HIDE ── */}
            <button
              type="button"
              onClick={() => setChoice("hide")}
              aria-pressed={choice === "hide"}
              className={`rounded-2xl border p-4 text-left transition ${
                choice === "hide"
                  ? "border-yellow/60 bg-yellow/10"
                  : "border-white/10 bg-dark hover:border-white/25"
              }`}
            >
              <span className="flex items-center gap-2 font-syne text-sm font-bold text-offwhite">
                <EyeOff className="h-4 w-4 shrink-0" /> Hide from customers
                {recommendedChoice(preview) === "hide" && (
                  <span className="rounded-full bg-yellow/20 px-2 py-0.5 font-bebas text-[10px] tracking-[0.15em] text-yellow">
                    SUGGESTED
                  </span>
                )}
              </span>
              <ul className="mt-2 space-y-1">
                {hideConsequences(preview).map((line) => (
                  <li key={line} className="flex gap-2 font-dm text-xs text-muted">
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </button>

            {/* ── DELETE ── */}
            <button
              type="button"
              onClick={() => setChoice("delete")}
              aria-pressed={choice === "delete"}
              className={`rounded-2xl border p-4 text-left transition ${
                choice === "delete"
                  ? "border-red-400/60 bg-red-500/10"
                  : "border-white/10 bg-dark hover:border-white/25"
              }`}
            >
              <span className="flex items-center gap-2 font-syne text-sm font-bold text-offwhite">
                <Trash2 className="h-4 w-4 shrink-0" /> Delete permanently
              </span>
              <p className="mt-2 font-dm text-xs text-red-300">This cannot be undone. It removes:</p>
              <ul className="mt-1 space-y-1">
                {deleteConsequences(preview).map((line) => (
                  <li key={line} className="flex gap-2 font-dm text-xs text-muted">
                    <span className="mt-0.5 text-red-400">•</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </button>
          </div>

          {/* ── THE CHOSEN ACTION ── */}
          {choice === "hide" ? (
            <button
              type="button"
              onClick={onHide}
              className="mt-4 w-full rounded-xl bg-yellow px-4 py-3 font-syne text-sm font-bold text-dark transition hover:brightness-110"
            >
              Hide {kitchen.name} from customers
            </button>
          ) : (
            <div className="mt-4">
              {blocked.length > 0 ? (
                <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3">
                  <p className="flex items-center gap-2 font-syne text-sm font-bold text-amber-200">
                    <AlertTriangle className="h-4 w-4 shrink-0" /> Not yet — finish this first
                  </p>
                  <ul className="mt-2 space-y-1">
                    {blocked.map((b) => (
                      <li key={b} className="font-dm text-xs text-amber-100/90">
                        {b}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 font-dm text-xs text-muted">
                    Deleting now would take a meal away from someone who has already paid for it.
                  </p>
                </div>
              ) : (
                <>
                  <label className="block font-bebas text-[11px] tracking-[0.2em] text-muted" htmlFor="purge-confirm">
                    TYPE THE KITCHEN NAME TO CONFIRM: {kitchen.name}
                  </label>
                  <input
                    id="purge-confirm"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    placeholder={kitchen.name}
                    autoComplete="off"
                    className="mt-1 w-full rounded-xl border border-white/10 bg-dark px-3 py-2.5 font-dm text-sm text-offwhite placeholder:text-muted focus:border-red-400/60 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={purge}
                    disabled={!canPress}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-3 font-syne text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    {deleteButtonLabel(preview)}
                  </button>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
