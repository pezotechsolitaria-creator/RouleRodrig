import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Attach every photo of each product, so a card can cycle through them.
 *
 * WHY THIS IS NOT IN THE VIEW OR THE RPC: both `food_catalog` and
 * `browse_products` pick the cover with a `limit 1` lateral join, so they
 * return exactly one URL per product however many the shop uploaded. Widening
 * them means altering a view and an RPC that several surfaces read from — a
 * migration against a live database, to render a photograph.
 *
 * One extra SELECT does the same job with nothing to migrate, and it needs no
 * grant change: the `media_read` policy scopes `product_media` to rows whose
 * parent product is visible under the CALLER'S OWN RLS, so a draft or
 * unapproved product's photos cannot come back through here any more than they
 * can through the view. This adds one round trip per listing page, not one per
 * card — the ids go in a single `in (…)`.
 *
 * Best-effort by design. On failure the products keep their covers: a menu or a
 * shop must never fail to render because a second photograph did not load.
 */
export async function withGalleries<T extends { id: string }>(
  supabase: SupabaseClient,
  items: T[],
): Promise<(T & { imageUrls: string[] })[]> {
  const withEmpty = () => items.map((i) => ({ ...i, imageUrls: [] as string[] }));
  if (items.length === 0) return withEmpty();

  const { data, error } = await supabase
    .from("product_media")
    .select("product_id, url")
    .in("product_id", items.map((i) => i.id))
    .eq("kind", "image")
    .order("position");

  if (error || !data) return withEmpty();

  const byProduct = new Map<string, string[]>();
  for (const row of data as { product_id: string; url: string }[]) {
    const list = byProduct.get(row.product_id);
    if (list) list.push(row.url);
    else byProduct.set(row.product_id, [row.url]);
  }

  // Ordered by `position` — the same order the lateral joins use to pick the
  // cover, so the cover leads here too and AutoPhotos drops the duplicate.
  return items.map((i) => ({ ...i, imageUrls: byProduct.get(i.id) ?? [] }));
}
