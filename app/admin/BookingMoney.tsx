"use client";

import { useState } from "react";
import { Banknote, Loader2, MessageCircle, UserX, Wallet } from "lucide-react";
import {
  METHOD_LABEL,
  PAYMENT_METHODS,
  rupees,
  type BookingKind,
  type BookingPaymentMethod,
} from "@/lib/bookings/in-person";
import {
  BADGE_TEXT,
  cashDateDefault,
  checkCashAmount,
  isIslandDay,
  methodPhrase,
  moneyStrip,
  paymentOutcomeUnknown,
  receiptByDefault,
  toldLine,
  waHref,
  type DeskRow,
  type PaymentBadge,
} from "@/lib/admin/booking-money";

// ── THE OWNER'S MONEY BUTTONS, FOR BOTH BOOKING DESKS (M220) ────────────────
//
// The owner, 29 Sept 2026: "accept a booking directly without paying on the
// website as people tend to pay on cash by hand". He was doing it with the
// "Confirmed" status pill, which means "the bank transfer arrived" — so the
// customer was told nothing in writing and the cash, when it came, could not
// be recorded anywhere.
//
// Three moments, one endpoint (/api/admin/bookings/in-person):
//   · Confirm — pays in person: the promise. Holds the booking, emails the
//     customer what to bring. Optionally records cash handed over right then.
//   · Cash received: the evidence. A ledger row, a running total, a receipt.
//   · No-show: they never came. Cancelled, marked, nothing refunded.
//
// Rendered by the rentals desk, the Stay & Activity desk and the dashboard
// agenda from this one file, so the three cannot drift into asking for
// different amounts or wording the same act three ways.

/** What a desk card says after an action, kept on the card after it reloads. */
export type DeskNotice = { tone: "good" | "warn"; text: string; phone?: string | null };

type InPersonReply = {
  ok?: boolean;
  error?: string;
  code?: string;
  emailed?: boolean;
  hasEmail?: boolean | null;
  /** payment: the owner chose no receipt (M222). */
  receiptSkipped?: boolean;
  repeat?: boolean;
  receipt?: { emailed?: boolean } | null;
  result?: { total?: number | null; paid?: number; balance?: number; already?: boolean };
};

/**
 * POST /api/admin/bookings/in-person. Never throws: a dropped connection comes
 * back as a refusal with a sentence, so no caller can mistake it for success.
 */
