"use client";

import { useRef } from "react";
import { Store, UtensilsCrossed } from "lucide-react";
import type { AccessibleStore } from "@/lib/merchant/context";

// ── Which shop am I looking at? ────────────────────────────────────────────
//
// The platform owner is a marketplace merchant AND owns two restaurants. Before
// this, the dashboard resolved "merchant first, then kitchen", so they landed on
// their shop and could never reach a restaurant at all — and owning two
// kitchens, never the second one either.
//
// Rendered ONLY when there is more than one thing to switch between, so a
// merchant with a single shop sees exactly what they saw before: no control, no
// question to answer, nothing new to learn.
//
// A plain form posting a server action rather than a fetch: the store lives in
// an httpOnly cookie the server validates against getAccessibleStores(), so the
// choice cannot be made client-side and the control keeps working without JS.

export default function StoreSwitcher({
  stores,
  currentId,
  action,
}: {
  stores: AccessibleStore[];
  currentId: string | null;
  action: (formData: FormData) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  if (stores.length < 2) return null;

  const current = stores.find((s) => s.id === currentId) ?? stores[0];

  return (
    <form ref={formRef} action={action} className="flex items-center">
      <label className="sr-only" htmlFor="rr-store-switch">
        Choose which shop or restaurant to manage
      </label>
      <span className="pointer-events-none -mr-6 ml-1 text-yellow" aria-hidden>
        {current?.kind === "kitchen" ? <UtensilsCrossed size={14} /> : <Store size={14} />}
      </span>
      <select
        id="rr-store-switch"
        name="storeId"
        defaultValue={current?.id}
        onChange={() => formRef.current?.requestSubmit()}
        className="w-full max-w-[190px] truncate rounded-full border border-white/15 bg-dark-card py-1.5 pl-7 pr-2 font-dm text-xs text-offwhite focus:border-yellow/50 focus:outline-none"
      >
        {/* Grouped, because "my shop" and "my restaurant" are different jobs and
            the list is meaningless without saying which is which. */}
        {stores.some((s) => s.kind === "shop") && (
          <optgroup label="Shop">
            {stores.filter((s) => s.kind === "shop").map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </optgroup>
        )}
        {stores.some((s) => s.kind === "kitchen") && (
          <optgroup label="Restaurant">
            {stores.filter((s) => s.kind === "kitchen").map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </optgroup>
        )}
      </select>
      {/* Works without JS: the onChange submit is the convenience, not the
          mechanism. */}
      <noscript>
        <button type="submit" className="ml-2 rounded-full bg-yellow px-2.5 py-1 font-dm text-xs font-bold text-dark">
          Go
        </button>
      </noscript>
    </form>
  );
}
