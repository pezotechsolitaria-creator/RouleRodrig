"use client";

import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { Loader2, ShieldCheck } from "lucide-react";

// What a person can turn off — and, just as importantly, what they cannot.
//
// The list comes from the server, which builds it from the notification
// registry excluding anything critical. So there is no toggle here for "your
// payment failed" or "your event was cancelled": those are consequences, not
// noise, and a preferences screen that could hide them would be a trap.

type Pref = { category: string; enabled: boolean };

const LABEL: Record<string, { title: string; hint: string }> = {
  deliveries: { title: "Delivery updates", hint: "A driver is on the way, arriving, delivered." },
  rentals: { title: "Booking updates", hint: "Reminders and changes to your rentals." },
  ticketing: { title: "Event updates", hint: "Reminders about events you have tickets for." },
  bookings: { title: "Order progress", hint: "Being prepared, ready to collect." },
  payments: { title: "Payment updates", hint: "Receipts and confirmations." },
  system: { title: "Account", hint: "Non-urgent account notices." },
  admin: { title: "Operations", hint: "Internal operational updates." },
};

export default function NotificationPreferences({ className = "" }: { className?: string }) {
  const { t } = useLanguage();
  const [prefs, setPrefs] = useState<Pref[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/preferences", { cache: "no-store" });
      if (!res.ok) {
        setPrefs([]);
        return;
      }
      const body = await res.json();
      setPrefs((body.categories as Pref[]) ?? []);
    } catch {
      setPrefs([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(category: string, next: boolean) {
    if (busy) return;
    setBusy(category);
    setError(null);
    // Optimistic — the request is idempotent, so a failure just reverts.
    setPrefs((p) => p?.map((x) => (x.category === category ? { ...x, enabled: next } : x)) ?? null);
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, muted: !next }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Could not save that.");
        setPrefs((p) => p?.map((x) => (x.category === category ? { ...x, enabled: !next } : x)) ?? null);
      }
    } finally {
      setBusy(null);
    }
  }

  if (prefs === null || prefs.length === 0) return null;

  return (
    <section className={`rounded-2xl border border-white/10 bg-dark-card p-5 ${className}`}>
      <h2 className="font-syne text-lg font-bold">Notifications</h2>
      <p className="mt-1 font-dm text-sm text-muted">
        {t.common.notificationPrefs}
      </p>

      <ul className="mt-4 divide-y divide-white/5">
        {prefs.map((p) => {
          const meta = LABEL[p.category] ?? { title: p.category, hint: "" };
          return (
            <li key={p.category} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="font-dm text-sm font-medium text-offwhite">{meta.title}</p>
                {meta.hint && <p className="mt-0.5 font-dm text-xs text-muted">{meta.hint}</p>}
              </div>
              <button
                role="switch"
                aria-checked={p.enabled}
                aria-label={meta.title}
                disabled={busy === p.category}
                onClick={() => void toggle(p.category, !p.enabled)}
                className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                  p.enabled ? "bg-yellow" : "bg-white/15"
                }`}
              >
                <span
                  className={`absolute top-1 h-5 w-5 rounded-full bg-dark transition-transform ${
                    p.enabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
                {busy === p.category && (
                  <Loader2 size={12} className="absolute inset-0 m-auto animate-spin text-dark" />
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {/* Said explicitly, because the absence of a toggle otherwise reads as an
          oversight rather than a decision. */}
      <p className="mt-4 flex items-start gap-2 font-dm text-xs text-muted">
        <ShieldCheck size={13} className="mt-0.5 shrink-0 text-yellow" />
        Payment problems, cancellations and security alerts are always sent. They affect your money or
        your booking, so they aren&apos;t optional.
      </p>

      {error && <p className="mt-3 font-dm text-xs text-red-400">{error}</p>}
    </section>
  );
}
