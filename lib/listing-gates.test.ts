import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MetadataRoute } from "next";
import { DEFAULT_CONTENT } from "@/lib/defaults";
import type { RecommendedPlace, SiteContent } from "@/lib/defaults";
import {
  contentWasRead,
  eventsPageItemCount,
  knownPublicEventCount,
  recommendedCount,
  robotsWhileEmpty,
} from "./listing-gates";

// ── EMPTY LISTING PAGES LEAVE THE INDEX; UNKNOWN ONES DO NOT (C16/T4) ───────
//
// SEO audit 2026-09-29: /events, /shop, /marketplace/wash and
// /experiences/chauffeur were in the sitemap and indexable while each said
// "nothing here yet" — soft 404s. They now leave the sitemap and send
// `noindex, follow` while KNOWN to be empty, and come back on their own.
//
// The half that is easy to get wrong is "known". listPublicEvents() answers []
// on a failed read, getContent() answers its defaults (no listings at all), and
// a DB hiccup must never de-index a page that has something on it. So each
// gate is driven here both ways — empty, and failed — through the real
// sitemap() and the real generateMetadata() of each page, with only the
// database replaced.

type Result = { data?: unknown; error?: unknown; count?: number | null };

const db = vi.hoisted(() => ({
  tables: {} as Record<string, Result>,
  single: {} as Record<string, Result>,
  rpc: {} as Record<string, Result>,
  events: [] as unknown[],
  content: null as unknown,
}));

function fakeClient() {
  const builder = (table: string) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "order", "limit", "not", "is", "gt"]) q[m] = () => q;
    q.maybeSingle = async () => db.single[table] ?? { data: null, error: null };
    q.then = (ok: (r: Result) => unknown, bad?: (e: unknown) => unknown) =>
      Promise.resolve(db.tables[table] ?? { data: [], error: null }).then(ok, bad);
    return q;
  };
  return {
    from: builder,
    rpc: (name: string) => {
      const r = Promise.resolve(db.rpc[name] ?? { data: [], error: null });
      return Object.assign(r, { maybeSingle: () => r });
    },
    auth: { getUser: async () => ({ data: { user: null } }) },
  };
}

vi.mock("@/lib/supabase/anon", () => ({ createAnonClient: () => fakeClient() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fakeClient() }));
vi.mock("@/lib/events/queries", async (orig) => ({
  ...(await orig<typeof import("@/lib/events/queries")>()),
  listPublicEvents: async () => db.events,
}));
vi.mock("@/lib/food/queries", async (orig) => ({
  ...(await orig<typeof import("@/lib/food/queries")>()),
  listFoodSlugs: async () => [],
}));
vi.mock("@/lib/content", async (orig) => ({
  ...(await orig<typeof import("@/lib/content")>()),
  getContent: async () => db.content,
}));
vi.mock("@/lib/site-data", async (orig) => ({
  ...(await orig<typeof import("@/lib/site-data")>()),
  getFleetView: async () => ({ content: db.content, fleet: [], recentBookings: {} }),
}));

const place = (over: Partial<RecommendedPlace>): RecommendedPlace =>
  ({ id: "x", category: "activity", name: "x", description: "", image: "/x.jpg", ...over }) as RecommendedPlace;

/** A site whose row was read: a boat trip and a massage, no chauffeur. */
const READ: SiteContent = {
  ...DEFAULT_CONTENT,
  events: [],
  recommended: {
    ...DEFAULT_CONTENT.recommended,
    items: [
      place({ id: "rec-balade", name: "Balade en mer", serviceType: "boat", priceNote: "Rs 700 per person" }),
      place({ id: "rec-spa", name: "Rituel Signature", serviceType: "massage" }),
    ],
  },
};

/** What getContent() answers when the read fails: the defaults. */
const FELL_BACK: SiteContent = { ...DEFAULT_CONTENT };

beforeEach(() => {
  db.tables = {
    events: { count: 0, error: null },
    trade_providers: { data: [], error: null },
  };
  db.single = {};
  db.rpc = { sitemap_stores: { data: [], error: null } };
  db.events = [];
  db.content = READ;
});

const urls = async () => {
  const { default: sitemap } = await import("@/app/sitemap");
  return ((await sitemap()) as MetadataRoute.Sitemap).map((e) => e.url.replace(/^https?:\/\/[^/]+/, ""));
};

describe("the rule, as functions", () => {
  it("noindexes only a count that is known to be zero", () => {
    expect(robotsWhileEmpty(0)).toEqual({ robots: { index: false, follow: true } });
    expect(robotsWhileEmpty(3)).toEqual({});
    expect(robotsWhileEmpty(null)).toEqual({});
  });

  it("counts titled notices and events, and treats an unknown side as unknown", () => {
    expect(eventsPageItemCount(0, [{ title: "" }, { title: "  " }])).toBe(0);
    expect(eventsPageItemCount(2, [{ title: "Market day" }])).toBe(3);
    expect(eventsPageItemCount(null, [])).toBeNull();
    expect(eventsPageItemCount(0, null)).toBeNull();
    // What WAS read still proves the page has something on it.
    expect(eventsPageItemCount(null, [{ title: "Market day" }])).toBe(1);
    expect(eventsPageItemCount(2, null)).toBe(2);
  });

  it("recognises getContent()'s defaults as unread, not as empty", () => {
    expect(contentWasRead(READ)).toBe(true);
    expect(contentWasRead(FELL_BACK)).toBe(false);
    expect(recommendedCount(READ, [])).toBe(0);
    expect(recommendedCount(FELL_BACK, [])).toBeNull();
  });

  it("re-checks an empty events list before trusting it", async () => {
    const client = fakeClient() as unknown as SupabaseClient;
    db.tables.events = { count: 0, error: null };
    expect(await knownPublicEventCount(client, 0)).toBe(0);
    db.tables.events = { count: null, error: { message: "timeout" } };
    expect(await knownPublicEventCount(client, 0)).toBeNull();
    // The table has rows the list did not return: the list failed.
    db.tables.events = { count: 2, error: null };
    expect(await knownPublicEventCount(client, 0)).toBeNull();
    expect(await knownPublicEventCount(client, 4)).toBe(4);
  });
});

