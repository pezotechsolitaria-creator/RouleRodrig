"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Check, AlertTriangle, Upload, Eye, Trash2, ShieldCheck, Gavel, Undo2, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

// The owner's own company details, editable without a deploy.
//
// Two rules shape this screen:
//   1. It NEVER invents a value. Every field starts blank and stays blank until
//      the owner types it. A plausible-looking BRN is worse than no BRN — it
//      would be a false statement of identity on a site that takes payments.
//   2. The certificate is uploaded to a PRIVATE bucket and only ever opened
//      through a short-lived signed URL. It is proof of identity, not content,
//      and it must never acquire a public URL.

type LegalFields = {
  legalName: string;
  brn: string;
  registeredAddress: string;
  tradingAddress: string;
  publicationDirector: string;
};

type TermsFields = {
  vehicleMinAge: string;
  experienceCancellationNotice: string;
  deliveryFailedRule: string;
  complaintWindow: string;
  ageRestrictedGoods: string;
};

const EMPTY_TERMS: TermsFields = {
  vehicleMinAge: "",
  experienceCancellationNotice: "",
  deliveryFailedRule: "",
  complaintWindow: "",
  ageRestrictedGoods: "",
};

// Every one of these is a decision only the owner can make, and each appears
// verbatim in the published Terms of Service. Blank shows there as "[to be
// confirmed by the operator]" — honest, and visibly unfinished, which is the
// point. The hints say what the clause is FOR, because a term written without
// understanding what it governs is how a business ends up bound to something
// it did not mean.
const TERMS_FIELDS: {
  key: keyof TermsFields;
  label: string;
  hint: string;
  placeholder: string;
}[] = [
  {
    key: "vehicleMinAge",
    label: "Minimum age to hire a vehicle",
    hint: "The law requires 18 to ride. If your own rule or your insurer's is higher, say so here.",
    placeholder: "e.g. 21, or 18 with a full licence held for 1 year",
  },
  {
    key: "experienceCancellationNotice",
    label: "Cancelling a boat trip, fishing trip or massage",
    hint: "How much notice a customer must give. Weather cancellations are already covered separately and are always refundable.",
    placeholder: "e.g. 24 hours' notice for a full refund, 50% within 24 hours",
  },
  {
    key: "deliveryFailedRule",
    label: "When a delivery cannot be completed",
    hint: "Nobody answers, the address is wrong, or the customer is not there. Say what happens to the goods and to the money.",
    placeholder: "e.g. the driver waits 10 minutes, then returns it to the shop for collection that day",
  },
  {
    key: "complaintWindow",
    label: "How long to report a problem",
    hint: "For orders generally. Food already has its own 24-hour rule, stated separately.",
    placeholder: "e.g. 48 hours of receiving your order",
  },
  {
    key: "ageRestrictedGoods",
    label: "Alcohol and age-restricted goods",
    hint: "Leave blank if nothing age-restricted is sold on the platform.",
    placeholder: "e.g. alcohol is sold only to over-18s and ID is checked at handover",
  },
];

type Tier = { window: string; outcome: string };
type RefundFields = {
  vehicleCancellationTiers: Tier[];
  securityDeposit: string;
  lateReturnCharge: string;
  damageRule: string;
};

const EMPTY_REFUNDS: RefundFields = {
  vehicleCancellationTiers: [],
  securityDeposit: "",
  lateReturnCharge: "",
  damageRule: "",
};

const REFUND_TEXT_FIELDS: { key: "securityDeposit" | "lateReturnCharge" | "damageRule"; label: string; hint: string }[] = [
  {
    key: "securityDeposit",
    label: "Security deposit",
    hint: "What you take at pickup, and what can be withheld from it at drop-off.",
  },
  {
    key: "lateReturnCharge",
    label: "Late returns",
    hint: "What a late return costs. Be specific enough that a customer cannot be surprised by it.",
  },
  {
    key: "damageRule",
    label: "Damage",
    hint: "How damage is assessed and charged, and what evidence the customer is shown.",
  },
];

const EMPTY: LegalFields = {
  legalName: "",
  brn: "",
  registeredAddress: "",
  tradingAddress: "",
  publicationDirector: "",
};

// Only the four the public notice treats as outstanding. tradingAddress has a
// real default in code, so leaving it blank is a choice rather than a gap.
const REQUIRED: (keyof LegalFields)[] = [
  "legalName",
  "brn",
  "registeredAddress",
  "publicationDirector",
];