export async function postInPerson(body: {
  kind: BookingKind;
  id: string;
  action: "confirm" | "payment" | "no_show";
  amountRupees?: number;
  method?: BookingPaymentMethod;
  note?: string;
  force?: boolean;
  /** payment: the island day the money changed hands, YYYY-MM-DD (M222). */
  receivedOn?: string;
  /** payment: email the customer a receipt (default yes). */
  notify?: boolean;
}): Promise<{ ok: boolean; status: number; reply: InPersonReply }> {
  try {
    const res = await fetch("/api/admin/bookings/in-person", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const reply = (await res.json().catch(() => ({}))) as InPersonReply;
    return { ok: res.ok, status: res.status, reply };
  } catch {
    return { ok: false, status: 0, reply: { error: "You appear to be offline — nothing was saved. Try again." } };
  }
}

function refusal(status: number, reply: InPersonReply): string {
  if (status === 401) return "Your admin session has expired — please sign in again. Nothing was saved.";
  return reply.error ?? `That did not work (error ${status}). Nothing was saved.`;
}

/** The receipt half of a payment's outcome. Not a reason to phone anyone. */
function receiptLine(reply: { emailed?: boolean; hasEmail?: boolean | null; receiptSkipped?: boolean }): string {
  if (reply.receiptSkipped) return "No receipt emailed, as you chose.";
  if (reply.emailed) return "Receipt emailed to the customer.";
  if (reply.hasEmail) return "The receipt email did not go out.";
  return "No email on file, so no receipt was sent.";
}

/** The line a card keeps after an action: what happened, and whether to phone. */
export function DeskNoticeLine({ notice, onDismiss }: { notice: DeskNotice; onDismiss?: () => void }) {
  const wa = notice.phone ? waHref(notice.phone) : null;
  return (
    <div
      role="status"
      className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border px-3.5 py-2.5 font-dm text-xs ${
        notice.tone === "good"
          ? "border-green-500/30 bg-green-500/[0.07] text-green-300"
          : "border-yellow/40 bg-yellow/[0.07] text-yellow"
      }`}
    >
      <span className="leading-relaxed">{notice.text}</span>
      {wa && (
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full bg-green-500/15 px-2.5 py-1 text-green-400 transition-colors hover:bg-green-500/25"
        >
          <MessageCircle size={11} /> WhatsApp them
        </a>
      )}
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="ml-auto text-[11px] text-muted hover:text-offwhite">
          Dismiss
        </button>
      )}
    </div>
  );
}

const fieldCls =
  "rounded-lg border border-[#2a2a2a] bg-[#0d0d0d] px-2 py-1 font-dm text-xs text-offwhite tabular-nums focus:border-yellow focus:outline-none";

// ── Confirm — pays in person ─────────────────────────────────────────────────

export function InPersonConfirm({
  kind,
  id,
  total,
  phone,
  disabled,
  onDone,
  onCancel,
}: {
  kind: BookingKind;
  id: string;
  /** The whole price, rupees — caps the "cash taken now" field. */
  total: number | null;
  phone: string | null;
  disabled?: boolean;
  onDone: (n: DeskNotice) => void;
  onCancel: () => void;
}) {
  const [cash, setCash] = useState("");
  const [working, setWorking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // The vehicle clash check (409 CLASH). Kept as its own state so the override
  // is a separate, deliberate press — never the same button pressed twice.
  const [clash, setClash] = useState<string | null>(null);

  async function send(force: boolean) {
    let amountRupees: number | undefined;
    if (cash.trim()) {
      const c = checkCashAmount(cash, total);
      if (!c.ok) {
        setErr(c.error);
        return;
      }
      amountRupees = c.amount;
    }
    setWorking(true);
    setErr(null);
    const { ok, status, reply } = await postInPerson({
      kind,
      id,
      action: "confirm",
      amountRupees,
      force: force || undefined,
    });
    setWorking(false);

    if (!ok) {
      if (reply.code === "CLASH") setClash(reply.error ?? "That vehicle is already held for those dates by another booking.");
      else setErr(refusal(status, reply));
      return;
    }
    setClash(null);

    const r = reply.result ?? {};
    if (reply.repeat || r.already) {
      onDone({ tone: "good", text: "Already confirmed as paid in person — nothing changed and nobody was emailed twice." });
      return;
    }
    const money = amountRupees
      ? ` ${rupees(amountRupees)} cash recorded — ${r.balance ? `${rupees(r.balance)} left to collect.` : "paid in full."}${
          reply.receipt?.emailed ? " Receipt emailed." : ""
        }`
      : typeof r.balance === "number" && r.balance > 0
        ? ` ${rupees(r.balance)} to collect in person.`
        : "";
    onDone({
      tone: reply.emailed ? "good" : "warn",
      text: `Confirmed — pays in person.${money} ${toldLine(reply)}`,
      phone: reply.emailed ? null : phone,
    });
  }

  const busy = disabled || working;
  const thing = kind === "vehicle" ? "The vehicle" : "Their place";
  const when = kind === "vehicle" ? "at pickup" : "on the day";

  return (
    <div className="mt-2.5 space-y-2">
      <p className="font-dm text-[11px] leading-relaxed text-muted/70">
        Confirmed now, paid {when}. {thing} is held for them, any pay-by deadline is cleared, and they are emailed
        {total ? ` that they owe ${rupees(total)}` : " what they owe"} with nothing to pay online. Nothing counts as paid
        until you record the money.
      </p>
      <label className="block font-dm text-[11px] text-muted">
        Cash taken now (optional): Rs
        <input
          value={cash}
          onChange={(e) => setCash(e.target.value)}
          inputMode="numeric"
          placeholder="0"
          aria-label="Cash taken now, in rupees"
          className={`mx-2 w-24 text-center ${fieldCls}`}
        />
      </label>
      <p className="font-dm text-[11px] leading-relaxed text-muted/50">
        Only if money is in your hand right now — it is recorded as cash and receipted.
      </p>

      {clash ? (
        <div className="space-y-2 rounded-lg border border-red-500/30 bg-red-500/[0.06] p-2.5">
          <p className="font-dm text-[11px] leading-relaxed text-red-300">{clash}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => send(true)}
              className="rounded-full border border-red-500/40 bg-red-500/10 px-3.5 py-1.5 font-syne text-[11px] font-bold text-red-300 transition-colors hover:bg-red-500/20 disabled:opacity-50"
            >
              {working ? "Confirming…" : "Confirm anyway (the other booking is a duplicate)"}
            </button>
            <button type="button" onClick={onCancel} className="font-dm text-[11px] text-muted hover:text-offwhite">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => send(false)}
            className="inline-flex items-center gap-1.5 rounded-full bg-yellow px-3.5 py-1.5 font-syne text-[11px] font-bold text-dark transition-colors hover:bg-yellow-dark disabled:opacity-50"
          >
            {working ? <Loader2 size={11} className="animate-spin" /> : <Wallet size={11} />}
            {working ? "Confirming…" : "Confirm — pays in person"}
          </button>
          <button type="button" onClick={onCancel} className="font-dm text-[11px] text-muted hover:text-offwhite">
            Cancel
          </button>
        </div>
      )}
      {err && <p className="font-dm text-[11px] text-red-400">{err}</p>}
    </div>
  );
}

// ── Cash received ────────────────────────────────────────────────────────────

/** "8 Sept 2026" for an island day — read as a calendar date, not an instant. */
function dayLabel(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function CashForm({
  kind,
  id,
  balance,
  today,
  startDate,
  onDone,
  onCancel,
}: {
  kind: BookingKind;
  id: string;
  /** Still owed, rupees: the prefill, and the ceiling. Null = no price on the booking, no ceiling. */
  balance: number | null;
  /** The island's YYYY-MM-DD. */
  today: string;
  /** The booking's first day — the date prefill once it has passed (M222). */
  startDate?: string | null;
  onDone: (n: DeskNotice) => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState(balance ? String(balance) : "");
  const [method, setMethod] = useState<BookingPaymentMethod>("cash");
  const [note, setNote] = useState("");
  // M222: the day the money changed hands, and whether to email a receipt.
  // The receipt follows the date (off for money more than a week old) until
  // the owner ticks or unticks it himself; after that it is his choice.
  const [day, setDay] = useState(() => cashDateDefault(startDate, today));
  const [notify, setNotify] = useState(() => receiptByDefault(cashDateDefault(startDate, today), today));
  const [notifyTouched, setNotifyTouched] = useState(false);
  // The amount waiting for "Yes, record it". Money written by a mistyped
  // figure is a customer with a wrong receipt, so it is said back first.
  const [checked, setChecked] = useState<number | null>(null);
  const [working, setWorking] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function changeDay(next: string) {
    setDay(next);
    if (!notifyTouched && isIslandDay(next)) setNotify(receiptByDefault(next, today));
  }

  function review() {
    const c = checkCashAmount(amount, balance);
    if (!c.ok) {
      setErr(c.error);
      return;
    }
    if (!isIslandDay(day)) {
      setErr("Enter the day the money was received.");
      return;
    }
    if (day > today) {
      setErr("The payment date cannot be in the future.");
      return;
    }
    setErr(null);
    setChecked(c.amount);
  }

  async function send() {
    if (checked === null) return;
    setWorking(true);
    const { ok, status, reply } = await postInPerson({
      kind,
      id,
      action: "payment",
      amountRupees: checked,
      method,
      note: note.trim() || undefined,
      receivedOn: day,
      notify,
    });
    setWorking(false);
    if (!ok) {
      // A dropped line or a 5xx can come AFTER the RPC committed. "Nothing
      // was saved" would invite a second press and a second ledger row for
      // the same cash, so the form closes, the list reloads, and the owner
      // reads the strip before pressing again.
      if (paymentOutcomeUnknown(status)) {
        onDone({ tone: "warn", text: "Could not confirm it was recorded — check the payment strip before trying again." });
        return;
      }
      setErr(refusal(status, reply));
      setChecked(null);
      return;
    }
    const left = reply.result?.balance;
    onDone({
      tone: "good",
      text: `Recorded ${rupees(checked)} ${methodPhrase(method, METHOD_LABEL[method])}${
        day === today ? "" : `, received ${dayLabel(day)}`
      }. ${reply.result?.total == null ? "" : left ? `${rupees(left)} still to collect. ` : "Paid in full. "}${receiptLine(reply)}`,
    });
  }

  const how = methodPhrase(method, METHOD_LABEL[method]);

  return (
    <div className="mt-2.5 space-y-2 rounded-lg border border-[#2a2a2a] bg-[#0a0a0a] p-2.5">
      {checked === null ? (
        <>
          <div className="flex flex-wrap items-center gap-2 font-dm text-[11px] text-muted">
            <label className="inline-flex items-center gap-1.5">
              Received Rs
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="numeric"
                aria-label="Amount received, in rupees"
                className={`w-24 text-center ${fieldCls}`}
              />
            </label>
            <label className="inline-flex items-center gap-1.5">
              by
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as BookingPaymentMethod)}
                aria-label="Payment method"
                className={fieldCls}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {METHOD_LABEL[m]}
                  </option>
                ))}
              </select>
            </label>
            <label className="inline-flex items-center gap-1.5">
              on
              <input
                type="date"
                value={day}
                max={today}
                onChange={(e) => changeDay(e.target.value)}
                aria-label="Day the money was received"
                className={fieldCls}
              />
            </label>
          </div>
          {balance === null && (
            <p className="font-dm text-[11px] leading-relaxed text-muted/60">
              This booking has no price on it, so any amount can be recorded — check it against what you agreed.
            </p>
          )}
          <input
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 300))}
            placeholder="Note (optional) — e.g. paid at the jetty, change given"
            aria-label="Note"
            className={`w-full px-2.5 py-1.5 ${fieldCls}`}
          />
          <label className="flex items-center gap-2 font-dm text-[11px] text-muted">
            <input
              type="checkbox"
              checked={notify}
              onChange={(e) => {
                setNotifyTouched(true);
                setNotify(e.target.checked);
              }}
              className="h-3 w-3 accent-yellow"
            />
            Email the customer a receipt
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={review}
              className="rounded-full bg-yellow px-3.5 py-1.5 font-syne text-[11px] font-bold text-dark transition-colors hover:bg-yellow-dark"
            >
              Continue
            </button>
            <button type="button" onClick={onCancel} className="font-dm text-[11px] text-muted hover:text-offwhite">
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="font-dm text-xs text-offwhite">
            You are recording <strong className="text-yellow">{rupees(checked)}</strong> {how}, received{" "}
            {day === today ? "today" : dayLabel(day)}.
            {balance !== null && checked < balance && (
              <span className="text-muted"> {rupees(balance - checked)} will still be owed.</span>
            )}
            <span className="text-muted">
              {notify ? " The customer is emailed a receipt." : " No receipt is emailed."}
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={working}
              onClick={send}
              className="inline-flex items-center gap-1.5 rounded-full bg-green-500 px-3.5 py-1.5 font-syne text-[11px] font-bold text-dark transition-colors hover:bg-green-400 disabled:opacity-50"
            >
              {working ? <Loader2 size={11} className="animate-spin" /> : <Banknote size={11} />}
              {working ? "Recording…" : "Yes, record it"}
            </button>
            <button
              type="button"
              disabled={working}
              onClick={() => setChecked(null)}
              className="font-dm text-[11px] text-muted hover:text-offwhite"
            >
              Change
            </button>
          </div>
        </>
      )}
      {err && <p className="font-dm text-[11px] text-red-400">{err}</p>}
    </div>
  );
}

// ── The payment strip on every card ─────────────────────────────────────────

const BADGE_CLS: Record<(typeof BADGE_TEXT)[PaymentBadge]["tone"], string> = {
  good: "border-green-500/30 bg-green-500/10 text-green-400",
  cash: "border-yellow/40 bg-yellow/10 text-yellow",
  warn: "border-amber-400/30 bg-amber-400/10 text-amber-400",
  muted: "border-[#2a2a2a] text-muted/70",
  bad: "border-red-500/30 bg-red-500/10 text-red-400",
};

export function PaymentStrip({
  kind,
  id,
  row,
  today,
  isCar,
  onChanged,
}: {
  kind: BookingKind;
  id: string;
  row: DeskRow;
  /** The island's YYYY-MM-DD. */
  today: string;
  /** A car's refundable security deposit is a separate sum, said so here. */
  isCar?: boolean;
  onChanged: (n: DeskNotice) => void;
}) {
  const s = moneyStrip(kind, row, today);
  const [mode, setMode] = useState<null | "cash" | "no_show">(null);
  const [working, setWorking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const badge = s.badge ? BADGE_TEXT[s.badge] : null;

  async function noShow() {
    setWorking(true);
    setErr(null);
    const { ok, status, reply } = await postInPerson({ kind, id, action: "no_show" });
    setWorking(false);
    if (!ok) {
      setErr(refusal(status, reply));
      return;
    }
    setMode(null);
    onChanged({
      tone: "good",
      text: `Marked as a no-show. The booking is cancelled and ${
        kind === "vehicle" ? "the vehicle" : "the place"
      } is free again. Nothing was refunded and the customer was not emailed.`,
    });
  }

  return (
    <div className="rounded-xl border border-[#2a2a2a] bg-[#0d0d0d] p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-bebas text-[9px] tracking-[0.2em] text-muted">PAYMENT</p>
        {badge && (
          <span
            className={`rounded-full border px-2.5 py-0.5 font-bebas text-[10px] tracking-[0.15em] ${BADGE_CLS[badge.tone]}`}
          >
            {badge.label.toUpperCase()}
          </span>
        )}
        {s.overdue && (
          <span
            title="The day has come and no payment is recorded — record the cash, or mark a no-show."
            className="rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 font-bebas text-[10px] tracking-[0.15em] text-red-400"
          >
            NOTHING RECORDED YET
          </span>
        )}
      </div>

      <p className="mt-1.5 font-dm text-xs tabular-nums text-offwhite">
        Total {s.total !== null ? rupees(s.total) : "—"}
        <span className="text-muted/50"> · </span>
        Paid {rupees(s.paid)}
        {s.toCollect !== null && (
          <>
            <span className="text-muted/50"> · </span>
            {s.toCollect > 0 ? (
              <strong className="text-yellow">To collect {rupees(s.toCollect)}</strong>
            ) : (
              <span className="text-green-400">Nothing left to collect</span>
            )}
          </>
        )}
      </p>
      {isCar && (
        <p className="mt-1 font-dm text-[11px] text-muted/60">
          The car&apos;s refundable security deposit is separate and not part of these figures.
        </p>
      )}

      {!mode && (s.canRecordPayment || s.canMarkNoShow) && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {s.canRecordPayment && (
            <button
              type="button"
              onClick={() => setMode("cash")}
              className="inline-flex items-center gap-1.5 rounded-full border border-green-500/40 bg-green-500/10 px-3 py-1.5 font-syne text-[11px] font-bold text-green-400 transition-colors hover:bg-green-500/20"
            >
              <Banknote size={12} /> Cash received
            </button>
          )}
          {s.canMarkNoShow && (
            <button
              type="button"
              onClick={() => setMode("no_show")}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#2a2a2a] px-3 py-1.5 font-syne text-[11px] font-bold text-muted transition-colors hover:border-red-500/40 hover:text-red-400"
            >
              <UserX size={12} /> No-show
            </button>
          )}
        </div>
      )}

      {mode === "cash" && (
        <CashForm
          kind={kind}
          id={id}
          balance={s.toCollect}
          today={today}
          startDate={row.start_date}
          onCancel={() => setMode(null)}
          onDone={(n) => {
            setMode(null);
            onChanged(n);
          }}
        />
      )}

      {mode === "no_show" && (
        <div className="mt-2.5 space-y-2 rounded-lg border border-red-500/30 bg-red-500/[0.05] p-2.5">
          <p className="font-dm text-xs leading-relaxed text-offwhite">
            They did not come? The booking is cancelled and {kind === "vehicle" ? "the vehicle" : "the place"} is
            freed. Nothing is refunded and the customer is not emailed.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={working}
              onClick={noShow}
              className="rounded-full border border-red-500/40 bg-red-500/10 px-3.5 py-1.5 font-syne text-[11px] font-bold text-red-300 transition-colors hover:bg-red-500/20 disabled:opacity-50"
            >
              {working ? "Saving…" : "Yes — mark a no-show"}
            </button>
            <button type="button" onClick={() => setMode(null)} className="font-dm text-[11px] text-muted hover:text-offwhite">
              Back
            </button>
          </div>
        </div>
      )}
      {err && <p className="mt-2 font-dm text-[11px] text-red-400">{err}</p>}
    </div>
  );
}
