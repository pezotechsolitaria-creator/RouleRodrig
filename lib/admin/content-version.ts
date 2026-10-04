// ── Which copy of the site was this edited from? ────────────────────────────
//
// architecture review 2026-09-30, item 4. The content studio PUTs the WHOLE
// site_content blob, and four routes write that row: the studio, the gallery,
// /admin/legal and the legal certificate. With no version on the request, a
// studio tab opened before a BRN was saved in /admin/legal put the old legal
// block back on its next Save — and said "Saved!".
//
// So the studio sends back the row's updated_at as it loaded it, the route
// refuses with 409 when the row has moved, and the studio says so in words
// instead of the bare "Error" it used to flash for three seconds while throwing
// the server's reason away.
//
// Client-safe on purpose (no server-only import): the studio and the route
// must agree on the header name and on the sentence the owner reads.

/** Request/response header carrying the site_content version (its updated_at). */
export const CONTENT_BASE_HEADER = "x-content-base";

/** Sent when the editor was loaded before any content row existed (first run). */
export const NO_ROW_VERSION = "none";

/** What the owner reads when another tab or screen saved first. */
export const CONTENT_CONFLICT_MESSAGE = "Someone saved in another tab — reload before saving.";

export type SaveOutcome =
  | { kind: "saved"; version: string | null }
  | { kind: "expired" }
  | { kind: "conflict"; message: string }
  | { kind: "refused"; message: string };

/**
 * Turn the content PUT's answer into what the studio does next.
 *
 * Pure, so the four ways a save can end are pinned by a test rather than by
 * somebody remembering to read the body: the old handler did
 * `if (!res.ok) throw new Error()`, which is how the guard's own "FAQ questions
 * would drop from 12 to 0" never reached the person it was written for.
 */
export function interpretSaveResponse(status: number, body: unknown): SaveOutcome {
  const b = (body && typeof body === "object" ? body : {}) as {
    error?: unknown;
    updatedAt?: unknown;
  };
  const reason = typeof b.error === "string" && b.error.trim() ? b.error.trim() : null;

  if (status >= 200 && status < 300) {
    return { kind: "saved", version: typeof b.updatedAt === "string" ? b.updatedAt : null };
  }
  if (status === 401) return { kind: "expired" };
  if (status === 409) return { kind: "conflict", message: reason ?? CONTENT_CONFLICT_MESSAGE };
  return {
    kind: "refused",
    message: reason ?? `The save failed (error ${status}) and the server gave no reason. Nothing was changed.`,
  };
}

/** The sentence for a request that never got an answer. */
export const OFFLINE_SAVE_MESSAGE = "Could not reach the server — you appear to be offline. Nothing was saved.";
