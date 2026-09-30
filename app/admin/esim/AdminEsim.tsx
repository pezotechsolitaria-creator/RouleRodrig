"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, Link2, Mail, RotateCcw, Undo2, Webhook } from "lucide-react";

// ── The eSIM desk ────────────────────────────────────────────────────────────
// Three blocks, in the order the owner needs them: is anything WRONG (orders
// needing action come first), is the SUPPLIER healthy (balance, keys), and
// WHAT is on sale at what margin.

type Margin = { retailEurCents: number; costEurCents: number; paypalEurCents: number; netEurCents: number; marginRatio: number };
type Plan = {
  id: string;
  name: string;
  provider_code: string;
  data_mb: number;
  per_day: boolean;
  period_num: number | null;
  validity_days: number;
  covers_rodrigues: boolean;
  available: boolean;
  active: boolean;
  badge: string | null;
  sort_order: number;
  retail_eur_cents: number;
  retail_locked: boolean;
  country_codes: string[];
  networkLabels: string[];
  networks: { name: string }[];
  margin: Margin;
  hidden: boolean;
  /** This plan's place on the selected destination's shelf, if it has one. */
  listing: { badge: string | null; sort_order: number; auto: boolean } | null;
};
type Order = {
  id: string;
  ref: string;
  email: string;
  destination: string | null;
  status: string;
  retail_eur_cents: number;
  paid_eur_cents: number | null;
  iccid: string | null;
  esim_status: string | null;
  last_error: string | null;
  email_sent_at: string | null;
  created_at: string;
  plan_snapshot: { data_mb: number; validity_days: number; per_day: boolean };
  source: Record<string, string>;
};
type Desk = {
  provider: { id: string; configured: boolean; balanceUsdMicros: number | null; balanceError: string | null };
  webhookUrl: string;
  eurPerUsd: number;
  country: string;
  destinations: { code: string; name: string; flag: string; live: number }[];
  shelfIsManual: boolean;
  plans: Plan[];
  orders: Order[];
  totals: { delivered: number; revenueEurCents: number; netEurCents: number; needsAction: number };
};

const eur = (c: number) => `€${(c / 100).toFixed(2)}`;
const plan = (p: { data_mb: number; validity_days: number; per_day: boolean }) =>
  `${p.data_mb >= 1024 ? `${+(p.data_mb / 1024).toFixed(1)} GB` : `${p.data_mb} MB`}${p.per_day ? "/day" : ""} · ${p.validity_days} d`;

const STATUS: Record<string, string> = {
  delivered: "border-ok/40 bg-ok-dim text-ok",
  provisioning: "border-warn/40 bg-warn-dim text-warn",
  paid: "border-warn/40 bg-warn-dim text-warn",
  failed: "border-bad/40 bg-bad-dim text-bad",
  refunded: "border-white/15 text-muted",
  cancelled: "border-white/10 text-muted",
};

