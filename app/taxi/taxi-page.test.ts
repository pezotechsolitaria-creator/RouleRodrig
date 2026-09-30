import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SITE_URL } from "@/lib/site";

// ── /taxi, AS A CRAWLER RECEIVES IT (SEO audit 2026-09-29 C23, C2, T9) ─────
//
// The page was "use client" and fetched its drivers from /api/taxi, which
// robots.txt disallows: the SSR HTML said "Loading drivers…" and no crawler
// ever saw a driver. Its FAQ said there was no fixed price list while
// /transfers published zone fares. These render the real server page — the
// wrapper that reads public_taxi_drivers() and the price sheet, and the client
// directory it hands them to — and read the HTML back.
//
// The Supabase client and the price sheet are faked; the sheet's numbers are
// deliberately not the live ones (test/transfer-sheet.fixture.ts).

const state = vi.hoisted(() => ({
  rpcError: null as null | { message: string },
  throws: false,
  noFares: false,
  language: "en" as "en" | "fr",
}));

const DRIVERS = [
  {
    id: "d1", name: "Jean-Marc Perrine", phone: "+230 5999 0001", whatsapp: "+230 5999 0001",
    photo: null, photos: [], vehicle: "Toyota Noah", vehicle_type: "minibus",
    languages: ["English", "French", "Creole"], areas: "Port Mathurin", notes: null,
    featured: true, seats: 7, luggage_capacity: 4, base_label: null, handles_taxi: true,
    handles_airport: true, handles_transfer: true, availability: null, created_at: "2026-01-01",
  },
  {
    id: "d2", name: "Priscilla Ravina", phone: "+230 5999 0002", whatsapp: null,
    photo: null, photos: [], vehicle: "Suzuki Swift", vehicle_type: "car",
    languages: ["French"], areas: "Mont Lubin", notes: null,
    featured: false, seats: 4, luggage_capacity: 2, base_label: null, handles_taxi: true,
    handles_airport: false, handles_transfer: false, availability: null, created_at: "2026-02-01",
  },
];

