"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, Plus, Download, X, Trash2, Check } from "lucide-react";
import { toCents } from "@/lib/money";
import { downloadBlob } from "@/lib/download";
import {
  bookingDocMoney, bookingDocStatus, bookingDocHeading, MAX_LINES,
} from "@/lib/booking-docs/model";
import {
  buildBookingDocPdf, bookingDocFilename, money, type BookingDocData,
} from "@/lib/booking-docs/pdf";
import type { BookingDoc, BookingDocPrefill, BookingDocLineRow } from "@/lib/booking-docs/types";

// ── THE DOCUMENT HE USED TO TYPE ────────────────────────────────────────────
//
// Everything on the form is typed because nothing in the database holds it: no
// column anywhere carries a meeting point, and place_bookings prices flat per
// reservation, so "2 x Rs 1,800" has no source. A reservation can PREFILL the
// guest, the experience and the dates; the rest is his.
//
// He types RUPEES, because that is what a price is written in. The API takes
// CENTS. That conversion is shown back on the screen before anything is saved
// — this platform has shipped a rupee/cent confusion four times and not one
// was caught by reading code.

type FormLine = { description: string; qty: string; unitRupees: string };

const BLANK_LINE: FormLine = { description: "", qty: "1", unitRupees: "" };

/** A typed rupee field becomes cents once, here. null means "not a number yet". */
function lineCents(l: FormLine): number | null {
  return toCents(l.unitRupees.trim());
}

