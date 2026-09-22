"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download, Plus, Trash2, Copy, Check, Sparkles, Upload, X, Save,
  FolderOpen, Ban, Loader2,
} from "lucide-react";
import { downloadBlob } from "@/lib/download";
import {
  DOC_KINDS, DOC_KIND_LABEL, CURRENCIES, currencyByCode, formatMoney, parseMoney,
  computeMoney, suggestReference, MAX_LINES, type DocKind, type ReceiptlyDoc,
} from "@/lib/receiptly/model";
import { buildReceiptlyPdf, receiptlyFilename } from "@/lib/receiptly/pdf";
import { blankDoc, loadDraft, saveDraft } from "@/lib/receiptly/draft";
import { islandToday } from "@/lib/receiptly/documents";
import { fileToLogoDataUrl } from "@/lib/receiptly/logo";
import type { SavedDoc, BusinessProfile } from "@/lib/receiptly/db";
import DocumentPreview from "./DocumentPreview";
import { PAGE } from "@/lib/receiptly/theme";

// ── RECEIPTLY ───────────────────────────────────────────────────────────────
//
// Form on the left, the actual page on the right, updating as you type. The
// preview is not a mock-up of the PDF — it reads the same constants, so a line
// that will be cut off in the download is cut off on screen too.
//
// TWO KINDS OF SAVING, kept visibly apart because conflating them would be a
// lie. The draft autosaves to THIS BROWSER on every keystroke, so a refresh
// never costs work. Pressing Save writes a numbered row to the database, which
// is what makes a document findable next week, from another device, by
// somebody else.
//
// The database does the arithmetic. The browser sends the typed figures and
// receives the totals back; it never computes a total and sends it.

const ACCENTS = ["#0a7d3b", "#0f172a", "#1d4ed8", "#b45309", "#be123c", "#7c3aed", "#0891b2"];

/** A reservation a document can be started from. */
type Prefill = {
  placeBookingId: string;
  reference: string;
  guestName: string;
  guestEmail: string | null;
  guestPhone: string | null;
  placeName: string;
  startDate: string;
  guests: number | null;
  timeSlot: string | null;
  totalMinor: number;
};

/** Today, as the date input wants it. */
function isoToday(): string {
  return islandToday();
}

