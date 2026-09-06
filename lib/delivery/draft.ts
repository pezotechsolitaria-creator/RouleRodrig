// ── Keeping a half-finished request when the connection is not ──────────────
//
// ── WHY THIS EXISTS ────────────────────────────────────────────────────────
// Mobile data on Rodrigues drops. Not "occasionally, in a tunnel" — it drops in
// the middle of the island, in the rain, and on the walk between two rooms.
// 96.8% of over-60s here own a mobile phone and 12.6% can use a computer
// (CMPHS 2024), so this form is being filled in on a handset, outdoors, on a
// network that comes and goes.
//
// A three-screen form has a specific failure that a one-screen form does not:
// you can lose four minutes of typing on the last tap and be shown a network
// error with nothing behind it. That is the moment somebody stops using a
// website and goes back to WhatsApp — and WhatsApp, notably, keeps your message
// and sends it later.
//
// So two separate things live here, and the distinction is the whole design:
//
//   THE DRAFT is what you are typing. Saved on every change, restored when you
//   come back, thrown away once the request is posted. It is a convenience and
//   it is allowed to be lossy.
//
//   THE OUTBOX is a request you FINISHED and tapped post on, which could not be
//   sent. That is a promise, not a convenience. It survives a closed tab and a
//   dead battery, and the form sends it the moment `online` fires.
//
// Both are pure over an injected Storage, like lib/delivery/my-requests.ts:
// testable without a DOM, and a browser with storage blocked degrades to "no
// draft" rather than throwing on module load.

import {
  isRequestKind,
  type ErrandKind,
  type RequestKind,
} from "@/lib/delivery/kind";

/** Exactly what /api/delivery-requests takes. Kept as the wire shape on
 *  purpose: an outbox entry that has to be re-derived from form state is an
 *  outbox entry that will drift from the endpoint it is aimed at. */
export type RequestPayload = {
  kind: RequestKind;
  what: string;
  pickupText: string;
  pickupNote?: string;
  dropoffText: string;
  dropoffNote?: string;
  pickupLat?: number;
  pickupLng?: number;
  dropoffLat?: number;
  dropoffLng?: number;
  sizeClass: "standard" | "large";
  cargoKind: "general" | "food" | "fragile" | "heavy";
  /** Only ever set on an errand. See lib/delivery/kind.ts. */
  errandKind?: ErrandKind;
  scheduleKind: "asap" | "today" | "tomorrow" | "date";
  timeSlot: "any" | "morning" | "afternoon" | "evening";
  neededDate?: string;
  maxBudget?: number;
  photoPath?: string;
  contactName: string;
  contactPhone: string;
  guestEmail?: string;
};

/** The form as the person left it — deliberately looser than RequestPayload,
 *  because a draft is by definition incomplete. */
export type Draft = {
  v: 1;
  kind: RequestKind;
  what: string;
  budget: string;
  item: string;
  /** The errand's own answer. Empty on the other two kinds, which ask `item`
   *  instead — the two questions are never both live. */
  errandKind: string;
  largeAndHeavy: boolean;
  scheduleKind: string;
  timeSlot: string;
  neededDate: string;
  photoPath: string | null;
  pickup: PlaceLite | null;
  dropoff: PlaceLite | null;
  pickupNote: string;
  dropoffNote: string;
  namesShop: boolean;
  name: string;
  phone: string;
  guestEmail: string;
  step: string;
  savedAt: string;
};

export type PlaceLite = {
  id: string;
  name: string;
  area: string;
  lat: number | null;
  lng: number | null;
};

export type Queued = {
  payload: RequestPayload;
  queuedAt: string;
};

const DRAFT_KEY = "rr_delivery_draft";
const OUTBOX_KEY = "rr_delivery_outbox";

/** A draft older than this is not a draft, it is an archaeological find.
 *  Restoring last month's half-typed request is worse than a clean form. */
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

/** An unsent request is kept far longer — it is a promise, and somebody may not
 *  get signal back for a day. Beyond a week the prices and the need have both
 *  moved on, and silently posting it would be the wrong kind of surprise. */
const OUTBOX_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function storage(): StorageLike | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    // Safari private mode throws on ACCESS, not on use.
    return null;
  }
}

function write(store: StorageLike | null, key: string, value: unknown): void {
  if (!store) return;
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    // Quota, or storage revoked between read and write. Losing the memory is
    // survivable; taking the form down with it is not.
  }
}

