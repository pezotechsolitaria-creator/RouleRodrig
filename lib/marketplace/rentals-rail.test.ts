import { describe, it, expect } from "vitest";
import { DEFAULT_CONTENT, type FleetItem, type RecommendedPlace, type SiteContent } from "@/lib/defaults";
import { isSellableFleetItem, vehiclePriceNumber } from "@/lib/site-data";
import { findVehicleUnits, unitToBook } from "@/lib/vehicle-slug";
import { buildRentalsRail, rentalCategories, rupees } from "./rentals-rail";

// ── THE RENTALS BRANCH SHOWS WHAT /browse SELLS, AND NOTHING ELSE ───────────
//
// Architecture review 2026-09-30, item 2. The hub's Rentals section is built
// from the fleet the /browse pages read. What must never happen, each driven
// through the real function below:
//
//   · a door to a category the owner switched off, or that holds only drafts —
//     a tap that lands on "cars are unavailable" or a Rs 0 template car;
//   · a figure that is not the one the category page prints — the Rs 599/699
//     drift the "from" price was centralised to stop (lib/site-data.ts);
//   · a price or a vehicle read off the SEED, which getContent() answers when
//     its read fails ("From Rs 600" is nobody's price);
//   · a boat trip called a rental.

const base = DEFAULT_CONTENT.fleet[0];
const veh = (over: Partial<FleetItem>): FleetItem => ({ ...base, units: 1, ...over }) as FleetItem;
const place = (over: Partial<RecommendedPlace>): RecommendedPlace =>
  ({ id: "p", category: "activity", name: "x", description: "", image: "/x.jpg", ...over }) as RecommendedPlace;

/** A site whose row was read: the live shape of the fleet, with its traps. */
function live(over: Partial<SiteContent> = {}): SiteContent {
  return {
    ...DEFAULT_CONTENT,
    vehicleCategories: [
      { id: "scooter", label: "Scooters", enabled: true },
      { id: "car", label: "Cars", enabled: true },
      { id: "kayak", label: "Kayaks", enabled: false },
    ],
    fleet: [
      veh({ id: "avenis", name: "Suzuki Avenis", price: "Rs 699", category: "scooter" }),
      // A second physical unit of the same model: one page, one card.
      veh({ id: "avenis-2", name: "Suzuki Avenis", price: "Rs 749", category: "scooter" }),
      // Out on hire: its page says Unavailable, so the hub offers no card.
      veh({ id: "burgman", name: "Burgman 125cc", price: "Rs 899/day", category: "scooter", available: false }),
      // The owner's verbatim note after the figure is his; the number is 1899.
      veh({
        id: "swift",
        name: "Suzuki Swift (Latest Gen) ",
        price: "Rs 1899(Book for more than 2 days to get free delivery!!)",
        category: "car",
      }),
      // An unfinished template row: no price, so a draft, never a card.
      veh({ id: "veh-1", name: "NEW CARS", price: "", category: "car" }),
      // Priced, but its category is switched off.
      veh({ id: "k1", name: "Sit-on-top kayak", price: "Rs 500", category: "kayak" }),
    ],
    recommended: {
      ...DEFAULT_CONTENT.recommended,
      items: [
        place({ id: "b1", name: "Lagoon & islets", serviceType: "boat" }),
        place({ id: "h1", name: "Guesthouse", category: "hotel" }),
      ],
    },
    ...over,
  };
}

describe("which categories the Rentals branch opens", () => {
  it("only the ones switched on AND holding a priced vehicle, in the owner's order", () => {
    expect(rentalCategories(live()).map((c) => c.href)).toEqual(["/browse/scooter", "/browse/car"]);
  });

  it("drops a category the owner switches off, even with priced stock", () => {
    const c = live();
    c.vehicleCategories = c.vehicleCategories.map((v) => (v.id === "car" ? { ...v, enabled: false } : v));
    expect(rentalCategories(c).map((x) => x.id)).toEqual(["scooter"]);
  });

  it("drops a category whose only rows are drafts", () => {
    const c = live();
    c.fleet = c.fleet.filter((f) => f.id !== "swift");
    expect(rentalCategories(c).map((x) => x.id)).toEqual(["scooter"]);
  });

  it("prints the cheapest sellable daily rate — the figure /browse/<category> prints", () => {
    const byId = Object.fromEntries(rentalCategories(live()).map((c) => [c.id, c.fromPerDay]));
    // A scooter quotes the published scooter rate (SCOOTER_RATES.threePlus, 6 Oct 2026), whatever the price box says.
    expect(byId).toEqual({ scooter: 799, car: 1899 });
  });

  it("says what kind of rental it is, motor unless the owner set otherwise", () => {
    const c = live();
    c.vehicleCategories = [
      ...c.vehicleCategories.filter((v) => v.id !== "kayak"),
      { id: "kayak", label: "Kayaks", enabled: true, rentalKind: "equipment" },
    ];
    const kinds = Object.fromEntries(rentalCategories(c).map((x) => [x.id, x.kind]));
    expect(kinds).toEqual({ scooter: "motor", car: "motor", kayak: "equipment" });
  });
});

