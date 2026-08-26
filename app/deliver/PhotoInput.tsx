"use client";

import { useRef, useState } from "react";
import { Camera, ImageIcon, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { type as t } from "@/lib/delivery/tokens";

// ── Showing the thing, instead of writing about it ──────────────────────────
//
// The 2022 census (Vol. VI Table E2a) records that 44% of Rodriguans aged 60+
// cannot read or write — 64% at 75+, 68% of women over 75. For close to half
// the people this surface was rebuilt for, no font size and no plain English
// reaches them. "What are we collecting?" is a writing task; holding up a phone
// is not.
//
// So this is a first-class input beside the description, not an attachment.
//
// ── TWO buttons, not one ───────────────────────────────────────────────────
// A single <input type="file" accept="image/*"> makes the OS ask "Camera or
// Photos?" in a sheet, which is one more unlabelled decision at exactly the
// wrong moment. Two inputs — one with capture="environment", one without —
// send the person straight where they meant to go, and each says which in
// words rather than relying on an icon.

export type PhotoCopy = {
  help: string;
  take: string;
  choose: string;
  takeAria: string;
  chooseAria: string;
  added: string;
  remove: string;
  failed: string;
  failedNetwork: string;
};

export default function PhotoInput({
  path,
  onChange,
  copy,
}: {
  path: string | null;
  onChange: (path: string | null) => void;
  /** From lib/delivery/copy.i18n.ts. This control matters most to the people
   *  least likely to be reading English, so it is translated like the rest. */
  copy: PhotoCopy;
}) {
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A local preview, so the photo appears instantly rather than after a round
  // trip on island data — and so nothing has to be signed just to confirm it
  // worked.
  const [preview, setPreview] = useState<string | null>(null);

  async function upload(file: File | undefined) {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/delivery-requests/photo", { method: "POST", body: fd });
      const json = (await res.json()) as { path?: string; error?: string };
      if (!res.ok || !json.path) {
        setError(json.error ?? copy.failed);
        return;
      }
      setPreview(URL.createObjectURL(file));
      onChange(json.path);
    } catch {
      setError(copy.failedNetwork);
    } finally {
      setBusy(false);
    }
  }

  if (path) {
    return (
      <div className="mt-4 flex items-center gap-3 rounded-2xl border border-yellow/40 bg-dark-card p-3">
        {preview ? (
          // A blob: URL from the file the person just chose. next/image cannot
          // optimise a local object URL, and this never leaves the device.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt={copy.added}
            className="h-20 w-20 shrink-0 rounded-xl object-cover"
          />
        ) : (
          <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-[#B0B0B0]">
            <ImageIcon size={22} aria-hidden />
          </span>
        )}
        <p className={cn(t.bodySm, "min-w-0 flex-1 text-offwhite")}>{copy.added}</p>
        <button
          type="button"
          onClick={() => {
            setPreview(null);
            onChange(null);
          }}
          // A real word beside the glyph: an icon-only control is a guess.
          className="flex min-h-14 shrink-0 items-center gap-1.5 rounded-full border border-[#6E6E6E] px-4 font-dm text-[16px] text-offwhite"
        >
          <X size={16} aria-hidden /> {copy.remove}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <p className={cn(t.meta, "mb-2 text-[#B0B0B0]")}>{copy.help}</p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => cameraRef.current?.click()}
          className="flex min-h-14 flex-1 items-center justify-center gap-2 rounded-xl border border-[#6E6E6E] px-3 font-dm text-[16px] text-offwhite disabled:opacity-50"
        >
          {busy ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} aria-hidden />}
          {copy.take}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => galleryRef.current?.click()}
          className="flex min-h-14 flex-1 items-center justify-center gap-2 rounded-xl border border-[#6E6E6E] px-3 font-dm text-[16px] text-offwhite disabled:opacity-50"
        >
          <ImageIcon size={18} aria-hidden />
          {copy.choose}
        </button>
      </div>

      {/* Two inputs so neither one has to ask which the person meant. */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        aria-label={copy.takeAria}
        onChange={(e) => void upload(e.target.files?.[0])}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label={copy.chooseAria}
        onChange={(e) => void upload(e.target.files?.[0])}
      />

      {error && (
        <p role="alert" className={cn(t.bodySm, "mt-2 text-red-400")}>
          {error}
        </p>
      )}
    </div>
  );
}
