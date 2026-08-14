"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

// ── Get a modal out from under the header ──────────────────────────────────
//
// THE BUG THIS EXISTS TO KILL. Every overlay on this site declares a big
// z-index — z-[100], z-[120] — and several of them were still being painted
// OVER by the navbar at z-50. The owner's screenshot shows it exactly: a place
// detail sheet open, with the logo and the hamburger sitting on top of it and
// the sheet's own close button tucked underneath.
//
// z-index is not global. It is only compared against siblings inside the
// nearest ancestor that forms a STACKING CONTEXT, and four pages wrap their
// content in
//
//     <main class="… relative z-1">
//
// `position: relative` plus any `z-index` other than auto forms one. So the
// modal's 100 was being compared against other things inside <main>, and <main>
// as a whole sits at z-index 1 — underneath the header at 50. The overlay could
// have asked for z-index 9999 and lost just the same. Raising the number is the
// obvious fix and it does not work; that is worth knowing before someone tries.
//
// Rendering into <body> sidesteps the whole question: with no stacking context
// between the overlay and the root, its z-index means what it says.
//
// ── THE TRAP ON THE WAY OUT ────────────────────────────────────────────────
//
// AnimatePresence must live INSIDE the portal, never around it:
//
//     ✅ createPortal(<AnimatePresence>{open && …}</AnimatePresence>, body)
//     ❌ <AnimatePresence>{createPortal(…, body)}</AnimatePresence>
//
// The second renders NOTHING. AnimatePresence inspects its children to work out
// what is entering and leaving, and a portal is opaque to it — it sees no
// element, so it animates nothing into existence. That already cost this
// codebase the "Install app" button once. This component takes plain children
// and portals them, so callers keep their own AnimatePresence inside and land
// on the correct arrangement by default.
// Never resubscribes — the only thing being asked is "server or client?", which
// cannot subsequently change for a given render tree.
const noop = () => () => {};

export default function ModalPortal({ children }: { children: React.ReactNode }) {
  // Portals need a real DOM node, which does not exist during the server render
  // or the hydrating pass. This must therefore render null on the server and on
  // the first client pass, then the portal after — the standard two-pass shape.
  //
  // useSyncExternalStore rather than useState + useEffect, because that spelling
  // is a synchronous setState inside an effect: it cascades an extra render and
  // eslint rejects it outright. This hook exists for exactly this question — it
  // returns the SERVER snapshot while hydrating and the client one afterwards,
  // with no effect and no second render to schedule.
  const ready = useSyncExternalStore(
    noop,
    () => true, // client
    () => false, // server + hydration
  );
  if (!ready || typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
