import { describe, it, expect } from "vitest";
import type { FleetItem, MapLocation, RecommendedPlace, RideRoute } from "@/lib/defaults";
import {
  heroImages,
  resolveCard,
  resolveWorldDoc,
  resolveMoods,
  topUpLocations,
  topUpPlaces,
  type Catalogue,
} from "./resolve";
import { cardIsLive, type WorldCard, type WorldDoc, type EditorialLabel } from "./types";
import { freshWorldDoc } from "./defaults";

// ── What these tests are actually guarding ──────────────────────────────────
//
// The Curated page's one safety property is that it cannot advertise something
// that no longer exists, and cannot leak something that is not meant to be
// public yet. Both live in this file, both are pure, and neither is visible in
// a type check — a card pointing at a deleted stay type-checks perfectly.

const place = (id: string, over: Partial<RecommendedPlace> = {}): RecommendedPlace => ({
  id,
  category: "activity",
  name: `Place ${id}`,
  description: "A description",
  image: `https://img/${id}.jpg`,
  ...over,
});

const location = (id: string, over: Partial<MapLocation> = {}): MapLocation => ({
  id,
  name: `Location ${id}`,
  description: "desc",
  category: "beach",
  lat: 0,
  lng: 0,
  image: `https://img/${id}.jpg`,
  ...over,
});

const route = (id: string, over: Partial<RideRoute> = {}): RideRoute => ({
  id,
  name: `Route ${id}`,
  description: "desc",
  distance: "12 km",
  duration: "1 hr",
  difficulty: "Easy",
  stops: "",
  mapsUrl: "",
  image: `https://img/${id}.jpg`,
  ...over,
});

const vehicle = (id: string, over: Partial<FleetItem> = {}): FleetItem => ({
  id,
  badge: "",
  name: `Vehicle ${id}`,
  tagline: "A tagline",
  description: "A description",
  unit: "day",
  price: "From Rs 699",
  image: `https://img/${id}.jpg`,
  category: "scooter",
  available: true,
  ...over,
});

const cat = (over: Partial<Catalogue> = {}): Catalogue => ({
  places: [],
  locations: [],
  routes: [],
  fleet: [],
  events: [],
  ...over,
});

const LABELS: EditorialLabel[] = [{ id: "lbl-pick", tone: "pick", text: { en: "Ti Roulé pick" } }];
const NOW = new Date("2026-08-16T12:00:00Z");

describe("resolveCard", () => {
  it("reads the name and photo from the catalogue, not from the card", () => {
    const c: WorldCard = { id: "c1", source: { kind: "place", id: "p1" } };
    const got = resolveCard(c, cat({ places: [place("p1", { name: "Renamed later" })] }), LABELS, NOW);
    expect(got?.title.en).toBe("Renamed later");
    expect(got?.image).toBe("https://img/p1.jpg");
  });

  it("DROPS a card whose listing has been deleted", () => {
    // The whole point: the page shrinks, it does not 404.
    const c: WorldCard = { id: "c1", source: { kind: "place", id: "gone" } };
    expect(resolveCard(c, cat({ places: [place("p1")] }), LABELS, NOW)).toBeNull();
  });

  it("lets the editor override the title and photo without copying the rest", () => {
    const c: WorldCard = {
      id: "c1",
      source: { kind: "location", id: "l1" },
      title: { en: "Some views are worth the climb" },
      image: "https://img/override.jpg",
    };
    const got = resolveCard(c, cat({ locations: [location("l1", { category: "viewpoint" })] }), LABELS, NOW);
    expect(got?.title.en).toBe("Some views are worth the climb");
    expect(got?.image).toBe("https://img/override.jpg");
    // …but the destination still comes from the catalogue row.
    expect(got?.href).toBe("/guide/viewpoints#l1");
  });

  it("prefers a location's story over its bare description", () => {
    const got = resolveCard(
      { id: "c1", source: { kind: "location", id: "l1" } },
      cat({ locations: [location("l1", { story: "The researched story", description: "desc" })] }),
      LABELS,
      NOW,
    );
    expect(got?.blurb?.en).toBe("The researched story");
  });

  it("attaches only labels that exist in the library", () => {
    const got = resolveCard(
      { id: "c1", source: { kind: "route", id: "r1" }, labels: ["lbl-pick", "lbl-deleted"] },
      cat({ routes: [route("r1")] }),
      LABELS,
      NOW,
    );
    expect(got?.labels.map((l) => l.id)).toEqual(["lbl-pick"]);
  });

  it("refuses an editorial link card with no title of its own", () => {
    const got = resolveCard({ id: "c1", source: { kind: "link", href: "/food" } }, cat(), LABELS, NOW);
    expect(got).toBeNull();
  });

  it("keys Favourites on the catalogue row, so it matches the rest of the site", () => {
    const got = resolveCard(
      { id: "curated-card-id", source: { kind: "place", id: "p1" } },
      cat({ places: [place("p1")] }),
      LABELS,
      NOW,
    );
    expect(got?.fav).toEqual({ type: "place", id: "p1" });
  });
});

