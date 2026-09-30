import { describe, expect, it } from "vitest";
import { curateDestination, totalMb, type Candidate } from "./curate";
import { DESTINATIONS, HOME_CODE, WORLD_DESTINATIONS, destinationBySlug, destinationByCode, destinationPath } from "./destinations";
import { worldFaq } from "./content";
import { esimJsonLd } from "./seo";

const RATE = 0.86;
let n = 0;
const plan = (over: Partial<Candidate>): Candidate => ({
  id: `p${++n}`,
  data_mb: 1024,
  per_day: false,
  validity_days: 7,
  country_codes: ["FR"],
  retail_eur_cents: 690,
  wholesale_usd_micros: 1_000_000,
  available: true,
  ...over,
});

describe("the destination registry", () => {
  it("has Mauritius & Rodrigues first, as the home shelf", () => {
    expect(DESTINATIONS[0].code).toBe(HOME_CODE);
    expect(WORLD_DESTINATIONS.some((d) => d.code === HOME_CODE)).toBe(false);
  });
  it("has unique codes and slugs, and no slug that shadows a static /esim route", () => {
    expect(new Set(DESTINATIONS.map((d) => d.code)).size).toBe(DESTINATIONS.length);
    expect(new Set(DESTINATIONS.map((d) => d.slug)).size).toBe(DESTINATIONS.length);
    for (const d of DESTINATIONS) {
      expect(d.code).toMatch(/^[A-Z]{2}$/);
      expect(d.slug).toMatch(/^[a-z-]+$/);
      expect(["order"]).not.toContain(d.slug);
    }
  });
  it("writes French with its preposition, never a bare 'en' before a feminine article", () => {
    for (const d of DESTINATIONS) {
      expect(d.frIn).toMatch(/^(à|au|aux|en) /);
      expect(d.frIn).not.toMatch(/^en (La|Le|Les) /);
    }
    expect(destinationByCode("RE")!.frIn).toBe("à La Réunion");
    expect(destinationByCode("SC")!.frIn).toBe("aux Seychelles");
  });
  it("routes the home shelf to its own pages", () => {
    const mu = destinationByCode("MU")!;
    expect(destinationPath(mu, "en")).toBe("/esim");
    expect(destinationPath(mu, "fr")).toBe("/fr/esim-maurice-rodrigues");
    expect(destinationPath(destinationBySlug("france")!, "fr")).toBe("/fr/esim/france");
  });
});

