"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, Loader2, Landmark } from "lucide-react";

// ── THE PLATFORM'S OWN ACCOUNT ──────────────────────────────────────────────
//
// Not a shop's. The rest of this screen sets store_payment_settings, which is
// how a MERCHANT is paid for goods; this one row is how Roulé Rodrigues is paid
// the DELIVERY FEE on a Deliver Anything job.
//
// It sits here because an admin holding a bank statement wants one place to
// look, and it is labelled hard so the two are never confused.

type Bank = {
  bank_account_name: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_note: string | null;
};

const field =
  "w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 font-dm text-sm text-offwhite placeholder:text-[#B0B0B0] focus:border-yellow/50 focus:outline-none focus:ring-2 focus:ring-yellow/25";
const labelCls = "mb-1.5 block font-dm text-xs font-medium text-muted";

export default function DeliveryBankPanel() {
  const [accountName, setAccountName] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [note, setNote] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/admin/delivery-bank");
        const data = (await res.json()) as { bank?: Bank | null; error?: string };
        if (!alive) return;
        if (!res.ok) {
          setError(data.error ?? "Couldn't load the details.");
        } else if (data.bank) {
          setAccountName(data.bank.bank_account_name ?? "");
          setBankName(data.bank.bank_name ?? "");
          setAccountNumber(data.bank.bank_account_number ?? "");
          setNote(data.bank.bank_note ?? "");
        }
      } catch {
        if (alive) setError("Couldn't load the details.");
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // The same rule the API enforces, said before the tap rather than after it.
  // delivery_request_view() switches the whole option on from the account NAME,
  // so a name with no number offers a transfer with nowhere to send it.
  const hasName = accountName.trim().length > 0;
  const hasNumber = accountNumber.trim().length > 0;
  const half = hasName !== hasNumber;
  const live = hasName && hasNumber;

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/delivery-bank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountName, bankName, accountNumber, note }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) setError(data.error ?? "Couldn't save that.");
      else setSaved(true);
    } catch {
      setError("Couldn't save that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-10 rounded-2xl border border-white/10 bg-dark-card p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-yellow/12 text-yellow">
          <Landmark size={17} />
        </span>
        <div className="min-w-0">
          <h2 className="font-syne text-base font-bold text-offwhite">
            Deliver Anything &mdash; where transfers go
          </h2>
          <p className="mt-1 font-dm text-sm text-muted">
            Your own account, for the delivery fee on a /deliver job. Not a
            shop&apos;s &mdash; those are set above. The money for the goods on a
            shopping run is still cash to the driver at the door.
          </p>
        </div>
      </div>

      {/* The state that matters most, said first: with this empty the customer
          is never offered a transfer at all, and nothing anywhere says why. */}
      {loaded && !live && (
        <p className="mt-4 flex items-start gap-2 rounded-xl border border-yellow/30 bg-yellow/[0.06] p-3 font-dm text-sm text-offwhite">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-yellow" />
          <span>
            Bank transfer is switched <strong>off</strong> for /deliver right now.
            Customers can only pay cash. Fill in the account name and number to
            offer it.
          </span>
        </p>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="dbp-name">
            Account name
          </label>
          <input
            id="dbp-name"
            className={field}
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            placeholder="The name on the account"
            disabled={busy || !loaded}
            autoComplete="off"
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="dbp-bank">
            Bank
          </label>
          <input
            id="dbp-bank"
            className={field}
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            placeholder="MCB, SBM, ABC&hellip;"
            disabled={busy || !loaded}
            autoComplete="off"
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="dbp-number">
            Account number
          </label>
          <input
            id="dbp-number"
            className={field}
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            placeholder="The number a customer types into their banking app"
            disabled={busy || !loaded}
            inputMode="numeric"
            autoComplete="off"
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="dbp-note">
            What to tell the customer (optional)
          </label>
          <input
            id="dbp-note"
            className={field}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Use your request number as the reference."
            disabled={busy || !loaded}
            autoComplete="off"
          />
          <p className="mt-1.5 font-dm text-[11px] text-[#B0B0B0]">
            Shown under the account details on the customer&apos;s screen. A
            reference they can quote is what makes a transfer matchable to a job.
          </p>
        </div>
      </div>

      {half && (
        <p className="mt-4 flex items-start gap-2 font-dm text-sm text-red-400">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          {hasName
            ? "Add the account number too — a name on its own offers a transfer with nowhere to send it."
            : "Add the account name too — the number alone will not switch bank transfer on."}
        </p>
      )}

      {error && (
        <p role="alert" className="mt-4 font-dm text-sm text-red-400">
          {error}
        </p>
      )}

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || !loaded || half}
          className="inline-flex min-h-[48px] items-center gap-2 rounded-full bg-yellow px-6 font-dm text-sm font-bold text-dark disabled:opacity-50"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : null}
          Save
        </button>
        {saved && (
          <span className="inline-flex items-center gap-1.5 font-dm text-sm text-yellow">
            <Check size={15} /> Saved
          </span>
        )}
      </div>
    </section>
  );
}
