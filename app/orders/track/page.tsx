"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, Search, CheckCircle2, UserPlus, PackageSearch, Phone } from "lucide-react";
import { centsToDecimalString } from "@/lib/money";
import { STATUS_LABEL, type OrderStatus } from "@/lib/orders/status";
import { holdInfo, customerHoldCopy, holdRemaining, type PaymentProvider } from "@/lib/orders/hold";
import BankTransferPanel from "@/components/orders/BankTransferPanel";
import { Button } from "@/components/ui/button";

// ── Guest order tracking + post-purchase (M20, completed M21) ──────────────
//
// A guest has no session, so /orders and /orders/[id] (both `customer_id =
// auth.uid()`) can never show them anything. This is their equivalent, and it
// deliberately mirrors /manage-booking — the account-free lookup the vehicle
// side of this product has always used — rather than inventing a new idea.
//
// M20 shipped this as lookup-and-display only. That left a hole: a guest who
// chose Bank transfer was told at checkout "You'll see the shop's bank details
// and upload your transfer receipt after placing the order" and then landed
// here, where neither existed — and where the reservation clock they could not
// see would cancel the order 48h later, possibly after they had already wired
// the money. lookup_order() now returns the bank block while payment is still
// owed, and "I've sent the transfer" reaches guest_report_payment().
//
// The just-placed order is handed over in sessionStorage, NOT in the URL: an
// order number plus an email address in a query string ends up in browser
// history, in any shared link, and in server logs. sessionStorage is scoped to
// the tab and dies with it. The `?ref=` link in the confirmation email carries
// only the order NUMBER — the email address is still typed, so the link alone
// discloses nothing.
const HANDOFF_KEY = "rr-just-ordered";

type TrackedOrder = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  total: number;
  placedAt: string | null;
  autoReleaseAt: string | null;
  acceptedAt: string | null;
  receiptSubmittedAt: string | null;
  provider: PaymentProvider | null;
  storeName: string;
  storeSlug: string;
  storePhone: string | null;
  isGuest: boolean;
  bank: {
    bankName: string | null;
    accountHolder: string | null;
    accountNumber: string | null;
    instructions: string | null;
    requireReceipt: boolean;
  } | null;
  items: { name: string; variant: string | null; qty: number; lineTotal: number }[];
};

export default function TrackOrderPage() {
  return (
    <Suspense fallback={null}>
      <TrackOrder />
    </Suspense>
  );
}

