"use client";

import { useState } from "react";
import { MessageCircle, Loader2, Check, ChevronDown } from "lucide-react";

// The second alert channel. A driver activates a personal CallMeBot key from
// their own WhatsApp — one message, once — and from then on jobs arrive there
// as well as by push. Two independent channels means a phone that has push
// blocked, cleared, or never granted still gets the work.
//
// The key is write-only everywhere: stored in a table no client role can read,
// and no endpoint ever returns it. This component only ever learns a boolean.
export default function WhatsappAlerts({
  configured,
  onSaved,
}: {
  configured: boolean;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function save(clear: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const res = await fetch("/api/driver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "whatsapp",
          apiKey: clear ? "" : key.trim(),
          phone: clear ? undefined : phone.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Could not save that.");
        return;
      }
      setKey("");
      setDone(true);
      if (clear) setOpen(false);
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-2xl border border-white/10 bg-dark-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-syne text-sm font-bold">
            <MessageCircle size={15} className={configured ? "text-green-400" : "text-muted"} />
            WhatsApp alerts {configured ? "on" : "off"}
          </p>
          <p className="mt-0.5 font-dm text-xs text-muted">
            {configured
              ? "Jobs also arrive on WhatsApp — a backup if notifications fail."
              : "A backup channel, in case notifications get blocked or cleared."}
          </p>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-h-[44px] shrink-0 items-center gap-1 rounded-full border border-white/20 px-4 font-syne text-sm font-bold"
        >
          {configured ? "Change" : "Set up"}
          <ChevronDown size={14} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
        </button>
      </div>

      {open && (
        <div className="mt-4 border-t border-white/10 pt-4">
          <p className="font-dm text-xs text-muted">
            Do this once, from the phone you want alerts on:
          </p>
          <ol className="mt-2 list-decimal space-y-1.5 pl-4 font-dm text-xs text-muted">
            <li>
              Save <span className="font-semibold text-offwhite">+34 644 51 95 23</span> in your contacts as
              CallMeBot.
            </li>
            <li>
              Send it this exact WhatsApp message:{" "}
              <span className="font-semibold text-offwhite">I allow callmebot to send me messages</span>
            </li>
            <li>It replies with your personal API key. Paste that below.</li>
          </ol>

          <label className="mt-4 block font-dm text-xs text-muted" htmlFor="wa-key">
            API key from CallMeBot
          </label>
          <input
            id="wa-key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            inputMode="numeric"
            autoComplete="off"
            placeholder="123456"
            className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-dark px-3 font-dm text-sm text-offwhite placeholder:text-muted/60"
          />

          <label className="mt-3 block font-dm text-xs text-muted" htmlFor="wa-phone">
            WhatsApp number (leave blank to use the one on your driver profile)
          </label>
          <input
            id="wa-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            autoComplete="off"
            placeholder="+230 5xxx xxxx"
            className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-dark px-3 font-dm text-sm text-offwhite placeholder:text-muted/60"
          />

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => void save(false)}
              disabled={busy || key.trim().length === 0}
              className="min-h-[44px] flex-1 rounded-full bg-yellow px-5 font-syne text-sm font-bold text-dark disabled:opacity-50"
            >
              {busy ? <Loader2 size={16} className="mx-auto animate-spin" /> : "Save"}
            </button>
            {configured && (
              <button
                onClick={() => void save(true)}
                disabled={busy}
                className="min-h-[44px] rounded-full border border-white/20 px-5 font-syne text-sm font-bold disabled:opacity-50"
              >
                Turn off
              </button>
            )}
          </div>

          {done && (
            <p className="mt-3 flex items-center gap-1.5 font-dm text-xs text-green-400">
              <Check size={14} /> Saved. Your next job will arrive on WhatsApp too.
            </p>
          )}
          {error && <p className="mt-3 font-dm text-xs text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}
