"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Clock, X } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { usePolling } from "@/lib/use-polling";
import { isConsole, FOCUSED_PREFIXES } from "@/lib/nav-scope";
import { countdown, hubView } from "@/lib/reservations/timeline";
import type { GuestView } from "@/lib/reservations/view";
import {
  PENDING_EVENT,
  PENDING_KEY,
  pendingPath,
  pickPending,
  readPending,
  removePending,
  upsertPending,
  type PendingEntry,
  type PendingReservation,
} from "@/lib/pending/store";
import { PENDING_COPY, pendingLang } from "@/lib/pending/copy";

// ── "Finish paying Rs 1,999 · 11h 59m left" on every page (6 Oct 2026) ──────
//
// The hold screen was a dead end: leaving it lost the guest, and nothing in
// the app led back to the payment choice while the hold kept running. This
// bar is the way back. It shows the one most urgent unfinished booking from
// lib/pending/store.ts and links to its own page.
//
// The browser's copy is only a starting point: a reservation is re-read from
// the server (at most once a minute) so the bar never says "pay" after Roulé
// recorded the payment, or keeps counting down a hold that already ended.

/** Pages that are the booking itself, a lookup for it, or a flow of their own. */
export function hidesResumeBar(pathname: string): boolean {
  if (isConsole(pathname)) return true;
  if (FOCUSED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true;
  if (/^\/(booking|manage-booking|track|pay)(\/|$)/.test(pathname)) return true;
  // Their own bottom bars already own that strip: the food cart, and a
  // vehicle page's Reserve bar.
  if (/^\/food(\/|$)/.test(pathname)) return true;
  if (/^\/browse\/[^/]+\/[^/]+/.test(pathname)) return true;
  return false;
}

const SYNC_MS = 60_000;
const DISMISS_KEY = "rr.pending.hidden";

function dismissedKey(e: PendingEntry): string {
  return e.kind === "reservation" ? `${e.ref}:${e.state}` : `${e.ref}:rental`;
}

/** Re-read a reservation from the server; the store drops it once settled. */
async function sync(e: PendingReservation): Promise<void> {
  const stamp = `rr.pending.sync.${e.ref}`;
  try {
    const last = Number(sessionStorage.getItem(stamp) ?? 0);
    if (Date.now() - last < SYNC_MS) return;
    sessionStorage.setItem(stamp, String(Date.now()));
  } catch {
    /* no sessionStorage: sync anyway */
  }
  try {
    const res = await fetch(`/api/reservations/${e.token}`, { cache: "no-store" });
    if (res.status === 404) return removePending(e.ref);
    if (!res.ok) return;
    const v = (await res.json()) as GuestView;
    const hub = hubView({ reservation_status: v.status, payment_status: v.paymentStatus }, null, new Date()).state;
    // Paid and reported: the guest has done their part while Roulé checks the
    // account, and the page pauses its clock too (M241).
    const reported = hub === "pay" && !!v.paymentReportedAt;
    upsertPending({
      ...e,
      state: reported ? "checking" : hub,
      dueMur: Math.max(0, (v.depositDueMur ?? v.amountMur ?? 0) - (v.amountPaidMur ?? 0)) || null,
      deadline: hub === "pay" && !reported ? v.paymentDeadlineAt : null,
      slotDate: v.slotDate,
    });
  } catch {
    /* offline: keep showing the last known state */
  }
}

export default function ResumeBar() {
  const pathname = usePathname() || "/";
  const { language } = useLanguage();
  const c = PENDING_COPY[pendingLang(language)];
  const [entry, setEntry] = useState<PendingEntry | null>(null);
  const [now, setNow] = useState(0);
  const [hidden, setHidden] = useState<string | null>(null);

  const load = useCallback(() => {
    const t = Date.now();
    setNow(t);
    setEntry(pickPending(readPending(t), t));
    try {
      setHidden(sessionStorage.getItem(DISMISS_KEY));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
    const onStorage = (ev: StorageEvent) => {
      if (ev.key === PENDING_KEY) load();
    };
    window.addEventListener(PENDING_EVENT, load);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(PENDING_EVENT, load);
      window.removeEventListener("storage", onStorage);
    };
  }, [load]);
  // The countdown's tick: only while the tab is visible (usePolling).
  usePolling(load, 30_000, { immediate: false });

  // One server read per page view (throttled), and on coming back to the tab.
  useEffect(() => {
    if (hidesResumeBar(pathname)) return;
    const run = () => {
      for (const e of readPending()) if (e.kind === "reservation") void sync(e);
    };
    run();
    const onVis = () => document.visibilityState === "visible" && run();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [pathname]);

  if (!entry || hidesResumeBar(pathname) || hidden === dismissedKey(entry)) return null;

  const amount = entry.dueMur ? `Rs ${entry.dueMur.toLocaleString(language === "fr" ? "fr-FR" : "en-US")}` : null;
  const left = entry.kind === "reservation" && entry.state === "pay" ? countdown(entry.deadline, new Date(now)) : null;
  const title =
    entry.kind === "rental"
      ? c.rental
      : entry.state === "pay"
        ? amount
          ? c.pay(amount)
          : c.payNoAmount
        : entry.state === "needs_information"
          ? c.needsInfo
          : c.checking;
  const sub =
    entry.kind === "rental"
      ? `${entry.ref} · ${entry.title}`
      : left
        ? `${c.left(left)} · ${entry.ref}`
        : `${entry.ref} · ${entry.title}`;
  const cta =
    entry.kind === "reservation" && entry.state === "pay"
      ? c.ctaPay
      : entry.kind === "reservation" && entry.state === "needs_information"
        ? c.ctaAnswer
        : c.ctaOpen;

  return (
    <>
      {/* The strip the bar floats over, so it never sits on a page's last line. */}
      <div aria-hidden className="h-20" />
      <aside
        aria-label={c.label}
        className="pointer-events-none fixed inset-x-0 z-[39] flex justify-center px-3 md:inset-x-auto md:right-5 md:px-0"
        // Above whichever dock is showing (lib/use-dock-height.ts); with none,
        // above the home indicator.
        style={{ bottom: "calc(max(var(--rr-dock-h, 0px), env(safe-area-inset-bottom)) + 0.5rem)" }}
      >
        <div className="pointer-events-auto flex w-full max-w-sm items-center gap-2 rounded-2xl border border-yellow/35 bg-dark/95 py-2 pl-3.5 pr-2 shadow-[0_16px_44px_-12px_rgba(0,0,0,0.8)] backdrop-blur-xl">
          {left && <Clock size={16} className="shrink-0 text-yellow" aria-hidden />}
          <Link href={pendingPath(entry)} className="min-w-0 flex-1">
            <span className="block font-syne text-sm font-bold leading-tight text-offwhite">{title}</span>
            <span className="mt-0.5 block font-dm text-xs leading-tight text-muted tabular-nums">{sub}</span>
          </Link>
          <Link
            href={pendingPath(entry)}
            className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full bg-yellow px-4 font-syne text-sm font-bold text-dark transition-colors hover:bg-yellow-dark"
          >
            {cta} <ArrowRight size={14} aria-hidden />
          </Link>
          <button
            type="button"
            onClick={() => {
              const k = dismissedKey(entry);
              try {
                sessionStorage.setItem(DISMISS_KEY, k);
              } catch {
                /* ignore */
              }
              setHidden(k);
            }}
            aria-label={c.hide}
            className="flex h-11 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-offwhite"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      </aside>
    </>
  );
}