function TrackOrder() {
  const searchParams = useSearchParams();
  const [orderNumber, setOrderNumber] = useState("");
  const [email, setEmail] = useState("");
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** True when we arrived straight from a completed checkout. */
  const [justOrdered, setJustOrdered] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const lookup = useCallback(async (ref: string, mail: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/orders/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber: ref, email: mail }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "We couldn't find that order.");
      setOrder(body.order as TrackedOrder);
    } catch (e) {
      setOrder(null);
      setError(e instanceof Error ? e.message : "We couldn't find that order.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Straight from checkout: look the order up immediately so the customer sees
  // a real confirmation rather than an empty search form. Falling back to
  // ?ref= means the link in the confirmation email lands on a form with the
  // hard part — a 14-character reference nobody wants to retype on a phone —
  // already filled in.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(HANDOFF_KEY);
      if (raw) {
        sessionStorage.removeItem(HANDOFF_KEY);
        const handoff = JSON.parse(raw) as { orderNumber?: string; email?: string };
        if (handoff.orderNumber && handoff.email) {
          setOrderNumber(handoff.orderNumber);
          setEmail(handoff.email);
          setJustOrdered(true);
          void lookup(handoff.orderNumber, handoff.email);
          return;
        }
      }
    } catch {
      /* corrupt handoff — fall through to ?ref= / the manual form */
    }
    const ref = searchParams.get("ref");
    if (ref) setOrderNumber(ref.trim().toUpperCase());
  }, [lookup, searchParams]);

  // "I have sent the transfer." Business rule 3 of the marketplace: the
  // customer declares it, the MERCHANT confirms receipt — the platform never
  // auto-marks a transfer as paid.
  async function reportPayment() {
    if (!order) return;
    setReporting(true);
    setReportError(null);
    try {
      const res = await fetch("/api/orders/report-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber: order.orderNumber, email }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "We couldn't record that.");
      // Re-read rather than patching state locally, so what the customer sees
      // is what the database actually says.
      await lookup(order.orderNumber, email);
    } catch (e) {
      setReportError(e instanceof Error ? e.message : "We couldn't record that.");
    } finally {
      setReporting(false);
    }
  }

  const hold = order ? holdInfo(order.autoReleaseAt) : null;
  // Same rule as the signed-in order page: the clock only matters while the
  // order is still waiting, and an accepted order has had its fuse cleared.
  const showHold = !!hold && order?.status === "pending_payment" && !order?.acceptedAt;
  const isBankTransfer = order?.provider === "bank_transfer";
  const awaitingConfirmation = order?.status === "awaiting_payment_confirmation";
  const showBankPanel =
    !!order && isBankTransfer && (order.status === "pending_payment" || awaitingConfirmation);

  return (
    <main className="min-h-screen bg-dark px-4 pb-28 pt-10 text-offwhite md:pb-16">
      <div className="mx-auto max-w-lg">
        <Link href="/shop" className="inline-flex items-center gap-1.5 font-dm text-sm text-muted hover:text-yellow">
          <ArrowLeft size={14} /> Continue shopping
        </Link>

        {justOrdered && order ? (
          <div className="mt-6 rounded-2xl border border-green-500/25 bg-green-500/[0.06] p-6 text-center">
            <CheckCircle2 className="mx-auto text-green-400" size={30} />
            <h1 className="mt-3 font-syne text-2xl font-extrabold text-offwhite">Order confirmed</h1>
            <p className="mt-1.5 font-dm text-sm text-muted">
              We&apos;ve emailed your confirmation to <span className="text-offwhite">{email}</span>.
            </p>
          </div>
        ) : (
          <>
            <h1 className="mt-3 font-syne text-2xl font-extrabold text-offwhite">Track your order</h1>
            <p className="mt-1 font-dm text-sm text-muted">
              No account needed — enter your order number and the email you ordered with.
            </p>
          </>
        )}

        {!order && (
          <form
            onSubmit={(e) => { e.preventDefault(); void lookup(orderNumber, email); }}
            className="mt-6 space-y-3"
          >
            <div>
              <label htmlFor="tr-ref" className="mb-1 block font-dm text-xs text-muted">
                Order number <span className="text-yellow">*</span>
              </label>
              <input
                id="tr-ref"
                required
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                placeholder="RR260808-A1B2C3"
                autoCapitalize="characters"
                className="w-full rounded-xl border border-dark-border bg-dark-card px-4 py-3 font-dm text-sm text-offwhite placeholder:text-muted/60 focus:border-yellow focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="tr-email" className="mb-1 block font-dm text-xs text-muted">
                Email <span className="text-yellow">*</span>
              </label>
              <input
                id="tr-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                autoComplete="email"
                className="w-full rounded-xl border border-dark-border bg-dark-card px-4 py-3 font-dm text-sm text-offwhite placeholder:text-muted/60 focus:border-yellow focus:outline-none"
              />
            </div>
            {error && <p role="alert" className="font-dm text-sm text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-yellow px-5 py-3.5 font-syne text-sm font-bold text-dark transition-colors hover:bg-yellow-dark disabled:opacity-60"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <><Search size={15} /> Find my order</>}
            </button>
            <p className="pt-1 text-center font-dm text-[11px] text-muted">
              Your order number is in your confirmation email (it looks like RR260808-A1B2C3).
            </p>
          </form>
        )}

        {order && (
          <div className="mt-6 space-y-4">
            <div className="rounded-2xl border border-white/10 bg-dark-card p-5">
              <div className="flex items-center justify-between gap-3">
                <span className="font-bebas text-[11px] tracking-[0.3em] text-yellow">{order.orderNumber}</span>
                <span className="rounded-full bg-white/10 px-3 py-1 font-dm text-[11px] font-medium text-offwhite">
                  {STATUS_LABEL[order.status] ?? order.status}
                </span>
              </div>
              <p className="mt-2 font-syne text-base font-bold text-offwhite">{order.storeName}</p>
              {/* A guest has no dashboard and no message thread. When something
                  is wrong, the shop's own number is the whole support channel —
                  it must not require going back to the storefront to find it. */}
              {order.storePhone && (
                <a
                  href={`tel:${order.storePhone.replace(/\s+/g, "")}`}
                  className="mt-1 inline-flex items-center gap-1.5 font-dm text-xs text-muted transition-colors hover:text-yellow"
                >
                  <Phone size={12} /> {order.storePhone}
                </a>
              )}

              <ul className="mt-4 space-y-2 border-t border-white/[0.08] pt-4">
                {order.items.map((it, i) => (
                  <li key={`${it.name}-${i}`} className="flex justify-between gap-3 font-dm text-sm">
                    <span className="min-w-0 text-muted">
                      {it.qty}× {it.name}
                      {it.variant ? <span className="text-muted/70"> ({it.variant})</span> : null}
                    </span>
                    <span className="shrink-0 text-offwhite">Rs {centsToDecimalString(it.lineTotal)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex justify-between border-t border-white/[0.08] pt-4 font-dm text-sm">
                <span className="text-muted">Total</span>
                <span className="font-syne font-bold text-yellow">Rs {centsToDecimalString(order.total)}</span>
              </div>
            </div>

            {/* The reservation clock. M20 returned autoReleaseAt from
                lookup_order and then rendered nothing with it, so the one party
                who can act on the deadline was the only one not shown it. */}
            {showHold && hold && (
              <section
                aria-labelledby="hold-h"
                className="rounded-2xl border border-yellow/25 bg-yellow/[0.06] p-5"
              >
                <h2 id="hold-h" className="font-syne text-sm font-bold text-yellow">
                  {isBankTransfer ? "Payment needed to keep your items" : "Your items are reserved"}
                </h2>
                <p className="mt-2 font-dm text-sm leading-relaxed text-offwhite/85">
                  {customerHoldCopy(order.provider ?? undefined, hold)}
                </p>
                <p className="mt-3 font-dm text-xs text-muted">
                  Time remaining: <span className="text-offwhite">{holdRemaining(hold)}</span>
                </p>
              </section>
            )}

            {showBankPanel && (
              <BankTransferPanel
                orderNumber={order.orderNumber}
                amount={order.total}
                bank={
                  order.bank
                    ? {
                        bank_name: order.bank.bankName,
                        account_holder: order.bank.accountHolder,
                        account_number: order.bank.accountNumber,
                        payment_instructions: order.bank.instructions,
                        require_receipt: order.bank.requireReceipt,
                      }
                    : null
                }
                awaitingConfirmation={!!awaitingConfirmation}
              >
                {/* A guest cannot upload a file — storage RLS is derived from a
                    session — so the declaration IS the action. create_order
                    refuses guest bank transfer at shops that require a receipt
                    photo, so this button is never the wrong affordance. */}
                <div>
                  <p className="font-dm text-xs leading-relaxed text-muted">
                    Once you&apos;ve made the transfer, tell the shop. They check their account and
                    confirm — nothing is charged automatically, and your reservation stops counting
                    down as soon as you press this.
                  </p>
                  <Button
                    type="button"
                    className="mt-3 w-full"
                    disabled={reporting}
                    onClick={() => void reportPayment()}
                  >
                    {reporting ? <Loader2 size={16} className="animate-spin" /> : "I've sent the transfer"}
                  </Button>
                  {reportError && (
                    <p role="alert" className="mt-2 font-dm text-xs text-red-400">{reportError}</p>
                  )}
                </div>
              </BankTransferPanel>
            )}

            {/* Post-purchase account offer. Only for GUEST orders — an order
                already attached to an account has nothing to claim. Signing in
                OR confirming a new account with this address runs
                claim_guest_orders(), which adopts this order and any earlier
                ones, so the invitation is truthful (M21 wired the new-account
                path, which M20 had left unhandled). */}
            {order.isGuest && (
              <div className="rounded-2xl border border-yellow/25 bg-yellow/[0.06] p-5">
                <div className="flex items-start gap-3">
                  <UserPlus size={18} className="mt-0.5 shrink-0 text-yellow" />
                  <div>
                    <p className="font-syne text-sm font-bold text-offwhite">
                      Create an account with this email to track future orders
                    </p>
                    <p className="mt-1 font-dm text-xs leading-relaxed text-muted">
                      This order — and any others placed with {email} — will appear in your history
                      automatically. If you already have an account, just sign in.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        href={`/login?next=${encodeURIComponent("/orders")}`}
                        className="rounded-full bg-yellow px-4 py-2 font-syne text-xs font-bold text-dark transition-colors hover:bg-yellow-dark"
                      >
                        Create account or sign in
                      </Link>
                      <Link
                        href="/shop"
                        className="rounded-full border border-white/15 px-4 py-2 font-syne text-xs font-bold text-offwhite transition-colors hover:border-white/30"
                      >
                        Keep shopping
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={() => { setOrder(null); setJustOrdered(false); setError(null); setReportError(null); }}
              className="inline-flex items-center gap-1.5 font-dm text-sm text-muted transition-colors hover:text-yellow"
            >
              <PackageSearch size={14} /> Look up another order
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
