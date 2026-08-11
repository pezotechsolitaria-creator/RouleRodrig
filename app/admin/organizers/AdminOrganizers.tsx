"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, AlertTriangle, UserPlus, CalendarDays, ShieldCheck, Ban, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";

// Event organisers, from /admin.
//
// An organiser is NOT a marketplace merchant and this screen never touches
// merchant data. It manages exactly three things: who is invited, which events
// they may run, and whether they are still allowed in.
//
// Nothing here decides authorization — every action calls an admin_* RPC that
// re-checks server-side and writes an audit_logs row. The UI is a form over
// those calls, not a second source of truth.

type OrganizerEvent = {
  storeId: string;
  name: string;
  slug: string;
  startsAt: string;
  canVerifyPayments: boolean;
};

type Organizer = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  status: "invited" | "active" | "suspended";
  isTest: boolean;
  claimed: boolean;
  notes: string | null;
  createdAt: string;
  events: OrganizerEvent[];
};

type EventOption = { storeId: string; name: string; slug: string; startsAt: string };

const STATUS_STYLE: Record<Organizer["status"], string> = {
  invited: "bg-yellow/15 text-yellow border-yellow/30",
  active: "bg-green-500/15 text-green-400 border-green-500/30",
  suspended: "bg-red-500/10 text-red-400 border-red-500/25",
};

