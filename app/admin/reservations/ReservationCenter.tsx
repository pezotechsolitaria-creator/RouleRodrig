"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, ChevronDown, Loader2, MessageCircle, Phone, RefreshCw, Search } from "lucide-react";
import { usePolling } from "@/lib/use-polling";
import type { AdminActionId, DeskFilter } from "@/lib/reservations/admin-actions";
import { formatMur, PAYMENT_METHOD_IDS, type PaymentMethodId, type PaymentMode, type PaymentPolicy, type ProductType } from "@/lib/reservations/policy";

// ── The Reservation Center ──────────────────────────────────────────────────
//
// The owner's desk for requests to book. Each row shows the two axes apart —
// where the booking stands, and where the money stands — because "confirmed"
// and "paid" are different facts and the guest is told them separately.
// Buttons are only the moves the server allows from here (legalActions);
// every move is recorded in the audit trail, shown in Rodrigues time.

type Row = {
  id: string;
  booking_reference: string;
  reservation_status: string;
  payment_status: string;
  payment_method: string | null;
  payment_reported_at: string | null;
  payment_reported_method: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  product_snapshot: { title?: string; provider?: string | null; capacity?: number; capacity_unit?: "seats" | "trips" };
  slot: { start_time?: string | null };
  party: { adults: number; children: number; babies: number };
  seats: number;
  slot_date: string;
  amount_mur: number | null;
  deposit_due_mur: number | null;
  balance_due_mur: number | null;
  amount_paid_mur: number;
  payment_deadline_at: string | null;
  requested_at: string;
  actions: AdminActionId[];
};

type Detail = {
  reservation: Row & {
    customer_notes: string | null;
    admin_notes: string | null;
    decline_reason: string | null;
    customer_locale: string;
    payment_policy_snapshot: PaymentPolicy;
    source: string;
  };
  events: { id: number; at: string; actor: string; actor_label: string | null; type: string; payload: Record<string, unknown> }[];
  infoRequests: { id: string; fields: string[]; note: string | null; asked_at: string; answered_at: string | null; answer: Record<string, string> | null }[];
  payments: { id: string; amount_rupees: number; method: string; received_at: string; note: string | null }[];
  outbox: { id: number; audience: string; channel: string; template: string; status: string; created_at: string; sent_at: string | null; error: string | null }[];
};

const FILTERS: { id: DeskFilter; label: string }[] = [
  { id: "new", label: "New" },
  { id: "needs_info", label: "Waiting on guest" },
  { id: "awaiting_payment", label: "Awaiting payment" },
  { id: "reported", label: "Guest says paid" },
  { id: "today", label: "Today" },
  { id: "upcoming", label: "Upcoming" },
  { id: "closed", label: "Closed" },
  { id: "all", label: "All" },
];

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  requested: "Requested",
  under_review: "Under review",
  needs_information: "Needs information",
  confirmed: "Confirmed",
  ready: "Ready",
  in_progress: "In progress",
  completed: "Completed",
  declined: "Declined",
  expired: "Expired",
  cancelled: "Cancelled",
};

const PAYMENT_LABEL: Record<string, string> = {
  not_required: "Nothing to pay",
  unpaid: "Unpaid",
  payment_pending: "Payment due",
  partially_paid: "Part paid",
  paid: "Paid",
  pay_in_person: "Pays on the day",
  failed: "Payment failed",
  refunded: "Refunded",
  waived: "Waived",
};

const METHOD_LABEL: Record<string, string> = {
  mcb_juice: "MCB Juice",
  bank_transfer: "Bank transfer",
  paypal: "PayPal",
  cash_in_person: "Cash",
  card: "Card",
};

const EVENT_LABEL: Record<string, string> = {
  submitted: "Request received",
  viewed: "Guest opened the page",
  review_started: "Review started",
  info_requested: "Asked the guest for information",
  info_received: "Guest answered",
  confirmed: "Confirmed — date held",
  payment_reported: "Guest says they paid",
  payment_recorded: "Payment recorded",
  pay_in_person: "Pays on the day",
  ready: "Marked ready",
  started: "Started",
  completed: "Completed",
  declined: "Declined",
  expired: "Expired — hold released",
  cancelled: "Cancelled",
  message_opened: "Guest opened WhatsApp",
  reminder_sent: "Reminder sent",
  note: "Note saved",
};

const INFO_FIELDS: { id: string; label: string }[] = [
  { id: "pickup_time", label: "Pickup time" },
  { id: "hotel", label: "Where they're staying" },
  { id: "passengers", label: "Number of people" },
  { id: "meeting_point", label: "Meeting point" },
  { id: "flight_number", label: "Flight number" },
  { id: "driver_name", label: "Driver's name" },
  { id: "other", label: "Other detail" },
];

