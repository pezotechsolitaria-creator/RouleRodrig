"use client";

import type { AttentionItem } from "@/lib/admin/ops";

// ── ONE POLL, HOWEVER MANY BELLS ────────────────────────────────────────────
//
// AdminShell renders <AdminBell/> twice — once in the desktop sidebar, once in
// the mobile top bar — and hides one with a CSS breakpoint. CSS hides; React
// still MOUNTS both, so both ran their own timer.
//
// /api/admin/attention runs 21 Supabase queries (lib/admin/attention-load.ts).
// Two bells, once a minute, is 42 queries a minute — 2,520 an hour — from a
// single admin tab, and it kept going all night on a tab nobody had closed.
//
// So the poll moved out of the component. Subscribers are counted: the first
// one starts the timer, the last one stops it, and every bell renders the same
// snapshot. Rendering the same thing twice should cost what rendering it once
// costs.
//
// IT ALSO STOPS WHEN NOBODY IS LOOKING. A hidden tab learns nothing from a
// poll — there is no one to read the badge — so the timer pauses and one fetch
// runs on the way back. An admin tab left open over a weekend used to bill
// about 120,000 queries for a number nobody read.

const POLL_MS = 60_000;

export type AttentionSnapshot = { items: AttentionItem[]; total: number };

const EMPTY: AttentionSnapshot = { items: [], total: 0 };

let snapshot: AttentionSnapshot = EMPTY;
let timer: ReturnType<typeof setInterval> | null = null;
let inFlight = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

async function pull() {
  // One request even if two bells mount in the same tick.
  if (inFlight) return;
  inFlight = true;
  try {
    const res = await fetch("/api/admin/attention", { cache: "no-store" });
    const json = (await res.json()) as { items?: AttentionItem[]; total?: number };
    const next: AttentionSnapshot = { items: json.items ?? [], total: json.total ?? 0 };
    // A new object every minute would re-render every bell whether or not the
    // numbers moved; useSyncExternalStore compares by identity.
    if (next.total === snapshot.total && sameIds(next.items, snapshot.items)) return;
    snapshot = next;
    emit();
  } catch {
    // Leave the last known state rather than flashing an empty bell.
  } finally {
    inFlight = false;
  }
}

function sameIds(a: AttentionItem[], b: AttentionItem[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, i) => item.key === b[i].key && item.count === b[i].count);
}

function visible(): boolean {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

function onVisibility() {
  if (visible()) {
    void pull();
    start();
  } else {
    stop();
  }
}

function start() {
  if (timer || !visible()) return;
  timer = setInterval(() => void pull(), POLL_MS);
}

function stop() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

export const attentionStore = {
  subscribe(listener: () => void): () => void {
    const first = listeners.size === 0;
    listeners.add(listener);
    if (first) {
      document.addEventListener("visibilitychange", onVisibility);
      void pull();
      start();
    }
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        document.removeEventListener("visibilitychange", onVisibility);
        stop();
      }
    };
  },
  get(): AttentionSnapshot {
    return snapshot;
  },
  /** The server never renders a bell with data — it has no session here. */
  getServerSnapshot(): AttentionSnapshot {
    return EMPTY;
  },
};
