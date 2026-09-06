"use client";

import { useEffect, useState } from "react";
import { Copy, Check, Loader2, Plus, Trash2, Truck } from "lucide-react";
import { toast } from "sonner";

type Courier = {
  id: string;
  name: string;
  phone: string | null;
  token: string;
  last_seen_at: string | null;
};

type State = {
  enabled: boolean;
  trackingApproved: boolean;
  feeCents: number;
  couriers: Courier[];
};

// ── DELIVERING YOUR OWN ORDERS ──────────────────────────────────────────────
//
// Two tiers, and the screen has to make the difference obvious without making
// the free one feel like a punishment:
//
//   The switch    free, instant, nobody's permission. "I deliver these myself."
//   The links     one per driver, every job tracked. Roulé Rodrigues switches
//                 this on per shop.
//
// The link IS the credential, so it is shown in full with a copy button rather
// than hidden behind a reveal: the merchant's whole job here is to send it to
// somebody on WhatsApp, and a masked secret they cannot copy is a secret they
// will screenshot instead.

export default function OwnDeliveryPanel() {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/merchant/own-delivery")
      .then((r) => r.json())
      .then((d) => setState(d))
      .catch(() => toast.error("Couldn't load your delivery settings."));
  }, []);

  async function post(body: unknown) {
    setBusy(true);
    try {
      const res = await fetch("/api/merchant/own-delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "That didn't work.");
      const fresh = await (await fetch("/api/merchant/own-delivery")).json();
      setState(fresh);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't work.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function linkFor(token: string) {
    return `${typeof window === "undefined" ? "" : window.location.origin}/c/${token}`;
  }

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(linkFor(token));
      setCopied(token);
      setTimeout(() => setCopied(null), 2000);
      toast.success("Link copied — send it on WhatsApp.");
    } catch {
      toast.error("Couldn't copy. Press and hold the link to copy it.");
    }
  }

  if (!state) {
    return (
      <div className="rounded-2xl border border-white/10 bg-dark-card p-6 text-center">
        <Loader2 size={18} className="mx-auto animate-spin text-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── The free switch ─────────────────────────────────────────── */}
      <section className="rounded-2xl border border-white/10 bg-dark-card p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-syne text-sm font-bold text-offwhite">
              <Truck size={15} className="text-yellow" /> I deliver my own orders
            </p>
            <p className="mt-1 font-dm text-xs text-muted">
              Free, and yours to switch on or off whenever you like. Roulé Rodrigues does not
              charge you for delivering your own orders.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={state.enabled}
            aria-label="I deliver my own orders"
            disabled={busy}
            onClick={() => post({ action: "toggle", enabled: !state.enabled })}
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
              state.enabled ? "bg-green-500" : "bg-white/15"
            }`}
          >
            <span
              className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform ${
                state.enabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </section>

      {/* ── The tracked tier ────────────────────────────────────────── */}
      <section className="rounded-2xl border border-white/10 bg-dark-card p-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-syne text-sm font-bold text-offwhite">Tracked delivery</p>
          <span
            className={`rounded-full px-2 py-0.5 font-dm text-[10px] ${
              state.trackingApproved
                ? "bg-green-500/15 text-green-400"
                : "bg-white/10 text-muted"
            }`}
          >
            {state.trackingApproved ? "On" : "Not on yet"}
          </span>
        </div>

        {!state.trackingApproved ? (
          <p className="mt-1 font-dm text-xs text-muted">
            Give each of your delivery people their own link, and every order they carry is
            tracked online — your customer can follow it, and you can see where it got to. Ask
            Roulé Rodrigues to switch this on for your shop.
          </p>
        ) : (
          <>
            <p className="mt-1 font-dm text-xs text-muted">
              Send each of your delivery people their own link. Anyone holding a link can see the
              orders waiting to go out, so send it to one person and no one else.
            </p>

            {state.couriers.length > 0 && (
              <ul className="mt-3 space-y-2">
                {state.couriers.map((c) => (
                  <li key={c.id} className="rounded-xl border border-white/10 bg-dark p-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate font-dm text-sm font-semibold text-offwhite">
                        {c.name}
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={`Remove ${c.name}`}
                        onClick={() => {
                          if (
                            confirm(
                              `Remove ${c.name}? Their link stops working straight away and cannot be turned back on — you would send them a new one.`,
                            )
                          ) {
                            post({ action: "remove", id: c.id });
                          }
                        }}
                        className="shrink-0 text-muted transition-colors hover:text-red-400 disabled:opacity-50"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    {c.phone && <p className="font-dm text-[11px] text-muted">{c.phone}</p>}
                    <button
                      type="button"
                      onClick={() => copy(c.token)}
                      className="mt-2 flex w-full items-center gap-2 rounded-lg border border-white/10 bg-dark-card px-3 py-2 text-left font-dm text-[11px] text-muted transition-colors hover:border-yellow/40"
                    >
                      {copied === c.token ? (
                        <Check size={13} className="shrink-0 text-green-400" />
                      ) : (
                        <Copy size={13} className="shrink-0" />
                      )}
                      <span className="truncate">{linkFor(c.token)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <form
              className="mt-3 flex flex-wrap gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!name.trim()) return;
                if (await post({ action: "add", name: name.trim(), phone: phone.trim() })) {
                  setName("");
                  setPhone("");
                }
              }}
            >
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name"
                maxLength={80}
                required
                className="min-h-[44px] flex-1 rounded-xl border border-white/15 bg-dark px-3 font-dm text-sm text-offwhite placeholder:text-muted/60"
              />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone (optional)"
                maxLength={40}
                inputMode="tel"
                className="min-h-[44px] flex-1 rounded-xl border border-white/15 bg-dark px-3 font-dm text-sm text-offwhite placeholder:text-muted/60"
              />
              <button
                type="submit"
                disabled={busy || !name.trim()}
                className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-yellow px-4 font-syne text-sm font-bold text-dark disabled:opacity-50"
              >
                <Plus size={15} /> Add
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
