"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download, Plus, Trash2, Copy, Check, Sparkles, History, Upload, X,
} from "lucide-react";
import { downloadBlob } from "@/lib/download";
import {
  DOC_KINDS, DOC_KIND_LABEL, CURRENCIES, currencyByCode, formatMoney, parseMoney,
  computeMoney, suggestReference, MAX_LINES, type DocKind, type ReceiptlyDoc,
} from "@/lib/receiptly/model";
import { buildReceiptlyPdf, receiptlyFilename } from "@/lib/receiptly/pdf";
import { blankDoc, loadDraft, saveDraft, pushHistory, loadHistory, type HistoryEntry } from "@/lib/receiptly/draft";
import DocumentPreview from "./DocumentPreview";
import { PAGE } from "@/lib/receiptly/theme";

// ── RECEIPTLY ───────────────────────────────────────────────────────────────
//
// Form on the left, the actual page on the right, updating as you type. The
// preview is not a mock-up of the PDF — it reads the same constants, so a line
// that will be cut off in the download is cut off on screen too.
//
// Everything lives in the browser until you press Download. Drafts autosave to
// localStorage, and the last ten finished documents are one click away.

const ACCENTS = ["#0a7d3b", "#0f172a", "#1d4ed8", "#b45309", "#be123c", "#7c3aed", "#0891b2"];

/** Today, as the date input wants it. */
function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ReceiptlyStudio() {
  const today = useMemo(isoToday, []);
  const [doc, setDoc] = useState<ReceiptlyDoc>(() => blankDoc(today));
  const [hydrated, setHydrated] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [saved, setSaved] = useState(false);
  const [previewScale, setPreviewScale] = useState(0.62);
  const previewWrap = useRef<HTMLDivElement>(null);

  const c = currencyByCode(doc.currencyCode);
  const m = computeMoney(doc);

  // ── Hydrate from the last draft, once ──────────────────────────────────
  useEffect(() => {
    const d = loadDraft(today);
    if (d) setDoc(d);
    setHistory(loadHistory(today));
    setHydrated(true);
  }, [today]);

  // ── Autosave, debounced ────────────────────────────────────────────────
  useEffect(() => {
    if (!hydrated) return;
    const t = setTimeout(() => {
      saveDraft(doc);
      setSaved(true);
      const hide = setTimeout(() => setSaved(false), 1400);
      return () => clearTimeout(hide);
    }, 600);
    return () => clearTimeout(t);
  }, [doc, hydrated]);

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
    pushHistory({
      at: new Date().toISOString(),
      label: `${doc.reference || DOC_KIND_LABEL[doc.kind]} · ${doc.customerName || "—"}`,
      doc,
    });
    setHistory(loadHistory(today));
  }, [doc, today]);

  const markPaid = useCallback(() => {
    setDoc((d) => {
      const money = computeMoney(d);
      return { ...d, receivedMinor: money.totalMinor, kind: "receipt" as DocKind };
    });
  }, []);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (e.key.toLowerCase() === "s") { e.preventDefault(); download(); }
      if (e.key.toLowerCase() === "d") { e.preventDefault(); markPaid(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [download, markPaid]);

  function onLogo(file: File | null) {
    if (!file) return set("business", { ...doc.business, logo: null });
    // Read in the browser and keep it as a data: URL — the document then
    // carries its own logo and needs nothing from the network to render.
    const reader = new FileReader();
    reader.onload = () => set("business", { ...doc.business, logo: String(reader.result) });
    reader.readAsDataURL(file);
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

          <div className="ml-auto flex items-center gap-2">
            <AnimatePresence>
              {saved && (
                <motion.span
                  initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="hidden items-center gap-1 text-xs text-slate-400 sm:flex"
                >
                  <Check size={12} /> Saved
                </motion.span>
              )}
            </AnimatePresence>
            <button
              type="button" onClick={() => setShowHistory((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-medium transition hover:bg-slate-100 dark:border-white/10 dark:hover:bg-white/5"
            >
              <History size={14} /> <span className="hidden sm:inline">Recent</span>
            </button>
            <button
              type="button" onClick={markPaid} title="Mark as paid (Ctrl+D)"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-medium transition hover:bg-slate-100 dark:border-white/10 dark:hover:bg-white/5"
            >
              <Check size={14} /> <span className="hidden sm:inline">Mark paid</span>
            </button>
            <button
              type="button" onClick={download} title="Download PDF (Ctrl+S)"
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
            >
              <Download size={14} /> Download PDF
            </button>
          </div>
        </div>

        <AnimatePresence>
          {showHistory && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-t border-slate-200/80 bg-white dark:border-white/10 dark:bg-[#0b0f14]"
            >
              <div className="mx-auto max-w-[1500px] px-4 py-3 md:px-6">
                {history.length === 0 ? (
                  <p className="py-4 text-center text-xs text-slate-400">
                    Nothing yet. Documents you download appear here.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {history.map((h, i) => (
                      <button
                        key={i} type="button"
                        onClick={() => { setDoc(h.doc); setShowHistory(false); }}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs transition hover:border-slate-400 dark:border-white/10"
                      >
                        {h.label}
                      </button>
                    ))}
                  </div>
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
            <div className="mt-3">
              <span className={labelCls}>Brand colour</span>
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
                  onClick={() => set("lines", [...doc.lines, { description: "", qty: 1, unitMinor: 0 }])}
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
                  <input aria-label={`Line ${i + 1} quantity`} className={`${inputCls} col-span-3 !mt-0 sm:col-span-2`}
                    inputMode="numeric" placeholder="Qty" value={l.qty || ""}
                    onChange={(e) => set("lines", doc.lines.map((x, j) => j === i
                      ? { ...x, qty: Math.max(0, Number(e.target.value.replace(/[^\d.]/g, "")) || 0) } : x))} />
                  <input aria-label={`Line ${i + 1} unit price`} className={`${inputCls} col-span-6 !mt-0 sm:col-span-3`}
                    inputMode="decimal" placeholder={`Unit (${c.symbol})`}
                    defaultValue={l.unitMinor ? String(l.unitMinor / 10 ** c.exponent) : ""}
                    onChange={(e) => {
                      const v = parseMoney(e.target.value, c);
                      set("lines", doc.lines.map((x, j) => j === i ? { ...x, unitMinor: v ?? 0 } : x));
                    }} />
                  <button type="button" aria-label={`Remove line ${i + 1}`}
                    onClick={() => doc.lines.length > 1 && set("lines", doc.lines.filter((_, j) => j !== i))}
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
                <input id="r-recv" className={inputCls} inputMode="decimal" placeholder="0"
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
