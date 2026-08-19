"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Check, AlertTriangle, Upload, Eye, Trash2, ShieldCheck } from "lucide-react";
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

  const dirty = (Object.keys(fields) as (keyof LegalFields)[]).some((k) => fields[k] !== saved[k]);
  const outstanding = REQUIRED.filter((k) => !fields[k].trim());

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/legal", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(fields),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not save.");
      setSaved({ ...fields });
      toast.success("Legal details saved — the notice page is already updated");
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
          <Button onClick={() => void save()} disabled={!dirty || saving}>
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
