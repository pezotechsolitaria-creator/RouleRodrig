// ── Making a browser actually save a file ────────────────────────────────────
//
// Every hand-rolled download in this app repeated the same two mistakes, and
// both fail silently — the button simply appears to do nothing:
//
//   1. URL.revokeObjectURL() called on the line after click(). This is the real
//      one. The browser reads the blob asynchronously, so revoking in the same
//      tick races it: fine on a fast desktop, lost on a slow phone. That is the
//      worst possible failure profile for a site whose traffic is mostly mobile.
//
//   2. The <a> was never added to the document. Measured in Chromium here, a
//      detached anchor's click() DOES dispatch, so this is not the culprit on
//      Chrome — but it has historically been unreliable in Firefox, and putting
//      the element in the document costs nothing. Treat it as defensive, not as
//      the diagnosis.
//
// Note for anyone testing this: the site's CSP sets `connect-src 'self' https:`
// with no `blob:`, so fetch()-ing a blob: URL from a page always throws. That is
// CSP, not a revoked blob — do not use fetch to "prove" this code works.
// Anchor downloads are not governed by connect-src and are unaffected.
//
// This is the one place that knows how to do it properly, so those mistakes
// cannot be reintroduced in a component.

/** Milliseconds to keep a blob URL alive after the click. */
const REVOKE_DELAY_MS = 60_000;

function supportsDownloadAttribute(): boolean {
  if (typeof document === "undefined") return false;
  return "download" in document.createElement("a");
}

/**
 * Saves `blob` to the user's device as `filename`.
 *
 * Returns true if a download was triggered, false if the browser could not and
 * the caller should fall back (e.g. to opening the content in a tab). Callers
 * that ignore the return value still get correct behaviour on every browser
 * that supports the `download` attribute, which is all of them since iOS 13.
 */
export function downloadBlob(blob: Blob, filename: string): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;

  const url = URL.createObjectURL(blob);

  if (!supportsDownloadAttribute()) {
    // No `download` support. Opening the blob is the honest fallback: the user
    // sees the file and can save it with the browser's own UI. Revoking here
    // would break the tab that just opened, so it is left to the timer.
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
    return false;
  }

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  // Off-screen rather than display:none — a few engines skip clicks on elements
  // with no layout box.
  a.style.position = "fixed";
  a.style.left = "-9999px";

  // In the DOM before the click, out of it after. This is the part Firefox needs.
  document.body.appendChild(a);
  a.click();
  a.remove();

  // Long delay, not zero. The browser reads the blob asynchronously and a slow
  // device can still be reading it well after this function returns.
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
  return true;
}

/** Convenience for text payloads (CSV, JSON, ICS…). */
export function downloadText(
  text: string,
  filename: string,
  mime = "text/plain;charset=utf-8",
): boolean {
  return downloadBlob(new Blob([text], { type: mime }), filename);
}

/**
 * CSV needs a UTF-8 BOM or Excel on Windows mis-reads accented names — "Perrine
 * Éloïse" arrives as "Ã‰loÃ¯se". Rodrigues customer names are routinely
 * accented, so this matters here more than it would elsewhere.
 */
export function downloadCsv(csv: string, filename: string): boolean {
  return downloadBlob(
    new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }),
    filename,
  );
}

/** Quotes a value for CSV: doubles embedded quotes and always wraps. */
export function csvCell(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

/** Builds a CSV document from a header row plus data rows. */
export function toCsv(rows: readonly (readonly unknown[])[]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}
