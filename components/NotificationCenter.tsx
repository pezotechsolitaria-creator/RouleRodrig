"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import Link from "next/link";
import { Bell, Check, Loader2, AlertTriangle } from "lucide-react";

// ── The notification centre ────────────────────────────────────────────────
//
// Role-agnostic on purpose. A notification row is addressed to a user id; the
// recipient's ROLE is a property of the row, not of the reader. So customers,
// drivers and merchants all read the same feed through this one component
// rather than three near-identical bells drifting apart.
//
// Reads /api/notifications, which is scoped to auth.uid() by RLS *and* by an
// explicit filter. There is no id in any request from this component — nothing
// here can be pointed at somebody else's feed.

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  category: string | null;
  priority: "low" | "normal" | "high" | "critical" | null;
  read_at: string | null;
  created_at: string;
};

const CATEGORY_LABEL: Record<string, string> = {
  deliveries: "Delivery",
  rentals: "Booking",
  ticketing: "Tickets",
  payments: "Payment",
  bookings: "Order",
  system: "Account",
  admin: "Admin",
};

// Island time, and short: "2h" beats "2 hours ago" in a 320px panel.
function ago(iso: string): string {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return "now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86_400) return `${Math.floor(secs / 3600)}h`;
  if (secs < 604_800) return `${Math.floor(secs / 86_400)}d`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function NotificationCenter({ className = "" }: { className?: string }) {
  const { t } = useLanguage();
  const [items, setItems] = useState<Notification[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) {
        // 401 is the normal state for a signed-out visitor, not an error worth
        // showing. The component simply renders nothing.
        setItems([]);
        return;
      }
      const body = await res.json();
      setItems((body.notifications as Notification[]) ?? []);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void load();
    // Slow poll. The bell is ambient — it does not need to be a live socket,
    // and a 60s interval costs a mobile battery almost nothing.
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [load]);

  // Click-away and Escape, because a panel you cannot dismiss is a trap.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function markAllRead() {
    if (busy) return;
    setBusy(true);
    // Optimistic: the server call is idempotent, so the worst case on failure
    // is a badge that reappears on the next poll.
    setItems((prev) => prev?.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })) ?? null);
    try {
      await fetch("/api/notifications", { method: "POST" });
    } finally {
      setBusy(false);
    }
  }

  async function markOneRead(id: string) {
    setItems((prev) => prev?.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)) ?? null);
    await fetch(`/api/notifications/${id}`, { method: "PATCH" }).catch(() => {});
  }

  // A signed-out visitor has no feed and gets no bell.
  if (items === null || items.length === 0) return null;

  const unread = items.filter((n) => !n.read_at);
  const earlier = items.filter((n) => n.read_at);

  return (
    <div className={`relative ${className}`} ref={panelRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={unread.length > 0 ? `Notifications, ${unread.length} unread` : "Notifications"}
        aria-expanded={open}
        className="relative flex h-11 w-11 items-center justify-center rounded-full text-offwhite transition-colors hover:bg-white/10"
      >
        <Bell size={19} />
        {unread.length > 0 && (
          <span className="absolute right-1.5 top-1.5 flex min-w-[18px] items-center justify-center rounded-full bg-yellow px-1 font-syne text-[10px] font-bold text-dark">
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 z-50 mt-2 max-h-[70vh] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain rounded-2xl border border-white/10 bg-dark-card shadow-2xl"
        >
          <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-white/10 bg-dark-card px-4 py-3">
            <h2 className="font-syne text-sm font-bold">{t.common.notifications}</h2>
            {unread.length > 0 && (
              <button
                onClick={() => void markAllRead()}
                disabled={busy}
                className="flex items-center gap-1 font-dm text-xs text-muted transition-colors hover:text-yellow disabled:opacity-50"
              >
                {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                Mark all read
              </button>
            )}
          </div>

          {unread.length > 0 && (
            <Section title="New" items={unread} onRead={markOneRead} onClose={() => setOpen(false)} />
          )}
          {earlier.length > 0 && (
            <Section title={t.common.earlier} items={earlier} onRead={markOneRead} onClose={() => setOpen(false)} dim />
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  items,
  onRead,
  onClose,
  dim = false,
}: {
  title: string;
  items: Notification[];
  onRead: (id: string) => void;
  onClose: () => void;
  dim?: boolean;
}) {
  return (
    <div>
      <p className="px-4 pb-1 pt-3 font-bebas text-[10px] tracking-[0.25em] text-muted">{title}</p>
      <ul>
        {items.map((n) => {
          const critical = n.priority === "critical";
          // Every row is a link when it knows where to go — a notification you
          // cannot act on is just an interruption.
          const inner = (
            <div className="flex gap-3">
              {critical && <AlertTriangle size={14} className="mt-0.5 shrink-0 text-red-400" />}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className={`truncate font-syne text-sm font-bold ${dim ? "text-muted" : ""}`}>{n.title}</p>
                  <span className="shrink-0 font-dm text-[11px] text-muted">{ago(n.created_at)}</span>
                </div>
                {n.body && <p className="mt-0.5 line-clamp-2 font-dm text-xs text-muted">{n.body}</p>}
                {n.category && (
                  <span className="mt-1.5 inline-block rounded-full border border-white/10 px-2 py-0.5 font-dm text-[10px] text-muted">
                    {CATEGORY_LABEL[n.category] ?? n.category}
                  </span>
                )}
              </div>
              {!n.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-yellow" />}
            </div>
          );

          return (
            <li key={n.id} className="border-b border-white/5 last:border-0">
              {n.link ? (
                <Link
                  href={n.link}
                  onClick={() => {
                    onRead(n.id);
                    onClose();
                  }}
                  className="block px-4 py-3 transition-colors hover:bg-white/5"
                >
                  {inner}
                </Link>
              ) : (
                <button onClick={() => onRead(n.id)} className="block w-full px-4 py-3 text-left transition-colors hover:bg-white/5">
                  {inner}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
