// ── The shape of a marketplace product, defined once ────────────────────────
//
// Every field here is produced by browse_products() (M96). Nothing in the UI
// may compute "is this buyable", "what does it cost" or "who sells it" from
// parts — the database answers those in one pass over the variants, and a
// second opinion in TypeScript is how a card ends up saying "In stock" next to
// a button that refuses.

/** One purchasable option, when the choice has already been made for you. */
export type QuickAddVariant = {
  id: string;
  price: number;
  stockQuantity: number;
};

export type MarketProduct = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;

  /** The seller. Present on EVERY card — this is a marketplace, not a shop. */
  storeId: string;
  storeSlug: string;
  storeName: string;
  storeLogo: string | null;
  storeAddress: string | null;
  storeRatingAvg: number | null;
  storeRatingCount: number;

  categorySlug: string | null;
  categoryName: string | null;

  minPrice: number;
  maxPrice: number;
  /** Set only when some variant is genuinely marked down. Never a fake anchor. */
  compareAt: number | null;
  /** "kg", "g", "piece"… when the shop sells by measure. */
  unit: string | null;

  imageUrl: string | null;
  imageCount: number;

  inStock: boolean;
  stockTotal: number;
  variantCount: number;
  /** Non-null only for a single-variant product with stock. */
  quickAdd: QuickAddVariant | null;

  ratingAvg: number | null;
  ratingCount: number;

  offersPickup: boolean;
  offersRrDelivery: boolean;
  offersOwnDelivery: boolean;
  /** The shop's subscription is live. Customers get the consequence, not the cause. */
  acceptingOrders: boolean;
  isOpen: boolean;
  hasSchedule: boolean;

  createdAt: string;
};

export type CategoryFacet = {
  slug: string;
  name: string;
  icon: string | null;
  count: number;
};

export type SellerFacet = { slug: string; name: string; count: number };

export type BrowseProductsResult = {
  total: number;
  limit: number;
  offset: number;
  deliveryFeeFrom: number | null;
  priceMin: number | null;
  priceMax: number | null;
  categories: CategoryFacet[];
  sellers: SellerFacet[];
  products: MarketProduct[];
};

export type MarketplaceSeller = {
  slug: string;
  name: string;
  logoUrl: string | null;
  coverUrl: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  ratingAvg: number | null;
  ratingCount: number;
  productCount: number;
};

export type MarketplaceHome = {
  productCount: number;
  storeCount: number;
  /** Shops that can take an order today. Below storeCount = browsable, not buyable. */
  sellingStoreCount: number;
  openStoreCount: number;
  deliveryFeeFrom: number | null;
  categories: CategoryFacet[];
  sellers: MarketplaceSeller[];
  /** Products with real paid orders behind them. Empty is a valid answer. */
  bestsellerIds: string[];
};

// ── One product page, from product_detail() ─────────────────────────────────

export type ProductVariant = {
  id: string;
  name: string | null;
  price: number;
  compareAt: number | null;
  stockQuantity: number;
  isActive: boolean;
  unit: string | null;
  sku: string | null;
  options: Record<string, string>;
};

export type ProductReview = {
  id: string;
  rating: number;
  body: string | null;
  createdAt: string;
  /** The buyer's first name, or null. Never more than that. */
  author: string | null;
};

export type ProductSeller = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  logoUrl: string | null;
  address: string | null;
  /** The exact pin. Null for a shop that has not set one — say so, never guess. */
  lat: number | null;
  lng: number | null;
  phone: string | null;
  ratingAvg: number | null;
  ratingCount: number;
  createdAt: string;
  acceptingOrders: boolean;
  productCount: number;
  /** Orders this shop has actually handed over. A count, not a badge. */
  completedOrders: number;
  offersPickup: boolean;
  offersRrDelivery: boolean;
  offersOwnDelivery: boolean;
};

export type ProductSchedule = {
  has_schedule: boolean;
  is_open: boolean;
  is_closed: boolean;
  opens_at: string | null;
  closes_at: string | null;
  next_open_at: string | null;
  delivery_available: boolean;
};

export type ProductDetail = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  description: string | null;
  attributes: Record<string, string>;
  createdAt: string;
  category: { slug: string; name: string; icon: string | null } | null;
  variants: ProductVariant[];
  media: { url: string; alt: string | null }[];
  store: ProductSeller;
  schedule: ProductSchedule | null;
  deliveryFeeFrom: number | null;
  reviews: ProductReview[];
  ratingAvg: number | null;
  ratingCount: number;
};

/** Sorts the listing offers, and the only strings browse_products accepts. */
export const PRODUCT_SORTS = ["recommended", "newest", "price_asc", "price_desc", "rating", "name"] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export const SORT_LABEL: Record<ProductSort, string> = {
  recommended: "Recommended",
  newest: "New arrivals",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
  rating: "Best rated",
  name: "A–Z",
};

export const FULFILMENT_FILTERS = ["pickup", "rr_delivery", "own_delivery"] as const;
export type FulfilmentFilter = (typeof FULFILMENT_FILTERS)[number];

export function toProductSort(v: string | null | undefined): ProductSort {
  return (PRODUCT_SORTS as readonly string[]).includes(v ?? "") ? (v as ProductSort) : "recommended";
}
