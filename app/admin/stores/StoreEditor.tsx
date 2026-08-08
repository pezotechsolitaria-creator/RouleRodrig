"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, AlertTriangle, Check, Store, Landmark, Truck, Clock, BadgeCheck } from "lucide-react";
import {
  WEEK_ORDER, WEEKDAYS, hhmm, validateWeek, defaultWeek, type DaySchedule,
} from "@/lib/schedule";
import { centsToDecimalString } from "@/lib/money";
import DeleteShopPanel from "./DeleteShopPanel";

type Profile = {
  name: string; tagline: string | null; description: string | null;
  phone: string | null; whatsapp: string | null; address: string | null;
  lat: number | null; lng: number | null; logo_url: string | null; status: string;
  featured: boolean; featured_until: string | null;
};
type Payment = {
  accepts_cash: boolean; accepts_bank_transfer: boolean;
  bank_name: string | null; account_holder: string | null; account_number: string | null;
  payment_instructions: string | null; require_receipt: boolean;
  offers_rr_delivery: boolean; offers_pickup: boolean; offers_customer_delivery: boolean;
};
type Invoice = {
  id: string; plan: string; amount: number; currency: string;
  period_start: string | null; period_end: string | null; status: string; paid_at: string | null;
};
type Merchant = {
  id: string; display_name: string; contact_email: string | null; status: string;
  merchant_subscriptions: {
    plan: string; status: string; started_at: string;
    current_period_end: string; grace_days: number; cancelled_at: string | null;
  } | null;
};

type Tab = "details" | "banking" | "features" | "hours" | "merchant";

const STORE_STATUSES = ["draft", "active", "paused", "holiday", "closed"] as const;

const input =
  "w-full rounded-lg border border-dark-border bg-dark px-3 py-2 font-dm text-sm text-offwhite focus:border-yellow focus:outline-none";

function Field({ label, htmlFor, children, hint }: {
  label: string; htmlFor: string; children: React.ReactNode; hint?: string;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block font-dm text-xs text-muted">{label}</label>
      {children}
      {hint && <p className="mt-1 font-dm text-[11px] text-muted/70">{hint}</p>}
    </div>
  );
}