describe("the vehicle cards", () => {
  it("one per vehicle page, linking the page vehicleHref builds", () => {
    const { vehicles } = buildRentalsRail(live());
    expect(vehicles).toEqual([
      { name: "Suzuki Avenis", href: "/browse/scooter/suzuki-avenis", category: "scooter", perDay: 799 },
      { name: "Suzuki Swift (Latest Gen)", href: "/browse/car/suzuki-swift-latest-gen", category: "car", perDay: 1899 },
    ]);
  });

  it("never lists a vehicle from a switched-off category, an unpriced row or one out of service", () => {
    const hrefs = buildRentalsRail(live()).vehicles.map((v) => v.href).join(" ");
    expect(hrefs).not.toMatch(/kayak|new-cars|burgman/);
  });

  // Architecture review 2026-09-30, twin-unit fix. The vehicle page books
  // unitToBook() among its twins, so the card must speak for that unit: with
  // the first Avenis off the road the page still sells the second one, at its
  // own price, and the hub used to drop the model altogether.
  const withAvenis = (first: boolean, second: boolean): SiteContent => {
    const c = live();
    c.fleet = c.fleet.map((f) =>
      f.id === "avenis" ? { ...f, available: first } : f.id === "avenis-2" ? { ...f, available: second } : f,
    );
    return c;
  };
  const avenisCards = (c: SiteContent) =>
    buildRentalsRail(c).vehicles.filter((v) => v.href === "/browse/scooter/suzuki-avenis");

  it("keeps the model while one twin is for hire, at the price of the twin its page books", () => {
    expect(avenisCards(withAvenis(false, true))).toEqual([
      // Every scooter twin quotes the published rate now; the card still
      // follows the twin the page books (the per-card test below).
      { name: "Suzuki Avenis", href: "/browse/scooter/suzuki-avenis", category: "scooter", perDay: 799 },
    ]);
  });

  it("drops the model only when every twin is off the road", () => {
    expect(avenisCards(withAvenis(false, false))).toEqual([]);
  });

  it("prints, card for card, the price of the unit the vehicle page resolves", () => {
    // The page's own resolve(): findVehicleUnits → isSellableFleetItem → unitToBook.
    for (const c of [live(), withAvenis(false, true), withAvenis(true, false)]) {
      for (const card of buildRentalsRail(c).vehicles) {
        const slug = card.href.split("/").pop()!;
        const units = findVehicleUnits(c.fleet, card.category, slug).filter(isSellableFleetItem);
        expect(card.perDay, card.href).toBe(vehiclePriceNumber(unitToBook(units)!, c.vehicleCategories));
      }
    }
  });

  it("keeps the fleet's order when the first twin is the one withdrawn", () => {
    expect(buildRentalsRail(withAvenis(false, true)).vehicles.map((v) => v.href)).toEqual([
      "/browse/scooter/suzuki-avenis",
      "/browse/car/suzuki-swift-latest-gen",
    ]);
  });
});

describe("a failed content read prints no price and links no vehicle", () => {
  it("keeps the category door, drops the figure and the cards", () => {
    // getContent() answers DEFAULT_CONTENT when its read fails.
    const seed = JSON.parse(JSON.stringify(DEFAULT_CONTENT)) as SiteContent;
    const rail = buildRentalsRail(seed);
    expect(rail.categories.map((c) => [c.href, c.fromPerDay])).toEqual([["/browse/scooter", null]]);
    expect(rail.vehicles).toEqual([]);
  });
});

describe("boats are skippered trips, never rentals", () => {
  it("links a water vertical only while it has a provider", () => {
    expect(buildRentalsRail(live()).water).toEqual([
      { type: "boat", href: "/experiences/boat", label: "boat trips" },
    ]);
  });

  it("links fishing too once a fishing trip is listed", () => {
    const c = live();
    c.recommended = {
      ...c.recommended,
      items: [...c.recommended.items, place({ id: "f1", name: "Big game", serviceType: "fishing" })],
    };
    expect(buildRentalsRail(c).water.map((w) => w.type)).toEqual(["boat", "fishing"]);
  });

  it("never puts a boat among the rental categories or the vehicles", () => {
    const rail = buildRentalsRail(live());
    const all = [...rail.categories.map((c) => c.href), ...rail.vehicles.map((v) => v.href)];
    expect(all.some((h) => /boat|fishing|experiences/.test(h))).toBe(false);
  });
});

describe("rupees", () => {
  it("groups the English way, as /browse prints it", () => {
    expect(rupees(1899)).toBe("Rs 1,899");
    expect(rupees(699)).toBe("Rs 699");
  });
});
