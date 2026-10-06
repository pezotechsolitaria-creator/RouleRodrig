import { beforeEach, describe, expect, it } from "vitest";
import {
  PENDING_KEY,
  canResume,
  pendingPath,
  pickPending,
  readPending,
  removePending,
  upsertPending,
  type PendingEntry,
  type PendingReservation,
} from "./store";

// ── The way back to an unfinished booking (6 Oct 2026) ──────────────────────
//
// The hold screen was a dead end: leaving it lost the guest while the hold ran
// on. These pin what the device remembers, when it lets go, and which booking
// the bar offers first.

const NOW = Date.parse("2026-10-06T12:00:00Z"); // 16:00 in Rodrigues
const TOKEN = "A".repeat(43);

const res = (o: Partial<PendingReservation> = {}): PendingReservation => ({
  kind: "reservation",
  ref: "RR-H01BK",
  token: TOKEN,
  title: "Île aux Cocos",
  state: "pay",
  dueMur: 1999,
  deadline: "2026-10-06T19:28:38Z",
  slotDate: "2026-10-07",
  savedAt: NOW,
  ...o,
});

const rental = (o: Partial<Extract<PendingEntry, { kind: "rental" }>> = {}): PendingEntry => ({
  kind: "rental",
  ref: "RR-A1B2C3",
  email: "guest@example.com",
  title: "Hyundai Venue",
  range: "7 – 8 Oct",
  dueMur: 1000,
  startDate: "2026-10-07",
  savedAt: NOW,
  ...o,
});

// A browser's storage, in memory, for the node test runner.
beforeEach(() => {
  const mem = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
    key: () => null,
    length: 0,
  } as Storage;
  (globalThis as unknown as { window: { dispatchEvent: () => boolean } }).window = { dispatchEvent: () => true };
});

describe("canResume", () => {
  it("keeps a hold until its deadline, and lets it go after", () => {
    expect(canResume(res(), NOW)).toBe(true);
    expect(canResume(res(), Date.parse("2026-10-06T19:29:00Z"))).toBe(false);
  });

  it("keeps a request being checked, or a question from Roulé, without a deadline", () => {
    expect(canResume(res({ state: "checking", deadline: null }), NOW)).toBe(true);
    expect(canResume(res({ state: "needs_information", deadline: null }), NOW)).toBe(true);
  });

  it("lets go of anything settled or over", () => {
    for (const state of ["paid", "pay_in_person", "ready", "completed", "declined", "expired", "cancelled"] as const) {
      expect(canResume(res({ state }), NOW), state).toBe(false);
    }
    expect(canResume(res({ slotDate: "2026-10-05" }), NOW)).toBe(false);
  });

  it("keeps a rental until its first day", () => {
    expect(canResume(rental(), NOW)).toBe(true);
    expect(canResume(rental({ startDate: "2026-10-05" }), NOW)).toBe(false);
  });
});

describe("pendingPath", () => {
  it("goes to the reservation's own page, and to the rental's lookup — never with the email", () => {
    expect(pendingPath(res())).toBe(`/booking/${TOKEN}`);
    expect(pendingPath(rental())).toBe("/manage-booking?ref=RR-A1B2C3");
    expect(pendingPath(rental())).not.toContain("@");
  });
});

describe("pickPending", () => {
  it("offers the hold that runs out first, before anything else", () => {
    const soon = res({ ref: "RR-SOON1", deadline: "2026-10-06T13:00:00Z" });
    const later = res({ ref: "RR-LATE1", deadline: "2026-10-06T20:00:00Z" });
    const checking = res({ ref: "RR-CHK11", state: "checking", deadline: null });
    expect(pickPending([rental(), checking, later, soon], NOW)?.ref).toBe("RR-SOON1");
  });

  it("then a question from Roulé, then a request, then a rental", () => {
    const q = res({ ref: "RR-Q1111", state: "needs_information", deadline: null });
    const chk = res({ ref: "RR-C1111", state: "checking", deadline: null });
    expect(pickPending([rental(), chk, q], NOW)?.ref).toBe("RR-Q1111");
    expect(pickPending([rental(), chk], NOW)?.ref).toBe("RR-C1111");
    expect(pickPending([rental()], NOW)?.kind).toBe("rental");
    expect(pickPending([], NOW)).toBeNull();
  });
});

describe("the device's list", () => {
  it("adds, refreshes in place, and removes", () => {
    upsertPending(res(), NOW);
    upsertPending(res({ dueMur: 999 }), NOW);
    expect(readPending(NOW)).toHaveLength(1);
    expect((readPending(NOW)[0] as PendingReservation).dueMur).toBe(999);
    removePending("RR-H01BK");
    expect(readPending(NOW)).toEqual([]);
  });

  it("drops an entry the moment it is settled", () => {
    upsertPending(res(), NOW);
    upsertPending(res({ state: "paid" }), NOW);
    expect(readPending(NOW)).toEqual([]);
  });

  it("ignores anything malformed rather than throwing", () => {
    localStorage.setItem(PENDING_KEY, JSON.stringify([{ kind: "reservation", ref: "x", token: "short", state: "pay", savedAt: 1 }, 7, null]));
    expect(readPending(NOW)).toEqual([]);
    localStorage.setItem(PENDING_KEY, "{not json");
    expect(readPending(NOW)).toEqual([]);
  });

  it("keeps at most five", () => {
    for (let i = 0; i < 8; i++) upsertPending(res({ ref: `RR-0000${i}` }), NOW);
    expect(readPending(NOW)).toHaveLength(5);
  });
});
