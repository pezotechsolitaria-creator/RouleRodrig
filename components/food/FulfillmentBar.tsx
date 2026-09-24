"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { ShoppingBag, Bike } from "lucide-react";

import { centsToShortString } from "@/lib/money";
// FOOD_COPY.fulfilment has carried all of this in English, French and Kreol
// from the start. This component rendered English literals beside two strings
// it DID take from the dictionary — so /food showed "Vous avez envie de quoi ?"
// above "Collect in person / Delivered to you".
import { FOOD_COPY } from "@/lib/food/copy.i18n";

// Pickup or delivery, decided once and remembered.
//
// ── WHY THIS IS THE SECOND THING ON THE SCREEN ─────────────────────────────
// It changes the price, the wait and where the customer has to be — so it is
// not a checkout field, it is a browsing MODE. Burying it behind a menu is the
// single most-complained-about change the big delivery apps have made, because
// a customer who wanted to collect finds out at the last step that they have
// been shopping in the wrong mode.
//
// ── THE STORAGE KEY IS THE CONTRACT ────────────────────────────────────────
// The choice is written to localStorage under FULFILLMENT_KEY and read back by
// the checkout form, so the mode chosen while browsing is the mode preselected
// when paying. That is the whole mechanism — no context provider, no URL
// parameter to lose on a refresh, and it survives the customer closing the tab
// to ask someone what they want.
//
// It is a PREFERENCE, never a price. Every fee is still derived server-side in
// create_order() from delivery_zones; nothing here can make delivery free.

export const FULFILLMENT_KEY = "rr-food-fulfillment";

export type FoodFulfillment = "pickup" | "rr_delivery";

export function readFulfillment(): FoodFulfillment | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(FULFILLMENT_KEY);
  return raw === "pickup" || raw === "rr_delivery" ? raw : null;
}

export default function FulfillmentBar({
  deliveryEnabled, deliveryFeeFrom,
}: {
  deliveryEnabled: boolean;
  deliveryFeeFrom: number | null;
}) {
  const { language } = useLanguage();
  const f = FOOD_COPY[language].fulfilment;
  const [mode, setMode] = useState<FoodFulfillment>("pickup");
  // SSR and the first paint cannot see localStorage, so rendering the stored
  // choice immediately would flash the wrong pill. Same reasoning as the cart's
  // `hydrated` flag.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setMode(readFulfillment() ?? "pickup");
    setHydrated(true);
  }, []);

  function choose(next: FoodFulfillment) {
    setMode(next);
    window.localStorage.setItem(FULFILLMENT_KEY, next);
  }

  // Delivery paused platform-wide: say so rather than offering a choice that
  // checkout is about to refuse.
  if (!deliveryEnabled) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-dark-card px-4 py-3">
        <ShoppingBag size={16} className="text-yellow" />
        <p className="font-dm text-sm text-offwhite">
          {f.collectionOnly}
          <span className="ml-1.5 text-muted">{f.deliveryPaused}</span>
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-white/10 bg-dark-card p-1.5">
        {(
          [
            // Shared with the shop cards, the shop filters and the checkout.
            // fulfilmentChip() is English-only — it is a flat record with no
            // Language dimension — and these two labels are the second control
            // a French visitor meets on /food, directly under a heading that
            // IS translated.
            { id: "pickup" as const, label: f.pickup, icon: ShoppingBag },
            { id: "rr_delivery" as const, label: f.delivery, icon: Bike },
          ]
        ).map((opt) => {
          const Icon = opt.icon;
          const on = hydrated && mode === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => choose(opt.id)}
              aria-pressed={on}
              className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-dm text-sm font-semibold transition-colors ${
                on ? "bg-yellow text-dark" : "text-muted hover:text-offwhite"
              }`}
            >
              <Icon size={16} /> {opt.label}
            </button>
          );
        })}
      </div>
      <p className="mt-2 px-1 font-dm text-xs text-muted">
        {hydrated && mode === "rr_delivery" ? (
          <>
            {f.deliveryNote}
            {deliveryFeeFrom !== null && <> {f.deliveryFee(centsToShortString(deliveryFeeFrom))}</>}
            {" "}{f.deliveryShare}
          </>
        ) : (
          <>{f.pickupNote}</>
        )}
      </p>
    </div>
  );
}
