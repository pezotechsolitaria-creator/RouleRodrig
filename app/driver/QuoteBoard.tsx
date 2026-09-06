"use client";

import { useMemo, useState } from "react";
import {
  ERRAND_LABEL,
  isErrandKind,
  KIND_LABEL,
  LEG_LABEL,
  mayLayOutMoney,
  toRequestKind,
  type RequestKind,
} from "@/lib/delivery/kind";
import { AnimatePresence, motion } from "framer-motion";
import {
  Loader2,
  Package,
  ShoppingBasket,
  ClipboardCheck,
  MapPin,
  Users,
  Check,
  Clock,
  Gavel,
  CalendarClock,
  Navigation,
  Zap,
} from "lucide-react";

// A Record, so a fourth kind cannot quietly inherit the parcel icon. See
// lib/delivery/kind.ts for why every one of these is a map and not a ternary.
const KIND_ICON: Record<RequestKind, typeof Package> = {
  package: Package,
  shop_and_deliver: ShoppingBasket,
  errand: ClipboardCheck,
};
import { cn } from "@/lib/utils";
import { toCents, centsToShortString } from "@/lib/money";
import { transition, type as t } from "@/lib/delivery/tokens";
import { formatWindow, urgencyOf, type Urgency } from "@/lib/delivery/schedule";

// ── The board a driver names their own price on ─────────────────────────────
//
// The other half of the screen this dashboard has always had. Everything above
// it is DISPATCH: a job at a price the platform already set, offered to one
// driver at a time, won by tapping fast. This is the opposite — an open board,
// no price yet, and the customer chooses between whoever bids.
//
// Those two things must never look the same. A driver who reads a board post as
// a dispatch offer thinks they lost a race they were never in, and a driver who
// reads a dispatch offer as a board post lets it expire. So this section has its
// own heading, its own verb ("Quote", never "Accept"), and says out loud that
// somebody else decides.
//
// ── Why the fee input is a decimal string ──────────────────────────────────
// A driver types "250", or "250.50", into a phone keypad. That string goes
// through toCents(), never through parseFloat: 9.995 * 100 is 999.4999999999999
// in IEEE-754, which rounds DOWN to Rs 9.99 and hands a driver a rupee less
// than they asked for. See lib/money.ts.

export type OpenRequest = {
  id: string;
  kind: string;
  what: string;
  sizeClass: string;
  /** M152. WHEN the customer needs it — the single most useful fact on this
   *  card, and the one the board had no column for until now. */
  scheduleKind: string | null;
  timeSlot: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  /** The window is open already, so this is startable this minute. */
  startsNow?: boolean;
  /** From the driver's last reported position to the pickup. Null when either
   *  end is unknown — which is normal, and must not read as "0 km away". */
  distanceKm?: number | null;
  pickupText: string;
  pickupNote: string | null;
  dropoffText: string;
  dropoffNote: string | null;
  spendCap: number | null;
  /** What SORT of errand, when this is one. Null on the other two kinds. */
  errandKind: string | null;
  createdAt: string;
  expiresAt: string | null;
  quoteCount: number;
  myQuote: { id: string; fee: number; note: string | null } | null;
  /** This driver is OFF DUTY and the row is here for one reason only: so they
   *  can take their price back. Going offline is how a driver says they cannot
   *  come; leaving a live quote unreachable means a customer books somebody who
   *  will not turn up, and the driver is then marked unresponsive for it. */
  offDuty?: boolean;
};

type Filter = "all" | "soon" | "later";

