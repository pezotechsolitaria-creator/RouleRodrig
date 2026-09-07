"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Bell, ArrowRight } from "lucide-react";
import type { AttentionItem } from "@/lib/admin/ops";
import { attentionStore } from "./attention-store";

// ── THE BELL ────────────────────────────────────────────────────────────────
//
// "Requires attention" already existed, and lived on exactly one screen: you
// had to be looking at /admin to find out that four shops could not trade or
// that somebody's application had been waiting a day. Every other admin page —
// the food queue, the deliveries board, the content studio, where an operator
// actually spends the day — said nothing.
//
// So this is the same list, in the chrome. It is deliberately NOT a new idea
// about what matters: it renders lib/admin/ops.ts's AttentionItem, fetched
// from the same loader the command centre uses, so the bell and the dashboard
// cannot disagree.
//
// It polls rather than subscribes. A minute is the right resolution for "a
// merchant is waiting"; realtime here would be a socket per admin tab for a
// number that changes a few times an hour.
//
// The poll itself lives in attention-store.ts, NOT in this component, because
// AdminShell mounts this twice — sidebar and mobile bar — and hides one with a
// breakpoint. Two mounts meant two timers against a route that runs 21
// Supabase queries: 2,520 an hour from one tab, all night. One shared poll now,
// paused while the tab is hidden.

const TONE: Record<AttentionItem["severity"], string> = {
  critical: "border-red-500/35 bg-red-500/[0.07] text-red-200",
  action: "border-red-400/30 bg-red-500/[0.05] text-red-300",
  info: "border-white/12 bg-white/[0.04] text-offwhite/80",
};

export default function AdminBell() {
  const { items, total } = useSyncExternalStore(
    attentionStore.subscribe,
    attentionStore.get,
    attentionStore.getServerSnapshot,
  );
  const [open, setOpen] = useState(false);
  // Closing on navigation is handled by each row's own onClick rather than by
  // watching the pathname: setting state in an effect for that is the
  // cascading-render pattern this repo lints as an error, and a menu item is
  // the only way out of this panel anyway.
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const critical = items.some((i) => i.severity === "critical");

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        // The number is IN the label, not only in the badge: a screen reader
        // announcing "Notifications" while a sighted operator sees a red 7 is
        // two different products.
        aria-label={
          total > 0
            ? `Notifications, ${total} item${total === 1 ? "" : "s"} need attention`
            : "Notifications, nothing waiting"
        }
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-white/12 text-muted transition-colors hover:border-yellow/40 hover:text-yellow"
      >
        <Bell size={16} />
        {total > 0 && (
          <span
            aria-hidden
            className={`absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-dm text-[10px] font-bold tabular-nums ${
              critical ? "bg-red-500 text-white" : "bg-yellow text-dark"
            }`}
          >
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-[min(21rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-white/12 bg-[#0e0e0e] shadow-2xl"
        >
          <p className="border-b border-white/10 px-4 py-2.5 font-bebas text-[11px] tracking-[0.28em] text-yellow">
            REQUIRES ATTENTION
          </p>

          {items.length === 0 ? (
            <p className="px-4 py-6 text-center font-dm text-[12.5px] text-muted">
              Nothing is waiting on you.
            </p>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto p-2">
              {items.map((a) => (
                <li key={a.key}>
                  <Link
                    href={a.href}
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    className={`mb-1.5 block rounded-xl border px-3 py-2.5 transition-colors hover:border-yellow/50 ${TONE[a.severity]}`}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="font-dm text-[12.5px]">{a.label}</span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <span className="font-syne text-sm font-extrabold tabular-nums">
                          {a.count}
                        </span>
                        <ArrowRight size={13} />
                      </span>
                    </span>
                    {/* The things behind the number, when the number alone is
                        not enough to act on. Same rule as the dashboard. */}
                    {a.names && a.names.length > 0 && (
                      <span className="mt-1 block font-dm text-[11px] opacity-75">
                        {a.names.join(" · ")}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