function fmtDate(v: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function StoreEditor({
  storeId, storeName, onClose, onSaved,
}: { storeId: string; storeName: string; onClose: () => void; onSaved: () => void }) {
  const [tab, setTab] = useState<Tab>("details");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [week, setWeek] = useState<DaySchedule[] | null>(null);
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/stores/${storeId}`)
      .then(async (r) => {
        const b = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(b.error || "Couldn't load that shop.");
        return b;
      })
      .then((b) => {
        if (cancelled) return;
        setProfile({ ...b.store });
        setPayment(b.payment);
        setMerchant(b.merchant);
        setInvoices(b.invoices ?? []);
        // Only fall back to a default week when the read SUCCEEDED and the shop
        // genuinely has no hours. Seeding a fabricated week after a FAILED read
        // would let Save overwrite the shop's real schedule with an invention.
        const days: DaySchedule[] = (b.days ?? []).map((d: DaySchedule) => ({
          ...d,
          opens_at: hhmm(d.opens_at) || null,
          closes_at: hhmm(d.closes_at) || null,
          delivery_opens_at: hhmm(d.delivery_opens_at) || null,
          delivery_closes_at: hhmm(d.delivery_closes_at) || null,
        }));
        const byDay = new Map(days.map((d) => [d.weekday, d]));
        setWeek(
          days.length
            ? WEEK_ORDER.map((wd) => byDay.get(wd) ?? {
                weekday: wd, is_closed: true, opens_at: null, closes_at: null,
                delivery_opens_at: null, delivery_closes_at: null, delivery_closed: false,
              })
            : defaultWeek(),
        );
      })
      .catch((e) => { if (!cancelled) setLoadError(e instanceof Error ? e.message : "Couldn't load that shop."); });
    return () => { cancelled = true; };
  }, [storeId]);

  async function send(body: Record<string, unknown>, what: string) {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/stores", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, ...body }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || "Couldn't save.");
      toast.success(`${what} saved.`);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  async function saveHours() {
    if (!week) return;
    const err = validateWeek(week);
    if (err) return toast.error(err);
    setBusy(true);
    try {
      const r = await fetch("/api/admin/stores", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, days: week }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || "Couldn't save.");
      toast.success("Opening hours saved.");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/[0.06] p-4">
        <p className="flex items-center gap-2 font-dm text-sm text-red-300">
          <AlertTriangle size={15} /> {loadError}
        </p>
        <button onClick={onClose} className="mt-3 rounded-full border border-white/15 px-3 py-1.5 font-dm text-xs text-muted hover:text-offwhite">
          Close
        </button>
      </div>
    );
  }

  if (!profile || !payment || !week) {
    return (
      <p className="flex items-center gap-2 font-dm text-sm text-muted" aria-busy="true">
        <Loader2 size={14} className="animate-spin" /> Loading {storeName}…
      </p>
    );
  }

  const weekError = validateWeek(week);
  const sub = merchant?.merchant_subscriptions ?? null;

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "details", label: "Details", icon: Store },
    { id: "banking", label: "Banking", icon: Landmark },
    { id: "features", label: "Features", icon: Truck },
    { id: "hours", label: "Hours", icon: Clock },
    { id: "merchant", label: "Merchant", icon: BadgeCheck },
  ];

  return (
    <div className="rounded-xl border border-yellow/25 bg-dark/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label={`Editing ${storeName}`} className="flex flex-wrap gap-1.5">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id} role="tab" type="button"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-dm text-xs transition-colors ${
                tab === id ? "border-yellow bg-yellow/10 text-yellow" : "border-white/15 text-muted hover:text-offwhite"
              }`}
            >
              <Icon size={12} /> {label}
            </button>
          ))}
        </div>
        <button type="button" onClick={onClose} className="rounded-full border border-white/15 px-3 py-1.5 font-dm text-xs text-muted hover:text-offwhite">
          Close
        </button>
      </div>

      <div className="mt-4">
        {tab === "details" && (
          <div className="space-y-3">
            <Field label="Shop name" htmlFor="e-name">
              <input id="e-name" className={input} value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
            </Field>
            <Field label="Tagline" htmlFor="e-tag">
              <input id="e-tag" className={input} value={profile.tagline ?? ""}
                onChange={(e) => setProfile({ ...profile, tagline: e.target.value })} />
            </Field>
            <Field label="Description" htmlFor="e-desc">
              <textarea id="e-desc" rows={3} className={input} value={profile.description ?? ""}
                onChange={(e) => setProfile({ ...profile, description: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone" htmlFor="e-phone">
                <input id="e-phone" className={input} value={profile.phone ?? ""}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
              </Field>
              <Field label="WhatsApp" htmlFor="e-wa">
                <input id="e-wa" className={input} value={profile.whatsapp ?? ""}
                  onChange={(e) => setProfile({ ...profile, whatsapp: e.target.value })} />
              </Field>
            </div>
            <Field label="Address" htmlFor="e-addr">
              <input id="e-addr" className={input} value={profile.address ?? ""}
                onChange={(e) => setProfile({ ...profile, address: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Latitude" htmlFor="e-lat" hint="Rodrigues is around -19.7">
                <input id="e-lat" inputMode="decimal" className={input} value={profile.lat ?? ""}
                  onChange={(e) => setProfile({ ...profile, lat: e.target.value === "" ? null : Number(e.target.value) })} />
              </Field>
              <Field label="Longitude" htmlFor="e-lng" hint="Rodrigues is around 63.4">
                <input id="e-lng" inputMode="decimal" className={input} value={profile.lng ?? ""}
                  onChange={(e) => setProfile({ ...profile, lng: e.target.value === "" ? null : Number(e.target.value) })} />
              </Field>
            </div>
            {profile.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.logo_url} alt={`${profile.name} logo`} className="h-14 w-14 rounded-xl object-cover" />
            )}
            <Field label="Shop visibility" htmlFor="e-status"
              hint="Separate from merchant approval — a shop can be approved but paused.">
              <select id="e-status" className={input} value={profile.status}
                onChange={(e) => setProfile({ ...profile, status: e.target.value })}>
                {STORE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>

            {/* Featuring is the only promotional lever at launch — the platform
                ships on ONE subscription tier, so there is no "premium plan" to
                buy placement with. Saved on its own rather than with the profile
                block: promoting a shop is a commercial decision, and bundling it
                into "Shop details" would make it an easy accidental side effect
                of renaming a shop. */}
            <Field label="Featured shop" htmlFor="e-featured"
              hint="Sorts this shop to the top of the public directory. A shop that can't take orders is never promoted above one that can.">
              <label className="flex items-center gap-2.5">
                <input
                  id="e-featured"
                  type="checkbox"
                  className="h-4 w-4 accent-yellow"
                  checked={profile.featured}
                  onChange={(e) => setProfile({ ...profile, featured: e.target.checked })}
                />
                <span className="text-sm text-offwhite">Feature this shop</span>
              </label>
            </Field>

            {profile.featured && (
              <Field label="Featured until (optional)" htmlFor="e-featured-until"
                hint="Leave blank to feature indefinitely. An end date is safer — a promotion with no expiry quietly becomes permanent.">
                <input
                  id="e-featured-until"
                  type="datetime-local"
                  className={input}
                  value={profile.featured_until ? profile.featured_until.slice(0, 16) : ""}
                  onChange={(e) => setProfile({ ...profile, featured_until: e.target.value || null })}
                />
              </Field>
            )}

            {/* The stored flag and the EFFECTIVE state are different things once
                an expiry is in the past, and an admin looking at a ticked box
                needs to know which one they are seeing. */}
            {profile.featured && profile.featured_until && new Date(profile.featured_until) <= new Date() && (
              <p className="-mt-1 text-xs text-yellow/90">
                This promotion expired on{" "}
                {new Date(profile.featured_until).toLocaleString("en-GB", {
                  timeZone: "Indian/Mauritius", day: "numeric", month: "short", year: "numeric",
                  hour: "2-digit", minute: "2-digit",
                })}{" "}
                — the shop is no longer featured in the directory. Clear the date or untick to tidy up.
              </p>
            )}

            <button type="button" disabled={busy}
              onClick={() => send({
                featured: {
                  on: profile.featured,
                  until: profile.featured && profile.featured_until ? profile.featured_until : null,
                },
              }, "Featured")}
              className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-offwhite transition-colors hover:bg-white/15 disabled:opacity-50">
              Save featured
            </button>
            <button type="button" disabled={busy}
              onClick={() => send({
                profile: {
                  name: profile.name, tagline: profile.tagline, description: profile.description,
                  phone: profile.phone, whatsapp: profile.whatsapp, address: profile.address,
                  lat: profile.lat, lng: profile.lng,
                },
                status: profile.status as (typeof STORE_STATUSES)[number],
              }, "Shop details")}
              className="inline-flex items-center gap-1.5 rounded-full bg-yellow px-4 py-2 font-dm text-xs font-medium text-dark hover:bg-yellow-dark disabled:opacity-50">
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save details
            </button>
          </div>
        )}

        {tab === "banking" && (
          <div className="space-y-3">
            <p className="font-dm text-xs text-muted">
              These are the details a customer sees when paying by bank transfer. Switching bank transfer
              on without all three is refused by the database.
            </p>
            <div className="flex flex-wrap gap-4">
              {([["accepts_cash", "Accepts cash"], ["accepts_bank_transfer", "Accepts bank transfer"], ["require_receipt", "Require receipt"]] as const).map(([k, label]) => (
                <label key={k} className="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={payment[k]} className="accent-yellow"
                    onChange={(e) => setPayment({ ...payment, [k]: e.target.checked })} />
                  <span className="font-dm text-xs text-offwhite">{label}</span>
                </label>
              ))}
            </div>
            <Field label="Bank name" htmlFor="e-bank">
              <input id="e-bank" className={input} value={payment.bank_name ?? ""}
                onChange={(e) => setPayment({ ...payment, bank_name: e.target.value })} />
            </Field>
            <Field label="Account holder" htmlFor="e-holder">
              <input id="e-holder" className={input} value={payment.account_holder ?? ""}
                onChange={(e) => setPayment({ ...payment, account_holder: e.target.value })} />
            </Field>
            <Field label="Account number" htmlFor="e-acct">
              <input id="e-acct" className={input} value={payment.account_number ?? ""}
                onChange={(e) => setPayment({ ...payment, account_number: e.target.value })} />
            </Field>
            <Field label="Payment instructions" htmlFor="e-instr">
              <textarea id="e-instr" rows={2} className={input} value={payment.payment_instructions ?? ""}
                onChange={(e) => setPayment({ ...payment, payment_instructions: e.target.value })} />
            </Field>
            <button type="button" disabled={busy}
              onClick={() => send({ payment }, "Banking")}
              className="inline-flex items-center gap-1.5 rounded-full bg-yellow px-4 py-2 font-dm text-xs font-medium text-dark hover:bg-yellow-dark disabled:opacity-50">
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save banking
            </button>
          </div>
        )}

        {tab === "features" && (
          <div className="space-y-3">
            <p className="font-dm text-xs text-muted">
              Which ways this shop can fulfil an order. create_order() refuses anything switched off here,
              so these take effect at checkout immediately.
            </p>
            {([
              ["offers_rr_delivery", "Roulé Rodrigues delivery", "Our team delivers; the platform sets the fee by zone."],
              ["offers_pickup", "Pickup", "Customer collects in person."],
              ["offers_customer_delivery", "Customer's own driver", "Customer sends someone to collect."],
            ] as const).map(([k, label, hint]) => (
              <label key={k} className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-white/10 px-3 py-2.5">
                <input type="checkbox" checked={payment[k]} className="mt-0.5 accent-yellow"
                  onChange={(e) => setPayment({ ...payment, [k]: e.target.checked })} />
                <span>
                  <span className="block font-dm text-sm text-offwhite">{label}</span>
                  <span className="block font-dm text-xs text-muted">{hint}</span>
                </span>
              </label>
            ))}
            {!payment.offers_rr_delivery && !payment.offers_pickup && !payment.offers_customer_delivery && (
              <p role="alert" className="font-dm text-xs text-red-400">
                With all three off, this shop cannot take any order at all.
              </p>
            )}
            <button type="button" disabled={busy}
              onClick={() => send({ payment }, "Features")}
              className="inline-flex items-center gap-1.5 rounded-full bg-yellow px-4 py-2 font-dm text-xs font-medium text-dark hover:bg-yellow-dark disabled:opacity-50">
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save features
            </button>
          </div>
        )}

        {tab === "hours" && (
          <div className="space-y-2">
            <p className="font-dm text-xs text-muted">
              Rodrigues local time. Delivery times may be narrowed inside the shop&apos;s own hours; leave them
              blank to deliver whenever open.
            </p>
            <ul className="space-y-2">
              {week.map((d) => (
                <li key={d.weekday} className="rounded-lg border border-white/10 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-20 shrink-0 font-dm text-xs text-offwhite">{WEEKDAYS[d.weekday]}</span>
                    <label className="flex cursor-pointer items-center gap-1.5">
                      <input type="checkbox" checked={!d.is_closed} className="accent-yellow"
                        onChange={(e) => setWeek(week.map((x) => x.weekday === d.weekday ? {
                          ...x, is_closed: !e.target.checked,
                          opens_at: e.target.checked ? (x.opens_at ?? "08:00") : x.opens_at,
                          closes_at: e.target.checked ? (x.closes_at ?? "17:00") : x.closes_at,
                        } : x))} />
                      <span className="font-dm text-xs text-muted">Open</span>
                    </label>
                    {!d.is_closed && (
                      <>
                        <input type="time" value={d.opens_at ?? ""} aria-label={`${WEEKDAYS[d.weekday]} opening time`}
                          onChange={(e) => setWeek(week.map((x) => x.weekday === d.weekday ? { ...x, opens_at: e.target.value || null } : x))}
                          className="rounded border border-dark-border bg-dark px-2 py-1 font-dm text-xs text-offwhite focus:border-yellow focus:outline-none" />
                        <span className="font-dm text-xs text-muted">–</span>
                        <input type="time" value={d.closes_at ?? ""} aria-label={`${WEEKDAYS[d.weekday]} closing time`}
                          onChange={(e) => setWeek(week.map((x) => x.weekday === d.weekday ? { ...x, closes_at: e.target.value || null } : x))}
                          className="rounded border border-dark-border bg-dark px-2 py-1 font-dm text-xs text-offwhite focus:border-yellow focus:outline-none" />
                      </>
                    )}
                  </div>
                  {/* Delivery window — the gap that made admin saves silently drop
                      a merchant's narrowed delivery times. */}
                  {!d.is_closed && payment.offers_rr_delivery && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-white/5 pt-2 pl-1">
                      <label className="flex cursor-pointer items-center gap-1.5">
                        <input type="checkbox" checked={!d.delivery_closed} className="accent-yellow"
                          onChange={(e) => setWeek(week.map((x) => x.weekday === d.weekday ? { ...x, delivery_closed: !e.target.checked } : x))} />
                        <span className="font-dm text-xs text-muted">Delivers</span>
                      </label>
                      {!d.delivery_closed && (
                        <>
                          <input type="time" value={d.delivery_opens_at ?? ""} aria-label={`${WEEKDAYS[d.weekday]} delivery start`}
                            onChange={(e) => setWeek(week.map((x) => x.weekday === d.weekday ? { ...x, delivery_opens_at: e.target.value || null } : x))}
                            className="rounded border border-dark-border bg-dark px-2 py-1 font-dm text-xs text-offwhite focus:border-yellow focus:outline-none" />
                          <span className="font-dm text-xs text-muted">–</span>
                          <input type="time" value={d.delivery_closes_at ?? ""} aria-label={`${WEEKDAYS[d.weekday]} delivery end`}
                            onChange={(e) => setWeek(week.map((x) => x.weekday === d.weekday ? { ...x, delivery_closes_at: e.target.value || null } : x))}
                            className="rounded border border-dark-border bg-dark px-2 py-1 font-dm text-xs text-offwhite focus:border-yellow focus:outline-none" />
                          <span className="font-dm text-[11px] text-muted/70">blank = whenever open</span>
                        </>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {weekError && <p role="alert" className="font-dm text-xs text-red-400">{weekError}</p>}
            <button type="button" disabled={busy || !!weekError} onClick={() => void saveHours()}
              className="inline-flex items-center gap-1.5 rounded-full bg-yellow px-4 py-2 font-dm text-xs font-medium text-dark hover:bg-yellow-dark disabled:opacity-50">
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save hours
            </button>
          </div>
        )}

        {tab === "merchant" && (
          <div className="space-y-3">
            <dl className="grid grid-cols-2 gap-y-2 font-dm text-xs">
              <dt className="text-muted">Merchant</dt><dd className="text-offwhite">{merchant?.display_name ?? "—"}</dd>
              <dt className="text-muted">Contact</dt><dd className="text-offwhite">{merchant?.contact_email ?? "—"}</dd>
              <dt className="text-muted">Approval</dt><dd className="text-offwhite">{merchant?.status ?? "—"}</dd>
              <dt className="text-muted">Plan</dt><dd className="text-offwhite">{sub?.plan ?? "no plan"}</dd>
              <dt className="text-muted">Subscription</dt><dd className="text-offwhite">{sub?.status ?? "—"}</dd>
              <dt className="text-muted">Started</dt><dd className="text-offwhite">{fmtDate(sub?.started_at ?? null)}</dd>
              <dt className="text-muted">Expires</dt><dd className="text-offwhite">{fmtDate(sub?.current_period_end ?? null)}</dd>
              <dt className="text-muted">Grace</dt><dd className="text-offwhite">{sub ? `${sub.grace_days} days` : "—"}</dd>
              {sub?.cancelled_at && (<><dt className="text-muted">Cancelled</dt><dd className="text-red-400">{fmtDate(sub.cancelled_at)}</dd></>)}
            </dl>
            <p className="font-dm text-[11px] text-muted/70">
              Approval, renewal and suspension are managed on the Merchants &amp; Subscriptions page.
            </p>

            {/* Deliberately at the bottom of the LAST tab, not beside "Save".
                Deleting the shop deletes the account behind it, so it should
                take a decision to reach, never a mis-click while editing. */}
            <DeleteShopPanel
              storeId={storeId}
              onDeleted={() => {
                onSaved();
                onClose();
              }}
            />
            <div>
              <p className="font-bebas text-[10px] tracking-[0.3em] text-yellow">BILLING HISTORY</p>
              {invoices.length === 0 ? (
                <p className="mt-1 font-dm text-xs text-muted">No invoices yet.</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {invoices.map((i) => (
                    <li key={i.id} className="flex justify-between gap-3 font-dm text-xs">
                      <span className="text-muted">{fmtDate(i.paid_at ?? i.period_start)} · {i.plan} · {i.status}</span>
                      <span className="shrink-0 text-offwhite">Rs {centsToDecimalString(i.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