vi.mock("@/lib/supabase/anon", () => ({
  createAnonClient: () => ({
    rpc: async () => {
      if (state.throws) throw new Error("network down");
      return state.rpcError ? { data: null, error: state.rpcError } : { data: DRIVERS, error: null };
    },
    from: () => ({
      select: () => ({
        eq: async () => ({
          data: [
            { driver_id: "d1", rating: 5 },
            { driver_id: "d1", rating: 4 },
          ],
          error: null,
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/rides/fares", async () => {
  const { SHEET } = await import("@/test/transfer-sheet.fixture");
  return {
    readTransferFares: async () =>
      state.noFares ? { airport: null, ferry: null } : { airport: SHEET, ferry: null },
  };
});

vi.mock("@/context/LanguageContext", async () => {
  const { translations } = await import("@/lib/i18n");
  return {
    useLanguage: () => ({
      language: state.language,
      t: translations[state.language],
      setLanguage: () => {},
      hasChosen: false,
      forceLanguage: () => {},
    }),
  };
});
vi.mock("next/link", () => ({
  default: ({ href, children, className, hrefLang }: Record<string, unknown>) =>
    createElement("a", { href, className, hrefLang }, children as never),
}));
vi.mock("@/components/AppPageHeader", () => ({ default: () => null }));

import TaxiPage from "./page";
import TaxiDirectory from "./TaxiDirectory";

async function render(): Promise<string> {
  return renderToStaticMarkup(await TaxiPage());
}

const text = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

/** Every JSON-LD node on the page, @graph unwrapped. */
function nodes(html: string): Record<string, unknown>[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap(
    (m) => {
      const j = JSON.parse(m[1]) as Record<string, unknown>;
      return (j["@graph"] as Record<string, unknown>[] | undefined) ?? [j];
    },
  );
}

beforeEach(() => {
  state.rpcError = null;
  state.throws = false;
  state.noFares = false;
  state.language = "en";
});

describe("the driver list is in the HTML (C23)", () => {
  it("names each driver, their vehicle and languages, instead of 'Loading drivers…'", async () => {
    const t = text(await render());
    expect(t).not.toContain("Loading drivers");
    expect(t).toContain("Jean-Marc Perrine");
    expect(t).toContain("Toyota Noah");
    expect(t).toContain("English · French · Creole");
    expect(t).toContain("Priscilla Ravina");
    expect(t).toContain("Suzuki Swift");
  });

  it("spells the brand unaccented in every rendered sentence (C17)", async () => {
    // It rendered "Roulé Rodrigues" three times here; the accented form
    // survives only as the schema's alternateName.
    for (const lang of ["en", "fr"] as const) {
      state.language = lang;
      expect(text(await render())).not.toContain("Roulé Rodrigues");
    }
  });

  it("says which drivers take airport runs, from handles_airport", async () => {
    const t = text(await render());
    const first = t.slice(t.indexOf("Jean-Marc Perrine"), t.indexOf("Priscilla Ravina"));
    const second = t.slice(t.indexOf("Priscilla Ravina"), t.indexOf("Taxis on Rodrigues — common questions"));
    expect(first).toContain("Airport transfer");
    expect(second).not.toContain("Airport transfer");
  });

  it("carries the review aggregate the API computes", async () => {
    expect(text(await render())).toContain("4.5 · 2 reviews");
  });

  it("keeps phone numbers out of the server HTML; the contact row is drawn inert", async () => {
    const html = await render();
    expect(html).not.toMatch(/5999\s?000[12]/);
    expect(html).not.toContain("tel:");
    expect(html).not.toContain("wa.me/");
    // The row is there (so nothing jumps), hidden from assistive tech.
    expect(html).toMatch(/aria-hidden="true"[^>]*>\s*<span[^>]*>.*WhatsApp/);
  });

  it("puts the H1 on the island", async () => {
    expect(await render()).toMatch(/<h1[^>]*>Taxis in Rodrigues<\/h1>/);
  });

  it("renders as it always did when the driver read fails: the client fetch takes over", async () => {
    state.rpcError = { message: "boom" };
    let t = text(await render());
    expect(t).toContain("Loading drivers");
    expect(t).not.toContain("Jean-Marc Perrine");
    state.rpcError = null;
    state.throws = true;
    t = text(await render());
    expect(t).toContain("Loading drivers");
  });
});

describe("contact works exactly as before once /api/taxi has answered", () => {
  it("draws WhatsApp and Call as the same links, from the numbers the API returns", () => {
    const html = renderToStaticMarkup(
      createElement(TaxiDirectory, { initialDrivers: DRIVERS as never, airport: null }),
    );
    expect(html).toContain('href="tel:+23059990001"');
    expect(html).toContain(
      `href="https://wa.me/23059990001?text=${encodeURIComponent("Hi Jean-Marc Perrine, I need a taxi on Rodrigues Island 🚗")}"`,
    );
    // No WhatsApp number: the phone stands in, as it always did.
    expect(html).toContain("https://wa.me/23059990002?");
  });
});

describe("one price answer, in two parts (C2)", () => {
  it("states the sheet's zone fares, then the driver's fare for every other ride", async () => {
    const t = text(await render());
    expect(t).toContain(
      "Airport transfers have fixed fares by zone, by road from Plaine Corail: Rs 1,111 up to 6 km, Rs 1,444 over 6 and under 13 km, and Rs 1,777 for 13 km and over, for one passenger; each extra passenger adds Rs 123.",
    );
    expect(t).toContain("Port Mathurin is Rs 1,777 one way.");
    expect(t).toContain("Evening transfers (17:00–21:59) add Rs 321 per trip");
    expect(t).toContain("Night transfers (22:00–04:59) are priced by hand");
    expect(t).toContain("Every other ride: each driver sets their own fare");
    expect(t).not.toContain("no fixed price list");
  });

  it("links the answer to /transfers", async () => {
    expect(await render()).toMatch(/<a href="\/transfers"[^>]*>Airport transfer prices, by zone →<\/a>/);
  });

  it("prints no fare when the sheet could not be read, and still names the page", async () => {
    state.noFares = true;
    const t = text(await render());
    expect(t).toContain("the price list is on our airport transfers page");
    const faq = t.slice(t.indexOf("common questions"));
    expect(faq).not.toMatch(/Rs\s?\d/);
  });

  it("answers in French for a French reader, from the same sheet", async () => {
    state.language = "fr";
    const t = text(await render());
    expect(t).toContain("Cela dépend de la course.");
    expect(t).toContain("jusqu'à 6 km");
    expect(t).toContain("Pour toute autre course, chaque chauffeur fixe son propre tarif");
  });
});

describe("the markup names the one business and matches the page (T9)", () => {
  it("points the Service's provider at #business and carries that node, with a context", async () => {
    const all = nodes(await render());
    const service = all.find((n) => n["@type"] === "Service");
    expect(service?.provider).toEqual({ "@id": `${SITE_URL}/#business` });
    const seller = all.find((n) => n["@id"] === `${SITE_URL}/#business`);
    expect(seller?.["@context"]).toBe("https://schema.org");
    expect(seller?.name).toBe("Roule Rodrigues");
    expect(JSON.stringify(all)).not.toMatch(/"name":"Roulé Rodrigues"/);
  });

  it("marks up exactly the answers the reader sees", async () => {
    const html = await render();
    const faq = nodes(html).find((n) => n["@type"] === "FAQPage") as {
      mainEntity: { acceptedAnswer: { text: string } }[];
    };
    const price = faq.mainEntity[0].acceptedAnswer.text;
    expect(price).toContain("Rs 1,111 up to 6 km");
    expect(text(html)).toContain(price);
  });
});