describe("curateDestination", () => {
  it("never curates Mauritius — that shelf is the owner's and bound by the Rodrigues rule", () => {
    expect(curateDestination("MU", [plan({ country_codes: ["MU"] })], RATE)).toEqual([]);
  });

  it("picks the cheapest plan for each trip shape, from plans that work there and make money", () => {
    const small = plan({ data_mb: 1024, validity_days: 7, retail_eur_cents: 590, wholesale_usd_micros: 1_000_000 });
    const daily = plan({ data_mb: 1024, per_day: true, validity_days: 7, retail_eur_cents: 990, wholesale_usd_micros: 4_550_000 });
    const big = plan({ data_mb: 10240, validity_days: 30, retail_eur_cents: 4290, wholesale_usd_micros: 34_000_000, country_codes: ["FR", "MU", "ZA"] });
    const elsewhere = plan({ country_codes: ["DE"], retail_eur_cents: 100 });
    const lossMaker = plan({ data_mb: 3072, validity_days: 30, retail_eur_cents: 400, wholesale_usd_micros: 9_000_000 });
    const withdrawn = plan({ data_mb: 5120, validity_days: 30, retail_eur_cents: 700, available: false });
    const picks = curateDestination("FR", [small, daily, big, elsewhere, lossMaker, withdrawn], RATE);
    const ids = picks.map((p) => p.planId);
    expect(ids).toEqual([small.id, daily.id, big.id]);
    expect(ids).not.toContain(elsewhere.id);
    expect(ids).not.toContain(lossMaker.id);
    expect(ids).not.toContain(withdrawn.id);
  });

  it("drops a pick another pick beats on every axis", () => {
    const worse = plan({ data_mb: 1024, validity_days: 7, retail_eur_cents: 990, wholesale_usd_micros: 2_000_000 });
    const better = plan({ data_mb: 3072, validity_days: 30, retail_eur_cents: 790, wholesale_usd_micros: 2_000_000 });
    const picks = curateDestination("FR", [worse, better], RATE);
    expect(picks.map((p) => p.planId)).toEqual([better.id]);
  });

  it("keeps ONE of two identical packages instead of losing both", () => {
    // The wholesaler lists "JP_3_30" and "JP_3_30_IIJ" at the same price.
    const a = plan({ country_codes: ["JP"], data_mb: 3072, validity_days: 30, retail_eur_cents: 390, wholesale_usd_micros: 1_800_000 });
    const b = plan({ country_codes: ["JP"], data_mb: 3072, validity_days: 30, retail_eur_cents: 390, wholesale_usd_micros: 1_800_000 });
    expect(curateDestination("JP", [a, b], RATE)).toHaveLength(1);
  });

  it("gives factual badges only — never a popularity claim", () => {
    const small = plan({ retail_eur_cents: 590 });
    const daily = plan({ data_mb: 1024, per_day: true, validity_days: 7, retail_eur_cents: 990, wholesale_usd_micros: 4_550_000 });
    const big = plan({ data_mb: 10240, validity_days: 30, retail_eur_cents: 4290, wholesale_usd_micros: 34_000_000 });
    const picks = curateDestination("FR", [small, daily, big], RATE);
    expect(picks.some((p) => p.badge === "popular")).toBe(false);
    // 7 GB for €9.90 is the lowest price per GB on this shelf.
    expect(picks.find((p) => p.planId === daily.id)?.badge).toBe("best_value");
    expect(picks.find((p) => p.planId === small.id)?.badge).toBe("short_trip");
    expect(picks.find((p) => p.planId === big.id)?.badge).toBe("long_stay");
  });

  it("counts a day pass's allowance for every day", () => {
    expect(totalMb({ data_mb: 1024, per_day: true, validity_days: 7 })).toBe(7168);
    expect(totalMb({ data_mb: 1024, per_day: false, validity_days: 7 })).toBe(1024);
  });
});

describe("a destination page's facts", () => {
  const fr = { name: "France", inPlace: "in France" };
  it("names the networks and the price it is given, and invents neither", () => {
    const faq = worldFaq("en", fr, "€5.90", ["Orange", "SFR", "Bouygues"]);
    expect(faq[0].a).toContain("Orange, SFR and Bouygues in France");
    expect(faq[1].a).toContain("€5.90");
    const bare = worldFaq("en", fr, null, []);
    expect(bare.map((f) => f.a).join(" ")).not.toMatch(/€\d/);
    expect(bare[0].a).toContain("local 4G/5G networks");
  });
  it("never repeats the Rodrigues network claims on another country's page", () => {
    const text = worldFaq("en", fr, "€5.90", ["Orange"]).map((f) => `${f.q} ${f.a}`).join(" ");
    expect(text).not.toMatch(/Chili|my\.t|Emtel|Rodrigues Island/);
  });
  it("is French in French", () => {
    const faq = worldFaq("fr", { name: "La Réunion", inPlace: "à La Réunion" }, "12,90 €", ["Orange"]);
    expect(faq[0].q).toBe("Quelle eSIM choisir à La Réunion ?");
    expect(faq[1].a).toContain("12,90 €");
  });
  it("gives each destination its own Product, breadcrumbed under the home store", () => {
    const ld = esimJsonLd({
      lang: "en",
      url: "https://roulerodrig.com/esim/france",
      plans: [{ id: "a", data_mb: 1024, per_day: true, validity_days: 7, retail_eur_cents: 990 }],
      faq: worldFaq("en", fr, "€9.90", []),
      selling: true,
      place: fr,
    });
    const product = ld.find((x) => x["@type"] === "Product")!;
    expect(product.name).toBe("France eSIM");
    const crumbs = JSON.stringify(ld.find((x) => x["@type"] === "BreadcrumbList"));
    expect(crumbs).toContain("Mauritius & Rodrigues eSIM");
    expect(crumbs).toContain("France eSIM");
  });
});
