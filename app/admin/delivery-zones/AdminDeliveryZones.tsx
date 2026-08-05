"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, AlertTriangle, Plus, EyeOff, Eye } from "lucide-react";
import { centsToDecimalString, toCents } from "@/lib/money";

type Zone = {
  id: string;
  name: string;
  covers: string | null;
  fee: number;
  is_active: boolean;
  position: number;
};

// Rupees on screen, minor units on the wire. toCents() parses the string
// without touching a float, so "150.05" cannot become 15004.999999.
function feeToCents(input: string): number | null {
  try {
    return toCents(input.trim());
  } catch {
    return null;
  }
}

export default function AdminDeliveryZones() {
  const [zones, setZones] = useState<Zone[] | null>(null);
  const [deliveryEnabled, setDeliveryEnabled] = useState(true);
  const [maxMinutes, setMaxMinutes] = useState(120);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Fee inputs are held locally so a half-typed "1" is never saved as Rs 1.
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [newZone, setNewZone] = useState({ name: "", covers: "", fee: "" });

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch("/api/admin/delivery-zones");
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || "Failed to load delivery areas.");
      setZones(b.zones);
      setDeliveryEnabled(b.deliveryEnabled);
      setMaxMinutes(b.maxMinutes);
      setDraft(
        Object.fromEntries((b.zones as Zone[]).map((z) => [z.id, centsToDecimalString(z.fee)])),
      );
    } catch (e) {
      setZones(null);
      setError(e instanceof Error ? e.message : "Failed to load delivery areas.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function patch(id: string, body: Record<string, unknown>, key: string) {
    setBusy(id + key);
    try {
      const r = await fetch("/api/admin/delivery-zones", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || "That didn't work.");
      toast.success("Saved.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  }

  async function saveFee(z: Zone) {
    const cents = feeToCents(draft[z.id] ?? "");
    if (cents === null) return toast.error("Enter a fee like 150 or 150.50.");
    if (cents === z.fee) return;
    await patch(z.id, { fee: cents }, "fee");
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const cents = feeToCents(newZone.fee);
    if (!newZone.name.trim()) return toast.error("Give the area a name.");
    if (cents === null) return toast.error("Enter a fee like 150 or 150.50.");
    setBusy("new");
    try {
      const r = await fetch("/api/admin/delivery-zones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newZone.name,
          covers: newZone.covers,
          fee: cents,
          position: (zones?.length ?? 0) + 1,
        }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || "Could not create that area.");
      toast.success("Area added.");
      setNewZone({ name: "", covers: "", fee: "" });
      setAdding(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create that area.");
    } finally {
      setBusy(null);
    }
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5">
        <p className="flex items-center gap-2 font-dm text-sm text-red-300">
          <AlertTriangle size={15} /> {error}
        </p>
        <button
          onClick={() => void load()}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 font-dm text-xs text-offwhite hover:border-yellow/50 hover:text-yellow"
        >
          <RefreshCw size={12} /> Try again
        </button>
      </div>
    );
  }

  if (!zones) {
    return (
      <p className="flex items-center gap-2 font-dm text-sm text-muted">
        <Loader2 size={15} className="animate-spin" /> Loading delivery areas…
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {!deliveryEnabled && (
        <p className="rounded-xl border border-orange-400/30 bg-orange-400/5 px-4 py-3 font-dm text-xs text-orange-200">
          Roulé Rodrigues delivery is switched off platform-wide, so no delivery fee is charged on any order
          regardless of what is set here.
        </p>
      )}

      <ul className="space-y-3">
        {zones.map((z) => (
          <li
            key={z.id}
            className={`rounded-2xl border p-4 ${z.is_active ? "border-white/10 bg-dark-card" : "border-white/5 bg-dark-card/40"}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-syne text-sm font-bold text-offwhite">
                  {z.name}
                  {!z.is_active && <span className="ml-2 font-dm text-xs font-normal text-muted">(hidden)</span>}
                </p>
                {z.covers && <p className="mt-0.5 font-dm text-xs text-muted">{z.covers}</p>}
              </div>

              <div className="flex items-center gap-2">
                <label htmlFor={`fee-${z.id}`} className="font-dm text-xs text-muted">Rs</label>
                <input
                  id={`fee-${z.id}`}
                  inputMode="decimal"
                  value={draft[z.id] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [z.id]: e.target.value }))}
                  onBlur={() => void saveFee(z)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void saveFee(z); } }}
                  aria-label={`Delivery fee for ${z.name}, in rupees`}
                  className="w-24 rounded-lg border border-dark-border bg-dark px-3 py-2 text-right font-dm text-sm text-offwhite focus:border-yellow focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void patch(z.id, { isActive: !z.is_active }, "active")}
                  disabled={busy === z.id + "active"}
                  aria-label={z.is_active ? `Hide ${z.name} from checkout` : `Show ${z.name} at checkout`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-2 font-dm text-xs text-muted hover:border-yellow/50 hover:text-yellow disabled:opacity-50"
                >
                  {busy === z.id + "active"
                    ? <Loader2 size={12} className="animate-spin" />
                    : z.is_active ? <EyeOff size={12} /> : <Eye size={12} />}
                  {z.is_active ? "Hide" : "Show"}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {adding ? (
        <form onSubmit={create} className="rounded-2xl border border-white/10 bg-dark-card p-4">
          <div className="space-y-3">
            <div>
              <label htmlFor="nz-name" className="mb-1 block font-dm text-xs text-muted">Area name</label>
              <input
                id="nz-name" value={newZone.name} required maxLength={80}
                onChange={(e) => setNewZone((n) => ({ ...n, name: e.target.value }))}
                className="w-full rounded-lg border border-dark-border bg-dark px-3 py-2 font-dm text-sm text-offwhite focus:border-yellow focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="nz-covers" className="mb-1 block font-dm text-xs text-muted">
                Villages it covers (shown to customers)
              </label>
              <input
                id="nz-covers" value={newZone.covers} maxLength={300}
                onChange={(e) => setNewZone((n) => ({ ...n, covers: e.target.value }))}
                className="w-full rounded-lg border border-dark-border bg-dark px-3 py-2 font-dm text-sm text-offwhite focus:border-yellow focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="nz-fee" className="mb-1 block font-dm text-xs text-muted">Delivery fee (Rs)</label>
              <input
                id="nz-fee" inputMode="decimal" value={newZone.fee} required
                onChange={(e) => setNewZone((n) => ({ ...n, fee: e.target.value }))}
                className="w-32 rounded-lg border border-dark-border bg-dark px-3 py-2 font-dm text-sm text-offwhite focus:border-yellow focus:outline-none"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="submit" disabled={busy === "new"}
              className="inline-flex items-center gap-1.5 rounded-full bg-yellow px-4 py-2 font-dm text-xs font-medium text-dark hover:bg-yellow-dark disabled:opacity-50"
            >
              {busy === "new" && <Loader2 size={12} className="animate-spin" />} Add area
            </button>
            <button
              type="button" onClick={() => setAdding(false)}
              className="rounded-full border border-white/15 px-4 py-2 font-dm text-xs text-muted hover:text-offwhite"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-2 font-dm text-xs text-offwhite hover:border-yellow/50 hover:text-yellow"
        >
          <Plus size={13} /> Add an area
        </button>
      )}

      <p className="font-dm text-xs text-muted">
        Customers are told deliveries usually happen within {Math.round(maxMinutes / 60)} hours and that they
        agree the exact time with the driver — Roulé Rodrigues does not promise a slot.
      </p>
    </div>
  );
}
