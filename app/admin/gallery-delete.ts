// ── Deleting a gallery photo from inside the content studio ─────────────────
//
// architecture review 2026-09-30, content-studio save safety (item 4). The
// studio sends the version it loaded with every save and the server refuses a
// save made from an older one. The gallery delete writes the same row, but it
// used to go out with no version and come back with none, so after one photo
// was deleted the studio's base version was stale on its OWN write: every
// later Save and upload in that tab was refused as "Someone saved in another
// tab", and the only way out, a reload, lost every unsaved edit.
//
// So the delete is versioned like a save, and the studio adopts the version it
// hands back. Kept out of AdminDashboard.tsx so a test can run it against the
// real route handler. Client-safe: no server-only import.

import {
  CONTENT_BASE_HEADER,
  NO_ROW_VERSION,
  OFFLINE_SAVE_MESSAGE,
  interpretSaveResponse,
  type SaveOutcome,
} from "@/lib/admin/content-version";

export type GalleryDeleteOutcome =
  | SaveOutcome
  /** The photo was never saved to the row (an upload whose save was refused). */
  | { kind: "not-saved" };

/** DELETE one photo, carrying the studio's base version. Never throws. */
export async function deleteGalleryPhoto(
  id: string,
  version: string | null,
  send: (url: string, init: RequestInit) => Promise<Response> = fetch,
): Promise<GalleryDeleteOutcome> {
  let res: Response;
  try {
    res = await send(`/api/admin/gallery?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { [CONTENT_BASE_HEADER]: version ?? NO_ROW_VERSION },
    });
  } catch {
    return { kind: "refused", message: OFFLINE_SAVE_MESSAGE };
  }
  const body = (await res.json().catch(() => null)) as { code?: unknown } | null;
  // The route checks the version first, so on 404 the row is at this tab's
  // version and simply never had the photo: nothing to delete on the server.
  if (res.status === 404 && body?.code === "not-saved") return { kind: "not-saved" };
  return interpretSaveResponse(res.status, body);
}

/**
 * The studio's "last saved" snapshot once the server has dropped one photo.
 *
 * Only the photo leaves the snapshot. The delete wrote the server's copy minus
 * that photo, not the studio's unsaved edits, so those must still count as
 * unsaved (the dirty flag and the leave-page warning read this snapshot).
 * Replacing it with the whole on-screen content would mark them saved.
 */
export function snapshotWithoutPhoto(snapshot: string, id: string): string {
  try {
    const saved = JSON.parse(snapshot) as { gallery?: { id?: string }[] };
    if (!Array.isArray(saved.gallery)) return snapshot;
    return JSON.stringify({ ...saved, gallery: saved.gallery.filter((g) => g.id !== id) });
  } catch {
    return snapshot;
  }
}
