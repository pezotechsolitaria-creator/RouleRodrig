// ── Remembering a guest's own requests, on their own device ─────────────────
//
// A guest has no account, so the only proof they own a request is the pair
// (request id, email) — the same credential shape /api/orders/lookup has always
// used, with a stronger identifier. Without somewhere to keep that pair, a
// guest who closes the tab has to be emailed a link to get back in, and every
// return visit becomes a form.
//
// So the pair is kept in localStorage. This is NOT a security boundary and is
// not treated as one: the server re-checks both halves on every call, and
// anything found here is a hint about which request to ask about, never a claim
// to be believed. The worst case if it is tampered with is a 404.
//
// Pure over an injected Storage so it can be tested without a DOM, and so a
// browser with storage disabled degrades to "ask for the email" rather than
// throwing on module load.

export type SavedRequest = {
  id: string;
  /** Absent for a signed-in customer — their session is the credential. */
  email?: string;
  /** What was asked for, so the list reads as something rather than as uuids. */
  what: string;
  savedAt: string;
};

const KEY = "rr_delivery_requests";
/** Enough to cover anybody's real history; the server caps open requests at 5. */
const MAX = 20;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function storage(): StorageLike | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    // Safari in private mode, and any browser with storage blocked, throws on
    // ACCESS rather than returning null.
    return null;
  }
}

function isSaved(v: unknown): v is SavedRequest {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return typeof r.id === "string" && r.id.length > 0 && typeof r.what === "string";
}

/** Everything remembered on this device, newest first. */
export function readSaved(store: StorageLike | null = storage()): SavedRequest[] {
  if (!store) return [];
  try {
    const raw = store.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Anything malformed is dropped rather than throwing. This value survives
    // deploys, so a shape change must degrade to "we forgot" and never to a
    // page that will not render.
    return parsed.filter(isSaved).slice(0, MAX);
  } catch {
    return [];
  }
}

/** Remember one, newest first, without ever storing the same id twice.
 *  A request the customer CLEARED is not remembered again: the tracker calls
 *  this on every load, and opening an old link must not undo a Clear. */
export function saveRequest(
  entry: Omit<SavedRequest, "savedAt"> & { savedAt?: string },
  store: StorageLike | null = storage(),
): SavedRequest[] {
  if (readCleared(store).includes(entry.id)) return readSaved(store);
  const next: SavedRequest = {
    id: entry.id,
    email: entry.email,
    what: entry.what,
    savedAt: entry.savedAt ?? new Date().toISOString(),
  };
  const merged = [next, ...readSaved(store).filter((r) => r.id !== next.id)].slice(0, MAX);
  if (store) {
    try {
      store.setItem(KEY, JSON.stringify(merged));
    } catch {
      // Quota, or storage disabled between the read and the write. Losing the
      // memory is survivable; taking the page down with it is not.
    }
  }
  return merged;
}

/** The email this device used for a request, if it has one. */
export function emailFor(id: string, store: StorageLike | null = storage()): string | null {
  return readSaved(store).find((r) => r.id === id)?.email ?? null;
}

export function forgetRequest(id: string, store: StorageLike | null = storage()): SavedRequest[] {
  const merged = readSaved(store).filter((r) => r.id !== id);
  if (store) {
    try {
      store.setItem(KEY, JSON.stringify(merged));
    } catch {
      /* see saveRequest */
    }
  }
  return merged;
}

// ── Cleared on this device (M227) ────────────────────────────────────────────
// "Clear" hides a request from the list (set_delivery_request_hidden on the
// server). A guest's list lives only here, so the device has to remember the
// choice too — otherwise the next tracker visit would save the request back.
// Ids only, capped, and like everything above a hint: losing it means a
// cleared request may reappear on this device, never that one disappears.

const CLEARED_KEY = "rr_delivery_cleared";
const CLEARED_MAX = 100;

export function readCleared(store: StorageLike | null = storage()): string[] {
  if (!store) return [];
  try {
    const parsed: unknown = JSON.parse(store.getItem(CLEARED_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string").slice(0, CLEARED_MAX) : [];
  } catch {
    return [];
  }
}

function writeCleared(ids: string[], store: StorageLike | null) {
  if (!store) return;
  try {
    store.setItem(CLEARED_KEY, JSON.stringify(ids.slice(0, CLEARED_MAX)));
  } catch {
    /* see saveRequest */
  }
}

/** Forget a request on this device AND remember that it was cleared. */
export function clearRequest(id: string, store: StorageLike | null = storage()): void {
  forgetRequest(id, store);
  writeCleared([id, ...readCleared(store).filter((x) => x !== id)], store);
}

/** Undo a Clear on this device: the entry comes back as it was. */
export function unclearRequest(entry: SavedRequest | null, id: string, store: StorageLike | null = storage()): void {
  writeCleared(readCleared(store).filter((x) => x !== id), store);
  if (entry) saveRequest(entry, store);
}
