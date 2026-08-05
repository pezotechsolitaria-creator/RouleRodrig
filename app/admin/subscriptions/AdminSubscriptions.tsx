"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, AlertTriangle, Search } from "lucide-react";

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

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch(`/api/admin/subscriptions?status=${encodeURIComponent(filter)}`);
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || "Failed to load merchants.");
      setMerchants(b.merchants);
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
                      onClick={() => act(m.id, "approve_merchant", { periodDays: 30 })}
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

              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" disabled={!!busy}
                  onClick={() => act(m.id, "approve_renewal", { periodDays: 30 })}
                  className="rounded-full bg-yellow px-3 py-1.5 font-dm text-xs font-medium text-dark hover:bg-yellow-dark disabled:opacity-50">
                  {busy === m.id + "approve_renewal" ? <Loader2 size={12} className="animate-spin" /> : "Approve renewal (+30d)"}
                </button>
                <button type="button" disabled={!!busy}
                  onClick={() => act(m.id, "reactivate", { periodDays: 30 })}
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
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
