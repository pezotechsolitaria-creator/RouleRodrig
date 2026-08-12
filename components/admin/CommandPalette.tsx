"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, CornerDownLeft } from "lucide-react";
import { isSearchable } from "@/lib/admin/ops";

// ── Ctrl+K for the whole platform ──────────────────────────────────────────
//
// The operator's fastest path to anything: static ACTIONS (navigation and
// create-shortcuts, filtered as you type) plus LIVE RESULTS from
// /api/admin/search once the query is worth a round trip. One list, one
// keyboard model — arrows, Enter, Escape — because a palette that behaves
// differently per result type is slower than the sidebar it replaces.

type Hit = { group: string; title: string; subtitle: string; href: string };

const ACTIONS: Hit[] = [
  { group: "Go", title: "Command Center", subtitle: "Today, attention, activity", href: "/admin" },
  { group: "Go", title: "What needs you", subtitle: "Live problems, and push setup", href: "/admin/operations" },
  { group: "Go", title: "Order statement", subtitle: "Every transaction, with a running balance", href: "/admin/statement" },
  { group: "Go", title: "Kitchen teams", subtitle: "Add a cook to a kitchen", href: "/admin/kitchen-staff" },
  { group: "Go", title: "Kitchen screen", subtitle: "What a cook sees", href: "/kitchen" },
  { group: "Go", title: "Food orders", subtitle: "The live kitchen queue", href: "/admin/food" },
  { group: "Go", title: "Deliveries & drivers", subtitle: "Assignment and failures", href: "/admin/deliveries" },
  { group: "Go", title: "Shops & opening hours", subtitle: "Every shop's schedule", href: "/admin/stores" },
  { group: "Go", title: "Merchants & subscriptions", subtitle: "Approvals and billing", href: "/admin/subscriptions" },
  { group: "Go", title: "Massage, fishing & sea trips", subtitle: "Add and edit bookable services", href: "/admin/content#services" },
  { group: "Go", title: "Customers", subtitle: "Accounts and their activity", href: "/admin/customers" },
  { group: "Go", title: "Events & tickets", subtitle: "Create, publish and monitor events", href: "/admin/events" },
  { group: "Go", title: "Ticketing fees", subtitle: "What the platform charges organisers", href: "/admin/managed-ticketing" },
  { group: "Go", title: "Event organisers", subtitle: "Scoped organiser accounts", href: "/admin/organizers" },
  { group: "Go", title: "Content studio", subtitle: "Everything the website shows", href: "/admin/content" },
  { group: "Go", title: "Delivery areas & fees", subtitle: "Zones and pricing", href: "/admin/delivery-zones" },
  { group: "Go", title: "Monetization", subtitle: "Revenue model and plans", href: "/admin/monetization" },
  { group: "Go", title: "WhatsApp alerts", subtitle: "Who gets pinged", href: "/admin/notifications" },
  { group: "Go", title: "Audit trail", subtitle: "Who changed what, when", href: "/admin/audit" },
  { group: "Create", title: "New dish or kitchen", subtitle: "Food catalog", href: "/admin/food" },
  { group: "Create", title: "Add a massage", subtitle: "Therapist, duration, price — goes live at /experiences/massage", href: "/admin/content#services" },
  { group: "Create", title: "Add a fishing trip", subtitle: "Captain, boat, hours at sea", href: "/admin/content#services" },
  { group: "Create", title: "Add a sortie de mer", subtitle: "Boat trip, island hop, snorkelling", href: "/admin/content#services" },
  { group: "Create", title: "Rental bookings", subtitle: "Confirm or cancel requests", href: "/admin/content#bookings" },
  { group: "Create", title: "Homepage cards & tiles", subtitle: "What visitors see first", href: "/admin/content#homeCards" },
];

export default function CommandPalette({
  open, onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [remote, setRemote] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset per open, and focus — a palette that keeps last week's query is a
  // palette that navigates somewhere surprising on Enter.
  useEffect(() => {
    if (!open) return;
    setQ("");
    setRemote([]);
    setCursor(0);
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open]);

  // Live search, debounced. Below the searchable threshold the remote list is
  // cleared rather than left stale next to fresh action matches.
  useEffect(() => {
    if (!open) return;
    if (!isSearchable(q)) {
      setRemote([]);
      return;
    }
    let cancelled = false;
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(q)}`);
        const body = await res.json().catch(() => ({}));
        if (!cancelled) setRemote(res.ok ? (body.hits ?? []) : []);
      } catch {
        if (!cancelled) setRemote([]);
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, open]);

  const needle = q.trim().toLowerCase();
  const results = useMemo(() => {
    const actions = needle
      ? ACTIONS.filter((a) => `${a.title} ${a.subtitle}`.toLowerCase().includes(needle))
      : ACTIONS;
    return [...actions.slice(0, needle ? 6 : 10), ...remote];
  }, [needle, remote]);

  const go = useCallback(
    (hit: Hit | undefined) => {
      if (!hit) return;
      onClose();
      // A same-page hash link (content studio sections) needs a hard set so the
      // studio's hash listener fires even when only the fragment changes.
      if (hit.href.includes("#")) window.location.href = hit.href;
      else router.push(hit.href);
    },
    [onClose, router],
  );

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, results.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
      else if (e.key === "Enter") { e.preventDefault(); go(results[cursor]); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, results, cursor, go, onClose]);

  useEffect(() => setCursor(0), [results.length]);

  if (!open) return null;

  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/70 p-4 pt-[12vh]" onClick={onClose}>
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/12 bg-[#111] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Command palette"
      >
        <div className="flex items-center gap-2.5 border-b border-white/10 px-4">
          {busy ? <Loader2 size={16} className="animate-spin text-yellow" /> : <Search size={16} className="text-muted" />}
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search orders, bookings, customers, products… or jump anywhere"
            className="w-full bg-transparent py-3.5 font-dm text-sm text-offwhite placeholder:text-muted focus:outline-none"
          />
          <kbd className="shrink-0 rounded border border-white/15 px-1.5 py-0.5 font-dm text-[10px] text-muted">esc</kbd>
        </div>

        <div className="max-h-[52vh] overflow-y-auto py-1.5">
          {results.length === 0 && (
            <p className="px-4 py-6 text-center font-dm text-sm text-muted">
              {busy ? "Searching…" : "Nothing matches that."}
            </p>
          )}
          {results.map((r, i) => {
            const header = r.group !== lastGroup ? r.group : null;
            lastGroup = r.group;
            return (
              <div key={`${r.group}-${r.title}-${i}`}>
                {header && (
                  <p className="px-4 pb-1 pt-2.5 font-bebas text-[10px] tracking-[0.25em] text-yellow/80">
                    {header.toUpperCase()}
                  </p>
                )}
                <button
                  onClick={() => go(r)}
                  onMouseEnter={() => setCursor(i)}
                  className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left ${
                    i === cursor ? "bg-yellow/10" : ""
                  }`}
                >
                  <span className="min-w-0">
                    <span className={`block truncate font-dm text-sm ${i === cursor ? "text-yellow" : "text-offwhite"}`}>
                      {r.title}
                    </span>
                    <span className="block truncate font-dm text-[11px] text-muted">{r.subtitle}</span>
                  </span>
                  {i === cursor && <CornerDownLeft size={13} className="shrink-0 text-muted" />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
