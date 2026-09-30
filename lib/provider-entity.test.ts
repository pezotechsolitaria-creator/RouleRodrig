import { describe, it, expect, vi } from "vitest";
import { type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_CONTENT } from "@/lib/defaults";
import { SITE_URL } from "@/lib/site";

// ── ONE BUSINESS, NOT A SECOND ANONYMOUS ONE (SEO audit 2026-09-29 T9) ──────
//
// /fr/manger-a-rodrigues named its provider as {"@type":"Organization",
// "name":"Roulé Rodrigues"} — no @id, the accented spelling, a second entity
// beside the #business node that sameAs and hasMap consolidate. And every
// event page named the business as organizer, which it never is: an event's
// organiser is event data, not a Roule Rodrigues account
// (lib/events/platform-merchant.ts), and the public event read carries no
// organiser name. These render both pages and read the JSON-LD back.

vi.mock("@/lib/site-data", async (orig) => ({
  ...(await orig<typeof import("@/lib/site-data")>()),
  getFleetView: async () => ({ content: DEFAULT_CONTENT, fleet: [], recentBookings: {}, businessWhatsApp: null }),
}));
vi.mock("@/components/Navbar", () => ({ default: () => null }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/events/queries", async (orig) => ({
  ...(await orig<typeof import("@/lib/events/queries")>()),
  getPublicEvent: async () => ({
    storeId: "s1",
    slug: "sega-night",
    name: "Sega night",
    tagline: null,
    description: null,
    coverUrl: null,
    venueName: "Port Mathurin",
    venueAddress: null,
    lat: null,
    lng: null,
    startsAt: "2026-10-10T18:00:00+04:00",
    endsAt: null,
    doorsOpenAt: null,
    timezone: "Indian/Mauritius",
    supportPhone: null,
    terms: null,
    cancelledAt: null,
    cancelledReason: null,
    phase: "upcoming",
    ticketTypes: [],
    fromPrice: null,
    remaining: 0,
    capacity: 0,
  }),
}));
vi.mock("@/components/events/EventDetail", () => ({ default: () => null }));
vi.mock("@/components/events/EventsBackBar", () => ({ default: () => null }));

type Node = Record<string, unknown>;

function graph(html: string): Node[] {
  const out: Node[] = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    const doc = JSON.parse(m[1]) as Node;
    const nodes = Array.isArray(doc["@graph"]) ? (doc["@graph"] as Node[]) : [doc];
    out.push(...nodes);
  }
  return out;
}

describe("/fr/manger-a-rodrigues", async () => {
  const { default: Page } = await import("@/app/fr/manger-a-rodrigues/page");
  const html = renderToStaticMarkup((await Page()) as ReactElement);
  const nodes = graph(html);

  it("points its Service at the business by @id", () => {
    const service = nodes.find((n) => n["@type"] === "Service")!;
    expect(service.provider).toEqual({ "@id": `${SITE_URL}/#business` });
  });

  it("carries the node that @id resolves to, under the schema.org vocabulary", () => {
    const business = nodes.find((n) => n["@id"] === `${SITE_URL}/#business`)!;
    expect(business).toBeDefined();
    expect(business["@context"]).toBe("https://schema.org");
    expect(business.name).toBe("Roule Rodrigues");
  });

  it("never names the business with the accent outside its alternateName", () => {
    const text = html.replace(/<script[\s\S]*?<\/script>/g, "");
    expect(text).not.toContain("Roulé Rodrigues");
    const withoutAlias = JSON.stringify(nodes, (key, value) =>
      key === "alternateName" ? undefined : value,
    );
    expect(withoutAlias).not.toContain("Roulé Rodrigues");
  });
});

describe("an event page", async () => {
  const { default: Page } = await import("@/app/events/[slug]/page");
  const html = renderToStaticMarkup(
    (await Page({ params: Promise.resolve({ slug: "sega-night" }) })) as ReactElement,
  );

  it("claims no organizer: the business never is one, and no organiser name is read", () => {
    const event = graph(html).find((n) => n["@type"] === "Event")!;
    expect(event).toBeDefined();
    expect(event.organizer).toBeUndefined();
    expect(JSON.stringify(event)).not.toContain("Roul");
  });
});
