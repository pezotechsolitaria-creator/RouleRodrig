"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Package, ShoppingBasket } from "lucide-react";
import { cn } from "@/lib/utils";
import { readSaved, type SavedRequest } from "@/lib/delivery/my-requests";
import { type as t } from "@/lib/delivery/tokens";

// ── The way back in ─────────────────────────────────────────────────────────
//
// A guest has no account and no order history, so without this the only route
// back to a posted request is a link they still have open. Somebody who closed
// the tab had lost it — which, on a surface whose whole value arrives MINUTES
// LATER as quotes, meant the wait was the end of the journey.
//
// Rendered from localStorage, so it is a hint about which requests to ask
// about, never a claim to be believed: the server re-checks ownership on every
// load and the worst case here is a card that leads to "we couldn't find that".
//
// Mounted only after hydration. Reading localStorage during render would make
// the server and client markup disagree, and React would throw away the whole
// tree — on the page whose job is to be reassuring.

export default function MyRequests() {
  const [saved, setSaved] = useState<SavedRequest[] | null>(null);

  useEffect(() => {
    setSaved(readSaved());
  }, []);

  if (!saved || saved.length === 0) return null;

  return (
    <section className="mb-9">
      <h2 className={cn(t.heading, "text-offwhite")}>Your requests</h2>
      <ul className="mt-3 flex flex-col gap-2">
        {saved.slice(0, 4).map((r) => (
          <li key={r.id}>
            <Link
              href={`/deliver/${r.id}`}
              className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3.5 transition-colors hover:border-white/20"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.05] text-white/50">
                {/* The stored `what` is all this knows — the live status comes
                    from the server on the page itself. A cached status here
                    would be a stale promise about somebody's delivery. */}
                <Package size={15} />
              </span>
              <span className={cn(t.bodySm, "min-w-0 flex-1 truncate text-offwhite")}>{r.what}</span>
              <ChevronRight
                size={15}
                className="shrink-0 text-white/25 transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
