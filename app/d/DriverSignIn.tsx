"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ArrowRight, KeyRound } from "lucide-react";

// The way back in (M100).
//
// Deliberately two fields and nothing else. A taxi driver standing at the side
// of a road, one-handed, at night, is the scene this has to survive — so no
// account, no password to invent, no email to confirm. He types the number he
// has said out loud ten thousand times and the six characters the owner gave
// him, and he is back on his job board.
export default function DriverSignIn() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Code only, matching the Account page. The phone field is kept in the
  // payload as an empty string so the route's schema is satisfied either way.
  const ready = code.trim().length >= 4;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/driver-signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const j = (await res.json()) as { ok?: boolean; path?: string; error?: string };
      if (!res.ok || !j.ok || !j.path) {
        setError(j.error ?? "That code and number do not match.");
        return;
      }
      router.push(j.path);
    } catch {
      setError("No connection. Check your signal and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-3">
      <div>
        <label htmlFor="d-code" className="mb-1 block font-dm text-xs text-muted">
          Your driver code
        </label>
        <input
          id="d-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder="6 characters"
          // Big and spaced: this is read off a screen or heard down a phone,
          // and 0/O and 1/l are exactly where that goes wrong.
          className="w-full rounded-xl border border-white/15 bg-dark-card px-4 py-3.5 font-mono text-lg tracking-[0.3em] text-offwhite placeholder:font-dm placeholder:text-base placeholder:tracking-normal placeholder:text-muted/40 focus:border-yellow focus:outline-none"
        />
      </div>

      {error && (
        <p role="alert" className="font-dm text-sm text-red-400">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!ready || busy}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-yellow py-4 font-syne text-base font-bold text-dark transition-colors hover:bg-yellow-dark disabled:opacity-50"
      >
        {busy ? <><Loader2 size={18} className="animate-spin" /> Checking…</> : <><KeyRound size={17} /> Open my page <ArrowRight size={17} /></>}
      </button>

      <p className="pt-1 text-center font-dm text-[11px] leading-relaxed text-muted/60">
        Once you are in, use <strong className="text-muted">Keep it on your phone</strong> to add an icon to your home
        screen — then you will not need this code again.
      </p>
    </form>
  );
}
