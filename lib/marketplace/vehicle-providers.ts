import type { SupabaseClient } from "@supabase/supabase-js";
import { isVehicleTrade } from "@/lib/marketplace/hub";

// ── WHO /marketplace/wash LISTS, ASKED ONCE ─────────────────────────────────
//
// Moved out of app/marketplace/wash/page.tsx unchanged, because two more
// callers now ask the same question (SEO audit 2026-09-29 C16/T4): the page's
// own metadata, which sends `noindex, follow` while the list is empty, and
// app/sitemap.ts, which submits the URL only while it is not. Three copies of
// this query would be three opinions about who is listed.
//
// No status filter, on purpose — see the note that stays on the page: RLS on
// trade_providers already hides a draft or paused business from a visitor, the
// same rule the storefront and marketplace_stores use.

export type VehicleProvider = {
  store_id: string;
  trade: string;
  mobile: boolean;
  takes_online_bookings: boolean;
};

export type VehicleProviderStore = {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  address: string | null;
  phone: string | null;
  logo_url: string | null;
};

export type ListedVehicleProvider = { p: VehicleProvider; s: VehicleProviderStore };

/**
 * Every vehicle-care business a visitor can see, joined to its shop row.
 * `null` when the first read failed — unknown, which is not the same as none.
 */
export async function listVehicleProviders(
  supabase: SupabaseClient,
): Promise<ListedVehicleProvider[] | null> {
  // Two queries rather than an embed: marketplace_stores is a VIEW, so it
  // carries no foreign key for PostgREST to join on. Joined by id below.
  const { data: providerRows, error } = await supabase
    .from("trade_providers")
    .select("store_id, trade, mobile, takes_online_bookings");
  if (error) {
    console.error("trade_providers read failed", error);
    return null;
  }

  const vehicle = ((providerRows ?? []) as VehicleProvider[]).filter((p) =>
    isVehicleTrade(p.trade),
  );

  let stores: VehicleProviderStore[] = [];
  if (vehicle.length > 0) {
    const { data, error: storesError } = await supabase
      .from("marketplace_stores")
      .select("id, name, slug, tagline, address, phone, logo_url")
      .in(
        "id",
        vehicle.map((p) => p.store_id),
      );
    // Providers exist but their shops could not be read: unknown, not an empty
    // shelf, so the page must not noindex itself over it (audit C16/T4). The
    // page still renders its empty state from `?? []`, as it did before.
    if (storesError) {
      console.error("marketplace_stores read failed", storesError);
      return null;
    }
    stores = (data ?? []) as VehicleProviderStore[];
  }

  // A provider whose store row did not come back is dropped rather than
  // rendered as a nameless card — the two queries can disagree by a moment.
  return vehicle
    .map((p) => ({ p, s: stores.find((s) => s.id === p.store_id) }))
    .filter((row): row is ListedVehicleProvider => Boolean(row.s));
}
