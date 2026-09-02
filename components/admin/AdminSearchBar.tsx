"use client";

import { Search } from "lucide-react";

// ── A SEARCH BAR YOU CAN SEE ────────────────────────────────────────────────
//
// The search itself is not new: CommandPalette and /api/admin/search have found
// orders, bookings, experiences, products, shops and drivers for a while, on
// Ctrl+K. What was missing was somewhere to LOOK. On the command centre the
// only mention was a line of small print at the bottom of the shortcuts panel —
// "Press Ctrl K anywhere to search" — and on a phone, where nobody has a Ctrl
// key, the entire affordance was a magnifier icon in the corner.
//
// So this is a visible box on the page an operator opens first, and it opens
// the SAME palette. Deliberately not a second search: a box that queried its
// own endpoint would be a second answer to "where is order RR1024", and the
// two would drift the first time either grew a table.
//
// It dispatches an event rather than taking a callback because the palette's
// state lives in AdminShell, and app/admin/page.tsx is a server component that
// cannot hold a handler. AdminShell listens for it beside its own Ctrl+K.

export const OPEN_ADMIN_SEARCH = "admin:open-search";

export default function AdminSearchBar() {
  const open = () => window.dispatchEvent(new CustomEvent(OPEN_ADMIN_SEARCH));

  return (
    // A button rather than an <input>: typing happens in the palette, and a
    // real input here would take the first keystroke and then lose focus as the
    // dialog steals it. Looks like a field, behaves like the control it is.
    <button
      type="button"
      onClick={open}
      className="flex min-h-11 w-full items-center gap-2.5 rounded-2xl border border-white/10 bg-dark-card px-4 font-dm text-sm text-muted transition-colors hover:border-yellow/40 hover:text-offwhite"
    >
      <Search size={15} className="shrink-0 text-yellow" />
      <span className="truncate">
        Search orders, bookings, customers, products…
      </span>
      <kbd className="ml-auto hidden shrink-0 rounded border border-white/15 px-1.5 py-0.5 font-dm text-[10px] text-muted sm:block">
        Ctrl K
      </kbd>
    </button>
  );
}
