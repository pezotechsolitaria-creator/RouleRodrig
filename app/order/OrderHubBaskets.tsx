"use client";

import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { ShoppingBag, ChevronRight } from "lucide-react";
import { useCarts } from "@/lib/cart/CartContext";
import { CART_DOMAINS, CART_BASKET_NAME, type CartDomain } from "@/lib/cart/domains";

// "Where did my order go?" — answered before it is asked.
//
// Three separate baskets is the right model (a curry and a concert ticket cannot
// be one order), but it means a shopper can have something waiting in a basket
// they are not currently looking at. This strip names each non-empty one and
// links straight to it. Silent when everything is empty, so it never adds noise
// to a first visit.
//
// Client-only because the baskets live in localStorage; `hydrated` gates the
// render so the server HTML and the first client paint agree.
export default function OrderHubBaskets() {
  const { t } = useLanguage();
  const { countFor, hydrated } = useCarts();
  if (!hydrated) return null;

  const waiting = CART_DOMAINS.map((d) => ({ domain: d as CartDomain, count: countFor(d) })).filter(
    (x) => x.count > 0,
  );
  if (waiting.length === 0) return null;

  return (
    <div className="mt-5 space-y-2">
      {waiting.map(({ domain, count }) => (
        <Link
          key={domain}
          href={`/cart?cart=${domain}`}
          className="flex items-center gap-3 rounded-xl border border-yellow/30 bg-yellow/[0.07] px-4 py-3 transition-colors hover:border-yellow"
        >
          <ShoppingBag size={17} className="shrink-0 text-yellow" />
          <span className="min-w-0 flex-1 font-dm text-sm text-offwhite">
            {t.common.youHave} <strong className="text-yellow">{count}</strong>{" "}
            {count === 1 ? "thing" : "things"} waiting in your{" "}
            {CART_BASKET_NAME[domain].toLowerCase()} basket
          </span>
          <ChevronRight size={17} className="shrink-0 text-yellow" />
        </Link>
      ))}
    </div>
  );
}
