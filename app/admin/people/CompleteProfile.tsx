"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { missingProfileFields, type PersonKind, type PersonRow } from "@/lib/admin/people";

// ── TYPING IN WHAT THEY TOLD YOU ON WHATSAPP ────────────────────────────────
//
// The desk could already NAME what a profile was missing. It could not do
// anything about it, so an admin sat looking at "Phone number" in amber with
// the number in front of them and nowhere to put it.
//
// Only the missing fields render. A profile lacking a phone gets one box, not a
// form — this is filling a gap, not editing somebody's account, and a screen
// that offers to change everything invites changing everything.

const FIELD: Record<string, { key: "phone" | "email" | "segment"; type: string; hint: string }> = {
  "Phone number": { key: "phone", type: "tel", hint: "+230 5xxx xxxx" },
  "Email address": { key: "email", type: "email", hint: "name@example.com" },
  "Vehicle type": { key: "segment", type: "text", hint: "Scooter, car, van…" },
  "What they sell": { key: "segment", type: "text", hint: "Honey, crafts, fish…" },
  "Where to collect": { key: "segment", type: "text", hint: "Green gate beside the market" },
};

export default function CompleteProfile({
  person,
  onDone,
}: {
  person: PersonRow;
  onDone: () => void;
}) {
  const missing = missingProfileFields(person.kind as PersonKind, person);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Some missing fields have nowhere to be written for that kind — a driver's
  // email lives on auth.users once they claim the account, and only they can
  // change it. Those are still SHOWN as missing above; they just get no box,
  // because offering one that silently does nothing is worse than offering none.
  const editable = missing.filter((m) => FIELD[m]);
  if (editable.length === 0) return null;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const fields: Record<string, string> = {};
      for (const m of editable) {
        const v = values[m]?.trim();
        if (v) fields[FIELD[m].key] = v;
      }
      if (Object.keys(fields).length === 0) {
        setError("Fill in at least one.");
        return;
      }
      const res = await fetch("/api/admin/people/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: person.kind, id: person.id, fields }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "That didn't save.");
      setSaved(true);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-dark p-3">
      <p className="font-dm text-[12px] text-offwhite">Fill it in for them</p>
      <p className="mt-0.5 font-dm text-[11px] text-muted">
        Recorded against your name in the audit trail.
      </p>

      <div className="mt-2 space-y-2">
        {editable.map((m) => (
          <label key={m} className="block">
            <span className="font-dm text-[11px] text-muted">{m}</span>
            <input
              type={FIELD[m].type}
              value={values[m] ?? ""}
              placeholder={FIELD[m].hint}
              onChange={(e) => setValues((v) => ({ ...v, [m]: e.target.value }))}
              className="mt-0.5 min-h-[40px] w-full rounded-lg border border-white/15 bg-dark-card px-3 font-dm text-[13px] text-offwhite placeholder:text-muted/50 focus:border-yellow focus:outline-none"
            />
          </label>
        ))}
      </div>

      {error && <p className="mt-2 font-dm text-[11px] text-red-400">{error}</p>}

      <button
        type="button"
        onClick={save}
        disabled={busy || saved}
        className="mt-2.5 inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-yellow px-4 font-syne text-[13px] font-bold text-dark disabled:opacity-50"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : null}
        {saved ? "Saved" : "Save"}
      </button>
    </div>
  );
}
