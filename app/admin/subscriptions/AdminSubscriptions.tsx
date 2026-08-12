"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, AlertTriangle, Search } from "lucide-react";
import { centsToDecimalString, toCents } from "@/lib/money";

// Rupees in, minor units out. toCents parses the string without touching a
// float, so "750.05" cannot land as 75004.999999.
function feeToCents(input: string): number | null {
  try {
    return toCents(input.trim());
  } catch {
    return null;
  }
}

type Sub = { plan: string; status: string; current_period_end: string; grace_days: number; started_at: string };
type Merchant = {
  id: string; display_name: string; contact_email: string | null; status: string; created_at: string;
  merchant_subscriptions: Sub | Sub[] | null;
  stores: { id: string; name: string; slug: string; status: string }[] | null;
};

const DAY = 86_400_000;

function subOf(m: Merchant): Sub | null {
  const s = Array.isArray(m.merchant_subscriptions) ? m.merchant_subscriptions[0] : m.merchant_subscriptions;
  return s ?? null;
}

// Mirrors merchant_subscription_active() in SQL, which is the authority.
function selling(s: Sub | null): { label: string; tone: string } {
  if (!s) return { label: "No plan (selling)", tone: "text-muted" };
  const end = new Date(s.current_period_end).getTime();
  const graceEnd = end + s.grace_days * DAY;
  const allows = ["trialing", "active", "past_due"].includes(s.status);
  if (!allows) return { label: "Blocked", tone: "text-red-400" };
  if (Date.now() > graceEnd) return { label: "Expired", tone: "text-red-400" };
  if (Date.now() > end) return { label: `Grace (${Math.ceil((graceEnd - Date.now()) / DAY)}d)`, tone: "text-orange-300" };
  return { label: `Active (${Math.ceil((end - Date.now()) / DAY)}d)`, tone: "text-green-400" };
}

