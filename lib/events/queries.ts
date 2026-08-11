import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Server-side reads for /events.
//
// Everything here sits ON TOP of the M33/M34 model rather than beside it: an
// event IS a store, a ticket type IS a product_variant, so capacity is
// stock_quantity and buying a ticket is an ordinary marketplace order. That is
// why there is no reservation code in this file — create_order() already does
// it, with the row locking and the RR012 price guard that were proven under
// 8-way concurrency.
//
// The only thing this layer adds is the SHAPE the event UI needs.

export type EventPhase = "upcoming" | "in_progress" | "ended" | "cancelled" | "draft";

export type EventTicketType = {
  variantId: string;
  name: string;
  price: number;
  capacity: number;
  remaining: number;
  minPerOrder: number;
  maxPerOrder: number | null;
  salesOpen: boolean;
  soldOut: boolean;
  // M47 package content. A customer choosing between Standard and VIP is not
  // comparing prices — they are comparing promises, and a name alone does not
  // carry one.
  subtitle: string | null;
  description: string | null;
  inclusions: string[];
  imageUrl: string | null;
  /** Why it cannot be bought yet, when that is the case. */
  salesStart: string | null;
  salesEnd: string | null;
};

export type EventSummary = {
  storeId: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  coverUrl: string | null;
  venueName: string | null;
  venueAddress: string | null;
  lat: number | null;
  lng: number | null;
  startsAt: string;
  endsAt: string | null;
  doorsOpenAt: string | null;
  timezone: string;
  supportPhone: string | null;
  terms: string | null;
  cancelledAt: string | null;
  cancelledReason: string | null;
  phase: EventPhase;
  ticketTypes: EventTicketType[];
  /** Cheapest active ticket price, for the listing card. */
  fromPrice: number | null;
  remaining: number;
  capacity: number;
};

type Row = {
  store_id: string;
  starts_at: string;
  ends_at: string | null;
  doors_open_at: string | null;
  timezone: string;
  venue_name: string | null;
  venue_address: string | null;
  venue_lat: number | null;
  venue_lng: number | null;
  support_phone: string | null;
  terms: string | null;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  stores: {
    id: string; slug: string; name: string; tagline: string | null;
    description: string | null; cover_url: string | null; status: string;
  } | null;
};

/** Derived exactly as event_phase() does in SQL, so the two cannot disagree. */
function phaseOf(row: Row, now = Date.now()): EventPhase {
  if (row.cancelled_at) return "cancelled";
  if (row.stores?.status !== "active") return "draft";
  if (row.ends_at && new Date(row.ends_at).getTime() < now) return "ended";
  if (new Date(row.starts_at).getTime() <= now) return "in_progress";
  return "upcoming";
}

async function ticketTypesFor(
  supabase: SupabaseClient,
  storeIds: string[],
): Promise<Map<string, EventTicketType[]>> {
  const byStore = new Map<string, EventTicketType[]>();
  if (storeIds.length === 0) return byStore;

  // products → variants → ticket_types. Public RLS already restricts this to
  // active products of visible stores, so no extra gating is needed here.
  const { data, error } = await supabase
    .from("products")
    .select(
      "store_id, product_variants(id, name, price, stock_quantity, is_active, " +
        "ticket_types(sales_start, sales_end, max_per_order, min_per_order, display_order, " +
        "subtitle, description, inclusions, image_url))",
    )
    .in("store_id", storeIds)
    .eq("status", "active");

  if (error) {
    console.error("event ticket types failed", error);
    return byStore;
  }

  const now = Date.now();
  type P = {
    store_id: string;
    product_variants: {
      id: string; name: string | null; price: number; stock_quantity: number; is_active: boolean;
      ticket_types: { sales_start: string | null; sales_end: string | null; max_per_order: number | null; min_per_order: number | null; display_order: number | null; subtitle: string | null; description: string | null; inclusions: string[] | null; image_url: string | null } | { sales_start: string | null; sales_end: string | null; max_per_order: number | null; min_per_order: number | null; display_order: number | null; subtitle: string | null; description: string | null; inclusions: string[] | null; image_url: string | null }[] | null;
    }[];
  };

  for (const p of (data ?? []) as unknown as P[]) {
    for (const v of p.product_variants ?? []) {
      if (!v.is_active) continue;
      const tt = Array.isArray(v.ticket_types) ? v.ticket_types[0] : v.ticket_types;
      // A variant with no ticket_types row is an ordinary product, not an
      // admission — skip it rather than selling it as a ticket.
      if (!tt) continue;

      const startOk = !tt.sales_start || new Date(tt.sales_start).getTime() <= now;
      const endOk = !tt.sales_end || new Date(tt.sales_end).getTime() > now;
      const list = byStore.get(p.store_id) ?? [];
      list.push({
        variantId: v.id,
        name: v.name ?? "Admission",
        price: v.price,
        capacity: v.stock_quantity,
        remaining: Math.max(0, v.stock_quantity),
        minPerOrder: Math.max(1, tt.min_per_order ?? 1),
        maxPerOrder: tt.max_per_order,
        salesOpen: startOk && endOk,
        soldOut: v.stock_quantity <= 0,
        subtitle: tt.subtitle,
        description: tt.description,
        inclusions: tt.inclusions ?? [],
        imageUrl: tt.image_url,
        salesStart: tt.sales_start,
        salesEnd: tt.sales_end,
        displayOrder: tt.display_order ?? 0,
      } as EventTicketType & { displayOrder: number });
      byStore.set(p.store_id, list);
    }
  }
  // The organiser decides the running order — Early Bird before Standard before
  // VIP, not whatever order Postgres returned.
  for (const [k, list] of byStore) {
    byStore.set(k, list.sort((a, b) =>
      ((a as { displayOrder?: number }).displayOrder ?? 0) - ((b as { displayOrder?: number }).displayOrder ?? 0)));
  }
  return byStore;
}

