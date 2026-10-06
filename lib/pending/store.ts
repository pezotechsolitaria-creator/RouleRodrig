import type { HubState } from "@/lib/reservations/timeline";

// ── What this device is in the middle of booking (6 Oct 2026) ───────────────
//
// "Choose a way to pay" lived on one page. Leaving it — Back, Home, any tab —
// lost the guest, while the hold kept running on the server until it expired
// and released the date. So the reservation page and the rental sheet write
// what is unfinished HERE, and a bar on every page (components/pending/
// ResumeBar.tsx) offers the way back until it is paid, answered, or over.
//
// Leaving is never cancelling: nothing in this file touches the server. The
// hold lives in the database and ends there (its own expiry job), so this is
// only a memory of where to go back to. The reservation's page path carries
// its access token — the same credential already in this browser's history.

export const PENDING_KEY = "rr.pending.v1";
/** Same-tab signal; other tabs hear the `storage` event. */
export const PENDING_EVENT = "rr:pending-changed";
const MAX = 5;

/** A reservation (activities, trips, transfers): /booking/<token>. */
export type PendingReservation = {
  kind: "reservation";
  ref: string;
  token: string;
  title: string;
  /** The page's own state when last seen (lib/reservations/timeline). */
  state: HubState;
  /** What the guest still owes now, whole rupees, or null. */
  dueMur: number | null;
  /** The hold's end (ISO), only while state is "pay". */
  deadline: string | null;
  slotDate: string;
  savedAt: number;
};

/** A car or scooter booking from the sheet: /manage-booking?ref=. */
export type PendingRental = {
  kind: "rental";
  ref: string;
  /** Kept on THIS device only, so the booking page can find it without
   *  asking again. Never put in a URL. */
  email: string;
  title: string;
  range: string;
  dueMur: number | null;
  startDate: string;
  savedAt: number;
};

export type PendingEntry = PendingReservation | PendingRental;

const RESUMABLE: HubState[] = ["checking", "needs_information", "pay"];

function today(now: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Indian/Mauritius" }).format(new Date(now));
}

/**
 * Is there still something to go back FOR? A reservation while Roulé checks
 * it, needs a detail, or waits for payment inside its hold; a rental until
 * its first day. Anything over drops out on its own.
 */
export function canResume(e: PendingEntry, now = Date.now()): boolean {
  if (e.kind === "reservation") {
    if (!RESUMABLE.includes(e.state)) return false;
    if (e.slotDate && e.slotDate < today(now)) return false;
    if (e.state === "pay" && e.deadline && new Date(e.deadline).getTime() <= now) return false;
    return true;
  }
  if (e.startDate && e.startDate < today(now)) return false;
  return now - e.savedAt < 30 * 24 * 3600_000;
}

/** Where the bar's link goes. */
export function pendingPath(e: PendingEntry): string {
  return e.kind === "reservation"
    ? `/booking/${e.token}`
    : `/manage-booking?ref=${encodeURIComponent(e.ref)}`;
}

function valid(x: unknown): x is PendingEntry {
  if (!x || typeof x !== "object") return false;
  const e = x as Record<string, unknown>;
  if (typeof e.ref !== "string" || typeof e.savedAt !== "number") return false;
  if (e.kind === "reservation") return typeof e.token === "string" && /^[A-Za-z0-9_-]{43}$/.test(e.token) && typeof e.state === "string";
  if (e.kind === "rental") return typeof e.email === "string";
  return false;
}

export function readPending(now = Date.now()): PendingEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(PENDING_KEY) ?? "[]");
    return (Array.isArray(raw) ? raw : []).filter(valid).filter((e) => canResume(e, now));
  } catch {
    return [];
  }
}

function write(list: PendingEntry[]): void {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(list.slice(0, MAX)));
    window.dispatchEvent(new Event(PENDING_EVENT));
  } catch {
    /* private mode or full: the bar is a convenience, never a requirement */
  }
}

/** Add or refresh one entry; an entry that cannot be resumed is removed. */
export function upsertPending(e: PendingEntry, now = Date.now()): void {
  const rest = readPending(now).filter((x) => x.ref !== e.ref);
  write(canResume(e, now) ? [e, ...rest] : rest);
}

export function removePending(ref: string): void {
  const list = readPending();
  if (list.some((x) => x.ref === ref)) write(list.filter((x) => x.ref !== ref));
}

/**
 * The one entry the bar shows: a hold that is running out first, then a
 * question from Roulé, then a request being checked, then a rental.
 */
export function pickPending(list: PendingEntry[], now = Date.now()): PendingEntry | null {
  const live = list.filter((e) => canResume(e, now));
  const rank = (e: PendingEntry) =>
    e.kind === "rental" ? 3 : e.state === "pay" ? 0 : e.state === "needs_information" ? 1 : 2;
  const deadline = (e: PendingEntry) =>
    e.kind === "reservation" && e.deadline ? new Date(e.deadline).getTime() : Number.MAX_SAFE_INTEGER;
  return [...live].sort((a, b) => rank(a) - rank(b) || deadline(a) - deadline(b) || b.savedAt - a.savedAt)[0] ?? null;
}