export default function ReceiptlyStudio() {
  const today = useMemo(isoToday, []);
  const [doc, setDoc] = useState<ReceiptlyDoc>(() => blankDoc(today));
  const [hydrated, setHydrated] = useState(false);
  // Two different "saved" states, and conflating them would be a lie to the
  // user: `drafted` is the autosave to this browser, `savedId` is the row in
  // the database that other people and other devices can see.
  const [drafted, setDrafted] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [savedNumber, setSavedNumber] = useState<string | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [docs, setDocs] = useState<SavedDoc[]>([]);
  const [prefills, setPrefills] = useState<Prefill[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const [placeBookingId, setPlaceBookingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewScale, setPreviewScale] = useState(0.62);
  // ── WHEN AN UNCONTROLLED BOX MUST BE RE-READ ──────────────────────────
  //
  // The money and quantity fields are uncontrolled on purpose: a controlled
  // one parses what you typed, formats it back and moves the cursor mid-
  // number. But defaultValue initialises on MOUNT only, so any change to the
  // document that did NOT come from the box itself — opening a saved one,
  // Mark paid, a prefill, deleting a line and shifting every index up — left
  // the old text sitting in the box beside a preview showing the new figure.
  //
  // This counter is the remount signal, and it is bumped only by those
  // outside-the-form events. Keying on the VALUE instead is what made the
  // "Amount received" box unusable: it remounted on every keystroke, so it
  // lost focus after the first character and "1800" was saved as Rs 1.
  const [formEpoch, setFormEpoch] = useState(0);
  const reseedForm = useCallback(() => setFormEpoch((n) => n + 1), []);
  const previewWrap = useRef<HTMLDivElement>(null);

  const c = currencyByCode(doc.currencyCode);
  const m = computeMoney(doc);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/receiptly", { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Could not load your documents.");
      setDocs(body.documents ?? []);
      setPrefills(body.prefills ?? []);
      return body.profile as BusinessProfile | undefined;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your documents.");
      return undefined;
    }
  }, []);

  // ── Hydrate: the local draft first, the server's profile behind it ─────
  useEffect(() => {
    const local = loadDraft(today);
    if (local) {
      setDoc(local.doc);
      // WHICH ROW the draft belongs to, restored with it. Without this a
      // reload mid-edit turned the next Save into a second numbered document
      // for the same booking.
      setSavedId(local.savedId);
      setSavedNumber(local.savedNumber);
      setPlaceBookingId(local.placeBookingId);
    }
    void (async () => {
      const profile = await refresh();
      // The saved profile fills a NEW document only. Overwriting a draft the
      // owner is halfway through typing would be the tool undoing his work.
      if (profile && !local) {
        setDoc((d) => ({
          ...d,
          business: {
            name: profile.name || d.business.name,
            tagline: profile.tagline || d.business.tagline,
            website: profile.website || d.business.website,
            accent: profile.accent || d.business.accent,
            logo: profile.logo ?? d.business.logo,
          },
          payMethod: profile.payMethod || d.payMethod,
          payReference: profile.payReference || d.payReference,
          terms: profile.terms || d.terms,
          footer: profile.footer || d.footer,
        }));
      }
      setHydrated(true);
    })();
  }, [today, refresh]);

  // ── Autosave the DRAFT to this browser, debounced ──────────────────────
  useEffect(() => {
    if (!hydrated) return;
    const t = setTimeout(() => {
      saveDraft({ doc, savedId, savedNumber, placeBookingId });
      setDrafted(true);
      setTimeout(() => setDrafted(false), 1400);
    }, 600);
    return () => clearTimeout(t);
  }, [doc, hydrated, savedId, savedNumber, placeBookingId]);

  // WHETHER THE ROW IS BEHIND THE SCREEN, by comparison rather than by flag.
  //
  // This was a useEffect on [doc] that set a dirty flag. It marked every
  // freshly OPENED document dirty: openSaved() sets the doc and clears the
  // flag in one batch, then the effect runs after that render, sees a changed
  // doc and a savedId, and sets it straight back. A snapshot cannot race
  // itself — it is the same two values compared, whenever they are read.
  const dirty = savedId !== null && JSON.stringify(doc) !== savedSnapshot;

  // ── The preview scales to whatever room it has ─────────────────────────
  useEffect(() => {
    const el = previewWrap.current;
    if (!el) return;
    const fit = () => setPreviewScale(Math.min(1, (el.clientWidth - 8) / PAGE.width));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const set = useCallback(<K extends keyof ReceiptlyDoc>(k: K, v: ReceiptlyDoc[K]) => {
    setDoc((d) => ({ ...d, [k]: v }));
  }, []);

  const download = useCallback(() => {
    const pdf = buildReceiptlyPdf(doc);
    downloadBlob(
      new Blob([pdf.slice().buffer as ArrayBuffer], { type: "application/pdf" }),
      receiptlyFilename(doc),
    );
  }, [doc]);

  const markPaid = useCallback(() => {
    setDoc((d) => {
      const money = computeMoney(d);
      return { ...d, receivedMinor: money.totalMinor, kind: "receipt" as DocKind };
    });
    // It writes receivedMinor from outside the box, so the box has to re-read.
    reseedForm();
  }, [reseedForm]);

  /** Write the document to the database and take back the figures it computed. */
  const save = useCallback(async () => {
    if (saving) return null;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/receiptly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: savedId, doc, placeBookingId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Could not save.");
      const saved = body.document as SavedDoc;
      setSavedId(saved.id);
      setSavedNumber(saved.number);
      // The snapshot is what the DATABASE returned, not what was sent: SQL
      // trims, lowercases the email and recomputes the totals, so comparing
      // against the sent version would show "unsaved changes" on a document
      // that is saved.
      setDoc(saved);
      setSavedSnapshot(JSON.stringify(saved));
      // SQL trims and re-rounds, so the boxes have to re-read what came back.
      reseedForm();
      void refresh();
      return saved;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
      return null;
    } finally {
      setSaving(false);
    }
  }, [doc, savedId, placeBookingId, saving, refresh, reseedForm]);

  /** Reopen a saved document, lines and all. */
  const openSaved = useCallback(async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/receiptly/${id}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Could not open it.");
      const saved = body.document as SavedDoc;
      setDoc(saved);
      setSavedId(saved.id);
      setSavedNumber(saved.number);
      setPlaceBookingId(saved.placeBookingId);
      setSavedSnapshot(JSON.stringify(saved));
      reseedForm();
      setShowSaved(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open it.");
    }
  }, [reseedForm]);

  /** Cancelled, never deleted: the number is never reused. */
  const cancelSaved = useCallback(async (id: string, state: "open" | "cancelled") => {
    try {
      await fetch(`/api/admin/receiptly/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state }),
      });
      void refresh();
    } catch {
      setError("Could not update it.");
    }
  }, [refresh]);

  /** Start a fresh document, keeping the business identity. */
  const startNew = useCallback(() => {
    const fresh = blankDoc(today);
    setDoc((d) => ({
      ...fresh,
      business: d.business,
      payMethod: d.payMethod,
      payReference: d.payReference,
      terms: d.terms,
      footer: d.footer,
      currencyCode: d.currencyCode,
    }));
    setSavedId(null);
    setSavedNumber(null);
    setPlaceBookingId(null);
    setSavedSnapshot(null);
    reseedForm();
  }, [today, reseedForm]);

  /** Remember the business identity for the next document. */
  const saveProfile = useCallback(async () => {
    try {
      await fetch("/api/admin/receiptly", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: {
            name: doc.business.name, tagline: doc.business.tagline,
            website: doc.business.website, accent: doc.business.accent,
            logo: doc.business.logo,
            payMethod: doc.payMethod, payReference: doc.payReference,
            terms: doc.terms, footer: doc.footer,
          },
        }),
      });
    } catch {
      // A profile that failed to save is not worth interrupting the document
      // for; the fields still hold what was typed.
    }
  }, [doc]);

  function applyPrefill(p: Prefill) {
    // What the reservation knows. The price comes across only when the listing
    // actually had one — most do not, which is why this tool exists.
    setPlaceBookingId(p.placeBookingId);
    setDoc((d) => ({
      ...d,
      reference: p.reference,
      customerName: p.guestName,
      customerEmail: p.guestEmail ?? "",
      customerPhone: p.guestPhone ?? "",
      serviceName: p.placeName,
      details: [
        { label: "Guests", value: p.guests ? `${p.guests} persons` : "" },
        { label: "Meeting point", value: "" },
        { label: "Meeting time", value: p.timeSlot ?? "" },
        { label: "Date", value: p.startDate.slice(0, 10) },
      ],
      lines: [{ description: p.placeName, qty: 1, unitMinor: p.totalMinor }],
    }));
    setSavedId(null);
    setSavedNumber(null);
    setSavedSnapshot(null);
    reseedForm();
  }

  // ── Keyboard shortcuts ─────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (e.key.toLowerCase() === "s") { e.preventDefault(); void save(); }
      if (e.key.toLowerCase() === "p") { e.preventDefault(); download(); }
      if (e.key.toLowerCase() === "d") { e.preventDefault(); markPaid(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [download, markPaid, save]);

  async function onLogo(file: File | null) {
    if (!file) return set("business", { ...doc.business, logo: null });
    try {
      // Downscaled and re-encoded to JPEG in the browser. A logo off a phone
      // is a three-megapixel photo; stored raw it would be megabytes of base64
      // copied onto every document this business ever issues.
      set("business", { ...doc.business, logo: await fileToLogoDataUrl(file) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "That image could not be used.");
    }
  }

  const inputCls =
    "mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 " +
    "outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-4 focus:ring-slate-900/5 " +
    "dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-100 dark:placeholder:text-slate-500";
  const labelCls =
    "text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#0b0f14] dark:text-slate-100">
      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur-xl dark:border-white/10 dark:bg-[#0b0f14]/85">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-3 px-4 py-3 md:px-6">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900">
              <Sparkles size={15} />
            </span>
            <span className="text-[15px] font-semibold tracking-tight">Receiptly</span>
          </div>

          <div className="ml-1 flex rounded-lg bg-slate-100 p-0.5 dark:bg-white/[0.06]">
            {DOC_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => set("kind", k)}
                className={`relative rounded-[7px] px-3 py-1.5 text-xs font-medium transition ${
                  doc.kind === k ? "text-slate-900 dark:text-white" : "text-slate-500 hover:text-slate-700 dark:text-slate-400"
                }`}
              >
                {doc.kind === k && (
                  <motion.span
                    layoutId="kind-pill"
                    className="absolute inset-0 rounded-[7px] bg-white shadow-sm dark:bg-white/10"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                <span className="relative">{DOC_KIND_LABEL[k]}</span>
              </button>
            ))}
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {/* Two states, said separately. "Draft saved" is this browser; the
                number beside it is the row everyone else can see. */}
            <AnimatePresence>
              {drafted && !dirty && (
                <motion.span
                  initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="hidden items-center gap-1 text-xs text-slate-400 sm:flex"
                >
                  <Check size={12} /> Draft saved
                </motion.span>
              )}
            </AnimatePresence>
            {savedNumber && (
              <span className="hidden items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-500 sm:flex dark:bg-white/[0.06] dark:text-slate-400">
                {savedNumber}
                {dirty && <span className="text-amber-600 dark:text-amber-400">unsaved changes</span>}
              </span>
            )}

            <button
              type="button" onClick={startNew}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-medium transition hover:bg-slate-100 dark:border-white/10 dark:hover:bg-white/5"
            >
              <Plus size={14} /> <span className="hidden sm:inline">New</span>
            </button>
            <button
              type="button" onClick={() => setShowSaved((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-medium transition hover:bg-slate-100 dark:border-white/10 dark:hover:bg-white/5"
            >
              <FolderOpen size={14} />
              <span className="hidden sm:inline">Saved</span>
              {docs.length > 0 && (
                <span className="rounded bg-slate-200 px-1 text-[10px] text-slate-600 dark:bg-white/10 dark:text-slate-300">
                  {docs.length}
                </span>
              )}
            </button>
            <button
              type="button" onClick={markPaid} title="Mark as paid (Ctrl+D)"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-medium transition hover:bg-slate-100 dark:border-white/10 dark:hover:bg-white/5"
            >
              <Check size={14} /> <span className="hidden sm:inline">Mark paid</span>
            </button>
            <button
              type="button" onClick={() => void save()} disabled={saving}
              title="Save to your documents (Ctrl+S)"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold transition hover:bg-slate-100 disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/5"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? "Saving" : savedId ? "Save changes" : "Save"}
            </button>
            <button
              type="button" onClick={download} title="Download PDF (Ctrl+P)"
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
            >
              <Download size={14} /> Download PDF
            </button>
          </div>
        </div>

        {error && (
          <div className="mx-auto max-w-[1500px] px-4 pb-3 md:px-6">
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
              {error}
            </p>
          </div>
        )}

        <AnimatePresence>
          {showSaved && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-t border-slate-200/80 bg-white dark:border-white/10 dark:bg-[#0b0f14]"
            >
              <div className="mx-auto max-w-[1500px] px-4 py-3 md:px-6">
                {prefills.length > 0 && (
                  <div className="mb-3">
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                      Start from a reservation
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {prefills.slice(0, 8).map((p) => (
                        <button
                          key={p.placeBookingId} type="button"
                          onClick={() => { applyPrefill(p); setShowSaved(false); }}
                          className="rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs transition hover:border-slate-500 dark:border-white/15"
                        >
                          {p.guestName} — {p.placeName}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                  Your documents
                </p>
                {docs.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-400">
                    Nothing saved yet. Press Save and it appears here, numbered, from any device.
                  </p>
                ) : (
                  <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {docs.map((d) => (
                      <li
                        key={d.id}
                        className={`flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 dark:border-white/10 ${
                          d.state === "cancelled" ? "opacity-55" : ""
                        }`}
                      >
                        <button
                          type="button" onClick={() => void openSaved(d.id)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <span className="block truncate text-xs font-semibold">
                            {d.reference}
                            {d.state === "cancelled" ? " (cancelled)" : ""}
                          </span>
                          <span className="block truncate text-[11px] text-slate-500">
                            {d.customerName} — {DOC_KIND_LABEL[d.kind]} — {d.number}
                          </span>
                        </button>
                        <button
                          type="button"
                          title={d.state === "cancelled" ? "Reopen" : "Cancel"}
                          onClick={() => void cancelSaved(d.id, d.state === "cancelled" ? "open" : "cancelled")}
                          className="shrink-0 rounded p-1 text-slate-400 transition hover:text-rose-500"
                        >
                          <Ban size={13} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-6 px-4 py-6 md:px-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        {/* ── The form ──────────────────────────────────────────────── */}
        <div className="space-y-4">
          <Card title="Your business">
            <div className="flex items-center gap-3">
              <label className="grid h-14 w-14 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-xl border border-dashed border-slate-300 text-slate-400 transition hover:border-slate-400 dark:border-white/15">
                {doc.business.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={doc.business.logo} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Upload size={16} />
                )}
                <input type="file" accept="image/*" className="sr-only"
                  onChange={(e) => onLogo(e.target.files?.[0] ?? null)} />
              </label>
              <div className="min-w-0 flex-1">
                <label className={labelCls} htmlFor="r-biz">Name</label>
                <input id="r-biz" className={inputCls} value={doc.business.name}
                  onChange={(e) => set("business", { ...doc.business, name: e.target.value })} />
              </div>
              {doc.business.logo && (
                <button type="button" aria-label="Remove logo"
                  onClick={() => set("business", { ...doc.business, logo: null })}
                  className="rounded-lg border border-slate-200 p-2 text-slate-400 dark:border-white/10">
                  <X size={13} />
                </button>
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Website" value={doc.business.website} cls={inputCls} labelCls={labelCls}
                onChange={(v) => set("business", { ...doc.business, website: v })} placeholder="roulerodrig.com" />
              <Field label="Tagline" value={doc.business.tagline} cls={inputCls} labelCls={labelCls}
                onChange={(v) => set("business", { ...doc.business, tagline: v })} placeholder="Take the long way" />
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className={labelCls}>Brand colour</span>
              <button
                type="button" onClick={() => void saveProfile()}
                className="text-[11px] font-medium text-slate-500 underline-offset-2 transition hover:text-slate-900 hover:underline dark:hover:text-white"
              >
                Remember for next time
              </button>
            </div>
            <div className="mt-2">
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {ACCENTS.map((a) => (
                  <button key={a} type="button" aria-label={`Use ${a}`}
                    onClick={() => set("business", { ...doc.business, accent: a })}
                    className={`h-7 w-7 rounded-full ring-offset-2 transition dark:ring-offset-[#0b0f14] ${
                      doc.business.accent === a ? "ring-2 ring-slate-900 dark:ring-white" : ""}`}
                    style={{ background: a }} />
                ))}
                <input type="color" aria-label="Custom brand colour" value={doc.business.accent}
                  onChange={(e) => set("business", { ...doc.business, accent: e.target.value })}
                  className="h-7 w-10 cursor-pointer rounded border border-slate-200 bg-transparent dark:border-white/10" />
              </div>
            </div>
          </Card>

          <Card title="Customer">
            <Field label="Name" value={doc.customerName} cls={inputCls} labelCls={labelCls}
              onChange={(v) => set("customerName", v)} placeholder="Sandrine Baltz" />
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Email" value={doc.customerEmail} cls={inputCls} labelCls={labelCls}
                onChange={(v) => set("customerEmail", v)} placeholder="name@example.com" />
              <Field label="Phone" value={doc.customerPhone} cls={inputCls} labelCls={labelCls}
                onChange={(v) => set("customerPhone", v)} placeholder="+230 5xxx xxxx" />
            </div>
          </Card>

          <Card title="What it is for">
            <Field label="Service or experience" value={doc.serviceName} cls={inputCls} labelCls={labelCls}
              onChange={(v) => set("serviceName", v)} placeholder="Îles aux Cocos – Les Inséparables" />
            <div className="mt-3 grid grid-cols-2 gap-3">
              {doc.details.map((d, i) => (
                <div key={i}>
                  <label className={labelCls} htmlFor={`r-det-${i}`}>{d.label}</label>
                  <input id={`r-det-${i}`} className={inputCls} value={d.value}
                    placeholder={d.label === "Guests" ? "2 persons" : d.label === "Meeting time" ? "09:00" : ""}
                    onChange={(e) => set("details",
                      doc.details.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                </div>
              ))}
            </div>
          </Card>

          <Card
            title="Line items"
            action={
              doc.lines.length < MAX_LINES ? (
                <button type="button"
                  onClick={() => {
                    set("lines", [...doc.lines, { description: "", qty: 1, unitMinor: 0 }]);
                    reseedForm();
                  }}
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 transition hover:text-slate-900 dark:hover:text-white">
                  <Plus size={13} /> Add line
                </button>
              ) : null
            }
          >
            <div className="space-y-2">
              {doc.lines.map((l, i) => (
                <div key={i} className="grid grid-cols-12 gap-2">
                  <input aria-label={`Line ${i + 1} description`} className={`${inputCls} col-span-12 !mt-0 sm:col-span-6`}
                    placeholder="Description" value={l.description}
                    onChange={(e) => set("lines", doc.lines.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} />
                  {/* UNCONTROLLED, for the reason the price beside it is.
                      As a controlled field it ATE THE DECIMAL POINT: typing
                      "1.5" re-rendered the box as "1" after the dot, so the
                      "5" landed against it and the line became qty 15 — ten
                      times the job, on the saved document and the PDF. */}
                  <input key={`qty-${formEpoch}-${i}`}
                    aria-label={`Line ${i + 1} quantity`} className={`${inputCls} col-span-3 !mt-0 sm:col-span-2`}
                    inputMode="decimal" placeholder="Qty"
                    defaultValue={l.qty ? String(l.qty) : ""}
                    onChange={(e) => {
                      const n = Number(e.target.value.replace(/[^\d.]/g, ""));
                      set("lines", doc.lines.map((x, j) => j === i
                        ? { ...x, qty: Number.isFinite(n) ? Math.max(0, n) : 0 } : x));
                    }} />
                  {/* UNCONTROLLED, and remounted deliberately.
                      A controlled money field fights the typist: parse "1.5"
                      and format it back and the cursor jumps mid-number. But
                      defaultValue only initialises on MOUNT, so opening a
                      saved document left the old text in the box while the
                      preview showed the new figure. The key changes with the
                      document and the currency — the two things that change
                      what this field should say — and nothing else.

                      The epoch is in the key because the INDEX is not enough:
                      deleting line 1 of two re-renders the survivor at index
                      0 with the identical key, so React kept the old DOM node
                      and the box still read the deleted line's price beside
                      the right description. */}
                  <input key={`unit-${formEpoch}-${i}-${doc.currencyCode}`}
                    aria-label={`Line ${i + 1} unit price`} className={`${inputCls} col-span-6 !mt-0 sm:col-span-3`}
                    inputMode="decimal" placeholder={`Unit (${c.symbol})`}
                    defaultValue={l.unitMinor ? String(l.unitMinor / 10 ** c.exponent) : ""}
                    onChange={(e) => {
                      const v = parseMoney(e.target.value, c);
                      set("lines", doc.lines.map((x, j) => j === i ? { ...x, unitMinor: v ?? 0 } : x));
                    }} />
                  <button type="button" aria-label={`Remove line ${i + 1}`}
                    onClick={() => {
                      if (doc.lines.length <= 1) return;
                      set("lines", doc.lines.filter((_, j) => j !== i));
                      reseedForm();
                    }}
                    className="col-span-3 grid place-items-center rounded-lg border border-slate-200 text-slate-400 transition hover:text-rose-500 sm:col-span-1 dark:border-white/10">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Money">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls} htmlFor="r-cur">Currency</label>
                <select id="r-cur" className={inputCls} value={doc.currencyCode}
                  onChange={(e) => set("currencyCode", e.target.value)}>
                  {CURRENCIES.map((x) => (
                    <option key={x.code} value={x.code}>{x.code} — {x.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="r-dep">Deposit %</label>
                <input id="r-dep" className={inputCls} inputMode="numeric" placeholder="50"
                  value={doc.depositPct ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    set("depositPct", raw === "" ? null : Math.min(100, Math.max(0, Number(raw.replace(/\D/g, "")) || 0)));
                  }} />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls} htmlFor="r-recv">Amount received</label>
                <input id="r-recv" key={`recv-${formEpoch}-${doc.currencyCode}`}
                  className={inputCls} inputMode="decimal" placeholder="0"
                  defaultValue={doc.receivedMinor ? String(doc.receivedMinor / 10 ** c.exponent) : ""}
                  onChange={(e) => set("receivedMinor", parseMoney(e.target.value, c) ?? 0)} />
              </div>
              <Field label="Payment method" value={doc.payMethod} cls={inputCls} labelCls={labelCls}
                onChange={(v) => set("payMethod", v)} placeholder="MCB Juice" />
            </div>
            <div className="mt-3">
              <Field label="Payment reference" value={doc.payReference} cls={inputCls} labelCls={labelCls}
                onChange={(v) => set("payReference", v)} placeholder="58363401" />
            </div>
            <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2.5 text-xs dark:bg-white/[0.04]">
              <div className="flex justify-between"><span className="text-slate-500">Total</span>
                <span className="font-semibold tabular-nums">{formatMoney(m.totalMinor, c)}</span></div>
              {m.depositMinor > 0 && (
                <div className="mt-1 flex justify-between"><span className="text-slate-500">Deposit</span>
                  <span className="tabular-nums">{formatMoney(m.depositMinor, c)}</span></div>
              )}
              <div className="mt-1 flex justify-between"><span className="text-slate-500">Received</span>
                <span className="tabular-nums">{formatMoney(m.receivedMinor, c)}</span></div>
            </div>
          </Card>

          <Card title="Document">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls} htmlFor="r-ref">Reference</label>
                <div className="mt-1.5 flex gap-2">
                  <input id="r-ref" className={`${inputCls} !mt-0`} value={doc.reference}
                    placeholder="RR-COCOS-SB" onChange={(e) => set("reference", e.target.value)} />
                  <button type="button" title="Suggest a reference"
                    onClick={() => set("reference", suggestReference(
                      doc.business.name, doc.serviceName, doc.customerName, today.replace(/-/g, "").slice(4)))}
                    className="shrink-0 rounded-lg border border-slate-200 px-2.5 text-slate-500 transition hover:text-slate-900 dark:border-white/10 dark:hover:text-white">
                    <Copy size={13} />
                  </button>
                </div>
              </div>
              <div>
                <label className={labelCls} htmlFor="r-issued">Issued on</label>
                <input id="r-issued" type="date" className={inputCls} value={doc.issuedOn}
                  onChange={(e) => set("issuedOn", e.target.value)} />
              </div>
            </div>
            <div className="mt-3">
              <label className={labelCls} htmlFor="r-notes">Notes</label>
              <textarea id="r-notes" rows={2} className={inputCls} value={doc.notes}
                placeholder="Anything the guest should know." onChange={(e) => set("notes", e.target.value)} />
            </div>
            <div className="mt-3">
              <label className={labelCls} htmlFor="r-terms">Terms</label>
              <textarea id="r-terms" rows={2} className={inputCls} value={doc.terms}
                placeholder="Cancellation policy, balance due date…" onChange={(e) => set("terms", e.target.value)} />
            </div>
          </Card>
        </div>

        {/* ── The page itself ───────────────────────────────────────── */}
        <div className="lg:sticky lg:top-[72px] lg:self-start">
          <div ref={previewWrap} className="overflow-hidden rounded-2xl">
            <div style={{ height: PAGE.height * previewScale }}>
              <DocumentPreview doc={doc} scale={previewScale} />
            </div>
          </div>
          <p className="mt-3 text-center text-xs text-slate-400">
            This is the page you will download. <kbd className="rounded border border-slate-300 px-1 dark:border-white/20">Ctrl</kbd>
            +<kbd className="rounded border border-slate-300 px-1 dark:border-white/20">S</kbd> to save it as a PDF.
          </p>
        </div>
      </div>
    </div>
  );
}

function Card({
  title, action, children,
}: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-white/[0.02]">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[13px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({
  label, value, onChange, placeholder, cls, labelCls,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; cls: string; labelCls: string;
}) {
  const id = `f-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div>
      <label className={labelCls} htmlFor={id}>{label}</label>
      <input id={id} className={cls} value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
