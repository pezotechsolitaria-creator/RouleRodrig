import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { DEFAULT_CONTENT, type SiteContent } from "@/lib/defaults";

// ── /llms.txt AND /llms-full.txt, AS SERVED (SEO audit 2026-09-29 C8, T20) ──
//
// The real route handlers, with the reads faked: text/plain, the live figures
// in, and — the promise that matters for a file cached an hour and quoted by
// assistants — a failed or seed read still answers 200 with a useful file and
// no invented number. The middleware is asked too, since it matches every
// path but /api and _next.

const state = vi.hoisted(() => ({ content: "live" as "live" | "seed" | "throws" }));

vi.mock("@/lib/content", async () => {
  const { DEFAULT_CONTENT } = await import("@/lib/defaults");
  const live = {
    ...DEFAULT_CONTENT,
    fleet: [{ ...DEFAULT_CONTENT.fleet[0], id: "t1", category: "scooter", price: "From Rs 747(free delivery)" }],
    contact: { ...DEFAULT_CONTENT.contact, phone: "+230 5835 5588", hours: "Open 24 hours, every day" },
  };
  return {
    getContent: async () => {
      if (state.content === "throws") throw new Error("site_content unreachable");
      return state.content === "seed" ? DEFAULT_CONTENT : live;
    },
  };
});
vi.mock("@/lib/rides/fares", async () => {
  const { SHEET } = await import("@/test/transfer-sheet.fixture");
  return { readTransferFares: async () => ({ airport: SHEET, ferry: null }) };
});
vi.mock("@/lib/supabase/anon", () => ({ createAnonClient: () => ({}) }));
vi.mock("@/lib/food/queries", () => ({
  getFoodHome: async () => ({
    kitchens: [{ name: "Chez Banane", address: "Rivière Banane", minNoticeHours: 24 }],
    deliveryEnabled: false,
  }),
  browseFood: async () => ({ items: [{ price: 131300 }] }),
}));
vi.mock("@/lib/events/queries", () => ({ listPublicEvents: async () => [] }));

import { GET as getIndex } from "@/app/llms.txt/route";
import { GET as getFull } from "@/app/llms-full.txt/route";
import { middleware } from "@/middleware";
import { isSeedContent } from "./llms-txt";

beforeEach(() => {
  state.content = "live";
});

describe("the routes serve plain text", () => {
  it("/llms.txt answers 200, text/plain; charset=utf-8, with the live figures", async () => {
    const res = await getIndex();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    const body = await res.text();
    expect(body).toMatch(/^# Roule Rodrigues\n/);
    expect(body).toContain("/transfers)");
    expect(body).toContain("from Rs 747/day");
    expect(body).toContain("Rs 1,111 up to 6 km");
    expect(body).toContain("Chez Banane at Rivière Banane");
    expect(body).toContain("dishes Rs 1,313");
    expect(body).not.toContain("/events)");
  });

  it("/llms-full.txt answers 200, text/plain; charset=utf-8, with the FAQs", async () => {
    const res = await getFull();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    const body = await res.text();
    expect(body).toContain("### How much does a taxi cost on Rodrigues?");
    expect(body).toContain("### How much is a transfer from Plaine Corail airport?");
  });
});

describe("a failed read is never a 500, and never an invented number", () => {
  it("serves the site map without a figure when the content row cannot be read", async () => {
    state.content = "throws";
    const res = await getIndex();
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("/browse/scooter)");
    expect(body).not.toContain("from Rs");
    // The price sheet is its own read, and it still answers.
    expect(body).toContain("Rs 1,111 up to 6 km");
    expect((await getFull()).status).toBe(200);
  });

  it("treats getContent()'s seed fallback as no read: no seed price, phone or hours", async () => {
    state.content = "seed";
    expect(isSeedContent(DEFAULT_CONTENT as SiteContent)).toBe(true);
    const body = await (await getIndex()).text();
    for (const f of DEFAULT_CONTENT.fleet) expect(body).not.toContain(f.price);
    expect(body).not.toContain("5XXX");
    expect(body).not.toContain(DEFAULT_CONTENT.contact.hours);
  });
});

describe("middleware.ts lets both paths through untouched", () => {
  it.each(["/llms.txt", "/llms-full.txt"])("%s falls through to the route", async (path) => {
    const req = new NextRequest(`https://roulerodrig.com${path}`, { headers: { host: "roulerodrig.com" } });
    const res = await middleware(req);
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(res.headers.get("location")).toBeNull();
  });
});
