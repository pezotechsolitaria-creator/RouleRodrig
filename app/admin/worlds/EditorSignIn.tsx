"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";

/**
 * Two doors, and they are not the same door.
 *
 * The owner signs in with the admin password and gets the whole platform. An
 * editor signs in with a code that opens the worlds they were given and
 * nothing else — no orders, no customers, no money. Keeping the second door
 * here rather than folding it into /admin/login is what guarantees an editor
 * code can never mint an admin session: the route that issues it
 * (/api/admin/worlds/signin) has no way to set the admin cookie.
 */
export default function EditorSignIn() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/worlds/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "That code was not recognised.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-dark px-5">
      <div className="w-full max-w-sm">
        <p className="font-syne text-lg font-extrabold text-offwhite">
          Worlds <span className="text-yellow">studio</span>
        </p>
        <p className="mt-1 font-dm text-[13px] text-muted">
          Where each part of the site tells its own story.
        </p>

        <form onSubmit={submit} className="mt-6 rounded-2xl border border-white/10 bg-dark-card p-4">
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 font-dm text-[11px] uppercase tracking-wider text-muted">
              <KeyRound size={12} /> Editor code
            </span>
            <input
              type="password"
              autoComplete="off"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full rounded-lg border border-white/12 bg-dark px-3 py-2.5 font-dm text-sm text-offwhite focus:border-yellow focus:outline-none"
            />
          </label>
          {error && (
            <p role="alert" className="mt-2 font-dm text-[12px] text-red-300">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || !code}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-yellow px-4 py-2.5 font-dm text-sm font-semibold text-dark disabled:opacity-40"
          >
            {busy && <Loader2 size={14} className="animate-spin" />} Open my worlds
          </button>
        </form>

        <Link
          href="/admin/login"
          className="mt-3 flex items-center justify-center gap-2 rounded-2xl border border-white/10 px-4 py-3 font-dm text-[13px] text-muted hover:border-yellow/40 hover:text-offwhite"
        >
          <ShieldCheck size={14} /> I'm the owner — sign in with the admin password
        </Link>
      </div>
    </div>
  );
}