function drop(store: StorageLike | null, key: string): void {
  if (!store) return;
  try {
    store.removeItem(key);
  } catch {
    /* see write */
  }
}

function ageMs(iso: unknown, now: number): number {
  if (typeof iso !== "string") return Infinity;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Infinity : now - t;
}

// ── The draft ───────────────────────────────────────────────────────────────

function isDraft(v: unknown): v is Draft {
  if (!v || typeof v !== "object") return false;
  const d = v as Record<string, unknown>;
  // The version gate is what lets the shape change without shipping a migration
  // for a value that only ever holds a few minutes of typing. An older draft is
  // simply not a draft any more.
  return d.v === 1 && typeof d.savedAt === "string";
}

export function readDraft(
  store: StorageLike | null = storage(),
  now: number = Date.now(),
): Draft | null {
  if (!store) return null;
  try {
    const raw = store.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isDraft(parsed)) return null;
    if (ageMs(parsed.savedAt, now) > DRAFT_TTL_MS) {
      drop(store, DRAFT_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Called on every keystroke, so it must be cheap and must never throw. */
export function writeDraft(
  draft: Omit<Draft, "v" | "savedAt">,
  store: StorageLike | null = storage(),
  now: Date = new Date(),
): void {
  write(store, DRAFT_KEY, { ...draft, v: 1, savedAt: now.toISOString() });
}

export function clearDraft(store: StorageLike | null = storage()): void {
  drop(store, DRAFT_KEY);
}

/**
 * Is there enough here to be worth offering back?
 *
 * A draft holding nothing but the default kind is not a draft — restoring it
 * would put "We kept what you had started" on a form nobody had started, which
 * teaches people the message is noise.
 */
export function draftHasContent(d: Draft | null): boolean {
  if (!d) return false;
  return Boolean(
    d.what.trim() ||
      d.photoPath ||
      d.pickup ||
      d.dropoff ||
      d.name.trim() ||
      d.phone.trim() ||
      d.budget.trim(),
  );
}

// ── The outbox ──────────────────────────────────────────────────────────────

function isQueued(v: unknown): v is Queued {
  if (!v || typeof v !== "object") return false;
  const q = v as Record<string, unknown>;
  if (typeof q.queuedAt !== "string") return false;
  const p = q.payload as Record<string, unknown> | undefined;
  // Validated against what the ENDPOINT requires, not against what the form
  // happened to hold. A queued item that the server will reject is worse than
  // no queue: it fails on a screen the person is no longer looking at.
  return Boolean(
    p &&
      typeof p.what === "string" &&
      typeof p.dropoffText === "string" &&
      p.dropoffText.length > 0 &&
      typeof p.contactPhone === "string" &&
      p.contactPhone.length > 0 &&
      // isRequestKind, not a hand-written union. When "errand" was added,
      // this line was the one place that would have SILENTLY BINNED a
      // queued request — the outbox drops anything it judges invalid, on a
      // screen the person has already left, so the failure is a delivery
      // that simply never happened and nobody to tell.
      isRequestKind(p.kind),
  );
}

export function readQueued(
  store: StorageLike | null = storage(),
  now: number = Date.now(),
): Queued | null {
  if (!store) return null;
  try {
    const raw = store.getItem(OUTBOX_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isQueued(parsed)) {
      drop(store, OUTBOX_KEY);
      return null;
    }
    if (ageMs(parsed.queuedAt, now) > OUTBOX_TTL_MS) {
      drop(store, OUTBOX_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * ONE queued request, not a list.
 *
 * The server caps a person at five open requests, and somebody offline is not
 * composing five of them. A single slot means the retry can never post a burst
 * of stale duplicates when signal returns — which is the failure mode that
 * makes people distrust an offline queue and stop using it.
 */
export function queueRequest(
  payload: RequestPayload,
  store: StorageLike | null = storage(),
  now: Date = new Date(),
): void {
  write(store, OUTBOX_KEY, { payload, queuedAt: now.toISOString() });
}

export function clearQueued(store: StorageLike | null = storage()): void {
  drop(store, OUTBOX_KEY);
}

/**
 * Is this failure worth queueing, or worth showing?
 *
 * A dropped connection means "try later" and the request should be kept. A 400
 * means the server looked at it and said no, and keeping it would retry a
 * rejection forever — so it is surfaced instead. Getting this backwards is how
 * an outbox becomes a poison queue.
 */
export function isRetryable(status: number | null): boolean {
  if (status === null) return true; // never reached the server at all
  if (status === 408 || status === 429) return true;
  return status >= 500;
}