describe("cardIsLive", () => {
  const base: WorldCard = { id: "c", source: { kind: "link", href: "/x" } };

  it("shows a card with no status at all", () => {
    expect(cardIsLive(base, NOW)).toBe(true);
  });

  it("hides a draft card", () => {
    expect(cardIsLive({ ...base, status: "draft" }, NOW)).toBe(false);
  });

  it("hides a scheduled card until its moment, then shows it", () => {
    const later = { ...base, status: "scheduled" as const, publishAt: "2026-08-16T18:00:00Z" };
    expect(cardIsLive(later, NOW)).toBe(false);
    expect(cardIsLive(later, new Date("2026-08-16T18:00:01Z"))).toBe(true);
  });

  it("hides a scheduled card with no date rather than showing it early", () => {
    expect(cardIsLive({ ...base, status: "scheduled" }, NOW)).toBe(false);
    expect(cardIsLive({ ...base, status: "scheduled", publishAt: "nonsense" }, NOW)).toBe(false);
  });
});

describe("topping a thin section up", () => {
  it("fills to the target from the catalogue", () => {
    const got = topUpPlaces([], cat({ places: [place("a"), place("b"), place("c")] }), 2);
    expect(got).toHaveLength(2);
    expect(got.every((c) => c.auto)).toBe(true);
  });

  it("never repeats something an editor already chose", () => {
    const chosen = resolveCard(
      { id: "c1", source: { kind: "place", id: "a" } },
      cat({ places: [place("a")] }),
      LABELS,
      NOW,
    )!;
    const got = topUpPlaces([chosen], cat({ places: [place("a"), place("b")] }), 2);
    expect(got).toHaveLength(2);
    expect(got.filter((c) => c.title.en === "Place a")).toHaveLength(1);
  });

  it("skips anything without a photograph — the card is the photograph", () => {
    const got = topUpPlaces([], cat({ places: [place("a", { image: "" }), place("b")] }), 5);
    expect(got.map((c) => c.title.en)).toEqual(["Place b"]);
  });

  it("puts places that have a written story first", () => {
    const got = topUpLocations(
      [],
      cat({
        locations: [location("plain"), location("told", { story: "A real story" })],
      }),
      2,
    );
    expect(got[0].title.en).toBe("Location told");
  });

  it("leaves petrol stations out of the island's highlights", () => {
    const got = topUpLocations([], cat({ locations: [location("g", { category: "gas" })] }), 3);
    expect(got).toHaveLength(0);
  });
});

