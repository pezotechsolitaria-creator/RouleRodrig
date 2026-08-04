"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { useNotifications, useMarkNotificationRead } from "@/lib/notifications-client";

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export default function NotificationBell() {
  const { data: notifications } = useNotifications();
  const markRead = useMarkNotificationRead();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const unreadCount = (notifications ?? []).filter((n) => !n.read_at).length;

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", onClickOutside);
      document.addEventListener("keydown", onEscape);
    }
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  function handleSelect(n: { id: string; read_at: string | null; order_id: string | null }) {
    if (!n.read_at) markRead.mutate(n.id);
    setOpen(false);
    if (n.order_id) router.push(`/merchant/orders/${n.order_id}`);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-muted transition-colors hover:border-yellow/50 hover:text-yellow"
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-yellow px-1 font-dm text-[9px] font-bold text-dark">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Notifications"
          className="absolute right-0 top-11 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-white/10 bg-dark-card shadow-xl"
        >
          <div className="border-b border-white/10 px-4 py-3">
            <h2 className="font-syne text-sm font-bold text-offwhite">Notifications</h2>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {!notifications || notifications.length === 0 ? (
              <p className="px-4 py-8 text-center font-dm text-sm text-muted">No notifications yet.</p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  role="menuitem"
                  onClick={() => handleSelect(n)}
                  className={
                    "flex w-full flex-col gap-0.5 border-b border-white/5 px-4 py-3 text-left transition-colors last:border-0 hover:bg-white/[0.04] " +
                    (n.read_at ? "" : "bg-yellow/[0.05]")
                  }
                >
                  <span className="flex items-center gap-2 font-dm text-sm font-medium text-offwhite">
                    {!n.read_at && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-yellow" aria-hidden="true" />}
                    {n.title}
                  </span>
                  {n.body && <span className="font-dm text-xs text-muted">{n.body}</span>}
                  <span className="font-dm text-[10px] text-muted/70">{timeAgo(n.created_at)}</span>
                </button>
              ))
            )}
          </div>
          {(notifications?.length ?? 0) > 0 && (
            <div className="border-t border-white/10 px-4 py-2 text-center">
              <Link href="/merchant/orders" onClick={() => setOpen(false)} className="font-dm text-xs text-yellow hover:underline">
                View all orders
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
