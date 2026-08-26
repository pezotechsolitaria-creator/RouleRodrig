"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { normaliseRef } from "@/lib/delivery/request-status";
import { recipe, type as t } from "@/lib/delivery/tokens";

// ── Getting back to a request you lost the link to ──────────────────────────
//
// The hole this fills: a guest gets no email, and their request is identified
// by a uuid nobody can memorise. The localStorage entry was the ONLY thread
// back to it — a different phone, cleared storage, a tab closed on the bus, and
// the request was unreachable for ever while drivers went on quoting.
//
// Collapsed by default. Somebody arriving to POST a request should not have to
// scroll past a form for finding one, and the people who need this know they
// need it. It sits under the requests list because that is where a returning
// customer looks first and finds nothing.

export default function FindRequest() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [ref, setRef] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refOk = normaliseRef(ref) !== null;
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !refOk || !emailOk) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/delivery-requests/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref: ref.trim(), email: email.trim().toLowerCase() }),
      });
      const json = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !json.id) {
        setError(json.error ?? "We couldn't find that.");
        return;
      }
      router.push(`/deliver/${json.id}`);
    } catch {
      setError("Could not reach us. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          t.bodySm,
          "mb-9 inline-flex items-center gap-1.5 text-muted underline underline-offset-4 transition-colors hover:text-offwhite",
        )}
      >
        <Search size={14} /> Already asked for prices? Find your request
      </button>
    );
  }

  return (
    <section className="mb-9 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <h2 className={cn(t.cardTitle, "text-offwhite")}>Find your request</h2>
      <p className={cn(t.bodySm, "mt-1.5 text-muted")}>
        The reference is on the request page, like RR-3F9A2B. We check it against the
        email you used, so neither one on its own opens anything.
      </p>

      <form className="mt-4 flex flex-col gap-3" onSubmit={submit}>
        <div>
          <label htmlFor="find-ref" className={cn(t.meta, "mb-1.5 block text-muted")}>
            Reference
          </label>
          <input
            id="find-ref"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder="RR-3F9A2B"
            autoComplete="off"
            spellCheck={false}
            className={cn(recipe.field, "uppercase")}
          />
          {/* Said before a request is spent, so a mistyped code explains itself
              rather than coming back as a bare "we couldn't find that". */}
          {ref.trim().length > 0 && !refOk && (
            <p className={cn(t.meta, "mt-1.5 text-red-400")}>
              That should be six characters, like RR-3F9A2B.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="find-email" className={cn(t.meta, "mb-1.5 block text-muted")}>
            The email you used
          </label>
          <input
            id="find-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className={recipe.field}
          />
        </div>

        {error && (
          <p role="alert" className={cn(t.bodySm, "text-red-400")}>
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className={cn(recipe.secondaryAction, "py-2.5")}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !refOk || !emailOk}
            className={cn(recipe.primaryAction, "inline-flex flex-1 items-center justify-center gap-2")}
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            {busy ? "Looking…" : "Find it"}
          </button>
        </div>
      </form>
    </section>
  );
}