describe("heroImages", () => {
  it("uses the owner's pinned stills when there are any", () => {
    const doc = { ...freshWorldDoc("curated") };
    doc.hero.images = ["https://img/pinned.jpg"];
    expect(heroImages(doc, cat({ heroImage: "https://img/site.jpg" }))).toEqual([
      "https://img/pinned.jpg",
    ]);
  });

  it("falls back to the site hero and the island's scenery, never to nothing", () => {
    const doc = freshWorldDoc("curated");
    const got = heroImages(
      doc,
      cat({
        heroImage: "https://img/site.jpg",
        locations: [location("b1"), location("v1", { category: "viewpoint" }), location("s1", { category: "shop" })],
      }),
    );
    expect(got[0]).toBe("https://img/site.jpg");
    expect(got).toContain("https://img/b1.jpg");
    // A craft shop is not hero scenery.
    expect(got).not.toContain("https://img/s1.jpg");
  });
});

describe("resolveMoods", () => {
  it("is deterministic, so the server and the browser agree", () => {
    const c = cat({ locations: [location("a"), location("b"), location("c")] });
    const moods = [
      { id: "m1", title: { en: "One" }, blurb: { en: "" }, href: "/a" },
      { id: "m2", title: { en: "Two" }, blurb: { en: "" }, href: "/b" },
    ];
    expect(resolveMoods(moods, c)).toEqual(resolveMoods(moods, c));
  });

  it("keeps a pinned photo and deals one to the rest", () => {
    const got = resolveMoods(
      [
        { id: "m1", title: { en: "One" }, blurb: { en: "" }, href: "/a", image: "https://img/mine.jpg" },
        { id: "m2", title: { en: "Two" }, blurb: { en: "" }, href: "/b" },
      ],
      cat({ locations: [location("a")] }),
    );
    expect(got[0].image).toBe("https://img/mine.jpg");
    expect(got[1].image).toBe("https://img/a.jpg");
  });

  it("leaves out a mood the editor hid", () => {
    const got = resolveMoods(
      [{ id: "m1", title: { en: "One" }, blurb: { en: "" }, href: "/a", enabled: false }],
      cat(),
    );
    expect(got).toHaveLength(0);
  });
});

describe("resolveWorldDoc", () => {
  const catalogue = cat({
    places: [place("rec-1784585562167"), place("svc-1786554105958")],
    locations: [location("loc-1"), location("loc-2", { story: "story" })],
    heroImage: "https://img/site.jpg",
  });

  it("renders the sections in the document's order, not a hard-coded one", () => {
    const doc = freshWorldDoc("curated");
    const reversed: WorldDoc = { ...doc, sections: [...doc.sections].reverse() };
    const got = resolveWorldDoc(reversed, catalogue, NOW);
    expect(got.sections[0].type).toBe("concierge");
  });

  it("leaves out a section the editor switched off", () => {
    const doc = freshWorldDoc("curated");
    doc.sections = doc.sections.map((s) =>
      s.type === "concierge" ? { ...s, enabled: false } : s,
    );
    const got = resolveWorldDoc(doc, catalogue, NOW);
    expect(got.sections.some((s) => s.type === "concierge")).toBe(false);
  });

  it("drops a card list that resolved to nothing rather than leaving a bare heading", () => {
    const doc = freshWorldDoc("curated");
    // Nothing in the catalogue and nothing to top up from: every card that
    // points at a listing disappears.
    const got = resolveWorldDoc(doc, cat(), NOW);
    expect(got.sections.some((s) => s.type === "featured")).toBe(false);

    // "Only in Rodrigues" survives, and that is correct rather than a leak: the
    // seed keeps one editorial `link` card (island cuisine → /food) which owns
    // its title and needs no catalogue row. Everything beside it is gone.
    const only = got.sections.find((s) => s.type === "onlyInRodrigues");
    expect(only?.cards.map((c) => c.href)).toEqual(["/food"]);

    // The prose sections have no catalogue dependency at all, so they stand.
    expect(got.sections.some((s) => s.type === "concierge")).toBe(true);
    expect(got.sections.some((s) => s.type === "editors")).toBe(true);
  });

  it("never returns more featured cards than the section asks for", () => {
    const doc = freshWorldDoc("curated");
    doc.sections = doc.sections.map((s) => (s.type === "featured" ? { ...s, limit: 3 } : s));
    const many = cat({ places: Array.from({ length: 20 }, (_, i) => place(`p${i}`)) });
    const got = resolveWorldDoc(doc, many, NOW);
    const featured = got.sections.find((s) => s.type === "featured");
    expect(featured?.cards.length).toBe(3);
  });
});

