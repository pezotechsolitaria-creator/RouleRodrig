"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Loader2, Package, ShoppingBasket, MapPin, Users, Check, Clock, Gavel,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toCents, centsToShortString } from "@/lib/money";
import { transition, type as t } from "@/lib/delivery/tokens";

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
  pickupText: string;
  pickupNote: string | null;
  dropoffText: string;
  dropoffNote: string | null;
  spendCap: number | null;
  createdAt: string;
  expiresAt: string | null;
  quoteCount: number;
  myQuote: { id: string; fee: number; note: string | null } | null;
};

export default function QuoteBoard({
  requests,
  busy,
  onQuote,
  onWithdraw,
}: {
  requests: OpenRequest[];
  busy: string | null;
  onQuote: (requestId: string, fee: number, note: string) => Promise<void>;
  onWithdraw: (quoteId: string) => Promise<void>;
}) {
  if (requests.length === 0) return null;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-syne text-lg font-bold">Jobs you can quote on</h2>
        {/* The sentence that stops this being mistaken for dispatch. */}
        <p className={cn(t.meta, "mt-0.5 text-muted")}>
          No fixed price on these. Name yours — the customer picks who they want.
        </p>
      </div>
      {requests.map((r) => (
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
  onQuote: (requestId: string, fee: number, note: string) => Promise<void>;
  onWithdraw: (quoteId: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [fee, setFee] = useState(r.myQuote ? centsToShortString(r.myQuote.fee) : "");
  const [note, setNote] = useState(r.myQuote?.note ?? "");

  const cents = fee.trim() ? toCents(fee) : null;
  const valid = cents !== null && cents >= 100 && cents <= 5_000_000;
  const Icon = r.kind === "shop_and_deliver" ? ShoppingBasket : Package;
  const quoting = busy === `quote-${r.id}`;
  const withdrawing = busy === `withdraw-${r.myQuote?.id}`;

  return (
    <div
      className={cn(
        "rounded-2xl border bg-dark-card p-4 transition-colors",
        r.myQuote ? "border-yellow/35" : "border-white/10",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.05] text-white/60">
          <Icon size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-syne text-base font-bold leading-snug">{r.what}</p>
          <p className={cn(t.meta, "mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted")}>
            <span>{r.kind === "shop_and_deliver" ? "Buy & deliver" : "Collect & deliver"}</span>
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
        <Where label="Collect" place={r.pickupText} note={r.pickupNote} />
        <Where label="Deliver" place={r.dropoffText} note={r.dropoffNote} />
      </div>

      {r.kind === "shop_and_deliver" && r.spendCap != null && (
        // Never merged with the fee. A driver who reads the shopping cap as
        // their pay quotes against the wrong number and loses money at the till.
        <p className={cn(t.meta, "mt-3 rounded-lg bg-white/[0.03] px-3 py-2 text-muted")}>
          They repay what you spend, up to{" "}
          <span className="text-offwhite">Rs {centsToShortString(r.spendCap)}</span>. Your fee
          is separate.
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
            <button
              type="button"
              onClick={() => setOpen(true)}
              className={cn(t.meta, "text-yellow/80 underline underline-offset-4")}
            >
              Change
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void onWithdraw(r.myQuote!.id)}
              className={cn(t.meta, "text-white/40 underline underline-offset-4 disabled:opacity-50")}
            >
              {withdrawing ? "Withdrawing…" : "Withdraw"}
            </button>
          </div>
        </div>
      )}

      {!r.myQuote && !open && (
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
                  className={cn(t.meta, "mb-1.5 block text-muted")}
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
                  className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 font-dm text-lg tabular-nums text-offwhite placeholder:text-white/30 focus:border-yellow/50 focus:outline-none focus:ring-2 focus:ring-yellow/25"
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
                  className={cn(t.meta, "mb-1.5 block text-muted")}
                >
                  Anything to tell them? (optional)
                </label>
                <input
                  id={`note-${r.id}`}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. I can come this afternoon"
                  maxLength={300}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 font-dm text-sm text-offwhite placeholder:text-white/30 focus:border-yellow/50 focus:outline-none focus:ring-2 focus:ring-yellow/25"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={quoting}
                  className="min-h-[52px] rounded-full border border-white/15 px-5 font-dm text-sm font-medium text-offwhite disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!valid || busy !== null}
                  onClick={async () => {
                    await onQuote(r.id, cents as number, note.trim());
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

              <p className={cn(t.meta, "text-white/40")}>
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
        <p className={cn(t.meta, "mt-3 inline-flex items-center gap-1.5 text-white/35")}>
          <Clock size={11} /> Closes {new Date(r.expiresAt).toLocaleString("en-GB", {
            weekday: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      )}
    </div>
  );
}

function Where({ label, place, note }: { label: string; place: string; note: string | null }) {
  return (
    <div className="flex items-start gap-2">
      <MapPin size={13} className="mt-0.5 shrink-0 text-white/30" />
      <p className={cn(t.bodySm, "min-w-0 text-offwhite")}>
        <span className="text-white/40">{label}: </span>
        {place}
        {note && <span className="text-muted"> — {note}</span>}
      </p>
    </div>
  );
}
