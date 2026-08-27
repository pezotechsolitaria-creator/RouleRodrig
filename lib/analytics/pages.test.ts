import { describe, it, expect } from "vitest";
import {
  normalisePath,
  sectionOf,
  rollUp,
  buildReport,
  buildPageviewQuery,
  parseResults,
} from "./pages";

describe("a page is a page, not a URL", () => {
  it("collapses ids so one page is one row", () => {
    // The failure this prevents: a thousand delivery requests, each one view,
    // burying the page they all belong to.
    expect(normalisePath("/deliver/8f3c1a2b-4d5e-6f70-8192-a3b4c5d6e7f8")).toBe(
      "/deliver/:id",
    );
    expect(normalisePath("/events/12345")).toBe("/events/:id");
    expect(normalisePath("/taxi/track?ref=RR-4F2A91")).toBe("/taxi/track");
  });

  it("collapses long slugs, which are content rather than structure", () => {
    expect(
      normalisePath("/blog/how-many-days-should-i-spend-in-rodrigues"),
    ).toBe("/blog/:slug");
  });

  it("does not mangle real section names", () => {
    // "scooter" and "car" are short and unhyphenated; they must survive.
    expect(normalisePath("/browse/scooter")).toBe("/browse/scooter");
    expect(normalisePath("/taxi/book")).toBe("/taxi/book");
    expect(normalisePath("/fr/location-scooter-rodrigues")).toBe(
      "/fr/location-scooter-rodrigues",
    );
  });

  it("survives the rubbish that arrives from real analytics", () => {
    expect(normalisePath("")).toBe("/");
    expect(normalisePath("/")).toBe("/");
    expect(normalisePath("food")).toBe("/food");
    expect(normalisePath("/food/")).toBe("/food");
    expect(normalisePath("/food//")).toBe("/food");
  });
});

describe("sections are parts of the business", () => {
  it("keeps booking apart from browsing", () => {
    // The distinction the owner acts on: a busy directory with an empty
    // booking flow is a completely different problem from a quiet directory.
    expect(sectionOf("/taxi")).toBe("Taxi directory");
    expect(sectionOf("/taxi/book")).toBe("Taxi & transfer booking");
    expect(sectionOf("/transfers")).toBe("Taxi & transfer booking");
    expect(sectionOf("/taxi/track")).toBe("Ride tracking");
  });

  it("names the rest of the marketplace", () => {
    expect(sectionOf("/")).toBe("Home");
    expect(sectionOf("/deliver")).toBe("Ti Roulé delivery");
    expect(sectionOf("/food/some-kitchen")).toBe("Food");
    expect(sectionOf("/browse/scooter")).toBe("Scooters");
    expect(sectionOf("/guide/beaches")).toBe("Guides & planning");
    expect(sectionOf("/fr/location-scooter-rodrigues")).toBe(
      "French landing pages",
    );
  });

  it("puts anything unrecognised somewhere visible rather than dropping it", () => {
    expect(sectionOf("/something-new")).toBe("Other");
  });
});

describe("rolling up", () => {
  const rows = [
    { path: "/taxi", views: 100, visitors: 60 },
    { path: "/taxi/reviews", views: 20, visitors: 15 },
    { path: "/deliver", views: 40, visitors: 30 },
    { path: "/deliver/abc-1234-5678-9012-345678901234", views: 5, visitors: 4 },
  ];

  it("adds views but never adds visitors", () => {
    // Summing visitors across paths double-counts the same person and inflates
    // reach — which is the number an owner would quote to a partner.
    const taxi = rollUp(rows).find((s) => s.section === "Taxi directory")!;
    expect(taxi.views).toBe(120);
    expect(taxi.visitors).toBe(60);
  });

  it("attaches enquiries only where a section can produce them", () => {
    const out = rollUp(rows, { taxi: 6 });
    const taxi = out.find((s) => s.section === "Taxi directory")!;
    expect(taxi.leads).toBe(6);
    expect(taxi.leadsPerHundred).toBe(5);
  });

  it("says NOTHING rather than zero where enquiries are not measured", () => {
    // "We do not measure this" and "nobody enquired" are different facts, and
    // printing 0% for the first is a lie the owner would act on.
    const deliver = rollUp(rows, {}).find(
      (s) => s.section === "Ti Roulé delivery",
    )!;
    expect(deliver.leadsPerHundred).toBeNull();
  });

  it("orders by views, busiest first", () => {
    const out = rollUp(rows);
    expect(out[0].section).toBe("Taxi directory");
  });
});