function lineQty(l: FormLine): number {
  const n = Number(l.qty.trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export default function BookingDocDesk() {
  const [docs, setDocs] = useState<BookingDoc[]>([]);
  const [prefills, setPrefills] = useState<BookingDocPrefill[]>([]);
  const [payInstruction, setPayInstruction] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  // The form
  const [editId, setEditId] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [experience, setExperience] = useState("");
  const [guests, setGuests] = useState("");
  const [meetingPoint, setMeetingPoint] = useState("");
  const [meetingTime, setMeetingTime] = useState("");
  const [dateLabel, setDateLabel] = useState("");
  const [lines, setLines] = useState<FormLine[]>([{ ...BLANK_LINE }]);
  const [depositPct, setDepositPct] = useState("50");
  const [receivedRupees, setReceivedRupees] = useState("0");
  const [placeBookingId, setPlaceBookingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/booking-docs", { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Could not load.");
      setDocs(body.documents ?? []);
      setPrefills(body.prefills ?? []);
      setPayInstruction(body.payInstruction ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function resetForm() {
    setEditId(null);
    setReference("");
    setGuestName("");
    setGuestEmail("");
    setGuestPhone("");
    setExperience("");
    setGuests("");
    setMeetingPoint("");
    setMeetingTime("");
    setDateLabel("");
    setLines([{ ...BLANK_LINE }]);
    setDepositPct("50");
    setReceivedRupees("0");
    setPlaceBookingId(null);
  }

  function applyPrefill(p: BookingDocPrefill) {
    // What the reservation knows. Everything else stays his to type — and the
    // price comes across only when the listing actually had one.
    setPlaceBookingId(p.placeBookingId);
    setReference(p.reference);
    setGuestName(p.guestName);
    setGuestEmail(p.guestEmail ?? "");
    setGuestPhone(p.guestPhone ?? "");
    setExperience(p.placeName);
    setGuests(p.guests ? String(p.guests) : "");
    setMeetingTime(p.timeSlot ?? "");
    setDateLabel(p.startDate.slice(0, 10));
    setLines([
      {
        description: p.placeName,
        qty: "1",
        unitRupees: p.totalCents > 0 ? String(Math.round(p.totalCents / 100)) : "",
      },
    ]);
  }

  // ── WHAT THE DOCUMENT WILL SAY, BEFORE IT IS SAVED ───────────────────────
  const parsed = useMemo(() => {
    const ok = lines.filter((l) => l.description.trim() && lineCents(l) !== null && lineQty(l) > 0);
    const modelLines = ok.map((l) => ({
      description: l.description.trim(),
      qty: lineQty(l),
      unitPriceCents: lineCents(l) as number,
    }));
    const pct = depositPct.trim() === "" ? null : Number(depositPct);
    const received = toCents(receivedRupees.trim()) ?? 0;
    const m = bookingDocMoney({
      lines: modelLines,
      depositPct: Number.isInteger(pct) && pct !== null && pct >= 0 && pct <= 100 ? pct : null,
      receivedCents: received,
    });
    return { modelLines, pct, received, m, complete: modelLines.length === lines.length };
  }, [lines, depositPct, receivedRupees]);

  const preview: BookingDocData = useMemo(() => ({
    ref: reference.trim() || "—",
    guestName: guestName.trim() || "—",
    details: [
      { label: "Experience", value: experience.trim() },
      { label: "Guests", value: guests.trim() ? `${guests.trim()} persons` : "" },
      { label: "Meeting point", value: meetingPoint.trim() },
      { label: "Meeting time", value: meetingTime.trim() },
      { label: "Date", value: dateLabel.trim() },
    ],
    lines: parsed.modelLines,
    depositPct: parsed.pct,
    receivedCents: parsed.received,
    payInstruction: payInstruction.trim() || null,
  }), [reference, guestName, experience, guests, meetingPoint, meetingTime, dateLabel,
       parsed, payInstruction]);

  const status = bookingDocStatus(parsed.m, parsed.pct != null && parsed.pct > 0);
  const ready =
    reference.trim().length > 0 && guestName.trim().length > 0 &&
    parsed.modelLines.length > 0 && parsed.complete;

  async function save(thenDownload: boolean) {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/booking-docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editId,
          reference: reference.trim(),
          guestName: guestName.trim(),
          guestEmail: guestEmail.trim() || undefined,
          guestPhone: guestPhone.trim() || undefined,
          details: preview.details.filter((d) => d.value.trim() !== ""),
          // Cents, never the typed string. The database adds them up again.
          lines: parsed.modelLines,
          depositPct: parsed.pct,
          receivedCents: parsed.received,
          placeBookingId,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Could not save.");
      const saved = body.document as BookingDoc;
      setSaid(`${saved.number} saved.`);
      if (thenDownload) downloadDoc(saved, parsed.modelLines);
      setEditing(false);
      resetForm();
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  function downloadDoc(
    doc: BookingDoc,
    docLines: { description: string; qty: number; unitPriceCents: number }[],
  ) {
    const pdf = buildBookingDocPdf({
      ref: doc.reference,
      number: doc.number,
      guestName: doc.guestName,
      details: doc.details,
      lines: docLines,
      depositPct: doc.depositPct,
      receivedCents: doc.receivedCents,
      payInstruction: doc.payInstruction,
      note: doc.note,
    });
    downloadBlob(
      new Blob([pdf.slice().buffer as ArrayBuffer], { type: "application/pdf" }),
      bookingDocFilename(doc.reference),
    );
  }

  /** A saved row has its lines in the database, so they are fetched to print. */
  async function downloadSaved(doc: BookingDoc) {
    try {
      const res = await fetch(`/api/admin/booking-docs/${doc.id}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Could not load it.");
      downloadDoc(
        body.document as BookingDoc,
        ((body.lines ?? []) as BookingDocLineRow[]).map((l) => ({
          description: l.description,
          qty: l.qty,
          unitPriceCents: l.unitPriceCents,
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load it.");
    }
  }

  async function editSaved(doc: BookingDoc) {
    try {
      const res = await fetch(`/api/admin/booking-docs/${doc.id}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Could not load it.");
      const d = body.document as BookingDoc;
      const ls = (body.lines ?? []) as BookingDocLineRow[];
      setEditId(d.id);
      setReference(d.reference);
      setGuestName(d.guestName);
      setGuestEmail(d.guestEmail ?? "");
      setGuestPhone(d.guestPhone ?? "");
      const find = (label: string) => d.details.find((x) => x.label === label)?.value ?? "";
      setExperience(find("Experience"));
      setGuests(find("Guests").replace(/\s*persons?$/i, ""));
      setMeetingPoint(find("Meeting point"));
      setMeetingTime(find("Meeting time"));
      setDateLabel(find("Date"));
      setLines(
        ls.length
          ? ls.map((l) => ({
              description: l.description,
              qty: String(l.qty),
              unitRupees: String(l.unitPriceCents / 100),
            }))
          : [{ ...BLANK_LINE }],
      );
      setDepositPct(d.depositPct == null ? "" : String(d.depositPct));
      setReceivedRupees(String(d.receivedCents / 100));
      setPlaceBookingId(d.placeBookingId);
      setEditing(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load it.");
    }
  }

  async function savePayInstruction(value: string) {
    try {
      await fetch("/api/admin/booking-docs/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payInstruction: value.trim() || null }),
      });
    } catch {
      // A payment line that failed to save is not worth interrupting the
      // document for; it is re-typed next time and the field still shows it.
    }
  }

  const field =
    "mt-1.5 min-h-12 w-full rounded-xl border border-white/12 bg-dark px-3 font-dm text-sm text-offwhite";
  const label = "block font-bebas text-[10px] tracking-[0.22em] text-muted";

  return (
    <main className="min-h-screen bg-dark px-4 py-8 text-offwhite md:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-syne text-2xl font-extrabold">Booking documents</h1>
            <p className="mt-1 font-dm text-sm text-muted">
              The confirmation you used to type out. Saved, numbered, and a receipt once it is paid.
            </p>
          </div>
          {!editing && (
            <button
              type="button"
              onClick={() => { resetForm(); setEditing(true); }}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-yellow px-4 font-syne text-sm font-bold text-dark"
            >
              <Plus size={15} /> New document
            </button>
          )}
        </div>

        {said && (
          <p className="mt-4 rounded-xl border border-green-500/30 bg-green-500/10 px-3 py-2.5 font-dm text-sm text-green-200">
            {said}
          </p>
        )}
        {error && (
          <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 font-dm text-sm text-red-300">
            {error}
          </p>
        )}

        {editing ? (
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
            {/* ── Start from a reservation, or from nothing ─────────────── */}
            {!editId && prefills.length > 0 && (
              <div className="mb-5">
                <span className={label}>Start from a reservation</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {prefills.slice(0, 8).map((p) => (
                    <button
                      key={p.placeBookingId}
                      type="button"
                      onClick={() => applyPrefill(p)}
                      className="rounded-full border border-white/12 px-3 py-1.5 font-dm text-xs hover:border-yellow"
                    >
                      {p.guestName} · {p.placeName}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={label} htmlFor="bd-ref">Booking ref — printed in the header</label>
                <input id="bd-ref" value={reference} onChange={(e) => setReference(e.target.value)}
                  placeholder="RR-COCOS-SB" className={field} />
              </div>
              <div>
                <label className={label} htmlFor="bd-guest">Guest</label>
                <input id="bd-guest" value={guestName} onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Sandrine Baltz" className={field} />
              </div>
              <div>
                <label className={label} htmlFor="bd-exp">Experience</label>
                <input id="bd-exp" value={experience} onChange={(e) => setExperience(e.target.value)}
                  placeholder="Îles aux Cocos – Les Inséparables" className={field} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label} htmlFor="bd-guests">Guests</label>
                  <input id="bd-guests" value={guests} onChange={(e) => setGuests(e.target.value)}
                    inputMode="numeric" placeholder="2" className={field} />
                </div>
                <div>
                  <label className={label} htmlFor="bd-time">Meeting time</label>
                  <input id="bd-time" value={meetingTime} onChange={(e) => setMeetingTime(e.target.value)}
                    placeholder="09:00" className={field} />
                </div>
              </div>
              <div>
                <label className={label} htmlFor="bd-point">Meeting point</label>
                <input id="bd-point" value={meetingPoint} onChange={(e) => setMeetingPoint(e.target.value)}
                  placeholder="Pointe Diable" className={field} />
              </div>
              <div>
                <label className={label} htmlFor="bd-date">Date</label>
                <input id="bd-date" value={dateLabel} onChange={(e) => setDateLabel(e.target.value)}
                  placeholder="23 September 2026" className={field} />
              </div>
            </div>

            {/* ── The priced lines ──────────────────────────────────────── */}
            <div className="mt-5">
              <span className={label}>What is being charged for</span>
              {lines.map((l, i) => (
                <div key={i} className="mt-2 grid grid-cols-12 gap-2">
                  <input
                    aria-label={`Line ${i + 1} description`}
                    value={l.description}
                    onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, description: e.target.value } : x))}
                    placeholder="Îles aux Cocos – Les Inséparables"
                    className={`${field} col-span-12 md:col-span-6`}
                  />
                  <input
                    aria-label={`Line ${i + 1} quantity`}
                    value={l.qty} inputMode="numeric"
                    onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))}
                    placeholder="2"
                    className={`${field} col-span-3 md:col-span-2`}
                  />
                  <input
                    aria-label={`Line ${i + 1} unit price in rupees`}
                    value={l.unitRupees} inputMode="decimal"
                    onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, unitRupees: e.target.value } : x))}
                    placeholder="1800"
                    className={`${field} col-span-6 md:col-span-3 font-mono`}
                  />
                  <button
                    type="button"
                    aria-label={`Remove line ${i + 1}`}
                    onClick={() => setLines(lines.length > 1 ? lines.filter((_, j) => j !== i) : lines)}
                    className="col-span-3 md:col-span-1 flex min-h-12 items-center justify-center rounded-xl border border-white/12 text-muted"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {lines.length < MAX_LINES && (
                <button
                  type="button"
                  onClick={() => setLines([...lines, { ...BLANK_LINE }])}
                  className="mt-2 rounded-xl border border-white/12 px-3 py-2 font-dm text-xs text-muted"
                >
                  + add another line
                </button>
              )}
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div>
                <label className={label} htmlFor="bd-dep">Deposit %, empty for none</label>
                <input id="bd-dep" value={depositPct} onChange={(e) => setDepositPct(e.target.value)}
                  inputMode="numeric" placeholder="50" className={`${field} font-mono`} />
              </div>
              <div>
                <label className={label} htmlFor="bd-recv">Amount received, in rupees</label>
                <input id="bd-recv" value={receivedRupees} onChange={(e) => setReceivedRupees(e.target.value)}
                  inputMode="decimal" placeholder="0" className={`${field} font-mono`} />
              </div>
              <div>
                <label className={label} htmlFor="bd-pay">How to pay — kept for every document</label>
                <input id="bd-pay" value={payInstruction}
                  onChange={(e) => setPayInstruction(e.target.value)}
                  onBlur={(e) => void savePayInstruction(e.target.value)}
                  placeholder="MCB Juice: 58363401" className={field} />
              </div>
            </div>

            {/* ── WHAT THE PAGE WILL SAY, BEFORE IT IS SAVED ──────────────
                The rupees typed above become cents here, once, and the figures
                are the same ones the PDF will print. */}
            <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 font-dm text-sm">
              <p className="font-bebas text-[10px] tracking-[0.22em] text-muted">
                {bookingDocHeading(parsed.m)}
              </p>
              <dl className="mt-2 space-y-1.5">
                <div className="flex justify-between">
                  <dt className="text-muted">Total</dt>
                  <dd className="tabular-nums font-semibold">{money(parsed.m.totalCents)}</dd>
                </div>
                {parsed.pct != null && parsed.pct > 0 && (
                  <>
                    <div className="flex justify-between">
                      <dt className="text-muted">Deposit required ({parsed.pct}%)</dt>
                      <dd className="tabular-nums">{money(parsed.m.depositCents)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted">Balance after deposit</dt>
                      <dd className="tabular-nums">{money(parsed.m.balanceAfterDepositCents)}</dd>
                    </div>
                  </>
                )}
                <div className="flex justify-between border-t border-white/10 pt-1.5">
                  <dt className="text-muted">Amount received</dt>
                  <dd className="tabular-nums font-semibold">{money(parsed.m.receivedCents)}</dd>
                </div>
              </dl>
              <p className={`mt-2 font-dm text-xs ${
                status.tone === "paid" ? "text-green-300"
                : status.tone === "part" ? "text-amber-200" : "text-red-300"}`}>
                {status.label}
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => { setEditing(false); resetForm(); }}
                className="min-h-12 flex-1 rounded-xl border border-white/12 font-dm text-sm">
                Cancel
              </button>
              <button type="button" onClick={() => void save(false)} disabled={!ready || busy}
                className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-white/12 font-dm text-sm disabled:opacity-50">
                <Check size={15} /> {busy ? "Saving…" : "Save"}
              </button>
              <button type="button" onClick={() => void save(true)} disabled={!ready || busy}
                className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-yellow font-syne text-sm font-bold text-dark disabled:opacity-50">
                <Download size={15} /> Save &amp; download
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5">
            {loading && <p className="py-10 text-center font-dm text-sm text-muted">Loading…</p>}
            {!loading && docs.length === 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] py-12 text-center">
                <FileText size={22} className="mx-auto text-muted" />
                <p className="mt-2 font-dm text-sm text-muted">
                  Nothing yet. The first one replaces the version you type by hand.
                </p>
              </div>
            )}
            <ul className="space-y-2">
              {docs.map((d) => {
                const m = bookingDocMoney({
                  lines: [],
                  depositPct: d.depositPct,
                  receivedCents: d.receivedCents,
                });
                // The list has no lines, so the stored totals are used directly.
                const shown = { ...m, totalCents: d.totalCents, depositCents: d.depositCents };
                const s = bookingDocStatus(shown, d.depositPct != null && d.depositPct > 0);
                return (
                  <li key={d.id}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-sm text-offwhite">{d.reference}</span>
                      <span className="block truncate font-dm text-xs text-muted">
                        {d.guestName} · {d.number}
                      </span>
                      <span className={`mt-0.5 block font-dm text-[11px] ${
                        s.tone === "paid" ? "text-green-300"
                        : s.tone === "part" ? "text-amber-200" : "text-red-300"}`}>
                        {s.label}
                      </span>
                    </span>
                    <span className="shrink-0 font-dm text-sm tabular-nums">{money(d.totalCents)}</span>
                    <button type="button" onClick={() => void editSaved(d)}
                      className="min-h-11 shrink-0 rounded-xl border border-white/12 px-3 font-dm text-xs">
                      Edit
                    </button>
                    <button type="button" onClick={() => void downloadSaved(d)}
                      className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-yellow px-3 font-syne text-xs font-bold text-dark">
                      <Download size={13} /> PDF
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}