function toSummary(row: Row, types: EventTicketType[]): EventSummary {
  const sellable = types.filter((t) => t.salesOpen && !t.soldOut);
  return {
    storeId: row.store_id,
    slug: row.stores?.slug ?? "",
    name: row.stores?.name ?? "Event",
    tagline: row.stores?.tagline ?? null,
    description: row.stores?.description ?? null,
    coverUrl: row.stores?.cover_url ?? null,
    venueName: row.venue_name,
    venueAddress: row.venue_address,
    lat: row.venue_lat,
    lng: row.venue_lng,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    doorsOpenAt: row.doors_open_at,
    timezone: row.timezone,
    supportPhone: row.support_phone,
    terms: row.terms,
    cancelledAt: row.cancelled_at,
    cancelledReason: row.cancelled_reason,
    phase: phaseOf(row),
    ticketTypes: types,
    fromPrice: sellable.length ? Math.min(...sellable.map((t) => t.price)) : null,
    remaining: types.reduce((n, t) => n + t.remaining, 0),
    capacity: types.reduce((n, t) => n + t.capacity, 0),
  };
}

const SELECT =
  "store_id, starts_at, ends_at, doors_open_at, timezone, venue_name, venue_address, " +
  "venue_lat, venue_lng, support_phone, terms, cancelled_at, cancelled_reason, " +
  "stores(id, slug, name, tagline, description, cover_url, status)";

/** Everything a visitor should see on /events, soonest first. */
export async function listPublicEvents(supabase: SupabaseClient): Promise<EventSummary[]> {
  const { data, error } = await supabase
    .from("events")
    .select(SELECT)
    .order("starts_at", { ascending: true });

  if (error) {
    console.error("listPublicEvents failed", error);
    return [];
  }
  const rows = (data ?? []) as unknown as Row[];
  const visible = rows.filter((r) => r.stores?.status === "active");
  const types = await ticketTypesFor(supabase, visible.map((r) => r.store_id));
  return visible.map((r) => toSummary(r, types.get(r.store_id) ?? []));
}

export async function getPublicEvent(
  supabase: SupabaseClient,
  slug: string,
): Promise<EventSummary | null> {
  // RLS (events_public_read → store_is_visible) already hides a draft event, so
  // an unannounced slug 404s rather than leaking that it exists.
  const { data, error } = await supabase
    .from("events")
    .select(SELECT)
    .eq("stores.slug", slug)
    .limit(1);

  if (error) {
    console.error("getPublicEvent failed", error);
    return null;
  }
  const row = ((data ?? []) as unknown as Row[]).find((r) => r.stores?.slug === slug);
  if (!row) return null;
  const types = await ticketTypesFor(supabase, [row.store_id]);
  return toSummary(row, types.get(row.store_id) ?? []);
}

/** Split for the listing: what is still ahead vs what has already happened. */
export function splitByTime(events: EventSummary[]): { upcoming: EventSummary[]; past: EventSummary[] } {
  const upcoming: EventSummary[] = [];
  const past: EventSummary[] = [];
  for (const e of events) {
    if (e.phase === "ended") past.push(e);
    else upcoming.push(e);
  }
  return { upcoming, past: past.reverse() };
}
