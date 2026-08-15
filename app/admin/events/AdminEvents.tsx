"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import EventOrdersPanel from "./EventOrdersPanel";
import EventEditPanel from "./EventEditPanel";
import {
  Loader2, CalendarPlus, CalendarDays, MapPin, Eye, EyeOff, Trash2,
  AlertTriangle, Ticket, Users, Banknote, ExternalLink, Pencil,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Creating an event, and getting it live.
//
// ── WHY THIS SCREEN EXISTS AT ALL ───────────────────────────────────────────
// Every other part of events worked — listing, checkout, tickets, scanner, fees
// — and none of it could ever be seen, because nothing in the product created an
// event. The homepage strip renders nothing when there is no upcoming event, so
// the whole feature looked broken when it was merely empty.
//
// ── PUBLISH IS THE HONEST PART ──────────────────────────────────────────────
// An event is created as a DRAFT and stays invisible until published, and the
// server refuses to publish one that cannot sell: no ticket package, or no way
// for the organiser to be paid. Rather than disable the button and leave the
// operator guessing, each card says exactly what is still missing and who adds
// it — packages and bank details belong to the ORGANISER's dashboard, not here.

type AdminEvent = {
  storeId: string;
  slug: string;
  name: string;
  status: string;
  isTest: boolean;
  phase: string;
  publiclyVisible: boolean;
  startsAt: string;
  endsAt: string | null;
  venueName: string | null;
  capacity: number | null;
  cancelledAt: string | null;
  packages: number;
  hasPaymentMethod: boolean;
  organisers: number;
  ticketsSold: number;
  // Enriched by the route for the edit form (admin_list_events answers the
  // list's questions; these answer the form's).
  coverUrl?: string | null;
  doorsOpenAt?: string | null;
  venueAddress?: string | null;
  supportPhone?: string | null;
};

const PHASE_STYLE: Record<string, string> = {
  upcoming: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  in_progress: "border-green-500/30 bg-green-500/10 text-green-300",
  ended: "border-white/15 bg-white/5 text-muted",
  cancelled: "border-red-500/25 bg-red-500/10 text-red-300",
  draft: "border-yellow/30 bg-yellow/10 text-yellow",
};

/** `datetime-local` gives "2026-08-22T19:30" with no zone. The island runs on
 *  one timezone, so this is read as Mauritius time (UTC+4) and sent as a proper
 *  offset — never as a bare local string the server would have to guess about. */
function toIsoWithOffset(local: string): string | null {
  if (!local) return null;
  const d = new Date(`${local}:00+04:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export default function AdminEvents() {
  const [rows, setRows] = useState<AdminEvent[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [openOrders, setOpenOrders] = useState<string | null>(null);
  const [openEdit, setOpenEdit] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [venue, setVenue] = useState("");
  const [address, setAddress] = useState("");
  const [capacity, setCapacity] = useState("");
  const [isTest, setIsTest] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/events");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not load events.");
      setRows(body.events ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load events.");
      setRows([]);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const startIso = toIsoWithOffset(startsAt);
  const canCreate = name.trim().length > 0 && !!startIso && !creating;

  async function create() {
    setCreating(true);
    try {
      const res = await fetch("/api/admin/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          startsAt: startIso,
          venueName: venue.trim() || undefined,
          venueAddress: address.trim() || undefined,
          capacity: capacity.trim() ? Number.parseInt(capacity, 10) : null,
          isTest,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not create that event.");
      toast.success(`Created “${name.trim()}” as a draft`);
      setName(""); setStartsAt(""); setVenue(""); setAddress(""); setCapacity("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create that event.");
    } finally {
      setCreating(false);
    }
  }

  async function act(payload: object, method: "PATCH" | "DELETE", ok: string, key: string) {
    setBusy(key);
    try {
      const res = await fetch("/api/admin/events", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "That didn't work.");
      toast.success(ok);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Create ────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-dark-card p-5">
        <h2 className="flex items-center gap-2 font-bebas text-[11px] tracking-[0.3em] text-yellow">
          <CalendarPlus size={14} /> NEW EVENT
        </h2>
        <p className="mt-2 font-dm text-xs leading-relaxed text-muted">
          Creates a draft. Nothing is public until you publish it, and it can only be published once
          it has a ticket package and a way for the organiser to be paid — both added by the
          organiser in their own dashboard.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="font-dm text-xs text-muted">Event name</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
          </label>
          <label className="block">
            <span className="font-dm text-xs text-muted">Starts (Rodrigues time)</span>
            <Input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="mt-1"
            />
          </label>
          <label className="block">
            <span className="font-dm text-xs text-muted">Venue (optional)</span>
            <Input value={venue} onChange={(e) => setVenue(e.target.value)} className="mt-1" />
          </label>
          <label className="block">
            <span className="font-dm text-xs text-muted">Address (optional)</span>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} className="mt-1" />
          </label>
          <label className="block">
            <span className="font-dm text-xs text-muted">Venue capacity (optional)</span>
            <Input
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              inputMode="numeric"
              placeholder="No overall limit"
              className="mt-1"
            />
          </label>
          <label className="flex items-end gap-2 pb-1">
            <input
              type="checkbox"
              checked={isTest}
              onChange={(e) => setIsTest(e.target.checked)}
              className="h-4 w-4 accent-[#2F80ED]"
            />
            <span className="font-dm text-xs text-muted">
              Test event — never shown publicly, even if published
            </span>
          </label>
        </div>

        <Button className="mt-4 w-full sm:w-auto" disabled={!canCreate} onClick={() => void create()}>
          {creating ? <Loader2 size={15} className="animate-spin" /> : "Create draft event"}
        </Button>
      </div>

      {/* ── List ──────────────────────────────────────────────────────── */}
      {rows === null ? (
        <p className="flex items-center gap-2 font-dm text-sm text-muted">
          <Loader2 size={15} className="animate-spin" /> Loading…
        </p>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-dark-card p-10 text-center">
          <CalendarDays className="mx-auto text-muted" size={22} />
          <p className="mt-3 font-syne text-base font-bold text-offwhite">No events yet</p>
          <p className="mx-auto mt-1 max-w-sm font-dm text-sm text-muted">
            Create one above. Until an event is published and still ahead, the homepage events strip
            and the /events page stay empty — that is deliberate, not a fault.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((e) => {
            const blockers: string[] = [];
            if (e.packages === 0) blockers.push("no ticket package");
            if (!e.hasPaymentMethod) blockers.push("no payment method");
            if (e.organisers === 0) blockers.push("no organiser assigned");
            const live = e.publiclyVisible;

            return (
              <div key={e.storeId} className="rounded-2xl border border-white/10 bg-dark-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-syne text-lg font-bold text-offwhite">
                      {e.name}
                      {e.isTest && (
                        <span className="ml-2 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 font-dm text-[10px] text-muted">
                          TEST
                        </span>
                      )}
                    </h3>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-dm text-xs text-muted">
                      <span className="flex items-center gap-1">
                        <CalendarDays size={11} />
                        {new Date(e.startsAt).toLocaleString("en-GB", {
                          timeZone: "Indian/Mauritius", day: "numeric", month: "short",
                          year: "numeric", hour: "2-digit", minute: "2-digit",
                        })}
                      </span>
                      {e.venueName && <span className="flex items-center gap-1"><MapPin size={11} /> {e.venueName}</span>}
                      <span>/{e.slug}</span>
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-3 py-1 font-dm text-[11px] ${PHASE_STYLE[e.phase] ?? PHASE_STYLE.draft}`}>
                    {live ? "Live" : e.status === "draft" ? "Draft" : e.phase}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-3 font-dm text-xs text-muted">
                  <span className="flex items-center gap-1"><Ticket size={11} /> {e.packages} package{e.packages === 1 ? "" : "s"}</span>
                  <span className="flex items-center gap-1"><Users size={11} /> {e.organisers} organiser{e.organisers === 1 ? "" : "s"}</span>
                  <span className="flex items-center gap-1"><Banknote size={11} /> {e.hasPaymentMethod ? "payment set" : "no payment method"}</span>
                  <span>{e.ticketsSold} sold</span>
                </div>

                {/* The owner hit this and reported it as "when i click on events
                    it shows lost on the island". A test event is invisible to
                    store_is_visible(), so its public page is a 404 — and the
                    Publish button sat disabled with nothing on screen saying so.
                    A dead control has to explain itself. */}
                {e.isTest && (
                  <div className="mt-3 rounded-xl border border-orange-400/25 bg-orange-400/[0.06] px-3 py-2.5">
                    <p className="flex items-start gap-2 font-dm text-xs text-orange-200">
                      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                      <span>
                        Marked as a <strong>test event</strong>. It can never be published, and
                        anyone opening <code className="text-orange-100">/events/{e.slug}</code> sees
                        &ldquo;Lost on the island&rdquo; — that is a 404, not a fault.
                      </span>
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2.5"
                      disabled={busy === e.storeId}
                      onClick={() =>
                        void act(
                          { action: "testFlag", storeId: e.storeId, isTest: false },
                          "PATCH",
                          "Now a real event — you can publish it",
                          e.storeId,
                        )
                      }
                    >
                      Make this a real event
                    </Button>
                  </div>
                )}

                {/* An unpublished REAL event is a 404 too, and for a reason the
                    operator can act on. Say it once, plainly, next to the button
                    that fixes it. */}
                {!live && !e.isTest && (
                  <p className="mt-3 flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 font-dm text-xs text-muted">
                    <EyeOff size={13} className="mt-0.5 shrink-0" />
                    Not published yet — customers who open its link see a 404 until you press
                    Publish.
                  </p>
                )}

                {blockers.length > 0 && !live && (
                  <p className="mt-3 flex items-start gap-2 rounded-xl border border-orange-400/25 bg-orange-400/[0.06] px-3 py-2 font-dm text-xs text-orange-200">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                    Can&apos;t go live yet: {blockers.join(", ")}. Packages and payment details are
                    added by the organiser in their dashboard.
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-4">
                  {live ? (
                    <Button size="sm" variant="outline" disabled={busy === e.storeId}
                      onClick={() => void act({ action: "publish", storeId: e.storeId, publish: false }, "PATCH", "Unpublished", e.storeId)}>
                      <EyeOff size={13} className="mr-1" /> Unpublish
                    </Button>
                  ) : (
                    <Button size="sm" disabled={busy === e.storeId || e.isTest}
                      title={e.isTest ? "Test events cannot be published — use “Make this a real event” first." : undefined}
                      onClick={() => void act({ action: "publish", storeId: e.storeId, publish: true }, "PATCH", "Published — it's live", e.storeId)}>
                      {busy === e.storeId ? <Loader2 size={13} className="animate-spin" /> : (<><Eye size={13} className="mr-1" /> Publish</>)}
                    </Button>
                  )}

                  {live && (
                    <Link
                      href={`/events/${e.slug}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 rounded-full border border-white/15 px-3 py-1.5 font-dm text-xs text-muted transition hover:text-yellow"
                    >
                      View <ExternalLink size={11} />
                    </Link>
                  )}

                  {/* Editing. admin_update_event was fully implemented and no
                      UI ever called it, so a typo'd name or a moved date was
                      permanent. Photo and cancellation live here too — both
                      columns existed and were read everywhere, and neither had
                      a write path. */}
                  <Button size="sm" variant="outline" disabled={busy === e.storeId}
                    onClick={() => setOpenEdit(openEdit === e.storeId ? null : e.storeId)}>
                    <Pencil size={13} className="mr-1" />
                    {openEdit === e.storeId ? "Close" : "Edit"}
                  </Button>

                  {/* The box office. Until M70 there was no admin path to
                      'paid' for an event order, so a bank transfer or a cash
                      payment on a platform-run event never issued a ticket. */}
                  <Button size="sm" variant="outline" disabled={busy === e.storeId}
                    onClick={() => setOpenOrders(openOrders === e.storeId ? null : e.storeId)}>
                    <Banknote size={13} className="mr-1" />
                    {openOrders === e.storeId ? "Hide sales" : "Sales & tickets"}
                  </Button>

                  {e.ticketsSold === 0 && (
                    <Button size="sm" variant="outline" disabled={busy === e.storeId}
                      onClick={() => {
                        if (!confirm(`Delete “${e.name}”? This cannot be undone.`)) return;
                        void act({ storeId: e.storeId }, "DELETE", "Event deleted", e.storeId);
                      }}>
                      <Trash2 size={13} />
                    </Button>
                  )}
                </div>

                {openEdit === e.storeId && (
                  <div className="mt-4">
                    <EventEditPanel
                      storeId={e.storeId}
                      eventName={e.name}
                      startsAt={e.startsAt}
                      endsAt={e.endsAt}
                      doorsOpenAt={e.doorsOpenAt ?? null}
                      venueName={e.venueName}
                      venueAddress={e.venueAddress ?? null}
                      supportPhone={e.supportPhone ?? null}
                      coverUrl={e.coverUrl ?? null}
                      cancelledAt={e.cancelledAt}
                      onSaved={() => void load()}
                    />
                  </div>
                )}

                {openOrders === e.storeId && (
                  <div className="mt-4">
                    <EventOrdersPanel storeId={e.storeId} eventName={e.name} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