export default function AdminEsim() {
  const [desk, setDesk] = useState<Desk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [country, setCountry] = useState("MU");
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/esim?country=${encodeURIComponent(country)}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setDesk(j);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the desk.");
    }
  }, [country]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(key: string, body: Record<string, unknown>, done: (j: Record<string, unknown>) => string) {
    setBusy(key);
    try {
      const r = await fetch("/api/admin/esim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      toast.success(done(j));
      await load();
      return j;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  }

  if (error) return <p className="rounded-2xl border border-bad/40 bg-bad-dim p-4 font-dm text-sm text-bad">{error}</p>;
  if (!desk) return <Loader2 className="animate-spin text-yellow" />;

  const needs = desk.orders.filter((o) => o.status === "failed" || (o.status === "paid" && o.last_error));

  return (
    <div className="space-y-10">
      {/* ── Totals ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["eSIMs sold", String(desk.totals.delivered)],
          ["Revenue", eur(desk.totals.revenueEurCents)],
          ["Net after supplier + PayPal", eur(desk.totals.netEurCents)],
          ["Needs action", String(desk.totals.needsAction)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="font-dm text-xs text-muted">{k}</p>
            <p className="mt-1 font-syne text-2xl font-extrabold">{v}</p>
          </div>
        ))}
      </div>

      {/* ── Supplier ───────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-white/10 p-5">
        <h2 className="font-syne text-lg font-bold">Supplier: {desk.provider.id}</h2>
        {!desk.provider.configured ? (
          <p className="mt-2 font-dm text-sm text-warn">
            Not connected — the store shows plans but takes no orders. Add ESIM_ACCESS_CODE and ESIM_ACCESS_SECRET in
            Vercel → Settings → Environment Variables, then redeploy.
          </p>
        ) : (
          <p className="mt-2 font-dm text-sm text-offwhite/90">
            Balance:{" "}
            {desk.provider.balanceUsdMicros != null ? (
              <b className={desk.provider.balanceUsdMicros < 20_000_000 ? "text-bad" : "text-ok"}>
                ${(desk.provider.balanceUsdMicros / 1_000_000).toFixed(2)}
              </b>
            ) : (
              <span className="text-bad">{desk.provider.balanceError ?? "unknown"}</span>
            )}
            {desk.provider.balanceUsdMicros != null && desk.provider.balanceUsdMicros < 20_000_000 && (
              <span className="text-bad"> — top up soon: an order with no balance fails and must be refunded.</span>
            )}
          </p>
        )}
        <p className="mt-2 font-dm text-xs text-muted">
          Webhook URL: <code className="text-offwhite/80">{desk.webhookUrl}</code> · 1 USD = {desk.eurPerUsd.toFixed(3)} EUR
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() =>
              act("sync", { action: "sync" }, (j) => `Synced ${j.seen} packages: ${j.created} new (inactive), ${j.updated} updated, ${j.retired} retired.`)
            }
            disabled={!desk.provider.configured || busy !== null}
            className="inline-flex min-h-10 items-center gap-2 rounded-full bg-yellow px-4 font-syne text-sm font-bold text-dark disabled:opacity-50"
          >
            {busy === "sync" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Sync catalogue
          </button>
          <button
            onClick={() => act("webhook", { action: "webhook" }, (j) => `Webhook registered: ${j.url}`)}
            disabled={!desk.provider.configured || busy !== null}
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/15 px-4 font-dm text-sm disabled:opacity-50"
          >
            <Webhook size={14} /> Register webhook
          </button>
        </div>
      </section>

      {/* ── Orders ─────────────────────────────────────────────────────── */}
      <section>
        <h2 className="font-syne text-lg font-bold">Orders {needs.length > 0 && <span className="text-bad">· {needs.length} need action</span>}</h2>
        {desk.orders.length === 0 ? (
          <p className="mt-3 font-dm text-sm text-muted">No eSIM sold yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full min-w-[760px] text-left font-dm text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-white/10">
                  <th className="p-3">Order</th>
                  <th className="p-3">Customer</th>
                  <th className="p-3">Plan</th>
                  <th className="p-3">Paid</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {[...needs, ...desk.orders.filter((o) => !needs.includes(o))].map((o) => (
                  <tr key={o.id} className="border-b border-white/5 align-top">
                    <td className="p-3">
                      <b>{o.ref}</b>
                      <div className="text-xs text-muted">{new Date(o.created_at).toLocaleString("en-GB")}</div>
                      {o.source?.utm_source && <div className="text-xs text-muted">via {o.source.utm_source}</div>}
                    </td>
                    <td className="p-3">
                      {o.email}
                      {o.email_sent_at && <div className="text-xs text-muted">emailed ✓</div>}
                    </td>
                    <td className="p-3">
                      {o.destination && <span className="mr-1 text-xs text-muted">{o.destination}</span>}
                      {plan(o.plan_snapshot)}
                    </td>
                    <td className="p-3">{eur(o.paid_eur_cents ?? o.retail_eur_cents)}</td>
                    <td className="p-3">
                      <span className={`rounded-full border px-2 py-0.5 text-xs ${STATUS[o.status] ?? "border-white/10"}`}>{o.status}</span>
                      {o.esim_status && <div className="mt-1 text-xs text-muted">{o.esim_status}</div>}
                      {o.last_error && <div className="mt-1 max-w-[220px] text-xs text-bad">{o.last_error}</div>}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1.5">
                        {(o.status === "failed" || o.status === "paid" || o.status === "provisioning") && (
                          <SmallBtn icon={<RotateCcw size={12} />} label="Retry" busy={busy === `retry:${o.id}`} onClick={() => act(`retry:${o.id}`, { action: "retry", id: o.id }, (j) => `Now: ${j.status}`)} />
                        )}
                        {o.status === "delivered" && (
                          <SmallBtn icon={<Mail size={12} />} label="Resend" busy={busy === `resend:${o.id}`} onClick={() => act(`resend:${o.id}`, { action: "resend", id: o.id }, (j) => (j.sent ? "Email sent again." : "Email not sent — check the email log."))} />
                        )}
                        <SmallBtn
                          icon={<Link2 size={12} />}
                          label="Link"
                          busy={busy === `link:${o.id}`}
                          onClick={async () => {
                            const j = await act(`link:${o.id}`, { action: "link", id: o.id }, () => "Customer link copied.");
                            if (j?.url) await navigator.clipboard.writeText(String(j.url)).catch(() => {});
                          }}
                        />
                        {o.status !== "refunded" && o.status !== "cancelled" && o.status !== "pending_payment" && (
                          <SmallBtn
                            icon={<Undo2 size={12} />}
                            label="Refund"
                            danger
                            busy={busy === `refund:${o.id}`}
                            onClick={() => {
                              if (!confirm(`Refund ${o.ref} in full (${eur(o.paid_eur_cents ?? o.retail_eur_cents)}) to the customer? If the eSIM was never installed, it is cancelled and the supplier refunds you too.`)) return;
                              act(`refund:${o.id}`, { action: "refund", id: o.id }, (j) =>
                                j.profileCancelled ? "Refunded — eSIM cancelled, supplier balance refunded." : "Refunded to the customer.",
                              );
                            }}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Shelves: one per destination (M224) ────────────────────────── */}
      <section>
        <h2 className="font-syne text-lg font-bold">Shelves</h2>
        <p className="mt-1 max-w-3xl font-dm text-xs text-muted">
          Each destination page sells the plans on its shelf. Mauritius &amp; Rodrigues is yours alone and only takes
          plans that reach Rodrigues (my.t / Emtel). Every other shelf is stocked automatically after each sync — until
          you change it, then it is yours; &ldquo;Reset to automatic&rdquo; hands it back. Net = price − supplier cost −
          PayPal (5.4% + €0.35, deliberately pessimistic). A price you type is never changed by a sync.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="font-dm text-sm">
            <span className="sr-only">Destination</span>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="min-h-10 rounded-xl border border-dark-border bg-dark-card px-3 text-offwhite"
            >
              {desk.destinations.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.flag} {d.name} {d.live ? `· ${d.live} on sale` : "· empty"}
                </option>
              ))}
            </select>
          </label>
          {desk.country !== "MU" && (
            <span className="rounded-full border border-white/15 px-2.5 py-1 font-dm text-xs text-muted">
              {desk.shelfIsManual ? "Curated by you" : "Automatic"}
            </span>
          )}
          {desk.country !== "MU" && desk.shelfIsManual && (
            <button
              onClick={() => act(`curate:${desk.country}`, { action: "curate", country: desk.country }, (j) => `Reset: ${Object.values(j)[0]} plans picked.`)}
              disabled={busy !== null}
              className="min-h-10 rounded-full border border-white/15 px-3 font-dm text-xs disabled:opacity-50"
            >
              Reset to automatic
            </button>
          )}
          <label className="ml-auto flex items-center gap-2 font-dm text-xs text-muted">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
            Show every plan that works here ({desk.plans.length})
          </label>
        </div>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[900px] text-left font-dm text-sm">
            <thead className="text-xs text-muted">
              <tr className="border-b border-white/10">
                <th className="p-3">On shelf</th>
                <th className="p-3">Plan</th>
                <th className="p-3">{desk.country === "MU" ? "Rodrigues" : "Networks"}</th>
                <th className="p-3">Cost</th>
                <th className="p-3">Price €</th>
                <th className="p-3">Net</th>
                <th className="p-3">Badge</th>
                <th className="p-3">On sale</th>
              </tr>
            </thead>
            <tbody>
              {desk.plans
                .filter((p) => showAll || p.listing)
                .sort((a, b) => (a.listing?.sort_order ?? 1e6) - (b.listing?.sort_order ?? 1e6) || a.retail_eur_cents - b.retail_eur_cents)
                .map((p) => (
                  <PlanRow key={p.id} p={p} country={desk.country} busy={busy} act={act} />
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function PlanRow({
  p,
  country,
  busy,
  act,
}: {
  p: Plan;
  country: string;
  busy: string | null;
  act: (key: string, body: Record<string, unknown>, done: (j: Record<string, unknown>) => string) => Promise<unknown>;
}) {
  const [price, setPrice] = useState((p.retail_eur_cents / 100).toFixed(2));
  const cents = Math.round(Number(price.replace(",", ".")) * 100);
  const changed = Number.isFinite(cents) && cents !== p.retail_eur_cents;
  const home = country === "MU";
  const listed = !!p.listing;
  // A plan that cannot reach Rodrigues can never go on the Mauritius shelf.
  const canList = p.available && (!home || p.covers_rodrigues);
  return (
    <tr className={`border-b border-white/5 align-top ${listed && p.active ? "" : "opacity-70"}`}>
      <td className="p-3">
        <input
          type="checkbox"
          checked={listed}
          disabled={busy !== null || (!listed && !canList)}
          onChange={() =>
            act(`list:${p.id}`, { action: "listing", country, planId: p.id, listed: !listed, badge: p.listing?.badge ?? null }, () =>
              listed ? "Taken off this shelf." : "Put on this shelf.",
            )
          }
          aria-label={`${listed ? "Remove from" : "Add to"} this shelf: ${plan(p)}`}
          className="h-5 w-5"
        />
        {p.listing?.auto && <div className="mt-1 text-[10px] text-muted">auto</div>}
      </td>
      <td className="p-3">
        <b>{plan(p)}</b>
        <div className="text-xs text-muted">{p.provider_code}{p.period_num ? ` × ${p.period_num}` : ""}{p.country_codes.length > 1 ? ` · ${p.country_codes.length} countries` : ""}</div>
        {!p.available && <div className="text-xs text-bad">withdrawn by supplier</div>}
        {p.hidden && <div className="text-xs text-warn">switched off by you</div>}
      </td>
      <td className="p-3">
        {home ? (
          p.covers_rodrigues ? (
            <span className="text-ok">✓ {p.networkLabels.join(", ")}</span>
          ) : (
            <span className="text-bad">✗ {p.networks.map((n) => n.name).join(", ") || "no network listed"}</span>
          )
        ) : (
          <span className="text-offwhite/80">{p.networkLabels.slice(0, 3).join(", ") || "—"}</span>
        )}
      </td>
      <td className="p-3">{eur(p.margin.costEurCents)}</td>
      <td className="p-3">
        <div className="flex items-center gap-1.5">
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
            aria-label={`Price for ${plan(p)}`}
            className="w-20 rounded-lg border border-dark-border bg-dark-card px-2 py-1.5 text-offwhite focus:border-yellow focus:outline-none"
          />
          {changed && (
            <button
              onClick={() => act(`price:${p.id}`, { action: "plan", id: p.id, retail_eur_cents: cents }, () => "Price saved (on every shelf).")}
              disabled={busy !== null}
              className="rounded-full bg-yellow px-2.5 py-1 text-xs font-bold text-dark"
            >
              Save
            </button>
          )}
        </div>
      </td>
      <td className={`p-3 ${p.margin.netEurCents < 100 ? "text-bad" : "text-ok"}`}>
        {eur(p.margin.netEurCents)} <span className="text-xs text-muted">({Math.round(p.margin.marginRatio * 100)}%)</span>
      </td>
      <td className="p-3">
        <select
          value={p.listing?.badge ?? ""}
          disabled={!listed || busy !== null}
          onChange={(e) =>
            act(`badge:${p.id}`, { action: "listing", country, planId: p.id, listed: true, badge: e.target.value || null, sort: p.listing?.sort_order }, () => "Badge saved.")
          }
          className="rounded-lg border border-dark-border bg-dark-card px-2 py-1.5 text-offwhite disabled:opacity-40"
        >
          <option value="">—</option>
          <option value="popular">Our pick</option>
          <option value="best_value">Best value</option>
          <option value="short_trip">Short stay</option>
          <option value="long_stay">Heavy use</option>
        </select>
      </td>
      <td className="p-3">
        <button
          onClick={() => act(`active:${p.id}`, { action: "plan", id: p.id, active: !p.active }, () => (p.active ? "Taken off sale everywhere." : "On sale."))}
          disabled={busy !== null || (!p.active && !p.available)}
          className={`min-h-9 rounded-full px-3 text-xs font-bold ${p.active ? "bg-ok-dim text-ok" : "border border-white/15 text-muted"} disabled:opacity-40`}
        >
          {p.active ? "On sale" : "Off"}
        </button>
      </td>
    </tr>
  );
}

function SmallBtn({ icon, label, onClick, busy, danger }: { icon: React.ReactNode; label: string; onClick: () => void; busy?: boolean; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`inline-flex min-h-8 items-center gap-1 rounded-full border px-2.5 text-xs ${danger ? "border-bad/40 text-bad" : "border-white/15 text-offwhite/90"} disabled:opacity-50`}
    >
      {busy ? <Loader2 size={12} className="animate-spin" /> : icon} {label}
    </button>
  );
}
