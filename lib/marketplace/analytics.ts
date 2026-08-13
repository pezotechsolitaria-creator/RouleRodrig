"use client";

import posthog from "posthog-js";

// ── The marketplace funnel, named once ──────────────────────────────────────
//
// NOT a second analytics system: this is a thin wrapper over the posthog-js
// client the app already loads (instrumentation-client.ts), and every event
// still passes through lib/posthog-scrub.ts on the way out.
//
// It exists because the events ARE the funnel. "add_to_cart" fired from three
// components with three different property names is three metrics that cannot
// be compared, and the questions this platform needs answered — where do people
// drop, which searches find nothing, what gets viewed but never bought — are
// exactly the ones a drifting event name makes unanswerable.
//
// ── WHAT NEVER GOES IN A PROPERTY BAG ──────────────────────────────────────
// Ids, counts, prices in cents, booleans and short enums. No customer name, no
// email, no phone, no address, no coordinates. The scrub would strip those, and
// relying on the scrub for something we could simply not send is backwards.
// Product and shop names are business data, not personal data, and they are
// what make a funnel readable without a join.

type Props = Record<string, string | number | boolean | null | undefined>;

function capture(event: string, props: Props = {}) {
  try {
    posthog.capture(event, props);
  } catch {
    // Analytics must never be able to break a purchase. If the client has not
    // loaded, or an ad blocker removed it, the shopper still checks out.
  }
}

/** The marketplace landing screen. */
export function trackMarketplaceViewed(props: { productCount: number; categoryCount: number; sellerCount: number }) {
  capture("marketplace_viewed", {
    product_count: props.productCount,
    category_count: props.categoryCount,
    seller_count: props.sellerCount,
  });
}

/**
 * A search happened. `resultCount: 0` is the single most valuable row in this
 * whole file — it is the list of things people came for and the island does not
 * sell yet, which is a catalogue roadmap nobody has to guess at.
 */
export function trackSearch(props: { query: string; resultCount: number; category?: string | null }) {
  capture("marketplace_search", {
    // Trimmed and capped: a search term is what was typed into a public box,
    // and a 400-character paste is not a query.
    query: props.query.trim().slice(0, 80).toLowerCase(),
    result_count: props.resultCount,
    found: props.resultCount > 0,
    category: props.category ?? null,
  });
}

export function trackCategorySelected(props: { category: string; resultCount: number }) {
  capture("category_selected", { category: props.category, result_count: props.resultCount });
}

export function trackFilterUsed(props: { filter: string; value: string }) {
  capture("filter_used", { filter: props.filter, value: props.value });
}

export function trackProductViewed(props: {
  productId: string; productName: string; storeId: string; storeName: string;
  price: number; inStock: boolean; hasImage: boolean; category?: string | null;
}) {
  capture("product_viewed", {
    product_id: props.productId,
    product_name: props.productName,
    store_id: props.storeId,
    store_name: props.storeName,
    price: props.price,
    in_stock: props.inStock,
    has_image: props.hasImage,
    category: props.category ?? null,
  });
}

export function trackSellerViewed(props: { storeId: string; storeName: string; productCount: number }) {
  capture("seller_viewed", {
    store_id: props.storeId,
    store_name: props.storeName,
    product_count: props.productCount,
  });
}

export function trackAddToCart(props: {
  storeId: string; storeName: string; variantId: string; productName: string;
  price: number; quantity: number; surface: "quick_add" | "product_page" | "buy_again";
}) {
  capture("add_to_cart", {
    store_id: props.storeId,
    store_name: props.storeName,
    variant_id: props.variantId,
    product_name: props.productName,
    price: props.price,
    quantity: props.quantity,
    value: props.price * props.quantity,
    surface: props.surface,
  });
}

export function trackRemoveFromCart(props: {
  storeId: string; variantId: string; productName: string; quantity: number;
}) {
  capture("remove_from_cart", {
    store_id: props.storeId,
    variant_id: props.variantId,
    product_name: props.productName,
    quantity: props.quantity,
  });
}

/** The bag screen. `basketCount` is what tells us multi-shop baskets get used. */
export function trackCartViewed(props: { basketCount: number; itemCount: number }) {
  capture("cart_viewed", { basket_count: props.basketCount, item_count: props.itemCount });
}

export function trackSaveToggled(props: { productId: string; productName: string; saved: boolean }) {
  capture(props.saved ? "favorite_added" : "favorite_removed", {
    product_id: props.productId,
    product_name: props.productName,
  });
}

export function trackReorderClicked(props: { orderId: string; available: number; unavailable: number }) {
  capture("reorder_clicked", {
    order_id: props.orderId,
    available_items: props.available,
    unavailable_items: props.unavailable,
  });
}
