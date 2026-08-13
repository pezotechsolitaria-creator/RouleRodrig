"use client";

import { useRef, useState } from "react";
import { UploadCloud, Loader2, AlertTriangle, FileText, Check, X } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

// ── Proof of a bank transfer, for a rental or an activity (M83) ─────────────
//
// Shops and food have had this since M49; the two oldest services on the site
// were still telling the customer to send the slip on WhatsApp, which put the
// evidence in a chat thread instead of on the booking.
//
// Mirrors the order uploader's behaviour deliberately — same 4 MB ceiling, same
// four types, same camera-first input, same real progress bar — because a
// customer photographing a bank slip on island mobile data should not meet two
// different uploaders on one site.

const MAX_BYTES = 4 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

/** The reference the customer sees on their confirmation: first 6 hex of the id. */
export function bookingRef(id: string): string {
  return "RR-" + id.replace(/-/g, "").slice(0, 6).toUpperCase();
}

export default function BookingReceiptUpload({ bookingId, email }: { bookingId: string; email: string }) {
  const { language } = useLanguage();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const T = {
    en: {
      title: "Send your transfer receipt",
      hint: "A photo or PDF of the transfer, up to 4 MB.",
      choose: "Choose file or take a photo",
      submit: "I have completed the transfer",
      sending: "Sending…",
      sent: "Received — we'll confirm your booking shortly.",
      retry: "Try again",
      remove: "Remove / replace",
      tooBig: "That file is too large — the limit is 4 MB.",
      badType: "Use a JPG, PNG, WebP or PDF.",
      failed: "We couldn't send that. Please try again.",
      network: "Network problem — check your connection and try again.",
    },
    fr: {
      title: "Envoyez votre reçu de virement",
      hint: "Une photo ou un PDF du virement, jusqu'à 4 Mo.",
      choose: "Choisir un fichier ou prendre une photo",
      submit: "J'ai effectué le virement",
      sending: "Envoi…",
      sent: "Bien reçu — nous confirmons votre réservation très vite.",
      retry: "Réessayer",
      remove: "Retirer / remplacer",
      tooBig: "Ce fichier est trop lourd — la limite est de 4 Mo.",
      badType: "Utilisez un JPG, PNG, WebP ou PDF.",
      failed: "L'envoi n'a pas abouti. Réessayez.",
      network: "Problème de réseau — vérifiez votre connexion et réessayez.",
    },
    cr: {
      title: "Avoy to resi vireman",
      hint: "Enn foto ouswa PDF vireman-la, ziska 4 Mo.",
      choose: "Swazir enn fisye ouswa pran enn foto",
      submit: "Mo finn fer vireman-la",
      sending: "Pe avoye…",
      sent: "Nou finn gagne li — nou konfirmen to rezervasion biento.",
      retry: "Reisi ankor",
      remove: "Tire / ranplas",
      tooBig: "Fisye-la tro gro — limit se 4 Mo.",
      badType: "Servi enn JPG, PNG, WebP ouswa PDF.",
      failed: "Pa finn kapav avoye. Reisi ankor.",
      network: "Problem rezo — get to koneksion ek reisi ankor.",
    },
  }[language] ?? {
    title: "Send your transfer receipt", hint: "A photo or PDF of the transfer, up to 4 MB.",
    choose: "Choose file or take a photo", submit: "I have completed the transfer", sending: "Sending…",
    sent: "Received — we'll confirm your booking shortly.", retry: "Try again", remove: "Remove / replace",
    tooBig: "That file is too large — the limit is 4 MB.", badType: "Use a JPG, PNG, WebP or PDF.",
    failed: "We couldn't send that. Please try again.", network: "Network problem — check your connection and try again.",
  };

  function accept(f: File) {
    setError(null);
    if (f.size > MAX_BYTES) { setError(T.tooBig); return; }
    if (!ACCEPT.split(",").includes(f.type)) { setError(T.badType); return; }
    setFile(f);
  }

  // XHR rather than fetch: it is the only way to show real upload progress, and
  // a bank slip over island mobile data takes long enough that a bare spinner
  // reads as broken.
  function submit() {
    if (!file) return;
    setBusy(true);
    setProgress(0);
    setError(null);

    const fd = new FormData();
    fd.append("ref", bookingRef(bookingId));
    fd.append("email", email);
    fd.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/bookings/report-payment");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      setBusy(false);
      let body: { error?: string } = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* non-JSON error page */ }
      if (xhr.status >= 200 && xhr.status < 300) setDone(true);
      else setError(body.error || T.failed);
    };
    xhr.onerror = () => { setBusy(false); setError(T.network); };
    xhr.send(fd);
  }

  if (done) {
    return (
      <p className="mt-3 flex items-start gap-2 rounded-xl border border-green-500/30 bg-green-500/[0.07] p-3 font-dm text-xs text-green-300">
        <Check size={14} className="mt-0.5 shrink-0" /> {T.sent}
      </p>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-dark-border bg-dark/40 p-3">
      <p className="font-dm text-xs text-offwhite">{T.title}</p>
      <p className="mt-0.5 font-dm text-[11px] text-muted/70">{T.hint}</p>

      {/* `capture` opens the camera straight away on a phone, which is how most
          customers will photograph a bank slip. */}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        capture="environment"
        className="sr-only"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) accept(f); }}
      />

      {!file ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/20 bg-white/[0.02] px-3 py-3 font-dm text-xs text-muted transition-colors hover:border-yellow/40 hover:text-offwhite"
        >
          <UploadCloud size={15} /> {T.choose}
        </button>
      ) : (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-white/15 bg-dark p-2">
          <FileText size={16} className="shrink-0 text-muted" />
          <span className="min-w-0 flex-1 truncate font-dm text-xs text-offwhite">{file.name}</span>
          {!busy && (
            <button
              type="button"
              onClick={() => { setFile(null); if (inputRef.current) inputRef.current.value = ""; }}
              aria-label={T.remove}
              className="shrink-0 text-muted/50 transition-colors hover:text-red-400"
            >
              <X size={13} />
            </button>
          )}
        </div>
      )}

      {busy && (
        <div className="mt-2">
          <div
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={T.sending}
            className="h-1.5 w-full overflow-hidden rounded-full bg-white/10"
          >
            <div className="h-full bg-yellow transition-[width]" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 flex items-start gap-1.5 font-dm text-[11px] text-red-400">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {error}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={busy || !file}
        className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-yellow py-2.5 font-syne text-xs font-bold text-dark transition-colors hover:bg-yellow-dark disabled:opacity-50"
      >
        {busy ? (
          <><Loader2 size={14} className="animate-spin" /> {T.sending}</>
        ) : error ? (
          T.retry
        ) : (
          <><Check size={14} /> {T.submit}</>
        )}
      </button>
    </div>
  );
}
