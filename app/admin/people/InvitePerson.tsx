"use client";

import { useState } from "react";
import { CheckCircle2, Copy, Loader2, Mail, TriangleAlert, X } from "lucide-react";
import { normalizePhone, type PersonKind } from "@/lib/admin/people";

// ── Creating an account for somebody who is sitting next to you ─────────────
//
// The self-service sign-up is unchanged and remains how most people join. This
// is the assisted path: a shop owner who does not use email much, a driver who
// would rather you did it, somebody signed up at the counter on a Saturday.
//
// ── WHAT THIS FORM DELIBERATELY DOES NOT ASK FOR ───────────────────────────
// A password. There is no field for one and no button that makes one, because
// the account does not have one until the person chooses it themselves. The
// admin creates a row with an email address on it; signing in with that address
// is what makes it theirs. So the ONE thing that must be right is the address,
// which is why it is the first field, why the success panel repeats it, and why
// it is the only thing the Copy button copies.
//
// The rest is the minimum needed to be useful the moment they arrive — the shop
// name so their page exists, the vehicle so dispatch can match them — and
// nothing more. Everything else is theirs to fill in, and the desk shows it as
// "Profile incomplete" until they do.

type Created = { id: string; email: string; invited: boolean; name: string };

const VEHICLES = ["scooter", "motorcycle", "car", "van", "bicycle", "foot"];

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="font-dm text-[12px] text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block font-dm text-[11px] text-muted/70">{hint}</span>}
    </label>
  );
}

const inputClass =
  "mt-1 w-full rounded-xl border border-white/15 bg-dark px-3 py-2.5 font-dm text-[13.5px] text-offwhite placeholder:text-muted/50 focus:border-yellow focus:outline-none";

