"use client";

import { useEffect, useState } from "react";
import { MessageCircle, Loader2, Check } from "lucide-react";

// ── WHATSAPP ALERTS, ON THE OWNER'S SIDE ────────────────────────────────────
//
// Moved here from the driver's own dashboard. Activating CallMeBot means
// messaging a bot from your phone, waiting for a key, and pasting it into a
// form — a real amount of work to ask of somebody who has just been handed a
// login, sitting on the one screen they open when they are trying to work.
//
// The owner onboards these drivers by hand anyway, so the setup belongs where
// he already is: beside the driver's name, on the desk where he approves them.
//
// The key is WRITE-ONLY. It is a credential for another person's WhatsApp, so
// nothing here ever displays it — this component only ever learns a boolean,
// and the field is cleared the moment it is saved.

export default function DriverWhatsappAlerts({
  driverId,
  driverPhone,
}: {
  driverId: string;
  driverPhone?: string | null;
}) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Fetched inline with a cancel flag rather than through a useCallback: the
  // lint rule cannot see that setConfigured happens after an await, and the
  // repo already carries that error in two neighbouring files. Resetting the
  // form for a different driver is done by REMOUNTING — the call site passes
  // key={driver.id} — not by setting state here.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/admin/people/whatsapp?driverId=${encodeURIComponent(driverId)}`,
          { cache: "no-store" },
        );
        const json = (await res.json().catch(() => null)) as {
          configured?: boolean;
        } | null;
        if (!cancelled) setConfigured(Boolean(json?.configured));
      } catch {
        if (!cancelled) setConfigured(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [driverId]);

  async function save(clear: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/people/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driverId,
          apiKey: clear ? "" : apiKey.trim(),
          phone: clear ? "" : phone.trim(),
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        error?: string;
        configured?: boolean;
      } | null;
      if (!res.ok) {
        setError(json?.error ?? "Could not save that.");
        return;
      }
      setApiKey("");
      setSaved(true);
      setConfigured(Boolean(json?.configured));
    } catch {
      setError("Could not save that — check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 rounded-xl border border-white/10 bg-dark-card p-3">
      <p className="flex items-center gap-2 font-dm text-[12.5px] text-offwhite">
        <MessageCircle size={14} className="text-yellow" />
        WhatsApp job alerts{" "}
        <span className={configured ? "text-yellow" : "text-muted"}>
          {configured === null ? "…" : configured ? "on" : "off"}
        </span>
      </p>
      <p className="mt-1 font-dm text-[11.5px] leading-relaxed text-muted">
        A second channel beside push, so a phone with notifications blocked
        still gets the job. Ask them to send{" "}
        <span className="text-offwhite">
          I allow callmebot to send me messages
        </span>{" "}
        to CallMeBot on WhatsApp, then paste the key it replies with.
      </p>

      <input
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder="CallMeBot API key"
        className="mt-2 min-h-11 w-full rounded-xl border border-white/15 bg-dark px-3 font-dm text-[13px] text-offwhite placeholder:text-muted/60"
      />
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder={driverPhone ? `WhatsApp number (${driverPhone})` : "WhatsApp number"}
        className="mt-2 min-h-11 w-full rounded-xl border border-white/15 bg-dark px-3 font-dm text-[13px] text-offwhite placeholder:text-muted/60"
      />
      <p className="mt-1 font-dm text-[11px] text-muted">
        Leave the number blank to use the one on their driver profile.
      </p>

      {error && (
        <p role="alert" className="mt-2 font-dm text-[12px] text-red-300">
          {error}
        </p>
      )}
      {saved && !error && (
        <p className="mt-2 flex items-center gap-1.5 font-dm text-[12px] text-yellow">
          <Check size={13} /> Saved.
        </p>
      )}

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void save(false)}
          disabled={busy || !apiKey.trim()}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-yellow/40 bg-yellow/10 px-3.5 font-dm text-[12.5px] text-yellow hover:bg-yellow/15 disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : null}
          Turn on
        </button>
        {configured && (
          <button
            type="button"
            onClick={() => void save(true)}
            disabled={busy}
            className="inline-flex min-h-9 items-center rounded-full border border-white/12 px-3.5 font-dm text-[12.5px] text-muted hover:border-red-400/50 hover:text-red-300 disabled:opacity-50"
          >
            Turn off
          </button>
        )}
      </div>
    </div>
  );
}
