"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CalendarDays, Check, Clock, Copy, Loader2, MapPin, MessageCircle, RotateCcw, Users, WifiOff, X } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { usePolling } from "@/lib/use-polling";
import { HUB_COPY, waText, type ResLang } from "@/lib/reservations/copy";
import { formatMur } from "@/lib/reservations/policy";
import { countdown, hubView, type NodeState, type TimelineNode } from "@/lib/reservations/timeline";
import type { GuestView } from "@/lib/reservations/view";
import ReservationPayPal from "./ReservationPayPal";

// ── The guest's reservation hub ─────────────────────────────────────────────
//
// One page, read top to bottom: whose booking this is (reference), what it is
// (product card), where it stands (four nodes and ONE sentence), what to do
// now (answer a question, or pay — the payment panel exists only after Roulé
// confirms), what happens next, then the details.
//
// It refreshes itself every 12 seconds while something is pending on Roulé's
// side, and only while the tab is visible. "I've paid" is a REPORT: it never
// changes the money state; Roulé confirms the payment and this page follows.

const POLL_MS = 12_000;
const DATE_LOCALE: Record<ResLang, string> = { en: "en-GB", fr: "fr-FR", cr: "fr-FR" };
const MU = "Indian/Mauritius";

function toLang(l: string): ResLang {
  return l === "fr" || l === "cr" ? l : "en";
}

function fmtDay(iso: string, lang: ResLang): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(DATE_LOCALE[lang], { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(d);
}

/** A moment in Rodrigues time: "4 Oct, 14:02". */
function fmtStamp(ts: string, lang: ResLang): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(DATE_LOCALE[lang], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: MU }).format(d);
}

/** When the activity starts, as an instant (slots are local Rodrigues times). */
function slotStart(v: GuestView): Date | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(v.slot?.start_time ?? "");
  const hhmm = m ? `${m[1].padStart(2, "0")}:${m[2]}` : "08:00";
  const d = new Date(`${v.slotDate}T${hhmm}:00+04:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Rupees still to pay online now. */
function dueNow(v: GuestView): number {
  return Math.max(0, (v.depositDueMur ?? v.amountMur ?? 0) - (v.amountPaidMur ?? 0));
}

function isLive(v: GuestView): boolean {
  if (["draft", "requested", "under_review", "needs_information"].includes(v.status)) return true;
  return v.status === "confirmed" && ["payment_pending", "partially_paid", "failed"].includes(v.paymentStatus);
}

const STAMP_EVENTS: Record<TimelineNode["key"], string[]> = {
  requested: ["submitted"],
  confirmed: ["confirmed"],
  payment: ["payment_recorded", "pay_in_person"],
  ready: ["ready"],
};

export default function ReservationHub({
  token,
  initial,
  unavailable,
  whatsapp,
  againHref,
  paypalClientId,
}: {
  token: string;
  initial: GuestView | null;
  unavailable: boolean;
  whatsapp: string | null;
  againHref: string;
  /** Set only while PayPal is live: card and PayPal account really pay. */
  paypalClientId: string | null;
}) {
  const { language } = useLanguage();
  const lang = toLang(language);
  const c = HUB_COPY[lang];

  const [view, setView] = useState<GuestView | null>(initial);
  const [down, setDown] = useState(unavailable);
  const [loading, setLoading] = useState(false);
  // The clock starts after hydration so the server and browser render alike.
  const [now, setNow] = useState<Date | null>(null);

  // One request at a time, and no closer than 3s apart unless the guest just
  // acted: a phone flicking between apps fires visibilitychange in bursts.
  const inflight = useRef(false);
  const last = useRef(0);
  const refresh = useCallback(async (force = false) => {
    if (inflight.current || (!force && Date.now() - last.current < 3_000)) return;
    inflight.current = true;
    last.current = Date.now();
    try {
      const res = await fetch(`/api/reservations/${token}`, { cache: "no-store" });
      if (res.status === 404) {
        setView(null);
        setDown(false);
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      setView((await res.json()) as GuestView);
      setDown(false);
    } catch {
      setDown(true);
    } finally {
      inflight.current = false;
    }
  }, [token]);

  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Only while something is pending on Roulé's side, only while the tab is
  // visible, one read on return (usePolling). Not on mount: the server just
  // rendered this.
  const live = view ? isLive(view) : false;
  usePolling(refresh, POLL_MS, { enabled: live, immediate: false });

  async function act(body: Record<string, unknown>): Promise<boolean> {
    setLoading(true);
    try {
      const res = await fetch(`/api/reservations/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean };
      await refresh(true);
      return Boolean(res.ok && j.ok);
    } catch {
      setDown(true);
      return false;
    } finally {
      setLoading(false);
    }
  }

  // ── No reservation behind this link ──
  if (!view) {
    return (
      <div className="mx-auto max-w-lg px-4 pt-10">
        <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">{c.eyebrow}</p>
        <h1 className="mt-2 font-syne text-2xl font-extrabold text-offwhite">{down ? c.offline : c.notFoundTitle}</h1>
        {!down && <p className="mt-2 font-dm text-sm leading-relaxed text-muted">{c.error}</p>}
        <div className="mt-6 flex flex-wrap gap-3">
          {down && (
            <button
              type="button"
              onClick={() => void refresh(true)}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-yellow px-5 font-syne text-sm font-bold text-dark transition-colors hover:bg-yellow-dark"
            >
              <RotateCcw size={15} /> {c.retry}
            </button>
          )}
          <Link
            href="/"
            className="inline-flex min-h-[44px] items-center rounded-xl border border-dark-border px-5 font-dm text-sm text-offwhite transition-colors hover:border-yellow/40"
          >
            {c.back}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <Hub
      view={view}
      lang={lang}
      now={now}
      live={live}
      down={down}
      loading={loading}
      token={token}
      whatsapp={whatsapp}
      againHref={againHref}
      paypalClientId={paypalClientId}
      act={act}
      refresh={refresh}
    />
  );
}