describe("the report the owner reads", () => {
  const many = [
    { path: "/", views: 900, visitors: 700 },
    { path: "/taxi", views: 400, visitors: 300 },
    { path: "/food", views: 300, visitors: 200 },
    { path: "/deliver", views: 120, visitors: 90 },
    { path: "/browse/scooter", views: 60, visitors: 50 },
    { path: "/guide/beaches", views: 12, visitors: 10 },
  ];

  it("counts everything it was given", () => {
    const r = buildReport(many, {}, 30);
    expect(r.totalViews).toBe(1792);
    expect(r.windowDays).toBe(30);
  });

  it("shows the busiest and the quietest, and they are not the same list", () => {
    const r = buildReport(many, {}, 30);
    expect(r.busiest[0].section).toBe("Home");
    expect(r.quietest[0].section).toBe("Guides & planning");
  });

  it("never lists a section with no views as 'quiet'", () => {
    // A page nobody reached is usually a page nobody CAN reach — a navigation
    // fault, not a content one. Mixing the two hides both.
    const r = buildReport(
      [...many, { path: "/shop", views: 0, visitors: 0 }],
      {},
      30,
    );
    expect(r.quietest.every((s) => s.views > 0)).toBe(true);
  });

  it("finds attention that produced nothing, which is the point of the screen", () => {
    // /taxi is heavily visited and, with no taxi leads, earned nothing.
    const r = buildReport(many, { taxi: 0, food_concierge: 9 }, 30);
    const names = r.attentionWithoutAction.map((s) => s.section);
    expect(names).toContain("Taxi directory");
    expect(names).not.toContain("Food");
  });

  it("does not accuse a section that barely anybody saw", () => {
    // Zero enquiries from twelve views is not a finding, it is a small number.
    const r = buildReport(many, {}, 30);
    expect(r.attentionWithoutAction.map((s) => s.section)).not.toContain(
      "Guides & planning",
    );
  });

  it("copes with an empty week", () => {
    const r = buildReport([], {}, 7);
    expect(r.totalViews).toBe(0);
    expect(r.busiest).toEqual([]);
    expect(r.quietest).toEqual([]);
    expect(r.attentionWithoutAction).toEqual([]);
  });
});

describe("the query", () => {
  it("asks for pathnames and counts, and nothing about anybody", () => {
    const q = buildPageviewQuery(30);
    expect(q).toContain("$pageview");
    expect(q).toContain("properties.$pathname");
    expect(q).toContain("INTERVAL 30 DAY");
    // No customer data crosses the wire in either direction. Matched on whole
    // words: "$pathname" contains "name" and is exactly what we DO want.
    expect(q).not.toMatch(/email|phone|\$ip|person\.properties/i);
  });

  it("clamps a silly window instead of trusting the caller", () => {
    expect(buildPageviewQuery(0)).toContain("INTERVAL 1 DAY");
    expect(buildPageviewQuery(99999)).toContain("INTERVAL 365 DAY");
    expect(buildPageviewQuery(30, 99999)).toContain("LIMIT 1000");
  });

  it("cannot be steered by its arguments", () => {
    // The window is interpolated into SQL, so it must be a number by the time
    // it lands there — a string would be an injection.
    const q = buildPageviewQuery(Number("7; DROP TABLE events") || 7);
    expect(q).not.toMatch(/DROP/i);
  });
});

describe("reading PostHog's answer", () => {
  it("turns positional arrays into rows", () => {
    expect(parseResults([["/food", 10, 8]])).toEqual([
      { path: "/food", views: 10, visitors: 8 },
    ]);
  });

  it("throws nothing away quietly except what it cannot use", () => {
    const out = parseResults([
      ["/food", 10, 8],
      ["", 5, 5],
      null,
      ["/taxi"],
      ["/taxi", "x", null],
    ]);
    expect(out).toEqual([
      { path: "/food", views: 10, visitors: 8 },
      { path: "/taxi", views: 0, visitors: 0 },
    ]);
  });

  it("does not explode when PostHog answers with something unexpected", () => {
    expect(parseResults(null)).toEqual([]);
    expect(parseResults({ error: "nope" })).toEqual([]);
    expect(parseResults("")).toEqual([]);
  });
});
