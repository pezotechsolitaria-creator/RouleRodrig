"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Loader2, BadgeCheck, Receipt, ExternalLink, Banknote, AlertTriangle, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { centsToDecimalString } from "@/lib/money";
import type { OrganizerReservation } from "@/lib/events/organizer";

// "Someone says they have paid — did they?"
//
// This is the only screen on the platform where a human decides that money
// arrived. Roulé Rodrigues never holds ticket money: the transfer goes straight
// to the organiser's account, so only the organiser can see it land, and the
// platform must never mark an order paid on its own.
//
// Confirming is what ISSUES THE TICKET — confirm_order_payment() moves the order
// to 'paid' and the orders_sync_tickets trigger creates the ticket rows. So the
// button says what it does, and the proof sits next to it rather than a click
// away, because a decision made without the evidence in view is a rubber stamp.
export default function PaymentReview({
  reservations,
  canVerify,
}: {
  reservations: OrganizerReservation[];
  canVerify: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const awaiting = reservations.filter((r) => r.status === "awaiting_payment_confirmation");

  async function viewReceipt(path: string) {
    setBusy(`r-${path}`);
    try {
      const res = await fetch(`/api/organizer/payments?path=${encodeURIComponent(path)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.url) throw new Error(body.error || "Could not open that receipt.");
      window.open(body.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open that receipt.");
    } finally {
      setBusy(null);
    }
  }

  async function confirm(r: OrganizerReservation) {
    setBusy(`c-${r.orderId}`);
    try {
      const res = await fetch("/api/organizer/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: r.orderId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not confirm that payment.");
      toast.success(`${r.orderNumber} confirmed — ticket issued`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not confirm that payment.");
    } finally {
      setBusy(null);
    }
  }

  // Declining. Deliberately asks for a reason: the buyer is dropped back to
  // pending_payment and prompted to pay again, and "your payment was rejected"
  // with no explanation is how you lose a customer who did nothing wrong.
  async function reject(r: OrganizerReservation) {
    const reason = window.prompt(
      `Why is payment for ${r.orderNumber} being rejected?

The buyer can pay again — their seats are NOT released.`,
      "The receipt could not be read",
    );
    // Cancelled the prompt: do nothing at all rather than reject with no reason.
    if (reason === null) return;

    setBusy(`r-${r.orderId}`);
    try {
      const res = await fetch("/api/organizer/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: r.orderId, action: "reject", reason }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not reject that payment.");
      toast.success(`${r.orderNumber} rejected — the buyer can pay again`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reject that payment.");
    } finally {
      setBusy(null);
    }
  }

  if (awaiting.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-dark-card p-6 text-center">
        <BadgeCheck className="mx-auto text-muted" size={20} />
        <p className="mt-2 font-dm text-sm text-muted">
          No payments waiting on you.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {awaiting.map((r) => {
        const isCash = r.provider === "cash";
        return (
          <div
            key={r.orderId}
            className="rounded-2xl border border-yellow/25 bg-yellow/[0.04] p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-syne text-base font-bold text-offwhite">
                  {r.customerName ?? "Someone"}{" "}
                  <span className="font-dm text-sm font-normal text-muted">
                    · {r.units ?? 0} {r.units === 1 ? "ticket" : "tickets"}
                  </span>
                </p>
                <p className="font-dm text-xs text-muted">
                  {r.orderNumber}
                  {r.customerPhone ? ` · ${r.customerPhone}` : ""}
                  {r.customerEmail ? ` · ${r.customerEmail}` : ""}
                </p>
                <p className="mt-1 flex items-center gap-1.5 font-dm text-sm text-yellow">
                  <Banknote size={13} /> Rs {centsToDecimalString(r.total)}
                  <span className="text-muted">· {isCash ? "cash" : "bank transfer"}</span>
                </p>
              </div>

              <div className="flex flex-col items-stretch gap-2">
                {r.receiptPath ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === `r-${r.receiptPath}`}
                    onClick={() => void viewReceipt(r.receiptPath!)}
                  >
                    {busy === `r-${r.receiptPath}` ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <>
                        <Receipt size={13} className="mr-1" /> View proof
                        <ExternalLink size={11} className="ml-1 opacity-60" />
                      </>
                    )}
                  </Button>
                ) : (
                  <span className="flex items-center gap-1.5 font-dm text-xs text-muted">
                    <AlertTriangle size={12} /> No proof attached
                  </span>
                )}

                {canVerify && (
                  <>
                    {/* Reject sits FIRST and quiet, Confirm last and primary:
                        the destructive action should never be the one a thumb
                        lands on by accident. */}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy !== null}
                      onClick={() => void reject(r)}
                    >
                      {busy === `r-${r.orderId}` ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        "Reject"
                      )}
                    </Button>
                    <Button size="sm" disabled={busy !== null} onClick={() => void confirm(r)}>
                      {busy === `c-${r.orderId}` ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        "Confirm & issue ticket"
                      )}
                    </Button>
                  </>
                )}
              </div>
            </div>

            <p className="mt-2 flex items-center gap-1.5 font-dm text-xs text-muted">
              <Clock size={11} />
              {r.receiptSubmittedAt
                ? `Reported ${new Date(r.receiptSubmittedAt).toLocaleString()}`
                : "Reported"}
              {" · "}
              Check the money is actually in your account before confirming — this issues the ticket.
            </p>
          </div>
        );
      })}

      {!canVerify && (
        <p className="font-dm text-xs text-muted">
          You can see these, but confirming payments isn&apos;t switched on for your account. Ask
          whoever set up your access to enable it.
        </p>
      )}
    </div>
  );
}
