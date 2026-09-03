"use client";

import { useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// How many people the room holds.
//
// Distinct from per-package capacity, and the distinction is the reason this
// card exists: "General Admission 400" and "VIP 200" are two answers to "how
// many of this tier", and no combination of them answers "how many people fit".
// Nothing stopped those summing to 600 in a hall that seats 450 until M58.
//
// Empty means no overall limit, which is the right default — most events are
// limited by their tiers, and a venue number invented to fill in a box would be
// a worse constraint than none. The server refuses a ceiling below what is
// already sold, so the floor is never left above the roof.
export default function CapacityCard({
  storeId,
  capacity,
  placesTaken,
}: {
  storeId: string;
  capacity: number | null;
  placesTaken: number;
}) {
  const { t } = useLanguage();
  const router = useRouter();
  const [value, setValue] = useState(capacity != null ? String(capacity) : "");
  const [saving, setSaving] = useState(false);

  const parsed = value.trim() === "" ? null : Number.parseInt(value, 10);
  const invalid = value.trim() !== "" && (!Number.isFinite(parsed) || (parsed ?? 0) < 1);
  const belowSold = parsed != null && parsed < placesTaken;
  const left = capacity != null ? Math.max(0, capacity - placesTaken) : null;

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/organizer/event", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, capacity: parsed }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not save that.");
      toast.success(parsed == null ? "No overall limit" : `Venue holds ${parsed}`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save that.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-dark-card p-5">
      <h2 className="flex items-center gap-2 font-bebas text-[11px] tracking-[0.3em] text-yellow">
        <Users size={14} /> {t.eventCapacity.title}
      </h2>
      <p className="mt-2 font-dm text-xs leading-relaxed text-muted">
        The total number of people the place holds, across every package. Leave it empty if the
        packages are the only limit.
      </p>

      <p className="mt-3 font-dm text-sm text-offwhite">
        {placesTaken} {placesTaken === 1 ? "place" : "places"} sold or held
        {left != null && <span className="text-muted"> · {left} left</span>}
      </p>

      <div className="mt-3 flex gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          inputMode="numeric"
          placeholder={t.eventCapacity.noLimit}
          aria-label={t.eventCapacity.label}
          aria-invalid={invalid || belowSold}
        />
        <Button disabled={saving || invalid || belowSold} onClick={() => void save()}>
          {saving ? <Loader2 size={15} className="animate-spin" /> : "Save"}
        </Button>
      </div>

      {invalid && (
        <p className="mt-2 font-dm text-xs text-orange-300">
          {t.eventCapacity.hint}
        </p>
      )}
      {belowSold && !invalid && (
        <p className="mt-2 font-dm text-xs text-orange-300">
          You have already sold or held {placesTaken}. Capacity can&apos;t go below that.
        </p>
      )}
    </div>
  );
}