export default function QuoteBoard({
  requests,
  busy,
  onQuote,
  onWithdraw,
}: {
  requests: OpenRequest[];
  busy: string | null;
  onQuote: (requestId: string, fee: number, note: string) => Promise<boolean>;
  onWithdraw: (quoteId: string) => Promise<void>;
}) {
  const [filter, setFilter] = useState<Filter>("all");

  // ── The filter is CLIENT-SIDE, and that is deliberate ───────────────────
  // driver_open_requests() takes a date range, and this could send one. It does
  // not, because the board is not paginated: the whole list is already here, so
  // filtering in the browser is instant and cannot disagree with the ordering
  // the server just applied. The server parameters exist for the day this list
  // is long enough to page — that day is not today, with one driver.
  const shown = useMemo(() => {
    if (filter === "all") return requests;
    return requests.filter((r) => {
      const u = urgencyOf(r.windowStart);
      return filter === "soon"
        ? u === "now" || u === "today" || u === "tomorrow"
        : u === "later";
    });
  }, [requests, filter]);

  const laterCount = useMemo(
    () => requests.filter((r) => urgencyOf(r.windowStart) === "later").length,
    [requests],
  );

  if (requests.length === 0) return null;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-syne text-lg font-bold">
          {requests.every((r) => r.offDuty)
            ? "Your prices are still out"
            : "Jobs you can quote on"}
        </h2>
        {/* The sentence that stops this being mistaken for dispatch. */}
        <p className={cn(t.meta, "mt-0.5 text-[#B0B0B0]")}>
          {requests.every((r) => r.offDuty)
            ? "You are off duty, but these customers can still book you. Withdraw any you cannot do."
            : "No fixed price on these. Name yours — the customer picks who they want."}
        </p>
        {/* ── SAYING THE ORDER OUT LOUD ──────────────────────────────────
            A sorted list that does not explain itself gets read as a random
            one, and a driver who thinks the order is arbitrary scrolls to the
            bottom looking for the good jobs — which is precisely how the
            urgent ones get missed. */}
        <p
          className={cn(t.meta, "mt-2 flex items-start gap-1.5 text-[#B0B0B0]")}
        >
          <Zap size={13} className="mt-1 shrink-0 text-yellow" aria-hidden />
          Soonest delivery time first, then nearest to you — so urgent jobs are
          never buried under ones booked weeks ahead.
        </p>
      </div>

      {/* Only worth showing once there is actually something far out to hide. */}
      {laterCount > 0 && (
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Filter by when"
        >
          {[
            { k: "all" as const, label: `All (${requests.length})` },
            {
              k: "soon" as const,
              label: `Next 2 days (${requests.length - laterCount})`,
            },
            { k: "later" as const, label: `Later (${laterCount})` },
          ].map((o) => (
            <button
              key={o.k}
              type="button"
              onClick={() => setFilter(o.k)}
              aria-pressed={filter === o.k}
              className={cn(
                "min-h-11 rounded-full border px-4 font-dm text-sm transition-colors",
                filter === o.k
                  ? "border-yellow/60 bg-yellow/[0.10] text-offwhite"
                  : "border-white/15 text-[#B0B0B0]",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 && (
        <p
          className={cn(
            t.meta,
            "rounded-xl border border-white/10 p-4 text-[#B0B0B0]",
          )}
        >
          Nothing in that range right now.
        </p>
      )}

      {shown.map((r) => (
        <RequestCard
          key={r.id}
          request={r}
          busy={busy}
          onQuote={onQuote}
          onWithdraw={onWithdraw}
        />
      ))}
    </div>
  );
}

function RequestCard({
  request: r,
  busy,
  onQuote,
  onWithdraw,
}: {
  request: OpenRequest;
  busy: string | null;
  onQuote: (requestId: string, fee: number, note: string) => Promise<boolean>;
  onWithdraw: (quoteId: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [fee, setFee] = useState(
    r.myQuote ? centsToShortString(r.myQuote.fee) : "",
  );
  const [note, setNote] = useState(r.myQuote?.note ?? "");

  const cents = fee.trim() ? toCents(fee) : null;
  const valid = cents !== null && cents >= 100 && cents <= 5_000_000;
  const kind = toRequestKind(r.kind);
  const Icon = KIND_ICON[kind];
  const quoting = busy === `quote-${r.id}`;
  const withdrawing = busy === `withdraw-${r.myQuote?.id}`;

  return (
    <div
      // Anchor for the ?request= deep link the new-request push carries, so
      // the tap lands on THIS card rather than the top of the board.
      id={`request-${r.id}`}
      className={cn(
        "rounded-2xl border bg-dark-card p-4 transition-colors",
        r.myQuote ? "border-yellow/35" : "border-white/10",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.05] text-[#B0B0B0]">
          <Icon size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-syne text-base font-bold leading-snug">{r.what}</p>
          {/* ── WHEN, ABOVE EVERYTHING ELSE ──────────────────────────────
              This is the fact a driver decides on. It goes first, in the
              accent, and carries a badge for anything that is not "later" —
              because a list sorted by urgency still needs each row to say why
              it is where it is. */}
          <p className="mt-1.5 flex flex-wrap items-center gap-2">
            <UrgencyBadge
              urgency={urgencyOf(r.windowStart)}
              startsNow={r.startsNow}
            />
            <span className={cn(t.meta, "text-offwhite")}>
              {formatWindow(
                r.windowStart,
                r.windowEnd,
                r.scheduleKind,
                r.timeSlot,
                "en",
              )}
            </span>
          </p>
          <p
            className={cn(
              t.meta,
              "mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[#B0B0B0]",
            )}
          >
            {typeof r.distanceKm === "number" && (
              <>
                <span className="inline-flex items-center gap-1">
                  <Navigation size={11} aria-hidden /> {r.distanceKm} km away
                </span>
                <span aria-hidden>·</span>
              </>
            )}
            <span>
              {/* For an errand the useful words are what SORT of errand it
                  is. "Do it for me" alone tells a driver nothing they can
                  price — paying a bill and queuing at a counter are very
                  different amounts of an afternoon. */}
              {isErrandKind(r.errandKind)
                ? ERRAND_LABEL[r.errandKind]
                : KIND_LABEL[kind]}
            </span>
            {r.sizeClass === "large" && (
              <>
                <span aria-hidden>·</span>
                <span className="text-yellow/80">Large item</span>
              </>
            )}
            {r.quoteCount > 0 && (
              <>
                <span aria-hidden>·</span>
                {/* A driver deciding whether to bother deserves to know they
                    would be the fourth quote, and the customer is better served
                    by a price set with that in mind. */}
                <span className="inline-flex items-center gap-1">
                  <Users size={11} /> {r.quoteCount} quoted
                </span>
              </>
            )}
          </p>
        </div>
      </div>

      {/* Both addresses, always. A driver cannot price a job without knowing
          where it starts and ends — the same rule the WhatsApp message follows. */}
      <div className="mt-3 space-y-2">
        <Where label={LEG_LABEL[kind].pickup} place={r.pickupText} note={r.pickupNote} />
        <Where label={LEG_LABEL[kind].dropoff} place={r.dropoffText} note={r.dropoffNote} />
      </div>

      {mayLayOutMoney(kind, r.spendCap) && (
        // Never merged with the fee. A driver who reads the shopping cap as
        // their pay quotes against the wrong number and loses money at the till.
        <p
          className={cn(
            t.meta,
            "mt-3 rounded-lg bg-white/[0.03] px-3 py-2 text-[#B0B0B0]",
          )}
        >
          They repay what you spend, up to{" "}
          <span className="text-offwhite">
            Rs {centsToShortString(r.spendCap)}
          </span>
          . Your fee is separate.
        </p>
      )}

      {r.myQuote && !open && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-yellow/25 bg-yellow/[0.06] px-3 py-2.5">
          <p className={cn(t.bodySm, "text-offwhite")}>
            <Check size={13} className="mr-1 inline text-yellow" />
            You quoted{" "}
            <span className="font-semibold text-yellow">
              Rs {centsToShortString(r.myQuote.fee)}
            </span>
          </p>
          <div className="flex shrink-0 items-center gap-3">
            {!r.offDuty && (
              <button
                type="button"
                onClick={() => setOpen(true)}
                className={cn(
                  t.meta,
                  "text-yellow/80 underline underline-offset-4",
                )}
              >
                Change
              </button>
            )}
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void onWithdraw(r.myQuote!.id)}
              className={cn(
                t.meta,
                "text-[#B0B0B0] underline underline-offset-4 disabled:opacity-50",
              )}
            >
              {withdrawing ? "Withdrawing…" : "Withdraw"}
            </button>
          </div>
        </div>
      )}

      {!r.myQuote && !open && !r.offDuty && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full bg-yellow font-syne text-base font-bold text-dark"
        >
          <Gavel size={16} /> Name your price
        </button>
      )}

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={transition.step}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-3">
              <div>
                <label
                  htmlFor={`fee-${r.id}`}
                  className={cn(t.meta, "mb-1.5 block text-[#B0B0B0]")}
                >
                  Your price for this delivery (Rs)
                </label>
                <input
                  id={`fee-${r.id}`}
                  type="text"
                  inputMode="decimal"
                  value={fee}
                  onChange={(e) => setFee(e.target.value)}
                  placeholder="250"
                  autoFocus
                  className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 font-dm text-lg tabular-nums text-offwhite placeholder:text-[#B0B0B0] focus:border-yellow/50 focus:outline-none focus:ring-2 focus:ring-yellow/25"
                />
                {fee.trim() && !valid && (
                  <p className={cn(t.meta, "mt-1.5 text-red-400")}>
                    Enter an amount between Rs 1 and Rs 50,000.
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor={`note-${r.id}`}
                  className={cn(t.meta, "mb-1.5 block text-[#B0B0B0]")}
                >
                  Anything to tell them? (optional)
                </label>
                <input
                  id={`note-${r.id}`}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. I can come this afternoon"
                  maxLength={300}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 font-dm text-sm text-offwhite placeholder:text-[#B0B0B0] focus:border-yellow/50 focus:outline-none focus:ring-2 focus:ring-yellow/25"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    // Put the draft back to the standing price, so Cancel means
                    // cancel rather than "keep my half-typed number".
                    setFee(r.myQuote ? centsToShortString(r.myQuote.fee) : "");
                    setNote(r.myQuote?.note ?? "");
                    setOpen(false);
                  }}
                  disabled={quoting}
                  className="min-h-[52px] rounded-full border border-white/15 px-5 font-dm text-sm font-medium text-offwhite disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!valid || busy !== null}
                  onClick={async () => {
                    // Only collapse on SUCCESS. It used to close regardless, so
                    // a refused quote -- request taken, wrong vehicle, a dropped
                    // connection -- threw away the price the driver had just
                    // typed and left them to work out what happened.
                    if (await onQuote(r.id, cents as number, note.trim()))
                      setOpen(false);
                  }}
                  className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-full bg-yellow font-syne text-base font-bold text-dark disabled:opacity-40"
                >
                  {quoting && <Loader2 size={16} className="animate-spin" />}
                  {quoting
                    ? "Sending…"
                    : r.myQuote
                      ? "Update my price"
                      : `Quote Rs ${valid ? centsToShortString(cents as number) : "—"}`}
                </button>
              </div>

              <p className={cn(t.meta, "text-[#B0B0B0]")}>
                {/* Expectation-setting, so silence afterwards is not read as a
                    failure. This is the part of the model that is genuinely
                    unlike everything else they do on this app. */}
                The customer sees every price and picks one. You will be told if
                yours is chosen.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {r.expiresAt && (
        <p
          className={cn(
            t.meta,
            "mt-3 inline-flex items-center gap-1.5 text-[#B0B0B0]",
          )}
        >
          <Clock size={11} /> Closes{" "}
          {new Date(r.expiresAt).toLocaleString("en-GB", {
            weekday: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      )}
    </div>
  );
}

/**
 * How soon, as a chip.
 *
 * "Later" gets no badge at all: a badge on every row is a badge on none, and
 * the whole point is that the top of this list should stand out from the
 * bottom of it.
 */
function UrgencyBadge({
  urgency,
  startsNow,
}: {
  urgency: Urgency;
  startsNow?: boolean;
}) {
  if (urgency === "later") return null;
  const style =
    urgency === "now"
      ? "bg-yellow text-dark"
      : urgency === "today"
        ? "bg-yellow/15 text-yellow"
        : "bg-white/[0.07] text-[#B0B0B0]";
  const label =
    urgency === "now"
      ? startsNow
        ? "Can start now"
        : "Needed now"
      : urgency === "today"
        ? "Today"
        : "Tomorrow";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-dm text-xs font-semibold",
        style,
      )}
    >
      {urgency === "now" ? (
        <Zap size={11} aria-hidden />
      ) : (
        <CalendarClock size={11} aria-hidden />
      )}
      {label}
    </span>
  );
}

function Where({
  label,
  place,
  note,
}: {
  label: string;
  place: string;
  note: string | null;
}) {
  return (
    <div className="flex items-start gap-2">
      <MapPin size={13} className="mt-0.5 shrink-0 text-white/30" />
      <p className={cn(t.bodySm, "min-w-0 text-offwhite")}>
        <span className="text-[#B0B0B0]">{label}: </span>
        {place}
        {note && <span className="text-[#B0B0B0]"> — {note}</span>}
      </p>
    </div>
  );
}