function Hub({
  view: v,
  lang,
  now,
  live,
  down,
  loading,
  token,
  whatsapp,
  againHref,
  paypalClientId,
  act,
  refresh,
}: {
  view: GuestView;
  lang: ResLang;
  now: Date | null;
  live: boolean;
  down: boolean;
  loading: boolean;
  token: string;
  whatsapp: string | null;
  againHref: string;
  paypalClientId: string | null;
  act: (body: Record<string, unknown>) => Promise<boolean>;
  refresh: (force?: boolean) => Promise<void>;
}) {
  const c = HUB_COPY[lang];
  const start = useMemo(() => slotStart(v), [v]);
  const hub = hubView({ reservation_status: v.status, payment_status: v.paymentStatus }, start, now ?? new Date(v.requestedAt));
  const title = v.product?.title ?? "";
  const day = fmtDay(v.slotDate, lang);
  const time = v.slot?.start_time ?? null;
  const when = time ? `${day} · ${time}` : day;
  const left = now ? countdown(v.paymentDeadlineAt, now) : null;
  const ended = hub.state === "declined" || hub.state === "expired" || hub.state === "cancelled";
  const stamps = useMemo(() => {
    const out: Partial<Record<TimelineNode["key"], string>> = {};
    for (const [key, types] of Object.entries(STAMP_EVENTS) as [TimelineNode["key"], string[]][]) {
      const e = [...(v.events ?? [])].reverse().find((ev) => types.includes(ev.type));
      if (e) out[key] = fmtStamp(e.at, lang);
    }
    return out;
  }, [v.events, lang]);

  const wa = whatsapp
    ? `https://wa.me/${whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(waText(lang, v.reference, title, when))}`
    : null;

  return (
    <div className="mx-auto max-w-lg px-4 pt-6">
      {/* ── Whose booking: the reference ── */}
      <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">{c.eyebrow}</p>
      <div className="mt-1 flex items-center gap-2">
        {/* Bebas, not Syne: Syne's figures are old-style, and this is a code
            a guest types into MCB Juice — a 1 that reads as "ı" costs a
            payment. */}
        <h1 className="font-bebas text-[2.75rem] leading-none tracking-[0.06em] text-offwhite">{v.reference}</h1>
        <CopyButton value={v.reference} label={c.copy} done={c.copied} compact />
      </div>

      {/* ── What it is ── */}
      <section className="mt-5 overflow-hidden rounded-xl border border-dark-border bg-dark-card">
        {v.product?.image && (
          <div className="relative aspect-[16/7] bg-dark">
            {/* eslint-disable-next-line @next/next/no-img-element -- the listing's own photo, any host */}
            <img src={v.product.image} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-dark-card via-dark-card/20 to-transparent" />
          </div>
        )}
        <div className="p-4">
          <h2 className="font-syne text-lg font-bold leading-snug text-offwhite">{title}</h2>
          {/* Most listing names already carry the operator ("… with Les Inséparables"). */}
          {v.product?.provider && !title.toLowerCase().includes(v.product.provider.toLowerCase()) && (
            <p className="mt-0.5 font-dm text-sm text-muted">{c.with(v.product.provider)}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 font-dm text-sm text-offwhite/85">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays size={14} className="text-yellow" aria-hidden /> {when}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Users size={14} className="text-yellow" aria-hidden /> {c.party(v.party?.adults ?? 0, v.party?.children ?? 0, v.party?.babies ?? 0)}
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-dark-border pt-3">
            <span className="font-dm text-sm text-muted">{c.total}</span>
            <span className="font-syne text-lg font-bold text-yellow">{v.amountMur != null ? formatMur(v.amountMur) : c.quoteLater}</span>
          </div>
        </div>
      </section>

      {/* ── Where it stands ── */}
      <section className="mt-6" aria-labelledby="rsv-status">
        <Timeline nodes={hub.nodes} labels={c.nodes} stamps={stamps} />
        <div aria-live="polite">
          {/* Not animated: the one sentence that says where the booking stands
              must be visible in the server's HTML, before any script runs. */}
          <p id="rsv-status" className="mt-5 font-syne text-xl font-bold leading-snug text-offwhite">
            {hub.state === "pay" && v.paymentReportedAt ? c.reported : c.state[hub.state]}
          </p>
        </div>
        {/* A reported payment extends the hold while Roulé checks (M241), so the
            countdown would be wrong — and the guest has done their part. */}
        {hub.state === "pay" && left && !v.paymentReportedAt && (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-yellow/30 bg-yellow/[0.08] px-3 py-1.5 font-dm text-sm text-yellow">
            <Clock size={14} aria-hidden /> {c.holdEnds} <strong className="font-syne tabular-nums">{left}</strong>
          </p>
        )}
        {hub.state === "declined" && v.declineReason && (
          <p className="mt-3 rounded-xl border border-dark-border bg-dark-card px-4 py-3 font-dm text-sm leading-relaxed text-offwhite/85">
            <span className="mr-1.5 font-bebas text-[10px] tracking-[0.2em] text-muted">{c.reason}</span>
            {v.declineReason}
          </p>
        )}
        {(live || down) && (
          <p className="mt-3 flex items-center gap-2 font-dm text-[11px] text-muted">
            {down ? (
              <>
                <WifiOff size={12} aria-hidden /> {c.offline}
              </>
            ) : (
              <>
                <span className="relative flex h-1.5 w-1.5" aria-hidden>
                  <span className="absolute inline-flex h-full w-full rounded-full bg-yellow/60 motion-safe:animate-ping" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-yellow" />
                </span>
                {c.live}
              </>
            )}
          </p>
        )}
      </section>

      {/* ── What to do now ── */}
      {hub.state === "needs_information" && v.infoRequest && (
        <InfoForm request={v.infoRequest} lang={lang} loading={loading} onSend={(answer) => act({ action: "answer", answer })} />
      )}

      {hub.payable && (
        <PaymentPanel view={v} lang={lang} left={left} loading={loading} token={token} paypalClientId={paypalClientId} act={act} refresh={refresh} />
      )}

      {/* ── What happens next ── */}
      {c.next[hub.state] && !(hub.state === "pay" && v.paymentReportedAt) && (
        <section className="mt-6">
          <h3 className="font-bebas text-[11px] tracking-[0.25em] text-muted">{c.nextTitle}</h3>
          <ol className="mt-2 space-y-2.5 rounded-xl border border-dark-border bg-dark-card p-4 font-dm text-sm text-offwhite/90">
            {c.next[hub.state]!.map((step, i) => (
              <li key={step} className="flex gap-3">
                <span className="font-bebas text-base leading-5 text-yellow">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* ── Actions ── */}
      <div className="mt-6 flex flex-col gap-2.5">
        {ended && (
          <Link
            href={againHref}
            className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-yellow px-5 font-syne text-sm font-bold text-dark transition-colors hover:bg-yellow-dark"
          >
            <CalendarDays size={16} aria-hidden /> {c.requestAgain}
          </Link>
        )}
        {wa && (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              // A note for the desk that the guest reached out; never blocks the tap.
              void fetch(`/api/reservations/${token}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "message_opened" }),
                keepalive: true,
              }).catch(() => {});
            }}
            className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-dark-border px-5 font-dm text-sm text-offwhite transition-colors hover:border-yellow/40 hover:text-yellow"
          >
            <MessageCircle size={16} aria-hidden /> {c.message}
          </a>
        )}
      </div>

      {/* ── Details ── */}
      <section className="mt-8">
        <h3 className="font-bebas text-[11px] tracking-[0.25em] text-muted">{c.details}</h3>
        <dl className="mt-2 divide-y divide-dark-border rounded-xl border border-dark-border bg-dark-card px-4 font-dm text-sm">
          <Row label={c.reference} value={v.reference} />
          <Row label={c.when} value={when} />
          <Row label={c.people} value={c.party(v.party?.adults ?? 0, v.party?.children ?? 0, v.party?.babies ?? 0)} />
          {v.product?.meeting_point && (
            <Row
              label={c.meeting}
              value={
                <span className="inline-flex items-start gap-1.5">
                  <MapPin size={13} className="mt-0.5 shrink-0 text-yellow" aria-hidden /> {v.product.meeting_point}
                </span>
              }
            />
          )}
          {v.amountMur != null && <Row label={c.total} value={formatMur(v.amountMur)} />}
          {v.depositDueMur != null && v.balanceDueMur != null && v.balanceDueMur > 0 && (
            <>
              <Row label={c.deposit} value={formatMur(v.depositDueMur)} />
              <Row label={c.balance} value={formatMur(v.balanceDueMur)} />
            </>
          )}
          {v.amountPaidMur > 0 && <Row label={c.paidSoFar} value={formatMur(v.amountPaidMur)} />}
        </dl>
      </section>
    </div>
  );
}

// ── The four nodes ──────────────────────────────────────────────────────────

function Timeline({
  nodes,
  labels,
  stamps,
}: {
  nodes: TimelineNode[];
  labels: [string, string, string, string];
  stamps: Partial<Record<TimelineNode["key"], string>>;
}) {
  return (
    <ol className="relative">
      {nodes.map((n, i) => {
        const last = i === nodes.length - 1;
        const reached = !last && (nodes[i + 1].state === "done" || nodes[i + 1].state === "active");
        return (
          <li key={n.key} className="relative flex gap-3.5 pb-5 last:pb-0" aria-current={n.state === "active" ? "step" : undefined}>
            {!last && (
              <span
                aria-hidden
                className={`absolute left-[13px] top-7 bottom-0 w-px ${reached ? "bg-yellow/45" : "bg-dark-border"}`}
              />
            )}
            <Dot state={n.state} />
            <div className="min-w-0 pt-0.5">
              <p
                className={`font-syne text-[15px] font-bold leading-6 ${
                  n.state === "active" ? "text-yellow" : n.state === "done" ? "text-offwhite" : "text-muted"
                } ${n.state === "stopped" ? "line-through decoration-muted/60" : ""}`}
              >
                {labels[i]}
              </p>
              {stamps[n.key] && n.state === "done" && <p className="font-dm text-[11px] text-muted">{stamps[n.key]}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Dot({ state }: { state: NodeState }) {
  if (state === "done") {
    return (
      <span className="relative z-[1] flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-green-500/50 bg-green-500/15">
        <Check size={14} className="text-green-400" strokeWidth={3} aria-hidden />
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className="relative z-[1] flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-yellow bg-dark">
        <span aria-hidden className="absolute inset-0 rounded-full bg-yellow/25 motion-safe:animate-ping" />
        <span aria-hidden className="relative h-2.5 w-2.5 rounded-full bg-yellow" />
      </span>
    );
  }
  if (state === "stopped") {
    return (
      <span className="relative z-[1] flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/15 bg-dark">
        <X size={13} className="text-muted" aria-hidden />
      </span>
    );
  }
  return (
    <span className="relative z-[1] flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-dark-border bg-dark">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-muted/50" />
    </span>
  );
}

// ── Roulé's question ────────────────────────────────────────────────────────

function InfoForm({
  request,
  lang,
  loading,
  onSend,
}: {
  request: NonNullable<GuestView["infoRequest"]>;
  lang: ResLang;
  loading: boolean;
  onSend: (answer: Record<string, string>) => Promise<boolean>;
}) {
  const c = HUB_COPY[lang];
  const fields = request.fields?.length ? request.fields : ["other"];
  const [values, setValues] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);
  const complete = fields.every((f) => (values[f] ?? "").trim().length > 0);

  return (
    <section className="mt-6 rounded-xl border border-yellow/30 bg-yellow/[0.05] p-4">
      <h3 className="font-bebas text-[11px] tracking-[0.25em] text-yellow">{c.answerTitle}</h3>
      {request.note && <p className="mt-1.5 font-dm text-sm leading-relaxed text-offwhite/90">{request.note}</p>}
      {sent ? (
        <p role="status" className="mt-3 font-dm text-sm text-offwhite">
          {c.sent}
        </p>
      ) : (
        <form
          className="mt-3 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!complete || loading) return;
            const answer = Object.fromEntries(fields.map((f) => [f, (values[f] ?? "").trim()]));
            if (await onSend(answer)) setSent(true);
          }}
        >
          {fields.map((f) => (
            <label key={f} className="block">
              <span className="mb-1 block font-dm text-xs text-muted">{c.fields[f] ?? f}</span>
              <input
                value={values[f] ?? ""}
                onChange={(e) => setValues((s) => ({ ...s, [f]: e.target.value }))}
                aria-label={c.fields[f] ?? f}
                maxLength={300}
                className="w-full rounded-xl border border-dark-border bg-dark px-4 py-3 font-dm text-sm text-offwhite placeholder:text-muted/50 focus:border-yellow focus:outline-none"
              />
            </label>
          ))}
          <button
            type="submit"
            disabled={!complete || loading}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-yellow font-syne text-sm font-bold text-dark transition-colors hover:bg-yellow-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading && <Loader2 size={15} className="animate-spin" />} {c.send}
          </button>
        </form>
      )}
    </section>
  );
}

// ── How to pay (only after Roulé confirms) ──────────────────────────────────

const ACCOUNT_RE = /\b\d{9,16}\b/;

function PaymentPanel({
  view: v,
  lang,
  left,
  loading,
  token,
  paypalClientId,
  act,
  refresh,
}: {
  view: GuestView;
  lang: ResLang;
  left: string | null;
  loading: boolean;
  token: string;
  paypalClientId: string | null;
  act: (body: Record<string, unknown>) => Promise<boolean>;
  refresh: (force?: boolean) => Promise<void>;
}) {
  const c = HUB_COPY[lang];
  // Card and PayPal account go through PayPal: offered only while it is live
  // and its button can load. Everything else is always available.
  const methods = (v.methods ?? []).filter((m) => (m.id !== "paypal" && m.id !== "card") || Boolean(paypalClientId));
  const [chosen, setChosen] = useState<string>(() => v.paymentReportedMethod ?? methods[0]?.id ?? "");
  const due = dueNow(v);
  const method = methods.find((m) => m.id === chosen) ?? methods[0];
  const deadline = v.paymentDeadlineAt ? fmtStamp(v.paymentDeadlineAt, lang) : null;

  if (methods.length === 0) return null;

  return (
    <section className="mt-6 rounded-xl border border-yellow/30 bg-dark-card p-4" aria-labelledby="rsv-pay">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="rsv-pay" className="font-bebas text-[11px] tracking-[0.25em] text-yellow">
          {c.payTitle}
        </h3>
        {deadline && <p className="font-dm text-[11px] text-muted">{c.payBy(deadline)}</p>}
      </div>
      <p className="mt-1 font-syne text-3xl font-extrabold text-offwhite tabular-nums">{formatMur(due)}</p>
      {v.amountPaidMur > 0 && (
        <p className="font-dm text-xs text-muted">
          {c.paidSoFar}: {formatMur(v.amountPaidMur)}
        </p>
      )}

      {v.paymentReportedAt ? (
        <p role="status" className="mt-4 flex items-start gap-2 rounded-xl border border-yellow/25 bg-yellow/[0.06] px-3.5 py-3 font-dm text-sm text-offwhite/90">
          <Clock size={15} className="mt-0.5 shrink-0 text-yellow" aria-hidden />
          <span>
            {c.reportedNote}
            <span className="mt-0.5 block text-[11px] text-muted">
              {(methods.find((m) => m.id === v.paymentReportedMethod)?.label?.[lang] ?? "") + " · "}
              {fmtStamp(v.paymentReportedAt, lang)}
            </span>
          </span>
        </p>
      ) : (
        <>
          {methods.length > 1 && (
            <fieldset className="mt-4">
              <legend className="mb-2 font-dm text-xs text-muted">{c.chooseMethod}</legend>
              <div className="grid grid-cols-2 gap-2">
                {methods.map((m) => (
                  <label
                    key={m.id}
                    className={`flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 font-dm text-sm transition-colors ${
                      method?.id === m.id ? "border-yellow bg-yellow/10 text-offwhite" : "border-dark-border text-muted hover:border-yellow/40"
                    }`}
                  >
                    <input
                      type="radio"
                      name="rsv-method"
                      value={m.id}
                      checked={method?.id === m.id}
                      onChange={() => setChosen(m.id)}
                      className="h-4 w-4 shrink-0 accent-yellow"
                    />
                    {m.label?.[lang] ?? m.label?.en ?? m.id}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {method && (
            <div className="mt-4">
              {method.instructions?.[lang] || method.instructions?.en ? (
                <p className="font-dm text-sm leading-relaxed text-offwhite/85">{method.instructions[lang] ?? method.instructions.en}</p>
              ) : null}

              {(method.id === "mcb_juice" || method.id === "bank_transfer") && (
                <>
                  <div className="mt-3 space-y-2">
                    {(() => {
                      const acct = ACCOUNT_RE.exec(method.instructions?.en ?? "")?.[0];
                      return acct ? <CopyRow label={c.account} value={acct} c={c} /> : null;
                    })()}
                    <CopyRow label={c.reference} value={v.reference} c={c} />
                    <CopyRow label={c.amount} value={String(due)} display={formatMur(due)} c={c} />
                  </div>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void act({ action: "report_payment", method: method.id })}
                    className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-yellow font-syne text-sm font-bold text-dark transition-colors hover:bg-yellow-dark disabled:opacity-60"
                  >
                    {loading && <Loader2 size={15} className="animate-spin" />} {c.iPaid}
                  </button>
                </>
              )}

              {(method.id === "paypal" || method.id === "card") && (
                <div className="mt-3">
                  <ReservationPayPal
                    key={method.id}
                    clientId={paypalClientId ?? ""}
                    token={token}
                    funding={method.id === "card" ? "card" : "paypal"}
                    dueMur={due}
                    payLabel={c.payPaypal}
                    feeLabel={method.id === "card" ? c.cardFee : c.paypalFee}
                    doneLabel={c.paypalDone}
                    errorLabel={c.paypalError}
                    onPaid={() => void refresh(true)}
                  />
                </div>
              )}

              {method.channel === "in_person" && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void act({ action: "choose_cash" })}
                  className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-yellow/50 font-syne text-sm font-bold text-yellow transition-colors hover:bg-yellow/10 disabled:opacity-60"
                >
                  {loading && <Loader2 size={15} className="animate-spin" />} {c.cashChoice}
                </button>
              )}
            </div>
          )}
        </>
      )}
      {left && !v.paymentReportedAt && <p className="sr-only">{`${c.holdEnds} ${left}`}</p>}
    </section>
  );
}

// ── Small parts ─────────────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 text-right text-offwhite">{value}</dd>
    </div>
  );
}

function useCopy(value: string) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      window.setTimeout(() => setDone(false), 1600);
    } catch {
      /* the value stays visible to copy by hand */
    }
  };
  return { done, copy };
}

function CopyButton({ value, label, done: doneLabel, compact }: { value: string; label: string; done: string; compact?: boolean }) {
  const { done, copy } = useCopy(value);
  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={`${label} ${value}`}
      className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-lg text-muted transition-colors hover:text-yellow ${compact ? "" : "border border-dark-border px-3"}`}
    >
      {done ? <Check size={16} className="text-yellow" aria-hidden /> : <Copy size={16} aria-hidden />}
      <span className={compact ? "sr-only" : "font-dm text-xs"} aria-live="polite">
        {done ? doneLabel : compact ? "" : label}
      </span>
    </button>
  );
}

function CopyRow({ label, value, display, c }: { label: string; value: string; display?: string; c: (typeof HUB_COPY)[ResLang] }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-dark px-3 py-1.5">
      <div className="min-w-0">
        <p className="font-bebas text-[10px] tracking-[0.2em] text-muted">{label}</p>
        <p className="break-all font-dm text-[15px] font-semibold tracking-wide text-offwhite tabular-nums">{display ?? value}</p>
      </div>
      <CopyButton value={value} label={c.copy} done={c.copied} />
    </div>
  );
}

