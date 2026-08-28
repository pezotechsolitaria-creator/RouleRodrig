"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { SHOP_COPY, type ShopCopy } from "@/lib/shop/copy.i18n";
import type { ProductSort } from "@/lib/marketplace/types";
import {
  sellerPitch,
  type MonetizationModel,
} from "@/lib/marketplace/fees";

// ── How a SERVER page in /shop says a translated word ───────────────────────
//
// Six of the ten pages under app/shop are server components, and three of the
// busiest components (ProductListing, FilterPanel, MarketProductCard) are too.
// The chosen language is not a cookie and not a route segment —
// context/LanguageContext.tsx keeps it in localStorage and restores it after
// mount — so there is nothing on the server to read it from.
//
// app/deliver/DeliverTitle.tsx solved this for ONE heading by moving that
// heading into a tiny client child. /shop has roughly a hundred strings spread
// over sixteen files, and a named client child per string would be sixteen
// more files of boilerplate that drift from each other. So the same idea is
// generalised exactly once, here: these are the smallest possible client
// leaves — a hook call and a text node — and everything around them (the
// grid, the cards, the links, the images) stays server-rendered.
//
// The consequence DeliverTitle already recorded holds here too: the provider
// starts on "en", so the server-rendered HTML is English and corrects itself
// after hydration. A crawler and a reader with no JavaScript get the English
// the page's metadata and JSON-LD already promise.
//
// Client components that already exist (MarketHeader, AddToCartForm, the saved
// page…) do NOT need these — they call useShopCopy() and read the object.

export function useShopCopy(): ShopCopy {
  const { language } = useLanguage();
  return SHOP_COPY[language];
}

/**
 * Every dotted path in the copy tree whose leaf has type `L`.
 *
 * The function check has to come BEFORE the object check: in TypeScript a
 * function is also an object, so without it `header.backTo` would be walked
 * into and produce paths like "header.backTo.call".
 */
type LeafOf<O, L> = {
  [K in keyof O & string]: O[K] extends L
    ? K
    : O[K] extends (...args: never[]) => unknown
      ? never
      : O[K] extends object
        ? `${K}.${LeafOf<O[K], L>}`
        : never;
}[keyof O & string];

/** A plain string: `<T k="home.payDirect" />`. */
export type TextKey = LeafOf<ShopCopy, string>;
/** A count: `<TCount k="counts.products" n={4} />`. */
export type CountKey = LeafOf<ShopCopy, (n: number) => string>;
/** One substitution: `<TName k="home.openStore" v={store.name} />`. */
export type NameKey = LeafOf<ShopCopy, (v: string) => string>;

function at(copy: ShopCopy, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], copy);
}

export function T({ k }: { k: TextKey }) {
  const copy = useShopCopy();
  return <>{at(copy, k) as string}</>;
}

export function TCount({ k, n }: { k: CountKey; n: number }) {
  const copy = useShopCopy();
  return <>{(at(copy, k) as (n: number) => string)(n)}</>;
}

export function TName({ k, v }: { k: NameKey; v: string }) {
  const copy = useShopCopy();
  return <>{(at(copy, k) as (v: string) => string)(v)}</>;
}

/**
 * The seller pitch, resolved HERE rather than on the server.
 *
 * sellerPitch() derives a claim about money from the live monetization model,
 * which is why the server used to compute it and pass the finished sentence
 * down. That made the sentence English in every language, and because it is
 * interpolated INTO a translated paragraph the result was a French sentence
 * ending in an English clause: "...avant de remettre quoi que ce soit — no
 * commission on your sales".
 *
 * So the MODEL and RATE come down instead of the prose, and the sentence is
 * built in the reader's language from the same two numbers. The percentage is
 * still formatted from the rate the database gave us, so no translation can
 * promise a figure the server will not honour.
 */
export function TPitch({
  k,
  model,
  rate,
}: {
  k: NameKey;
  model: MonetizationModel;
  rate: number;
}) {
  const copy = useShopCopy();
  const { language } = useLanguage();
  return <>{(at(copy, k) as (v: string) => string)(sellerPitch(model, rate, language))}</>;
}

/** "Page 2 of 7" — two numbers, so it does not fit TCount. */
export function TPage({ page, total }: { page: number; total: number }) {
  const copy = useShopCopy();
  return <>{copy.listing.page(page, total)}</>;
}

/**
 * A sort chip's label. The KEY (`recommended`, `price_asc`…) is wire format —
 * lib/marketplace/types.ts calls it the only strings browse_products accepts —
 * and only the label passing through here is display.
 */
export function TSort({ sort }: { sort: ProductSort }) {
  const copy = useShopCopy();
  return <>{copy.sort[sort]}</>;
}

/**
 * A <nav> whose aria-label needs translating. The children stay server-rendered
 * — they are passed in, not imported.
 */
export function LabelledNav({
  k, className, children,
}: {
  k: TextKey;
  className?: string;
  children: ReactNode;
}) {
  const copy = useShopCopy();
  return (
    <nav aria-label={at(copy, k) as string} className={className}>
      {children}
    </nav>
  );
}

/** A <Link> whose aria-label names something — "Open Chez Marie". */
export function LabelledLink({
  k, v, href, className, children,
}: {
  k: NameKey;
  v: string;
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const copy = useShopCopy();
  return (
    <Link
      href={href}
      aria-label={(at(copy, k) as (v: string) => string)(v)}
      className={className}
    >
      {children}
    </Link>
  );
}
