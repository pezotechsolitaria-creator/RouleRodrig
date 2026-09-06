"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UploadCloud, X, Loader2, AlertTriangle, FileText, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

// 4 MB keeps us under Vercel's ~4.5MB serverless body limit with headroom for
// multipart overhead — the same ceiling the API route enforces. Checked here
// too so the customer gets an instant answer instead of a failed round trip;
// the server remains the actual gate.
const MAX_BYTES = 4 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";
const ACCEPT_LABEL = "JPG, PNG, WebP or PDF, up to 4 MB";

type Phase = "idle" | "uploading" | "error";

export default function ReceiptUploader({ orderId, required }: { orderId: string; required: boolean }) {
  const { t } = useLanguage();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Held in a ref so the unmount cleanup can revoke the CURRENT url without
  // re-running (and thus revoking a live preview) whenever it changes.
  const previewRef = useRef<string | null>(null);

  useEffect(() => {
    previewRef.current = previewUrl;
  }, [previewUrl]);
  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
  }, []);

  const accept = useCallback((f: File) => {
    setError(null);
    if (f.size > MAX_BYTES) {
      setError(`That file is ${(f.size / 1024 / 1024).toFixed(1)} MB — the limit is 4 MB.`);
      return;
    }
    if (!ACCEPT.split(",").includes(f.type)) {
      setError(`We can't read that file type. Use ${ACCEPT_LABEL}.`);
      return;
    }
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    setFile(f);
    setPreviewUrl(f.type === "application/pdf" ? null : URL.createObjectURL(f));
    setPhase("idle");
  }, []);

  function clear() {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    setFile(null);
    setPreviewUrl(null);
    setError(null);
    setPhase("idle");
    if (inputRef.current) inputRef.current.value = "";
  }

  // XHR rather than fetch: it's the only way to get real upload progress, and a
  // receipt on a slow island connection can take long enough that a silent
  // spinner feels broken.
  function submit() {
    if (!file && required) return;
    setPhase("uploading");
    setProgress(0);
    setError(null);

    const fd = new FormData();
    if (file) fd.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/orders/${orderId}/receipt`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let body: { error?: string } = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* non-JSON error page */ }
      if (xhr.status >= 200 && xhr.status < 300) {
        toast.success("Thanks — they will confirm your payment shortly.");
        router.refresh();
      } else {
        setPhase("error");
        setError(body.error || "We couldn't submit your receipt. Please try again.");
      }
    };
    xhr.onerror = () => {
      setPhase("error");
      setError("Network problem — check your connection and try again.");
    };
    xhr.send(fd);
  }

  const busy = phase === "uploading";

  return (
    <div>
      {!file ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) accept(f);
          }}
          className={`rounded-xl border border-dashed p-6 text-center transition-colors ${
            dragging ? "border-yellow bg-yellow/[0.06]" : "border-white/20 bg-white/[0.02]"
          }`}
        >
          <UploadCloud className="mx-auto text-muted" size={26} />
          <p className="mt-2 font-dm text-sm text-offwhite">{t.receipt.addReceipt}</p>
          <p className="mt-0.5 font-dm text-xs text-muted">Drag it here, or choose a file. {ACCEPT_LABEL}.</p>

          {/* `capture` opens the camera directly on mobile, which is how most
              customers will photograph a bank slip. */}
          <input
            ref={inputRef}
            id="receipt-file"
            type="file"
            accept={ACCEPT}
            capture="environment"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) accept(f);
            }}
          />
          <Button type="button" variant="outline" className="mt-3" onClick={() => inputRef.current?.click()}>
            {t.receipt.chooseFile}
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-white/15 bg-dark p-3">
          <div className="flex items-start gap-3">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt={t.receipt.preview} className="h-20 w-20 shrink-0 rounded-lg object-cover" />
            ) : (
              <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-white/5 text-muted">
                <FileText size={22} />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-dm text-sm text-offwhite">{file.name}</p>
              <p className="font-dm text-xs text-muted">{(file.size / 1024).toFixed(0)} KB</p>
              {!busy && (
                <button
                  type="button"
                  onClick={clear}
                  className="mt-1 inline-flex items-center gap-1 font-dm text-xs text-muted underline hover:text-yellow"
                >
                  <X size={11} /> {t.receipt.removeReplace}
                </button>
              )}
            </div>
          </div>

          {busy && (
            <div className="mt-3">
              <div
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={t.receipt.uploading}
                className="h-1.5 w-full overflow-hidden rounded-full bg-white/10"
              >
                <div className="h-full bg-yellow transition-[width]" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-1 font-dm text-xs text-muted" aria-live="polite">
                {progress < 100 ? `Uploading… ${progress}%` : "Finishing up…"}
              </p>
            </div>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 flex items-start gap-1.5 font-dm text-xs text-red-400">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {error}
        </p>
      )}

      <Button
        type="button"
        className="mt-3 w-full"
        onClick={submit}
        disabled={busy || (required && !file)}
      >
        {busy ? (
          <><Loader2 size={16} className="mr-1.5 animate-spin" /> Sending…</>
        ) : phase === "error" ? (
          "Try again"
        ) : (
          <><Check size={15} className="mr-1.5" /> I have completed the transfer</>
        )}
      </Button>
      {required && !file && (
        <p className="mt-1.5 text-center font-dm text-xs text-muted">
          {t.receipt.askProof}
        </p>
      )}
    </div>
  );
}