export default function InvitePerson({
  kind,
  onClose,
  onCreated,
}: {
  kind: PersonKind;
  onClose: () => void;
  /** Refresh the list. Called once, after a successful create. */
  onCreated: () => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [category, setCategory] = useState("");
  const [vehicleType, setVehicleType] = useState(VEHICLES[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [copied, setCopied] = useState(false);
  const [resent, setResent] = useState<"idle" | "busy" | "done">("idle");

  const isMerchant = kind === "merchant";
  // Shown live, because "+230 5835 5588" appearing under a locally-typed number
  // is what teaches an admin the number was understood — and the E.164 CHECK on
  // delivery_drivers.phone is unforgiving enough that guessing is not fair.
  const e164 = phone.trim() ? normalizePhone(phone) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/people/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isMerchant
            ? { kind, email, businessName: name, ownerName, phone, category }
            : { kind, email, fullName: name, phone, vehicleType },
        ),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        id?: string;
        invited?: boolean;
        duplicate?: boolean;
      };
      if (!res.ok) {
        setError(data.error ?? "That account could not be created.");
        return;
      }
      setCreated({ id: data.id ?? "", email: email.trim().toLowerCase(), invited: !!data.invited, name });
      onCreated();
    } catch {
      setError("Could not reach the server. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!created || resent === "busy") return;
    setResent("busy");
    try {
      const res = await fetch("/api/admin/people/invite", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id: created.id }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "That invitation could not be sent again.");
        setResent("idle");
        return;
      }
      setResent("done");
    } catch {
      setResent("idle");
    }
  }

  function copyInstructions() {
    if (!created) return;
    // What to read out, or send on WhatsApp, when the email has not arrived.
    // Deliberately short and free of jargon: this gets read aloud.
    const text = [
      `Roulé Rodrigues — ${isMerchant ? "your shop account" : "your delivery account"}`,
      "",
      "1. Go to roulerodrig.com/login",
      '2. Choose "Create account"',
      `3. Use this email address exactly: ${created.email}`,
      "4. Choose your own password — nobody at Roulé Rodrigues can see it",
      "",
      isMerchant
        ? "Your shop is waiting for you when you sign in."
        : "You will see delivery jobs on your phone once you are approved.",
    ].join("\n");
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    });
  }

  // ── After it is created ──────────────────────────────────────────────────
  if (created) {
    return (
      <Shell onClose={onClose} title={isMerchant ? "Shop account created" : "Delivery account created"}>
        <div className="flex items-start gap-3 rounded-xl border border-green-500/25 bg-green-500/[0.06] p-3">
          <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-green-300" />
          <div className="min-w-0">
            <p className="font-dm text-[13px] text-offwhite">
              {created.name} is on the platform, pending approval.
            </p>
            <p className="mt-1 font-dm text-[12px] text-muted">
              {created.invited
                ? "The invitation has been emailed to them."
                : "The account exists, but the invitation email did not go out. Send it again, or read them the steps below."}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <p className="font-dm text-[11px] uppercase tracking-wider text-muted">
            They must sign up with this exact address
          </p>
          <p className="mt-1 break-all font-syne text-sm font-bold text-yellow">{created.email}</p>
          <p className="mt-2 font-dm text-[11.5px] text-muted">
            It is how their account is matched. A different address leaves them without access — and
            nobody here can set a password for them, by design.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={copyInstructions}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 font-dm text-[13px] text-offwhite hover:border-yellow/40"
          >
            <Copy size={14} /> {copied ? "Copied" : "Copy the steps"}
          </button>
          <button
            onClick={() => void resend()}
            disabled={resent !== "idle"}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 font-dm text-[13px] text-offwhite hover:border-yellow/40 disabled:opacity-50"
          >
            {resent === "busy" ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
            {resent === "done" ? "Invitation sent" : "Send the invitation again"}
          </button>
          <button
            onClick={onClose}
            className="ml-auto rounded-full bg-yellow px-5 py-2 font-dm text-[13px] font-bold text-dark"
          >
            Done
          </button>
        </div>

        {error && (
          <p role="alert" className="flex items-start gap-2 font-dm text-[12.5px] text-red-300">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" /> {error}
          </p>
        )}
      </Shell>
    );
  }

  // ── The form ─────────────────────────────────────────────────────────────
  return (
    <Shell
      onClose={onClose}
      title={isMerchant ? "Add a merchant" : "Add a delivery partner"}
      subtitle="For someone who would rather you did this for them. They still own the account — they choose their own password when they first sign in."
    >
      <form onSubmit={submit} className="space-y-3">
        <Field
          label="Their email address"
          hint="The one thing that must be right. It is how they claim the account."
        >
          <input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="marie@example.com"
            className={inputClass}
          />
        </Field>

        <Field label={isMerchant ? "Business name" : "Their full name"}>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={isMerchant ? "Chez Banane" : "Marie Louise"}
            className={inputClass}
          />
        </Field>

        {isMerchant && (
          <Field label="Owner’s name" hint="Optional. Recorded so you know who you spoke to.">
            <input
              type="text"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder="Marie Louise"
              className={inputClass}
            />
          </Field>
        )}

        <Field
          label={isMerchant ? "Phone" : "Phone"}
          hint={
            phone.trim()
              ? e164
                ? `Will be saved as ${e164}`
                : "That does not look like a phone number yet."
              : isMerchant
                ? "Optional."
                : "Local numbers are fine — 5835 5588."
          }
        >
          <input
            type="tel"
            required={!isMerchant}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="5835 5588"
            aria-invalid={phone.trim().length > 0 && !e164}
            className={inputClass}
          />
        </Field>

        {isMerchant ? (
          <Field label="What do they sell?" hint="Optional. Helps their shop appear in the right place.">
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Restaurant, grocery, crafts…"
              className={inputClass}
            />
          </Field>
        ) : (
          <Field label="Vehicle">
            <select
              value={vehicleType}
              onChange={(e) => setVehicleType(e.target.value)}
              className={inputClass}
            >
              {VEHICLES.map((v) => (
                <option key={v} value={v}>
                  {v[0].toUpperCase() + v.slice(1)}
                </option>
              ))}
            </select>
          </Field>
        )}

        <p className="rounded-xl border border-white/10 bg-white/[0.02] p-3 font-dm text-[11.5px] text-muted">
          They will be created as <strong className="text-offwhite">pending</strong>
          {!isMerchant && <> and <strong className="text-offwhite">offline</strong></>} — nothing goes
          live and no {isMerchant ? "shop opens" : "job is offered"} until you approve them.
        </p>

        {error && (
          <p role="alert" className="flex items-start gap-2 font-dm text-[12.5px] text-red-300">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" /> {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/15 px-4 py-2 font-dm text-[13px] text-muted hover:text-offwhite"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !email.trim() || !name.trim() || (!isMerchant && !e164)}
            className="inline-flex items-center gap-2 rounded-full bg-yellow px-5 py-2 font-dm text-[13px] font-bold text-dark disabled:opacity-40"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            Create and send the invitation
          </button>
        </div>
      </form>
    </Shell>
  );
}

function Shell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-white/10 bg-dark-card p-4 sm:rounded-2xl"
      >
        <div className="mb-3 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-syne text-base font-extrabold text-offwhite">{title}</h2>
            {subtitle && <p className="mt-1 font-dm text-[12px] text-muted">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 text-muted hover:text-offwhite"
          >
            <X size={16} />
          </button>
        </div>
        <div className="space-y-3">{children}</div>
      </div>
    </div>
  );
}