const FIELDS: {
  key: keyof LegalFields;
  label: string;
  hint: string;
  placeholder: string;
  multiline?: boolean;
}[] = [
  {
    key: "legalName",
    label: "Registered legal name",
    hint: "Exactly as it appears on the certificate of incorporation — including any Ltd or Ltée.",
    placeholder: "e.g. Roulé Rodrigues Ltd",
  },
  {
    key: "brn",
    label: "Business Registration Number (BRN)",
    hint: "Issued by the Registrar of Companies. Shown in the footer and on the legal notice.",
    placeholder: "e.g. C12345678",
  },
  {
    key: "registeredAddress",
    label: "Registered office",
    hint: "The address as filed with the registry. It may differ from where customers meet you.",
    placeholder: "Street, town, Rodrigues, Republic of Mauritius",
    multiline: true,
  },
  {
    key: "tradingAddress",
    label: "Trading address",
    hint: "Where customers actually find you. Leave blank to keep the address already published.",
    placeholder: "Baie aux Huîtres, Rodrigues Island, Republic of Mauritius",
    multiline: true,
  },
  {
    key: "publicationDirector",
    label: "Publication director",
    hint: "The person responsible for what is published on the site — normally you.",
    placeholder: "Full name",
  },
];

export default function AdminLegal() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState<LegalFields>(EMPTY);
  const [saved, setSaved] = useState<LegalFields>(EMPTY);

  const [terms, setTerms] = useState<TermsFields>(EMPTY_TERMS);
  const [savedTerms, setSavedTerms] = useState<TermsFields>(EMPTY_TERMS);

  const [refunds, setRefunds] = useState<RefundFields>(EMPTY_REFUNDS);
  const [savedRefunds, setSavedRefunds] = useState<RefundFields>(EMPTY_REFUNDS);

  const [certificatePath, setCertificatePath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/legal");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not load the legal details.");
      const l = body.legal ?? {};
      const next: LegalFields = {
        legalName: l.legalName ?? "",
        brn: l.brn ?? "",
        registeredAddress: l.registeredAddress ?? "",
        tradingAddress: l.tradingAddress ?? "",
        publicationDirector: l.publicationDirector ?? "",
      };
      setFields(next);
      setSaved(next);
      const t = body.terms ?? {};
      const nextTerms: TermsFields = {
        vehicleMinAge: t.vehicleMinAge ?? "",
        experienceCancellationNotice: t.experienceCancellationNotice ?? "",
        deliveryFailedRule: t.deliveryFailedRule ?? "",
        complaintWindow: t.complaintWindow ?? "",
        ageRestrictedGoods: t.ageRestrictedGoods ?? "",
      };
      setTerms(nextTerms);
      setSavedTerms(nextTerms);
      // The API returns the RESOLVED policy, so an owner who has never edited
      // this opens the screen showing the wording that is actually published
      // rather than empty boxes they could unknowingly save over.
      const r = body.refunds ?? {};
      const nextRefunds: RefundFields = {
        vehicleCancellationTiers: Array.isArray(r.vehicleCancellationTiers)
          ? r.vehicleCancellationTiers.map((t: Tier) => ({ window: t.window ?? "", outcome: t.outcome ?? "" }))
          : [],
        securityDeposit: r.securityDeposit ?? "",
        lateReturnCharge: r.lateReturnCharge ?? "",
        damageRule: r.damageRule ?? "",
      };
      setRefunds(nextRefunds);
      setSavedRefunds(nextRefunds);
      setCertificatePath(l.certificatePath ?? null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load the legal details.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const legalDirty = (Object.keys(fields) as (keyof LegalFields)[]).some((k) => fields[k] !== saved[k]);
  const termsDirty = (Object.keys(terms) as (keyof TermsFields)[]).some((k) => terms[k] !== savedTerms[k]);
  const refundsDirty = JSON.stringify(refunds) !== JSON.stringify(savedRefunds);
  const dirty = legalDirty || termsDirty || refundsDirty;
  // A tier with only one half filled would publish a rule the customer cannot
  // read, so it blocks the save rather than being silently dropped.
  const tiersValid = refunds.vehicleCancellationTiers.every(
    (t) => (t.window.trim() && t.outcome.trim()) || (!t.window.trim() && !t.outcome.trim()),
  );
  const outstanding = REQUIRED.filter((k) => !fields[k].trim());

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/legal", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          legal: fields,
          terms,
          refunds: {
            ...refunds,
            // Half-written rows never reach the policy.
            vehicleCancellationTiers: refunds.vehicleCancellationTiers.filter(
              (t) => t.window.trim() && t.outcome.trim(),
            ),
          },
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not save.");
      setSaved({ ...fields });
      setSavedTerms({ ...terms });
      setSavedRefunds(JSON.parse(JSON.stringify(refunds)));
      toast.success("Saved — the notice, terms and refund policy are already updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadCertificate(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/legal/certificate", { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not upload that file.");
      setCertificatePath(body.certificatePath ?? null);
      toast.success("Certificate stored privately");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not upload that file.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function viewCertificate() {
    try {
      const res = await fetch("/api/admin/legal/certificate");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not open that document.");
      window.open(body.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open that document.");
    }
  }

  async function removeCertificate() {
    try {
      const res = await fetch("/api/admin/legal/certificate", { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not remove that document.");
      setCertificatePath(null);
      toast.success("Certificate removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove that document.");
    }
  }

  if (loading) {
    return (
      <p className="flex items-center gap-2 font-dm text-sm text-muted">
        <Loader2 size={15} className="animate-spin" /> Loading…
      </p>
    );
  }

  if (loadError) {
    return (
      <div role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5">
        <p className="flex items-center gap-2 font-syne text-base font-bold text-red-200">
          <AlertTriangle size={17} /> {loadError}
        </p>
        <Button variant="outline" className="mt-3" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }

  const field =
    "mt-1.5 w-full rounded-xl border border-white/12 bg-dark px-3.5 py-2.5 font-dm text-sm text-offwhite placeholder:text-muted/50 focus:border-yellow/50 focus:outline-none";

  return (
    <div className="space-y-5">
      {outstanding.length > 0 && (
        <p className="flex items-start gap-2 rounded-2xl border border-yellow/25 bg-yellow/[0.06] px-4 py-3 font-dm text-xs leading-relaxed text-offwhite">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-yellow" />
          <span>
            {outstanding.length} of {REQUIRED.length} required details are still blank. Until they are
            filled in, the legal notice publicly shows them as unconfirmed.
          </span>
        </p>
      )}

      <section className="rounded-2xl border border-white/10 bg-dark-card p-5">
        <h2 className="font-syne text-base font-bold text-offwhite">Company details</h2>
        <p className="mt-1 font-dm text-sm text-muted">
          Type these exactly as they appear on your registration documents. Nothing here is guessed
          or filled in for you.
        </p>

        <div className="mt-4 space-y-4">
          {FIELDS.map((f) => {
            const missing = REQUIRED.includes(f.key) && !fields[f.key].trim();
            return (
              <div key={f.key}>
                <label htmlFor={`legal-${f.key}`} className="block font-bebas text-[11px] tracking-[0.2em] text-muted">
                  {f.label.toUpperCase()}
                  {missing && <span className="ml-2 text-yellow/80">· not yet published</span>}
                </label>
                {f.multiline ? (
                  <textarea
                    id={`legal-${f.key}`}
                    rows={2}
                    value={fields[f.key]}
                    placeholder={f.placeholder}
                    onChange={(e) => setFields((p) => ({ ...p, [f.key]: e.target.value }))}
                    className={field}
                  />
                ) : (
                  <input
                    id={`legal-${f.key}`}
                    type="text"
                    value={fields[f.key]}
                    placeholder={f.placeholder}
                    onChange={(e) => setFields((p) => ({ ...p, [f.key]: e.target.value }))}
                    className={field}
                  />
                )}
                <p className="mt-1 font-dm text-[11px] leading-relaxed text-muted">{f.hint}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex items-center gap-3">
          <Button onClick={() => void save()} disabled={!dirty || !tiersValid || saving}>
            {saving ? <Loader2 size={16} className="mr-1.5 animate-spin" /> : null}
            Save
          </Button>
          {!dirty && (
            <span className="flex items-center gap-1.5 font-dm text-xs text-green-400">
              <Check size={14} /> Saved
            </span>
          )}
        </div>
      </section>

      {/* ── Commercial rules the owner must decide (P1 #4) ──────────────
          Each of these appears verbatim in the published Terms of Service.
          They are separated from the company details above because they are a
          different kind of thing: the block above is a matter of fact that can
          be looked up, this one is a matter of policy that has to be chosen. */}
      <section className="rounded-2xl border border-white/10 bg-dark-card p-5">
        <h2 className="flex items-center gap-2 font-syne text-base font-bold text-offwhite">
          <Gavel size={16} className="text-yellow" /> Your commercial rules
        </h2>
        <p className="mt-1 font-dm text-sm text-muted">
          These appear word for word in your{" "}
          <a href="/legal/terms" target="_blank" rel="noreferrer" className="text-yellow hover:underline">
            Terms &amp; Conditions
          </a>
          . Nothing here is filled in for you — a guessed rule published on a page customers agree to
          is a rule you would be held to. Anything left blank shows there as{" "}
          <span className="text-yellow/80">[to be confirmed by the operator]</span>.
        </p>

        <div className="mt-4 space-y-4">
          {TERMS_FIELDS.map((f) => (
            <div key={f.key}>
              <label htmlFor={`terms-${f.key}`} className="block font-bebas text-[11px] tracking-[0.2em] text-muted">
                {f.label.toUpperCase()}
                {!terms[f.key].trim() && <span className="ml-2 text-yellow/80">· not yet decided</span>}
              </label>
              <textarea
                id={`terms-${f.key}`}
                rows={2}
                value={terms[f.key]}
                placeholder={f.placeholder}
                onChange={(e) => setTerms((p) => ({ ...p, [f.key]: e.target.value }))}
                className={field}
              />
              <p className="mt-1 font-dm text-[11px] leading-relaxed text-muted">{f.hint}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-center gap-3">
          <Button onClick={() => void save()} disabled={!dirty || !tiersValid || saving}>
            {saving ? <Loader2 size={16} className="mr-1.5 animate-spin" /> : null}
            Save
          </Button>
          {!dirty && (
            <span className="flex items-center gap-1.5 font-dm text-xs text-green-400">
              <Check size={14} /> Saved
            </span>
          )}
        </div>
      </section>

      {/* ── The refund policy's commercial numbers ──────────────────────
          Sections 3, 6, 7 and 8 of /legal/refunds. Everything else on that
          page describes what the software does — who holds the money, how a
          refund is opened and chased — and stays out of the owner's hands on
          purpose, because the page must not be editable into disagreeing with
          the mechanism it documents. */}
      <section className="rounded-2xl border border-white/10 bg-dark-card p-5">
        <h2 className="flex items-center gap-2 font-syne text-base font-bold text-offwhite">
          <Undo2 size={16} className="text-yellow" /> Refund policy
        </h2>
        <p className="mt-1 font-dm text-sm text-muted">
          The rental cancellation ladder and deposit rules published in your{" "}
          <a href="/legal/refunds" target="_blank" rel="noreferrer" className="text-yellow hover:underline">
            Refund &amp; Cancellation Policy
          </a>
          . These are already live, so the boxes start filled with what customers see today — clearing
          one restores that wording rather than removing it.
        </p>

        <div className="mt-4">
          <span className="block font-bebas text-[11px] tracking-[0.2em] text-muted">
            CANCELLATION LADDER (VEHICLE RENTALS)
          </span>
          <p className="mt-1 font-dm text-[11px] leading-relaxed text-muted">
            Most notice first. A customer reads this top to bottom to find their own situation.
          </p>

          <div className="mt-2.5 space-y-2">
            {refunds.vehicleCancellationTiers.map((t, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <input
                  aria-label={`Cancellation window ${i + 1}`}
                  value={t.window}
                  placeholder="More than 48 hours before pickup"
                  onChange={(e) =>
                    setRefunds((p) => ({
                      ...p,
                      vehicleCancellationTiers: p.vehicleCancellationTiers.map((row, j) =>
                        j === i ? { ...row, window: e.target.value } : row,
                      ),
                    }))
                  }
                  className="min-w-[220px] flex-1 rounded-xl border border-white/12 bg-dark px-3.5 py-2.5 font-dm text-sm text-offwhite placeholder:text-muted/50 focus:border-yellow/50 focus:outline-none"
                />
                <span className="font-dm text-sm text-muted">&mdash;</span>
                <input
                  aria-label={`Cancellation outcome ${i + 1}`}
                  value={t.outcome}
                  placeholder="full refund"
                  onChange={(e) =>
                    setRefunds((p) => ({
                      ...p,
                      vehicleCancellationTiers: p.vehicleCancellationTiers.map((row, j) =>
                        j === i ? { ...row, outcome: e.target.value } : row,
                      ),
                    }))
                  }
                  className="min-w-[160px] flex-1 rounded-xl border border-white/12 bg-dark px-3.5 py-2.5 font-dm text-sm text-offwhite placeholder:text-muted/50 focus:border-yellow/50 focus:outline-none"
                />
                <button
                  type="button"
                  aria-label={`Remove tier ${i + 1}`}
                  onClick={() =>
                    setRefunds((p) => ({
                      ...p,
                      vehicleCancellationTiers: p.vehicleCancellationTiers.filter((_, j) => j !== i),
                    }))
                  }
                  className="rounded-xl border border-white/12 p-2.5 text-muted hover:border-red-500/40 hover:text-red-300"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>

          {!tiersValid && (
            <p role="alert" className="mt-2 font-dm text-xs text-red-400">
              Every tier needs both a window and an outcome — a half-written row would publish a rule
              nobody can read.
            </p>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setRefunds((p) => ({
                  ...p,
                  vehicleCancellationTiers: [...p.vehicleCancellationTiers, { window: "", outcome: "" }],
                }))
              }
            >
              <Plus size={14} className="mr-1.5" /> Add a tier
            </Button>
            {refunds.vehicleCancellationTiers.length === 0 && (
              <span className="font-dm text-xs text-yellow/80">
                No tiers — the published policy will fall back to the current one rather than show none.
              </span>
            )}
          </div>
        </div>

        <div className="mt-5 space-y-4">
          {REFUND_TEXT_FIELDS.map((f) => (
            <div key={f.key}>
              <label htmlFor={`refunds-${f.key}`} className="block font-bebas text-[11px] tracking-[0.2em] text-muted">
                {f.label.toUpperCase()}
              </label>
              <textarea
                id={`refunds-${f.key}`}
                rows={3}
                value={refunds[f.key]}
                onChange={(e) => setRefunds((p) => ({ ...p, [f.key]: e.target.value }))}
                className={field}
              />
              <p className="mt-1 flex items-center gap-1.5 font-dm text-[11px] leading-relaxed text-muted">
                {f.hint}
                {!refunds[f.key].trim() && (
                  <span className="inline-flex items-center gap-1 text-yellow/80">
                    <RotateCcw size={11} /> blank — the current wording stays published
                  </span>
                )}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-center gap-3">
          <Button onClick={() => void save()} disabled={!dirty || !tiersValid || saving}>
            {saving ? <Loader2 size={16} className="mr-1.5 animate-spin" /> : null}
            Save
          </Button>
          {!dirty && (
            <span className="flex items-center gap-1.5 font-dm text-xs text-green-400">
              <Check size={14} /> Saved
            </span>
          )}
        </div>
        <p className="mt-3 font-dm text-[11px] text-muted">
          &ldquo;If we or the owner cancel, you receive a 100% refund&rdquo; is not editable — that is a
          promise the platform makes, not a dial.
        </p>
      </section>

      {/* ── The certificate. Private bucket, signed URLs, never published. ── */}
      <section className="rounded-2xl border border-white/10 bg-dark-card p-5">
        <h2 className="flex items-center gap-2 font-syne text-base font-bold text-offwhite">
          <ShieldCheck size={16} className="text-yellow" /> Registration certificate
        </h2>
        <p className="mt-1 font-dm text-sm text-muted">
          A photo or PDF of your certificate of incorporation, for your own reference and to prove
          identity when a bank or supplier asks.
        </p>
        <p className="mt-2 flex items-start gap-2 rounded-xl border border-green-500/25 bg-green-500/[0.07] px-3.5 py-2.5 font-dm text-[11px] leading-relaxed text-green-200/90">
          <ShieldCheck size={13} className="mt-0.5 shrink-0" />
          <span>
            Stored in a private bucket, not with the site&apos;s public images. It is never published
            anywhere on the site and can only be opened from this page, through a link that stops
            working after five minutes.
          </span>
        </p>

        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadCertificate(f);
          }}
        />

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : <Upload size={15} className="mr-1.5" />}
            {certificatePath ? "Replace" : "Upload"}
          </Button>
          {certificatePath && (
            <>
              <Button variant="outline" onClick={() => void viewCertificate()}>
                <Eye size={15} className="mr-1.5" /> View
              </Button>
              <Button variant="outline" onClick={() => void removeCertificate()}>
                <Trash2 size={15} className="mr-1.5" /> Remove
              </Button>
            </>
          )}
          <span className="font-dm text-xs text-muted">
            {certificatePath ? "A certificate is stored." : "Nothing uploaded yet. JPG, PNG, WebP, HEIC or PDF, up to 4 MB."}
          </span>
        </div>
      </section>
    </div>
  );
}