export default function AdminSubscriptions() {
  const [merchants, setMerchants] = useState<Merchant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  // How many days a renewal grants, per merchant. The API has accepted
  // periodDays (1–366) all along; every button here hardcoded 30, so a
  // three-month deal or a two-week extension had to be clicked repeatedly.
  const [days, setDays] = useState<Record<string, number>>({});
  const daysFor = (id: string) => days[id] ?? 30;
  // Monthly price per plan, in minor units. Renewals default to these; a plan
  // left at 0 is why billing history used to read "Rs 0.00" for every renewal.
  const [planPrices, setPlanPrices] = useState<Record<string, number>>({
    starter: 0, standard: 0, premium: 0,
  });

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch(`/api/admin/subscriptions?status=${encodeURIComponent(filter)}`);
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || "Failed to load merchants.");
      setMerchants(b.merchants);
      setPlanPrices(b.planPrices ?? { starter: 0, standard: 0, premium: 0 });
    } catch (e) {
      setMerchants(null);
      setError(e instanceof Error ? e.message : "Failed to load merchants.");
    }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  async function act(merchantId: string, action: string, extra: Record<string, unknown> = {}) {
    setBusy(merchantId + action);
    try {
      const r = await fetch("/api/admin/subscriptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchantId, action, ...extra }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || "That didn't work.");
      toast.success("Done.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  }

  // "I tried to clear test but I could not." — there was no remove button at
  // all. Now there is one, and it tries the honest delete first: type the name,
  // and if the merchant never traded it and everything under it really is gone.
  // If it HAS traded the server answers 409 with what is in the way, and the
  // operator is offered the archive that keeps the money records intact.
  async function removeMerchant(m: Merchant) {
    const typed = prompt(
      `Remove "${m.display_name}"?\n\n` +
        `If this merchant has never taken an order, it is deleted for good — shops, products, ` +
        `hours and photos included. If it has, nothing is deleted and you will be offered to ` +
        `archive it instead.\n\nType the merchant name to confirm:`,
      "",
    );
    if (typed === null) return;

    setBusy(m.id + "delete");
    try {
      const r = await fetch(
        `/api/admin/subscriptions?merchantId=${encodeURIComponent(m.id)}&confirm=${encodeURIComponent(typed)}`,
        { method: "DELETE" },
      );
      const b = await r.json().catch(() => ({}));

      if (r.status === 409 && b.suggestion === "archive") {
        if (confirm(`${b.error}\n\nArchive it instead? The shops come off the site immediately.`)) {
          const a = await fetch(
            `/api/admin/subscriptions?merchantId=${encodeURIComponent(m.id)}&mode=archive`,
            { method: "DELETE" },
          );
          const ab = await a.json().catch(() => ({}));
          if (!a.ok) throw new Error(ab.error || "Could not archive that merchant.");
          toast.success("Archived — shops are off the site, records kept.");
          await load();
        }
        return;
      }

      if (!r.ok) throw new Error(b.error || "Could not remove that merchant.");
      toast.success(`"${m.display_name}" deleted.`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove that merchant.");
    } finally {
      setBusy(null);
    }
  }

  const visible = (merchants ?? []).filter((m) =>
    !q.trim() || m.display_name.toLowerCase().includes(q.toLowerCase()) ||
    (m.contact_email ?? "").toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search merchants…" aria-label="Search merchants"
            className="w-full rounded-xl border border-dark-border bg-dark-card py-2.5 pl-8 pr-3 font-dm text-sm text-offwhite placeholder:text-muted/50 focus:border-yellow focus:outline-none"
          />
        </div>
        <select
          value={filter} onChange={(e) => setFilter(e.target.value)}
          aria-label="Filter by merchant status"
          className="rounded-xl border border-dark-border bg-dark-card px-3 py-2.5 font-dm text-sm text-offwhite focus:border-yellow focus:outline-none"
        >
          {["all", "pending", "approved", "suspended"].map((s) => (
            <option key={s} value={s}>{s === "all" ? "All merchants" : s}</option>
          ))}
        </select>
        <button
          type="button" onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-2.5 font-dm text-sm text-offwhite hover:border-yellow/50 hover:text-yellow"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && (
        <div role="alert" className="mt-4 rounded-xl border border-red-500/25 bg-red-500/[0.05] p-4 text-center">
          <AlertTriangle className="mx-auto text-red-400" size={20} />
          <p className="mt-1.5 font-dm text-sm text-red-400">{error}</p>
        </div>
      )}

      {!merchants && !error && (
        <p className="mt-6 font-dm text-sm text-muted" aria-busy="true">Loading merchants…</p>
      )}

      {merchants && visible.length === 0 && (
        <p className="mt-6 font-dm text-sm text-muted">No merchants match.</p>
      )}

      <div className="mt-4 space-y-2">
        {visible.map((m) => {
          const s = subOf(m);
          const state = selling(s);
          const store = m.stores?.[0];
          return (
            <div key={m.id} className="rounded-xl border border-white/10 bg-dark-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-dm text-sm font-medium text-offwhite">{m.display_name}</p>
                  <p className="font-dm text-xs text-muted">{m.contact_email ?? "—"}</p>
                  {store && <p className="font-dm text-xs text-muted/70">Shop: {store.name} ({store.status})</p>}
                </div>
                <div className="text-right">
                  <p className={`font-dm text-sm ${state.tone}`}>{state.label}</p>
                  <p className="font-dm text-xs text-muted">
                    {s ? `${s.plan} · ends ${new Date(s.current_period_end).toLocaleDateString()}` : "no subscription row"}
                  </p>
                  <p className={`font-dm text-xs ${m.status === "approved" ? "text-green-400" : m.status === "pending" ? "text-orange-300" : "text-red-400"}`}>
                    {m.status}
                  </p>
                </div>
              </div>

              {/* A shop stays invisible to customers until it is approved —
                  store_is_visible() requires merchants.status = 'approved'. */}
              {m.status !== "approved" && (
                <div className="mt-3 rounded-lg border border-orange-400/25 bg-orange-400/[0.05] px-3 py-2">
                  <p className="font-dm text-xs text-orange-200">
                    This shop is <strong>{m.status}</strong> — customers cannot see it or order from it.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" disabled={!!busy}
                      onClick={() => act(m.id, "approve_merchant", { periodDays: daysFor(m.id) })}
                      className="rounded-full bg-green-500/20 px-3 py-1.5 font-dm text-xs font-medium text-green-300 hover:bg-green-500/30 disabled:opacity-50">
                      {busy === m.id + "approve_merchant"
                        ? <Loader2 size={12} className="animate-spin" />
                        : "Approve shop (opens 30-day trial)"}
                    </button>
                    {m.status !== "rejected" && (
                      <button type="button" disabled={!!busy}
                        onClick={() => act(m.id, "reject_merchant")}
                        className="rounded-full border border-white/15 px-3 py-1.5 font-dm text-xs text-muted hover:border-red-500/50 hover:text-red-400 disabled:opacity-50">
                        Reject
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="mt-3 flex items-center gap-2">
                <label htmlFor={`days-${m.id}`} className="font-dm text-xs text-muted">
                  Active days
                </label>
                <input
                  id={`days-${m.id}`}
                  type="number"
                  min={1}
                  max={366}
                  value={daysFor(m.id)}
                  onChange={(e) => {
                    // Clamped to the same 1–366 the API enforces, so the field
                    // cannot ask for something the server will reject.
                    const n = Number.parseInt(e.target.value, 10);
                    setDays((d) => ({ ...d, [m.id]: Number.isNaN(n) ? 30 : Math.min(366, Math.max(1, n)) }));
                  }}
                  className="w-20 rounded-lg border border-white/15 bg-dark px-2 py-1 font-dm text-xs text-offwhite"
                />
                <span className="font-dm text-xs text-muted">
                  applied to renewal, reactivate and trial
                </span>
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" disabled={!!busy}
                  onClick={() => {
                    // Pre-filled from the configured plan price so the invoice
                    // records what was actually charged, but overridable for a
                    // pro-rata, discounted or partial payment.
                    const plan = s?.plan ?? "starter";
                    const suggested = planPrices[plan] ?? 0;
                    const entered = prompt(
                      `Amount received for this ${plan} renewal, in rupees.\n` +
                        (suggested > 0
                          ? `Leave as-is to record the standard ${plan} price.`
                          : `No price is configured for ${plan} yet — enter what was paid.`),
                      centsToDecimalString(suggested),
                    );
                    if (entered === null) return; // cancelled
                    const cents = feeToCents(entered);
                    if (cents === null) return toast.error("Enter an amount like 750 or 750.50.");
                    act(m.id, "approve_renewal", { periodDays: daysFor(m.id), amount: cents });
                  }}
                  className="rounded-full bg-yellow px-3 py-1.5 font-dm text-xs font-medium text-dark hover:bg-yellow-dark disabled:opacity-50">
                  {busy === m.id + "approve_renewal" ? <Loader2 size={12} className="animate-spin" /> : `Approve renewal (+${daysFor(m.id)}d)`}
                </button>
                <button type="button" disabled={!!busy}
                  onClick={() => act(m.id, "reactivate", { periodDays: daysFor(m.id) })}
                  className="rounded-full border border-white/15 px-3 py-1.5 font-dm text-xs text-offwhite hover:border-green-400/50 hover:text-green-400 disabled:opacity-50">
                  Reactivate
                </button>
                <button type="button" disabled={!!busy}
                  onClick={() => act(m.id, "suspend")}
                  className="rounded-full border border-white/15 px-3 py-1.5 font-dm text-xs text-offwhite hover:border-red-500/50 hover:text-red-400 disabled:opacity-50">
                  Suspend
                </button>
                <select
                  aria-label={`Plan for ${m.display_name}`}
                  value={s?.plan ?? "starter"} disabled={!!busy}
                  onChange={(e) => act(m.id, "set_plan", { plan: e.target.value })}
                  className="rounded-full border border-white/15 bg-dark px-3 py-1.5 font-dm text-xs text-offwhite focus:border-yellow focus:outline-none"
                >
                  {["starter", "standard", "premium"].map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                {/* Trial controls. merchant_subscription_active() already counts
                    'trialing' as selling, so these only move status + window. */}
                {s?.status !== "trialing" ? (
                  <button type="button" disabled={!!busy}
                    onClick={() => act(m.id, "start_trial", { periodDays: daysFor(m.id) })}
                    className="rounded-full border border-white/15 px-3 py-1.5 font-dm text-xs text-offwhite hover:border-yellow/50 hover:text-yellow disabled:opacity-50">
                    Start trial
                  </button>
                ) : (
                  <button type="button" disabled={!!busy}
                    onClick={() => act(m.id, "end_trial")}
                    className="rounded-full border border-white/15 px-3 py-1.5 font-dm text-xs text-offwhite hover:border-yellow/50 hover:text-yellow disabled:opacity-50">
                    End trial
                  </button>
                )}
                {/* Cancel is the merchant leaving, not a platform sanction —
                    hence the confirm and the separate wording from Suspend. */}
                {s?.status !== "cancelled" && (
                  <button type="button" disabled={!!busy}
                    onClick={() => {
                      if (confirm(`Cancel ${m.display_name}'s subscription? Their shop stops selling once the current period ends.`)) {
                        act(m.id, "cancel");
                      }
                    }}
                    className="rounded-full border border-white/15 px-3 py-1.5 font-dm text-xs text-muted hover:border-red-500/50 hover:text-red-400 disabled:opacity-50">
                    Cancel
                  </button>
                )}
                {/* Clearing a merchant. Two different actions behind one button
                    on purpose: the operator says "remove this", and the server
                    decides whether that can be a real delete (never traded) or
                    must be an archive (orders exist, and three RESTRICT foreign
                    keys would refuse anyway). Asking them to know the
                    difference in advance is asking them to know the schema. */}
                <button type="button" disabled={!!busy}
                  onClick={() => removeMerchant(m)}
                  className="ml-auto rounded-full border border-red-500/30 px-3 py-1.5 font-dm text-xs text-red-300 hover:border-red-500 hover:bg-red-500/10 disabled:opacity-50">
                  {busy === m.id + "delete" ? <Loader2 size={12} className="animate-spin" /> : "Remove…"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