const MU_FMT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Indian/Mauritius" });
const mu = (ts: string | null | undefined) => (ts ? MU_FMT.format(new Date(ts)) : "—");
const day = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

function partyText(p: Row["party"]): string {
  return [p?.adults ? `${p.adults} adult${p.adults === 1 ? "" : "s"}` : "", p?.children ? `${p.children} child${p.children === 1 ? "" : "ren"}` : "", p?.babies ? `${p.babies} bab${p.babies === 1 ? "y" : "ies"}` : ""]
    .filter(Boolean)
    .join(", ");
}

function statusTone(s: string): string {
  if (s === "completed") return "border-green-500/40 bg-green-500/10 text-green-400";
  if (s === "requested" || s === "under_review" || s === "needs_information") return "border-yellow/40 bg-yellow/10 text-yellow";
  if (s === "declined" || s === "expired" || s === "cancelled") return "border-dark-border bg-dark text-muted";
  return "border-offwhite/25 bg-offwhite/5 text-offwhite";
}

function payTone(p: string): string {
  if (p === "paid") return "border-green-500/40 bg-green-500/10 text-green-400";
  if (p === "payment_pending" || p === "partially_paid" || p === "failed") return "border-yellow/40 bg-yellow/10 text-yellow";
  return "border-dark-border bg-dark text-muted";
}

function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-dm text-[11px] font-medium ${tone}`}>{children}</span>;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `Request failed (${res.status})`);
  return j as T;
}

export default function ReservationCenter() {
  const [tab, setTab] = useState<"desk" | "settings">("desk");
  return (
    <div>
      <div className="mb-5 inline-flex rounded-xl border border-dark-border bg-dark-card p-1">
        {(["desk", "settings"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`min-h-[40px] rounded-lg px-4 font-syne text-sm font-bold transition-colors ${tab === t ? "bg-yellow text-dark" : "text-muted hover:text-offwhite"}`}
          >
            {t === "desk" ? "Desk" : "Payment settings"}
          </button>
        ))}
      </div>
      {tab === "desk" ? <Desk /> : <Settings />}
    </div>
  );
}

// ── Desk ────────────────────────────────────────────────────────────────────

function Desk() {
  const [filter, setFilter] = useState<DeskFilter>("new");
  const [q, setQ] = useState("");
  const [data, setData] = useState<{ counts: Record<DeskFilter, number>; rows: Row[]; today: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api(`/api/admin/reservations?filter=${filter}&q=${encodeURIComponent(q)}`));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filter, q]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), q ? 250 : 0);
    return () => window.clearTimeout(t);
  }, [load, q]);

  // New requests arrive while the desk is open.
  usePolling(load, 30_000, { immediate: false });

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => {
              setFilter(f.id);
              setOpen(null);
            }}
            className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 font-dm text-xs transition-colors ${
              filter === f.id ? "border-yellow bg-yellow/10 text-yellow" : "border-dark-border text-muted hover:text-offwhite"
            }`}
          >
            {f.label}
            {data && data.counts[f.id] > 0 && f.id !== "all" && f.id !== "closed" && (
              <span className={`rounded-full px-1.5 font-bold tabular-nums ${filter === f.id ? "bg-yellow text-dark" : "bg-dark-raised text-offwhite"}`}>{data.counts[f.id]}</span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-4 flex gap-2">
        <label className="relative flex-1">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Reference, name, phone or experience"
            className="w-full rounded-xl border border-dark-border bg-dark-card py-2.5 pl-9 pr-3 font-dm text-sm text-offwhite placeholder:text-muted/60 focus:border-yellow focus:outline-none"
          />
        </label>
        <button
          type="button"
          onClick={() => void load()}
          aria-label="Refresh"
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-dark-border text-muted hover:text-yellow"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {error && (
        <p className="mt-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 font-dm text-sm text-red-300">
          <AlertCircle size={15} /> {error}
        </p>
      )}

      <div className="mt-4 space-y-2.5">
        {!data && !error && (
          <p className="flex items-center gap-2 font-dm text-sm text-muted">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </p>
        )}
        {data && data.rows.length === 0 && (
          <p className="rounded-xl border border-dashed border-dark-border px-4 py-8 text-center font-dm text-sm text-muted">Nothing here.</p>
        )}
        {data?.rows.map((r) => (
          <DeskCard key={r.id} row={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} onChanged={load} />
        ))}
      </div>
    </div>
  );
}