const STATUS_HELP: Record<Organizer["status"], string> = {
  invited: "Emailed, not signed up yet — no access.",
  active: "Signed in and running their events.",
  suspended: "Access revoked immediately. History kept.",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function AdminOrganizers() {
  const [organizers, setOrganizers] = useState<Organizer[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Invite form
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [isTest, setIsTest] = useState(false);
  const [inviting, setInviting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/organizers");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not load organisers.");
      setOrganizers(body.organizers ?? []);
      setEvents(body.events ?? []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load organisers.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function send(body: unknown, method: "POST" | "PATCH", okMsg: string, key: string) {
    setBusy(key);
    try {
      const res = await fetch("/api/admin/organizers", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || "That didn't work.");
      toast.success(okMsg);
      await load();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't work.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const canInvite = emailValid && name.trim().length > 0 && !inviting;

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!canInvite) return;
    setInviting(true);
    const ok = await send(
      { email: email.trim(), name: name.trim(), phone: phone.trim() || undefined, isTest },
      "POST",
      "Organiser invited",
      "invite",
    );
    setInviting(false);
    if (ok) { setEmail(""); setName(""); setPhone(""); setIsTest(false); }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 font-dm text-sm text-muted" aria-busy="true">
        <Loader2 size={16} className="animate-spin" /> Loading organisers…
      </div>
    );
  }

  if (loadError) {
    return (
      <div role="alert" className="rounded-2xl border border-red-500/25 bg-red-500/[0.05] p-6 text-center">
        <AlertTriangle className="mx-auto text-red-400" size={22} />
        <p className="mt-3 font-dm text-sm text-muted">{loadError}</p>
        <Button variant="outline" className="mt-4" onClick={() => void load()}>
          <RefreshCw size={15} className="mr-1.5" /> Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Invite ─────────────────────────────────────────────────────── */}
      <section aria-labelledby="inv-h" className="rounded-2xl border border-white/10 bg-dark-card p-5">
        <h2 id="inv-h" className="flex items-center gap-2 font-syne text-base font-bold text-offwhite">
          <UserPlus size={16} className="text-yellow" /> Invite an organiser
        </h2>
        <p className="mt-1 font-dm text-sm text-muted">
          They sign up at <span className="text-offwhite">/login</span> with this exact email and the
          invitation links itself to their account. Nobody can register as an organiser on their own.
        </p>

        <form onSubmit={invite} className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="org-name" className="mb-1 block font-dm text-xs text-muted">
              Name <span className="text-yellow">*</span>
            </label>
            <input
              id="org-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120}
              placeholder="Summer Fest Ltd"
              className="w-full rounded-xl border border-dark-border bg-dark px-4 py-3 font-dm text-sm text-offwhite placeholder:text-muted/50 focus:border-yellow focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="org-email" className="mb-1 block font-dm text-xs text-muted">
              Email <span className="text-yellow">*</span>
            </label>
            <input
              id="org-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              placeholder="organiser@example.com" inputMode="email"
              aria-invalid={email.length > 0 && !emailValid}
              className={`w-full rounded-xl border bg-dark px-4 py-3 font-dm text-sm text-offwhite placeholder:text-muted/50 focus:outline-none ${
                email.length > 0 && !emailValid ? "border-red-500/60" : "border-dark-border focus:border-yellow"
              }`}
            />
          </div>
          <div>
            <label htmlFor="org-phone" className="mb-1 block font-dm text-xs text-muted">Phone (optional)</label>
            <input
              id="org-phone" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40}
              placeholder="+230 5xxx xxxx"
              className="w-full rounded-xl border border-dark-border bg-dark px-4 py-3 font-dm text-sm text-offwhite placeholder:text-muted/50 focus:border-yellow focus:outline-none"
            />
          </div>
          <div className="flex items-end">
            <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-white/15 px-4 py-3 font-dm text-sm text-offwhite transition-colors hover:bg-white/[0.04]">
              <input type="checkbox" checked={isTest} onChange={(e) => setIsTest(e.target.checked)} className="accent-yellow" />
              Test account
            </label>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={!canInvite}>
              {inviting ? <Loader2 size={16} className="mr-1.5 animate-spin" /> : null}
              Send invitation
            </Button>
            {!emailValid && email.length > 0 && (
              <p role="alert" className="mt-2 font-dm text-xs text-red-400">That email address doesn&apos;t look right.</p>
            )}
          </div>
        </form>
      </section>

      {/* ── Roster ─────────────────────────────────────────────────────── */}
      {organizers.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-10 text-center">
          <h2 className="font-syne text-lg font-bold text-offwhite">No organisers yet</h2>
          <p className="mx-auto mt-1 max-w-xs font-dm text-sm text-muted">
            Invite one above. They&apos;ll be able to run only the events you assign them.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {organizers.map((o) => (
            <OrganizerCard
              key={o.id}
              organizer={o}
              events={events}
              busy={busy}
              onAssign={(storeId, canVerify) =>
                send({ organizerId: o.id, storeId, canVerifyPayments: canVerify }, "PATCH", "Event assigned", `a-${o.id}`)
              }
              onUnassign={(storeId) =>
                send({ organizerId: o.id, storeId, unassign: true }, "PATCH", "Assignment removed", `u-${o.id}-${storeId}`)
              }
              onStatus={(status) =>
                send({ organizerId: o.id, status }, "PATCH", `Organiser ${status}`, `s-${o.id}`)
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function OrganizerCard({
  organizer: o, events, busy, onAssign, onUnassign, onStatus,
}: {
  organizer: Organizer;
  events: EventOption[];
  busy: string | null;
  onAssign: (storeId: string, canVerify: boolean) => Promise<boolean>;
  onUnassign: (storeId: string) => Promise<boolean>;
  onStatus: (status: Organizer["status"]) => Promise<boolean>;
}) {
  const [pick, setPick] = useState("");
  const [canVerify, setCanVerify] = useState(false);

  const assigned = new Set(o.events.map((e) => e.storeId));
  const available = events.filter((e) => !assigned.has(e.storeId));

  return (
    <div className="rounded-2xl border border-white/10 bg-dark-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-syne text-base font-bold text-offwhite">
            {o.name}
            {o.isTest && (
              <span className="rounded-full border border-white/15 px-2 py-0.5 font-dm text-[10px] font-medium uppercase tracking-wide text-muted">
                Test
              </span>
            )}
          </p>
          <p className="mt-0.5 font-dm text-sm text-muted">{o.email}</p>
          {o.phone && <p className="font-dm text-xs text-muted">{o.phone}</p>}
        </div>
        <div className="text-right">
          <span className={`inline-block rounded-full border px-3 py-1 font-dm text-[11px] font-medium ${STATUS_STYLE[o.status]}`}>
            {o.status}
          </span>
          {/* Never show a state without saying what it means. */}
          <p className="mt-1 max-w-[16rem] font-dm text-[11px] leading-tight text-muted">{STATUS_HELP[o.status]}</p>
          {!o.claimed && (
            <p className="mt-1 font-dm text-[11px] text-yellow/90">Waiting for them to sign up</p>
          )}
        </div>
      </div>

      {/* Assigned events */}
      <div className="mt-4 border-t border-white/10 pt-4">
        <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">EVENTS THEY CAN RUN</p>
        {o.events.length === 0 ? (
          <p className="mt-1.5 font-dm text-sm text-muted">
            None yet — they can sign in but will see nothing until you assign an event.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {o.events.map((e) => (
              <li key={e.storeId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/[0.03] px-3 py-2">
                <span className="min-w-0 font-dm text-sm text-offwhite">
                  <CalendarDays size={13} className="mr-1.5 inline text-muted" />
                  {e.name}
                  <span className="ml-2 text-xs text-muted">{fmtDate(e.startsAt)}</span>
                </span>
                <span className="flex items-center gap-2">
                  {e.canVerifyPayments ? (
                    <span className="flex items-center gap-1 font-dm text-[11px] text-green-400">
                      <ShieldCheck size={12} /> can approve payments
                    </span>
                  ) : (
                    <span className="font-dm text-[11px] text-muted">admin approves payments</span>
                  )}
                  <button
                    onClick={() => void onUnassign(e.storeId)}
                    disabled={busy === `u-${o.id}-${e.storeId}`}
                    aria-label={`Remove ${e.name} from ${o.name}`}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 text-muted transition-colors hover:border-red-500/50 hover:text-red-400 disabled:opacity-50"
                  >
                    {busy === `u-${o.id}-${e.storeId}` ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        {available.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label htmlFor={`pick-${o.id}`} className="sr-only">Assign an event to {o.name}</label>
            <select
              id={`pick-${o.id}`} value={pick} onChange={(e) => setPick(e.target.value)}
              className="min-w-[12rem] flex-1 rounded-xl border border-dark-border bg-dark px-3 py-2.5 font-dm text-sm text-offwhite focus:border-yellow focus:outline-none"
            >
              <option value="">Assign an event…</option>
              {available.map((e) => (
                <option key={e.storeId} value={e.storeId}>{e.name} — {fmtDate(e.startsAt)}</option>
              ))}
            </select>
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/15 px-3 py-2.5 font-dm text-xs text-offwhite transition-colors hover:bg-white/[0.04]">
              <input type="checkbox" checked={canVerify} onChange={(e) => setCanVerify(e.target.checked)} className="accent-yellow" />
              Can approve payments
            </label>
            <Button
              size="sm" variant="outline" disabled={!pick || busy === `a-${o.id}`}
              onClick={async () => { if (await onAssign(pick, canVerify)) { setPick(""); setCanVerify(false); } }}
            >
              {busy === `a-${o.id}` ? <Loader2 size={14} className="animate-spin" /> : <><Check size={14} className="mr-1" /> Assign</>}
            </Button>
          </div>
        )}
      </div>

      {/* Status */}
      <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-4">
        {o.status !== "suspended" ? (
          <Button
            size="sm" variant="outline" disabled={busy === `s-${o.id}`}
            onClick={() => void onStatus("suspended")}
          >
            {busy === `s-${o.id}` ? <Loader2 size={14} className="animate-spin" /> : <><Ban size={14} className="mr-1.5" /> Suspend</>}
          </Button>
        ) : (
          <Button size="sm" disabled={busy === `s-${o.id}` || !o.claimed} onClick={() => void onStatus("active")}>
            {busy === `s-${o.id}` ? <Loader2 size={14} className="animate-spin" /> : "Restore access"}
          </Button>
        )}
        {o.status === "suspended" && !o.claimed && (
          <p className="self-center font-dm text-xs text-muted">
            They never signed up, so there is no account to restore.
          </p>
        )}
      </div>

      {o.notes && (
        <p className="mt-3 rounded-xl bg-white/[0.03] px-3 py-2 font-dm text-xs text-muted">{o.notes}</p>
      )}
    </div>
  );
}
