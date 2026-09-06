"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, Loader2, Search } from "lucide-react";

type Row = {
  id: string;
  name: string;
  slug: string;
  status: string;
  acceptsCash: boolean;
  acceptsBankTransfer: boolean;
  hasBankDetails: boolean;
  canBePaid: boolean;
};

type Settings = {
  accepts_cash: boolean;
  accepts_bank_transfer: boolean;
  bank_name: string | null;
  account_holder: string | null;
  account_number: string | null;
  payment_instructions: string | null;
};

export default function PaymentMethodsAdmin() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Row | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function loadList() {
    const res = await fetch("/api/admin/payment-methods");
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Couldn't load shops.");
      return;
    }
    setRows(data.stores);
  }

  useEffect(() => {
    loadList().catch(() => setError("Couldn't load shops."));
  }, []);

  async function openStore(row: Row) {
    setOpen(row);
    setSettings(null);
    setSaved(false);
    const res = await fetch(`/api/admin/payment-methods?storeId=${row.id}`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Couldn't load that shop.");
      return;
    }
    setSettings(
      data.settings ?? {
        accepts_cash: false,
        accepts_bank_transfer: false,
        bank_name: "",
        account_holder: "",
        account_number: "",
        payment_instructions: "",
      },
    );
  }

  async function save() {
    if (!open || !settings) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/payment-methods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: open.id,
          patch: {
            accepts_cash: settings.accepts_cash,
            accepts_bank_transfer: settings.accepts_bank_transfer,
            bank_name: settings.bank_name ?? "",
            account_holder: settings.account_holder ?? "",
            account_number: settings.account_number ?? "",
            payment_instructions: settings.payment_instructions ?? "",
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "That didn't save.");
      setSaved(true);
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save.");
    } finally {
      setBusy(false);
    }
  }

  if (!rows) return <Loader2 size={18} className="mt-8 animate-spin text-muted" />;

  const needle = q.trim().toLowerCase();
  const shown = needle ? rows.filter((r) => r.name.toLowerCase().includes(needle)) : rows;
  const broken = rows.filter((r) => !r.canBePaid).length;

  return (
    <div className="mt-6 max-w-2xl">
      {error && (
        <p className="mb-4 rounded-xl border border-red-400/30 bg-red-500/[0.07] p-3 font-dm text-sm text-red-300">
          {error}
        </p>
      )}

      {/* The number that matters, and the one nothing else says out loud: a shop
          with no method switched on looks completely healthy on every other
          screen on this platform, and cannot take a single order. */}
      {broken > 0 && (
        <p className="mb-4 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] p-3 font-dm text-sm text-amber-200">
          <AlertTriangle size={15} className="shrink-0" />
          {broken} shop{broken === 1 ? "" : "s"} cannot be paid at all — no method switched on.
        </p>
      )}

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find a shop"
          className="min-h-[44px] w-full rounded-xl border border-white/15 bg-dark-card pl-9 pr-3 font-dm text-sm text-offwhite placeholder:text-muted/60"
        />
      </div>

      <ul className="mt-4 space-y-2">
        {shown.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => void openStore(r)}
              className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                open?.id === r.id
                  ? "border-yellow/50 bg-yellow/[0.06]"
                  : "border-white/10 bg-dark-card hover:border-white/25"
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-dm text-sm font-semibold text-offwhite">{r.name}</p>
                <p className="font-dm text-[11px] text-muted">
                  {r.canBePaid
                    ? [r.acceptsCash && "cash", r.acceptsBankTransfer && "bank transfer"]
                        .filter(Boolean)
                        .join(" and ")
                    : "cannot be paid"}
                  {r.acceptsBankTransfer && !r.hasBankDetails && " · no bank details"}
                </p>
              </div>
              <span
                aria-hidden="true"
                className={`h-2 w-2 shrink-0 rounded-full ${r.canBePaid ? "bg-green-400" : "bg-red-400"}`}
              />
            </button>

            {open?.id === r.id && (
              <div className="mt-2 rounded-xl border border-white/10 bg-dark p-4">
                {!settings ? (
                  <Loader2 size={16} className="animate-spin text-muted" />
                ) : (
                  <>
                    <div className="space-y-2">
                      <Toggle
                        label="Bank transfer"
                        on={settings.accepts_bank_transfer}
                        onChange={(v) => setSettings({ ...settings, accepts_bank_transfer: v })}
                      />
                      <Toggle
                        label="Cash"
                        on={settings.accepts_cash}
                        onChange={(v) => setSettings({ ...settings, accepts_cash: v })}
                      />
                      {/* Said plainly rather than left to be discovered: the
                          platform switch overrides this, so a cash toggle that
                          looks on can still offer the customer nothing. */}
                      <p className="font-dm text-[11px] text-muted/70">
                        Cash is also subject to the platform-wide setting. While prepayment is on,
                        checkout offers bank transfer only, whatever this says.
                      </p>
                    </div>

                    {settings.accepts_bank_transfer && (
                      <div className="mt-3 space-y-2">
                        <Field
                          label="Bank"
                          value={settings.bank_name ?? ""}
                          onChange={(v) => setSettings({ ...settings, bank_name: v })}
                        />
                        <Field
                          label="Account holder"
                          value={settings.account_holder ?? ""}
                          onChange={(v) => setSettings({ ...settings, account_holder: v })}
                        />
                        <Field
                          label="Account number"
                          value={settings.account_number ?? ""}
                          onChange={(v) => setSettings({ ...settings, account_number: v })}
                        />
                        <p className="font-dm text-[11px] text-muted/70">
                          All three are required before bank transfer can be switched on — the
                          database refuses it otherwise, so a customer is never offered a method
                          nobody can actually be paid by.
                        </p>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => void save()}
                      disabled={busy}
                      className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-yellow px-5 font-syne text-sm font-bold text-dark disabled:opacity-50"
                    >
                      {busy ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : saved ? (
                        <Check size={14} />
                      ) : null}
                      {saved ? "Saved" : "Save"}
                    </button>
                  </>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {shown.length === 0 && (
        <p className="mt-4 font-dm text-sm text-muted">No shop matches that.</p>
      )}
    </div>
  );
}

function Toggle({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-dm text-sm text-offwhite">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(!on)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
          on ? "bg-green-500" : "bg-white/15"
        }`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform ${
            on ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="font-dm text-[11px] text-muted">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 min-h-[40px] w-full rounded-lg border border-white/15 bg-dark-card px-3 font-dm text-[13px] text-offwhite focus:border-yellow focus:outline-none"
      />
    </label>
  );
}