describe("a card can point at a vehicle", () => {
  // The original business. The first cut of the world pages had no way to put a
  // scooter or a car on them at all, which the owner spotted: a page selling
  // "the island, elevated" with no way to get around it.
  it("reads the vehicle's own name, photo and price", () => {
    const got = resolveCard(
      { id: "c1", source: { kind: "fleet", id: "burgman" } },
      cat({ fleet: [vehicle("burgman", { name: "BURGMAN 125cc", price: "From Rs 699" })] }),
      LABELS,
      NOW,
    );
    expect(got?.title.en).toBe("BURGMAN 125cc");
    expect(got?.meta?.en).toBe("From Rs 699");
    expect(got?.href).toBe("/browse/scooter");
  });

  it("sends a car to the car page, not the scooter page", () => {
    const got = resolveCard(
      { id: "c1", source: { kind: "fleet", id: "swift" } },
      cat({ fleet: [vehicle("swift", { category: "car" })] }),
      LABELS,
      NOW,
    );
    expect(got?.href).toBe("/browse/car");
  });

  it("DROPS a vehicle the owner has taken off the road", () => {
    // Recommending it and then refusing it at checkout is the worse failure.
    const got = resolveCard(
      { id: "c1", source: { kind: "fleet", id: "burgman" } },
      cat({ fleet: [vehicle("burgman", { available: false })] }),
      LABELS,
      NOW,
    );
    expect(got).toBeNull();
  });

  it("drops one that has been deleted outright", () => {
    const got = resolveCard(
      { id: "c1", source: { kind: "fleet", id: "gone" } },
      cat({ fleet: [vehicle("burgman")] }),
      LABELS,
      NOW,
    );
    expect(got).toBeNull();
  });
});

describe("the top-up respects the owner's world tagging", () => {
  // "Visible in both, but de-emphasised" is the owner's rule for content that
  // suits one world more than the other. It has to be an ORDERING, not a
  // filter: hiding a village walk from Curated would make the two worlds two
  // catalogues, which is exactly what this design avoids.
  it("puts a world's own listings before the shared ones", () => {
    const shared = place("shared", { name: "Shared thing" });
    const curatedOnly = place("lux", { name: "Lux thing", world: "curated", priorityCurated: 0 });
    const got = topUpPlaces([], cat({ places: [shared, curatedOnly] }), 5, "curated");
    expect(got.map((c) => c.title.en)).toEqual(["Lux thing", "Shared thing"]);
  });

  it("keeps an untagged listing visible in both worlds", () => {
    const shared = place("shared", { name: "Shared thing" });
    for (const world of ["authentic", "curated"] as const) {
      const got = topUpPlaces([], cat({ places: [shared] }), 5, world);
      expect(got.map((c) => c.title.en)).toEqual(["Shared thing"]);
    }
  });

  it("leaves a listing narrowed to the OTHER world out", () => {
    const got = topUpPlaces(
      [],
      cat({ places: [place("a", { name: "Authentic only", world: "authentic" })] }),
      5,
      "curated",
    );
    expect(got).toEqual([]);
  });

  it("orders exactly as it did before when no world is given", () => {
    const places = [place("a", { name: "A" }), place("b", { name: "B", world: "curated" })];
    expect(topUpPlaces([], cat({ places }), 5).map((c) => c.title.en)).toEqual(["A", "B"]);
  });
});