describe("the sitemap", () => {
  it("drops the four empty listing pages while they are known to be empty", async () => {
    const u = await urls();
    expect(u).not.toContain("/events");
    expect(u).not.toContain("/shop");
    expect(u).not.toContain("/marketplace/wash");
    expect(u).not.toContain("/experiences/chauffeur");
    // …and keeps the verticals that have a listing.
    expect(u).toContain("/experiences/boat");
    expect(u).toContain("/experiences/massage");
    expect(u).toContain("/marketplace");
  });

  it("lists each one again once it has something on it", async () => {
    db.events = [{ slug: "sega-night", name: "Sega night" }];
    db.rpc.sitemap_stores = { data: [{ slug: "miel-rodrigues", updated_at: null }], error: null };
    db.tables.trade_providers = {
      data: [{ store_id: "s1", trade: "Car wash and valeting", mobile: true, takes_online_bookings: true }],
      error: null,
    };
    db.tables.marketplace_stores = {
      data: [{ id: "s1", name: "Shine", slug: "shine", tagline: null, address: null, phone: null, logo_url: null }],
      error: null,
    };
    const u = await urls();
    expect(u).toContain("/events");
    expect(u).toContain("/events/sega-night");
    expect(u).toContain("/shop");
    expect(u).toContain("/shop/miel-rodrigues");
    expect(u).toContain("/marketplace/wash");
  });

  it("lists /events for a titled notice even with no ticketed event", async () => {
    db.content = { ...READ, events: [{ id: "n1", title: "Festival Kreol" }] };
    expect(await urls()).toContain("/events");
  });

  it("keeps every page listed when the reads FAIL rather than come back empty", async () => {
    db.tables.events = { count: null, error: { message: "timeout" } };
    db.rpc.sitemap_stores = { data: null, error: { message: "timeout" } };
    db.tables.trade_providers = { data: null, error: { message: "timeout" } };
    db.content = FELL_BACK;
    const u = await urls();
    expect(u).toContain("/events");
    expect(u).toContain("/shop");
    expect(u).toContain("/marketplace/wash");
    expect(u).toContain("/experiences/chauffeur");
    expect(u).toContain("/experiences/boat");
  });
});

describe("each page's robots agrees with its sitemap entry", () => {
  it("/events: noindex, follow only while known empty", async () => {
    const { generateMetadata } = await import("@/app/events/page");
    expect((await generateMetadata()).robots).toEqual({ index: false, follow: true });

    db.tables.events = { count: null, error: { message: "timeout" } };
    expect((await generateMetadata()).robots).toBeUndefined();

    db.tables.events = { count: 0, error: null };
    db.content = FELL_BACK;
    expect((await generateMetadata()).robots).toBeUndefined();
  });

  it("/shop: noindex while sitemap_stores() lists nothing, indexable when it fails", async () => {
    const { generateMetadata } = await import("@/app/shop/page");
    expect((await generateMetadata()).robots).toEqual({ index: false, follow: true });
    db.rpc.sitemap_stores = { data: null, error: { message: "timeout" } };
    expect((await generateMetadata()).robots).toBeUndefined();
    db.rpc.sitemap_stores = { data: [{ slug: "a" }], error: null };
    expect((await generateMetadata()).robots).toBeUndefined();
  });

  it("/marketplace/wash: noindex while nobody is listed, indexable when a read fails", async () => {
    const { generateMetadata } = await import("@/app/marketplace/wash/page");
    expect((await generateMetadata()).robots).toEqual({ index: false, follow: true });
    db.tables.trade_providers = { data: null, error: { message: "timeout" } };
    expect((await generateMetadata()).robots).toBeUndefined();
    // Providers exist but their shops could not be read: unknown, not empty.
    db.tables.trade_providers = {
      data: [{ store_id: "s1", trade: "Car wash and valeting", mobile: true, takes_online_bookings: true }],
      error: null,
    };
    db.tables.marketplace_stores = { data: null, error: { message: "timeout" } };
    expect((await generateMetadata()).robots).toBeUndefined();
  });
});

describe("/marketplace no longer offers a car wash in its snippet", () => {
  it("says what can be done today", async () => {
    // generateMetadata since the shops clause is gated on sitemap_stores()
    // too — see app/marketplace/marketplace-snippet.test.ts.
    const { generateMetadata } = await import("@/app/marketplace/page");
    expect(String((await generateMetadata()).description)).not.toMatch(/car wash/i);
  });
});