function DeskCard({ row: r, open, onToggle, onChanged }: { row: Row; open: boolean; onToggle: () => void; onChanged: () => Promise<void> }) {
  const due = Math.max(0, (r.deposit_due_mur ?? r.amount_mur ?? 0) - r.amount_paid_mur);
  return (
    <article className={`rounded-xl border bg-dark-card ${open ? "border-yellow/40" : "border-dark-border"}`}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-3 p-4 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-syne text-sm font-extrabold tabular-nums text-offwhite">{r.booking_reference}</span>
            <Badge tone={statusTone(r.reservation_status)}>{STATUS_LABEL[r.reservation_status] ?? r.reservation_status}</Badge>
            <Badge tone={payTone(r.payment_status)}>{PAYMENT_LABEL[r.payment_status] ?? r.payment_status}</Badge>
            {r.payment_reported_at && r.payment_status !== "paid" && (
              <Badge tone="border-yellow bg-yellow text-dark">Guest says paid · {METHOD_LABEL[r.payment_reported_method ?? ""] ?? "?"}</Badge>
            )}
          </div>
          <p className="mt-1.5 truncate font-dm text-sm text-offwhite">{r.product_snapshot?.title ?? "—"}</p>
          <p className="mt-0.5 font-dm text-xs text-muted">
            {day(r.slot_date)}
            {r.slot?.start_time ? ` · ${r.slot.start_time}` : ""} · {partyText(r.party)} · {r.customer_name}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-syne text-sm font-bold text-yellow">{formatMur(r.amount_mur)}</p>
          {r.reservation_status === "confirmed" && due > 0 && r.payment_deadline_at && (
            <p className="mt-0.5 font-dm text-[11px] text-muted">due by {mu(r.payment_deadline_at)}</p>
          )}
          <ChevronDown size={16} className={`ml-auto mt-1 text-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
        </div>
      </button>
      {open && <DetailPanel id={r.id} onChanged={onChanged} />}
    </article>
  );
}

function DetailPanel({ id, onChanged }: { id: string; onChanged: () => Promise<void> }) {
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setD(await api<Detail>(`/api/admin/reservations?id=${id}`));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <p className="border-t border-dark-border px-4 py-3 font-dm text-sm text-red-300">{error}</p>;
  if (!d) {
    return (
      <p className="flex items-center gap-2 border-t border-dark-border px-4 py-3 font-dm text-sm text-muted">
        <Loader2 size={14} className="animate-spin" /> Loading…
      </p>
    );
  }
  const r = d.reservation;
  const digits = r.customer_phone.replace(/\D/g, "");
  const due = Math.max(0, (r.deposit_due_mur ?? r.amount_mur ?? 0) - r.amount_paid_mur);

  return (
    <div className="border-t border-dark-border px-4 pb-4 pt-3">
      <div className="grid gap-4 sm:grid-cols-2">
        {/* The guest — admin only, never on a public route. */}
        <div>
          <h4 className="font-bebas text-[10px] tracking-[0.25em] text-muted">GUEST</h4>
          <p className="mt-1 font-dm text-sm text-offwhite">{r.customer_name}</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <a href={`tel:${r.customer_phone}`} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-dark-border px-2.5 font-dm text-xs text-offwhite hover:border-yellow/40">
              <Phone size={12} /> {r.customer_phone}
            </a>
            <a
              href={`https://wa.me/${digits}?text=${encodeURIComponent(`Hello ${r.customer_name}, this is Roulé Rodrigues about ${r.booking_reference}.`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-dark-border px-2.5 font-dm text-xs text-offwhite hover:border-yellow/40"
            >
              <MessageCircle size={12} /> WhatsApp
            </a>
          </div>
          {r.customer_email && <p className="mt-1.5 break-all font-dm text-xs text-muted">{r.customer_email}</p>}
          <p className="mt-1 font-dm text-[11px] text-muted">Language: {r.customer_locale === "cr" ? "Kreol" : r.customer_locale === "fr" ? "French" : "English"}</p>
          {r.customer_notes && (
            <p className="mt-2 rounded-lg bg-dark px-3 py-2 font-dm text-xs leading-relaxed text-offwhite/85">“{r.customer_notes}”</p>
          )}
        </div>

        <div>
          <h4 className="font-bebas text-[10px] tracking-[0.25em] text-muted">MONEY</h4>
          <dl className="mt-1 space-y-1 font-dm text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Total</dt>
              <dd className="text-offwhite">{formatMur(r.amount_mur)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Due before the day</dt>
              <dd className="text-offwhite">{formatMur(r.deposit_due_mur)}</dd>
            </div>
            {(r.balance_due_mur ?? 0) > 0 && (
              <div className="flex justify-between gap-3">
                <dt className="text-muted">On the day</dt>
                <dd className="text-offwhite">{formatMur(r.balance_due_mur)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Received</dt>
              <dd className="text-offwhite">{formatMur(r.amount_paid_mur)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Policy</dt>
              <dd className="text-right text-offwhite">
                {policyText(r.payment_policy_snapshot)} · {(r.payment_policy_snapshot?.allowed_methods ?? []).map((m) => METHOD_LABEL[m] ?? m).join(", ")}
              </dd>
            </div>
          </dl>
          {d.payments.length > 0 && (
            <ul className="mt-2 space-y-1">
              {d.payments.map((p) => (
                <li key={p.id} className="font-dm text-[11px] text-muted">
                  {mu(p.received_at)} · {formatMur(p.amount_rupees)} · {METHOD_LABEL[p.method] ?? p.method}
                  {p.note ? ` · ${p.note}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {d.infoRequests.length > 0 && (
        <div className="mt-4">
          <h4 className="font-bebas text-[10px] tracking-[0.25em] text-muted">QUESTIONS</h4>
          <ul className="mt-1 space-y-1.5">
            {d.infoRequests.map((i) => (
              <li key={i.id} className="rounded-lg bg-dark px-3 py-2 font-dm text-xs">
                <p className="text-muted">
                  Asked {mu(i.asked_at)}: {i.fields.map((f) => INFO_FIELDS.find((x) => x.id === f)?.label ?? f).join(", ")}
                  {i.note ? ` — ${i.note}` : ""}
                </p>
                {i.answer ? (
                  <p className="mt-1 text-offwhite">
                    {Object.entries(i.answer)
                      .map(([k, v]) => `${INFO_FIELDS.find((x) => x.id === k)?.label ?? k}: ${v}`)
                      .join(" · ")}
                  </p>
                ) : (
                  <p className="mt-1 text-yellow">Waiting for the guest</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Actions detail={d} due={due} onDone={async () => {
        await Promise.all([load(), onChanged()]);
      }} />

      <details className="mt-4 group">
        <summary className="cursor-pointer list-none font-bebas text-[10px] tracking-[0.25em] text-muted hover:text-offwhite">
          AUDIT TRAIL ({d.events.length}) · RODRIGUES TIME
        </summary>
        <ol className="mt-2 space-y-1.5 border-l border-dark-border pl-3">
          {d.events.map((e) => (
            <li key={e.id} className="font-dm text-xs">
              <span className="text-muted tabular-nums">{mu(e.at)}</span>{" "}
              <span className="text-offwhite">{EVENT_LABEL[e.type] ?? e.type}</span>{" "}
              <span className="text-muted">· {e.actor_label ?? e.actor}</span>
              {e.type === "declined" && typeof e.payload?.reason === "string" && <span className="text-muted"> — {e.payload.reason}</span>}
              {e.type === "payment_recorded" && typeof e.payload?.amount_mur === "number" && (
                <span className="text-muted"> — {formatMur(e.payload.amount_mur)} {METHOD_LABEL[String(e.payload.method)] ?? ""}</span>
              )}
            </li>
          ))}
        </ol>
        {d.outbox.length > 0 && (
          <>
            <p className="mt-3 font-bebas text-[10px] tracking-[0.25em] text-muted">MESSAGES</p>
            <ul className="mt-1 space-y-1">
              {d.outbox.map((o) => (
                <li key={o.id} className="font-dm text-[11px] text-muted">
                  {mu(o.created_at)} · {o.audience} · {o.template} · {o.status}
                  {o.error ? ` (${o.error})` : ""}
                </li>
              ))}
            </ul>
          </>
        )}
      </details>
    </div>
  );
}

function policyText(p: PaymentPolicy | null | undefined): string {
  if (!p) return "—";
  switch (p.mode) {
    case "full":
      return `Full payment within ${p.deadline_hours}h`;
    case "deposit_percent":
      return `${p.deposit_percent}% deposit within ${p.deadline_hours}h`;
    case "deposit_fixed":
      return `${formatMur(p.deposit_fixed_mur)} deposit within ${p.deadline_hours}h`;
    case "pay_at_pickup":
      return "Pays on the day";
    default:
      return "Nothing to pay";
  }
}

// ── Actions: only the legal ones ────────────────────────────────────────────

function Actions({ detail, due, onDone }: { detail: Detail; due: number; onDone: () => Promise<void> }) {
  const r = detail.reservation;
  const can = (a: AdminActionId) => r.actions.includes(a);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<null | "confirm" | "request_info" | "decline" | "cancel" | "mark_paid">(null);

  const [amount, setAmount] = useState(String(r.amount_mur ?? ""));
  const [hours, setHours] = useState(String(r.payment_policy_snapshot?.deadline_hours ?? 24));
  const [fields, setFields] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [method, setMethod] = useState<PaymentMethodId>((r.payment_reported_method as PaymentMethodId) || "mcb_juice");
  const [paid, setPaid] = useState(String(due || ""));
  const [ref, setRef] = useState("");
  const [note, setNote] = useState(r.admin_notes ?? "");

  async function act(op: string, payload: Record<string, unknown> = {}) {
    setBusy(op);
    setError(null);
    try {
      await api("/api/admin/reservations", { method: "POST", body: JSON.stringify({ action: "act", id: r.id, op, payload }) });
      setForm(null);
      setText("");
      await onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const btn = "inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3.5 font-syne text-xs font-bold transition-colors disabled:opacity-50";
  const primary = `${btn} bg-yellow text-dark hover:bg-yellow-dark`;
  const quiet = `${btn} border border-dark-border text-offwhite hover:border-yellow/40`;
  const danger = `${btn} border border-red-500/30 text-red-300 hover:bg-red-500/10`;
  const input = "w-full rounded-lg border border-dark-border bg-dark px-3 py-2 font-dm text-sm text-offwhite focus:border-yellow focus:outline-none";
  const spin = (op: string) => busy === op && <Loader2 size={13} className="animate-spin" />;

  return (
    <div className="mt-4">
      <h4 className="font-bebas text-[10px] tracking-[0.25em] text-muted">ACTIONS</h4>
      {r.actions.length === 0 && <p className="mt-1 font-dm text-xs text-muted">Nothing to do: this reservation is closed.</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {can("confirm") && (
          <button type="button" className={primary} onClick={() => setForm(form === "confirm" ? null : "confirm")}>
            Confirm…
          </button>
        )}
        {can("review") && (
          <button type="button" className={quiet} disabled={!!busy} onClick={() => void act("review")}>
            {spin("review")} Start review
          </button>
        )}
        {can("request_info") && (
          <button type="button" className={quiet} onClick={() => setForm(form === "request_info" ? null : "request_info")}>
            Ask the guest…
          </button>
        )}
        {can("mark_paid") && (
          <button type="button" className={r.payment_reported_at && r.payment_status !== "paid" ? primary : quiet} onClick={() => setForm(form === "mark_paid" ? null : "mark_paid")}>
            Record payment…
          </button>
        )}
        {can("allow_cash") && (
          <button type="button" className={quiet} disabled={!!busy} onClick={() => void act("allow_cash")}>
            {spin("allow_cash")} Let them pay on the day
          </button>
        )}
        {can("ready") && (
          <button type="button" className={quiet} disabled={!!busy} onClick={() => void act("ready")}>
            {spin("ready")} Mark ready
          </button>
        )}
        {can("start") && (
          <button type="button" className={quiet} disabled={!!busy} onClick={() => void act("start")}>
            {spin("start")} Started
          </button>
        )}
        {can("complete") && (
          <button type="button" className={quiet} disabled={!!busy} onClick={() => void act("complete")}>
            {spin("complete")} Completed
          </button>
        )}
        {can("decline") && (
          <button type="button" className={danger} onClick={() => setForm(form === "decline" ? null : "decline")}>
            Decline…
          </button>
        )}
        {can("cancel") && (
          <button type="button" className={danger} onClick={() => setForm(form === "cancel" ? null : "cancel")}>
            Cancel…
          </button>
        )}
      </div>

      {form === "confirm" && (
        <div className="mt-3 space-y-3 rounded-xl border border-yellow/30 bg-yellow/[0.04] p-3">
          <p className="font-dm text-sm text-offwhite">Confirm holds the date. It does not take payment.</p>
          <p className="font-dm text-xs text-muted">
            {r.product_snapshot?.capacity_unit === "trips"
              ? `One of ${r.product_snapshot?.capacity ?? "?"} trip${r.product_snapshot?.capacity === 1 ? "" : "s"} that day, for ${partyText(r.party)}.`
              : `${r.seats} of ${r.product_snapshot?.capacity ?? "?"} places.`}{" "}
            The guest then sees how to pay; if nothing arrives in time, the hold ends by itself and the date is released.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block font-dm text-[11px] text-muted">Total (Rs)</span>
              <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} className={input} />
            </label>
            <label className="block">
              <span className="mb-1 block font-dm text-[11px] text-muted">Hours to pay</span>
              <input inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value.replace(/\D/g, ""))} className={input} />
            </label>
          </div>
          <button
            type="button"
            className={primary}
            disabled={!!busy}
            onClick={() => {
              const payload: Record<string, unknown> = {};
              if (amount && Number(amount) !== r.amount_mur) payload.amount_mur = Number(amount);
              if (hours) payload.deadline_hours = Number(hours);
              void act("confirm", payload);
            }}
          >
            {spin("confirm")} Confirm and hold
          </button>
        </div>
      )}

      {form === "request_info" && (
        <div className="mt-3 space-y-3 rounded-xl border border-dark-border bg-dark p-3">
          <div className="flex flex-wrap gap-2">
            {INFO_FIELDS.map((f) => (
              <label key={f.id} className={`inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 font-dm text-xs ${fields.includes(f.id) ? "border-yellow text-yellow" : "border-dark-border text-muted"}`}>
                <input
                  type="checkbox"
                  className="accent-yellow"
                  checked={fields.includes(f.id)}
                  onChange={(e) => setFields((s) => (e.target.checked ? [...s, f.id] : s.filter((x) => x !== f.id)))}
                />
                {f.label}
              </label>
            ))}
          </div>
          <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Optional note the guest will read" className={input} maxLength={500} />
          <button type="button" className={primary} disabled={!!busy || fields.length === 0} onClick={() => void act("request_info", { fields, note: text || undefined })}>
            {spin("request_info")} Ask
          </button>
        </div>
      )}

      {form === "mark_paid" && (
        <div className="mt-3 space-y-3 rounded-xl border border-dark-border bg-dark p-3">
          <p className="font-dm text-xs text-muted">
            Record money you have actually received. {r.payment_reported_at ? `The guest reported paying by ${METHOD_LABEL[r.payment_reported_method ?? ""] ?? "?"} at ${mu(r.payment_reported_at)} — check your account first.` : ""}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block font-dm text-[11px] text-muted">How</span>
              <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethodId)} className={input}>
                {PAYMENT_METHOD_IDS.filter((m) => m !== "card").map((m) => (
                  <option key={m} value={m}>
                    {METHOD_LABEL[m]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block font-dm text-[11px] text-muted">Amount (Rs)</span>
              <input inputMode="numeric" value={paid} onChange={(e) => setPaid(e.target.value.replace(/\D/g, ""))} className={input} />
            </label>
          </div>
          <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Transaction reference (optional)" className={input} maxLength={120} />
          <button type="button" className={primary} disabled={!!busy || !Number(paid)} onClick={() => void act("mark_paid", { method, amount_mur: Number(paid), external_ref: ref || undefined })}>
            {spin("mark_paid")} Record {paid ? formatMur(Number(paid)) : "payment"}
          </button>
        </div>
      )}

      {(form === "decline" || form === "cancel") && (
        <div className="mt-3 space-y-3 rounded-xl border border-red-500/25 bg-red-500/[0.04] p-3">
          <textarea
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={500}
            placeholder={form === "decline" ? "Reason — the guest sees this (e.g. the boat is full that morning)" : "Reason (kept in the audit trail)"}
            className={input}
          />
          <button type="button" className={danger} disabled={!!busy || (form === "decline" && text.trim().length < 3)} onClick={() => void act(form, { reason: text.trim() || undefined })}>
            {spin(form)} {form === "decline" ? "Decline" : "Cancel reservation"}
          </button>
        </div>
      )}

      {error && (
        <p className="mt-3 flex items-center gap-2 font-dm text-sm text-red-300">
          <AlertCircle size={14} /> {error}
        </p>
      )}

      <div className="mt-4">
        <label className="block">
          <span className="mb-1 block font-bebas text-[10px] tracking-[0.25em] text-muted">PRIVATE NOTE</span>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} className={input} placeholder="Only the desk sees this" />
        </label>
        {note !== (r.admin_notes ?? "") && (
          <button type="button" className={`${quiet} mt-2`} disabled={!!busy} onClick={() => void act("note", { note })}>
            {spin("note")} Save note
          </button>
        )}
      </div>
    </div>
  );
}

// ── Settings: methods and policies, no deploy needed ────────────────────────

type SettingsData = {
  methods: { id: string; enabled: boolean; channel: string; label_i18n: Record<string, string>; instructions_i18n: Record<string, string>; sort: number }[];
  types: { type: ProductType; custom: boolean; policy: PaymentPolicy; defaults: PaymentPolicy }[];
};

const TYPE_LABEL: Record<ProductType, string> = {
  experience: "Tours & excursions",
  activity: "Activities (massage, guides…)",
  boat: "Boats & fishing",
  stay: "Stays",
  scooter: "Scooters",
  car: "Cars",
  other: "Other",
};

function Settings() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setData(await api<SettingsData>("/api/admin/reservations?settings=1"));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <p className="font-dm text-sm text-red-300">{error}</p>;
  if (!data) return <p className="font-dm text-sm text-muted">Loading…</p>;

  return (
    <div className="space-y-8">
      <section>
        <h2 className="font-syne text-lg font-bold">Payment methods</h2>
        <p className="mt-1 font-dm text-sm text-muted">What a guest can choose once you confirm. Changes apply straight away.</p>
        <div className="mt-3 space-y-2.5">
          {data.methods.map((m) => (
            <MethodEditor key={m.id} method={m} onSaved={load} />
          ))}
        </div>
      </section>
      <section>
        <h2 className="font-syne text-lg font-bold">Payment policy by kind</h2>
        <p className="mt-1 font-dm text-sm text-muted">
          How much is paid before the day, how long a confirmed hold waits for it, and which methods are offered. A request already sent keeps the policy it was sent under.
        </p>
        <div className="mt-3 space-y-2.5">
          {data.types.map((t) => (
            <PolicyEditor key={t.type} entry={t} onSaved={load} />
          ))}
        </div>
      </section>
    </div>
  );
}

function MethodEditor({ method: m, onSaved }: { method: SettingsData["methods"][number]; onSaved: () => Promise<void> }) {
  const [enabled, setEnabled] = useState(m.enabled);
  const [label, setLabel] = useState({ en: m.label_i18n.en ?? "", fr: m.label_i18n.fr ?? "", cr: m.label_i18n.cr ?? "" });
  const [ins, setIns] = useState({ en: m.instructions_i18n.en ?? "", fr: m.instructions_i18n.fr ?? "", cr: m.instructions_i18n.cr ?? "" });
  const [state, setState] = useState<"idle" | "saving" | "saved" | string>("idle");
  const isCard = m.id === "card";
  const input = "w-full rounded-lg border border-dark-border bg-dark px-3 py-2 font-dm text-sm text-offwhite focus:border-yellow focus:outline-none";

  async function save() {
    setState("saving");
    try {
      await api("/api/admin/reservations", {
        method: "POST",
        body: JSON.stringify({ action: "method", id: m.id, enabled, label_i18n: label, instructions_i18n: isCard ? undefined : ins }),
      });
      setState("saved");
      await onSaved();
    } catch (e) {
      setState((e as Error).message);
    }
  }

  return (
    <details className="rounded-xl border border-dark-border bg-dark-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <span className="font-dm text-sm text-offwhite">{m.label_i18n.en ?? m.id}</span>
        <span className={`font-dm text-xs ${m.enabled ? "text-yellow" : "text-muted"}`}>{isCard ? "Off — needs a card processor" : m.enabled ? "On" : "Off"}</span>
      </summary>
      <div className="space-y-3 border-t border-dark-border px-4 pb-4 pt-3">
        <label className="flex items-center gap-2 font-dm text-sm text-offwhite">
          <input type="checkbox" className="accent-yellow" checked={enabled} disabled={isCard} onChange={(e) => setEnabled(e.target.checked)} />
          Offer this method
        </label>
        {(["en", "fr", "cr"] as const).map((l) => (
          <div key={l} className="grid gap-2 sm:grid-cols-[110px_1fr]">
            <span className="pt-2 font-bebas text-[10px] tracking-[0.2em] text-muted">{l === "en" ? "ENGLISH" : l === "fr" ? "FRENCH" : "KREOL"}</span>
            <div className="space-y-1.5">
              <input value={label[l]} onChange={(e) => setLabel((s) => ({ ...s, [l]: e.target.value }))} placeholder="Name" className={input} maxLength={60} />
              {!isCard && (
                <textarea rows={2} value={ins[l]} onChange={(e) => setIns((s) => ({ ...s, [l]: e.target.value }))} placeholder="What the guest should do" className={input} maxLength={600} />
              )}
            </div>
          </div>
        ))}
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => void save()} disabled={state === "saving" || !label.en.trim()} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-yellow px-4 font-syne text-xs font-bold text-dark disabled:opacity-50">
            {state === "saving" && <Loader2 size={13} className="animate-spin" />} Save
          </button>
          {state === "saved" && <span className="font-dm text-xs text-muted">Saved.</span>}
          {state !== "idle" && state !== "saving" && state !== "saved" && <span className="font-dm text-xs text-red-300">{state}</span>}
        </div>
      </div>
    </details>
  );
}

const MODES: { id: PaymentMode; label: string }[] = [
  { id: "full", label: "Full amount before the day" },
  { id: "deposit_percent", label: "Deposit (percentage)" },
  { id: "deposit_fixed", label: "Deposit (fixed amount)" },
  { id: "pay_at_pickup", label: "Everything on the day" },
  { id: "none", label: "Nothing to pay" },
];

function PolicyEditor({ entry, onSaved }: { entry: SettingsData["types"][number]; onSaved: () => Promise<void> }) {
  const [p, setP] = useState<PaymentPolicy>(entry.policy);
  const [state, setState] = useState<"idle" | "saving" | "saved" | string>("idle");
  const input = "w-full rounded-lg border border-dark-border bg-dark px-3 py-2 font-dm text-sm text-offwhite focus:border-yellow focus:outline-none";

  async function save(policy: PaymentPolicy | null) {
    setState("saving");
    try {
      await api("/api/admin/reservations", {
        method: "POST",
        body: JSON.stringify({ action: "policy", scope_type: "product_type", scope_id: entry.type, policy }),
      });
      setState("saved");
      if (policy === null) setP(entry.defaults);
      await onSaved();
    } catch (e) {
      setState((e as Error).message);
    }
  }

  return (
    <details className="rounded-xl border border-dark-border bg-dark-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <span className="font-dm text-sm text-offwhite">{TYPE_LABEL[entry.type]}</span>
        <span className="text-right font-dm text-xs text-muted">
          {policyText(entry.policy)}
          {entry.custom ? "" : " · default"}
        </span>
      </summary>
      <div className="space-y-3 border-t border-dark-border px-4 pb-4 pt-3">
        <label className="block">
          <span className="mb-1 block font-dm text-[11px] text-muted">What is paid before the day</span>
          <select value={p.mode} onChange={(e) => setP((s) => ({ ...s, mode: e.target.value as PaymentMode }))} className={input}>
            {MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          {p.mode === "deposit_percent" && (
            <label className="block">
              <span className="mb-1 block font-dm text-[11px] text-muted">Deposit %</span>
              <input inputMode="numeric" value={p.deposit_percent ?? ""} onChange={(e) => setP((s) => ({ ...s, deposit_percent: Number(e.target.value.replace(/\D/g, "")) || null }))} className={input} />
            </label>
          )}
          {p.mode === "deposit_fixed" && (
            <label className="block">
              <span className="mb-1 block font-dm text-[11px] text-muted">Deposit (Rs)</span>
              <input inputMode="numeric" value={p.deposit_fixed_mur ?? ""} onChange={(e) => setP((s) => ({ ...s, deposit_fixed_mur: Number(e.target.value.replace(/\D/g, "")) || null }))} className={input} />
            </label>
          )}
          <label className="block">
            <span className="mb-1 block font-dm text-[11px] text-muted">Hours to pay after confirm</span>
            <input inputMode="numeric" value={p.deadline_hours} onChange={(e) => setP((s) => ({ ...s, deadline_hours: Number(e.target.value.replace(/\D/g, "")) || 1 }))} className={input} />
          </label>
        </div>
        <div>
          <span className="mb-1 block font-dm text-[11px] text-muted">Methods offered</span>
          <div className="flex flex-wrap gap-2">
            {PAYMENT_METHOD_IDS.filter((m) => m !== "card").map((m) => (
              <label key={m} className={`inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 font-dm text-xs ${p.allowed_methods.includes(m) ? "border-yellow text-yellow" : "border-dark-border text-muted"}`}>
                <input
                  type="checkbox"
                  className="accent-yellow"
                  checked={p.allowed_methods.includes(m)}
                  onChange={(e) =>
                    setP((s) => ({ ...s, allowed_methods: e.target.checked ? [...s.allowed_methods, m] : s.allowed_methods.filter((x) => x !== m) }))
                  }
                />
                {METHOD_LABEL[m]}
              </label>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void save({ ...p, hold_capacity_on: "confirm" })} disabled={state === "saving"} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-yellow px-4 font-syne text-xs font-bold text-dark disabled:opacity-50">
            {state === "saving" && <Loader2 size={13} className="animate-spin" />} Save
          </button>
          {entry.custom && (
            <button type="button" onClick={() => void save(null)} disabled={state === "saving"} className="inline-flex min-h-[40px] items-center rounded-xl border border-dark-border px-4 font-dm text-xs text-muted hover:text-offwhite">
              Back to default
            </button>
          )}
          {state === "saved" && <span className="font-dm text-xs text-muted">Saved. New requests use it.</span>}
          {state !== "idle" && state !== "saving" && state !== "saved" && <span className="font-dm text-xs text-red-300">{state}</span>}
        </div>
      </div>
    </details>
  );
}
