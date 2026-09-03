"use client";

import { useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { useRouter } from "next/navigation";
import { Loader2, ArrowRight, Car } from "lucide-react";

// ── A driver gets back to their page from the Account tab (M102) ───────────
//
// The first version of this lived at /d and asked for a phone number and a
// code. The owner's answer was that it was still unreachable — and he was
// right twice over: a driver does not know a URL exists unless it is in the
// app, and a driver at the roadside will abandon two fields.
//
// So it lives HERE, on the page every user already opens to find their stuff,
// and it asks for one thing. Six hex characters against six attempts a minute
// is over five years of guessing per valid code; the rate limit was always the
// security, not the second field.
export default function DriverCodeBox() {
  const { t } = useLanguage();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (code.trim().length < 4 || busy) return;
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
        setError(j.error ?? "That code was not recognised.");
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
    <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-2">
        <Car size={16} className="text-yellow" />
        <h2 className="font-syne text-sm font-bold text-offwhite">{t.account.drivingForUs}</h2>
      </div>
      <p className="mt-1 font-dm text-xs leading-relaxed text-muted">
        {t.account.driverCodeHint}
      </p>

      <form onSubmit={submit} className="mt-3 flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-label={t.account.yourDriverCode}
          placeholder={t.account.driverCode}
          autoComplete="off"
          spellCheck={false}
          // Spaced and monospaced because this is read off a screen or heard
          // down a phone, and 0/O and 1/l is exactly where that goes wrong.
          className="min-w-0 flex-1 rounded-xl border border-white/15 bg-dark-card px-3 py-3 font-mono text-base tracking-[0.25em] text-offwhite placeholder:font-dm placeholder:text-sm placeholder:tracking-normal placeholder:text-muted/40 focus:border-yellow focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || code.trim().length < 4}
          aria-label="{t.account.openDriverPage}"
          className="shrink-0 rounded-xl bg-yellow px-4 font-syne text-sm font-bold text-dark transition-colors hover:bg-yellow-dark disabled:opacity-50"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-2 font-dm text-xs text-red-400">
          {error}
        </p>
      )}
    </section>
  );
}
