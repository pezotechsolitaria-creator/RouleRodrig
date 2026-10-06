import { describe, expect, it } from "vitest";
import type { TransferPricing } from "@/lib/rides/transfer";
import {
  carAirportPassage,
  categoryFrom,
  categoryMetaDescription,
  categoryTitle,
  deliveryIsFree,
  gettingAroundNotes,
  IN_PERSON_SENTENCE_FR,
  rentalWhoWherePay,
  STAY_PAY,
  vehicleMetaTitle,
  villageOf,
  withFreeDelivery,
} from "./browse-copy";
import { IN_PERSON_SENTENCE } from "./experiences";
import { experiencesFaq } from "./experiences-faq";

// The functions behind the sentences /browse prints (SEO audit 2026-09-29).
// What the pages actually render with them — the real server components,
// against a content row shaped like the live one — is pinned in
// app/browse/browse-pages-render.test.ts. These pin the rules themselves.

const len = (s: string) => Array.from(s).length;

/** Every Rs amount in a sentence, as a number: "Rs 1,899", "Rs 1 899". \s, not
 *  a typed space: fr-FR groups with U+202F, which \s matches and a pasted
 *  character silently turns into a plain space. */
const rsFigures = (s: string) =>
  [...s.matchAll(/Rs\s?(\d(?:[\d,\s]*\d)?)/g)].map((m) => Number(m[1].replace(/\D/g, "")));

// The live shape, 29 Sept: the Swift at Rs 1,899 (repriced from 1,999 on
// 10 Sept), scooters at the published Rs 799 (SCOOTER_RATES, 6 Oct — the
// price boxes still say 699 and 899, and no longer decide), one unfinished
// car draft. The zone fares are
// deliberately NOT the live ones, so a remembered figure cannot pass.
const FLEET = [
  { price: "Rs 699(free delivery)", category: "scooter" },
  { price: "Rs 899", category: "scooter" },
  { price: "Rs 1899(Book for more than 2 days to get free delivery!!)", category: "car" },
  { price: "Rs 2,899", category: "car" },
  { price: "", category: "car" },
];
const CATS = [
  { id: "scooter", enabled: true },
  { id: "car", enabled: true },
];
const AIRPORT = {
  oneWay: [113100, 146400, 179700],
  zone1MaxKm: 6,
  zone2MaxKm: 13,
  includedPassengers: 1,
} as Pick<TransferPricing, "oneWay" | "zone1MaxKm" | "zone2MaxKm" | "includedPassengers">;

// ── EVERY Rs FIGURE IN THE GETTING-AROUND NOTES COMES FROM THE DATA (C1, C2) ─
describe("the getting-around notes", () => {
  const carFrom = categoryFrom(FLEET, "car", CATS);
  const scooterFrom = categoryFrom(FLEET, "scooter", CATS);
  const notes = gettingAroundNotes({ carFrom, scooterFrom, airport: AIRPORT });
  const text = notes.flatMap((n) => [n.body, n.bodyFr ?? ""]).join(" ");

  it("reads the from-prices the category pages show", () => {
    expect(carFrom).toBe(1899);
    expect(scooterFrom).toBe(799);
  });

  it("prints no Rs figure, in either language, that is not the fleet's or the sheet's", () => {
    const allowed = new Set([carFrom, scooterFrom, 1131, 1464, 1797]);
    const figures = rsFigures(text);
    expect(figures.length).toBe(10);
    expect(figures.filter((n) => !allowed.has(n))).toEqual([]);
  });

  it("quotes the car and scooter prices in both languages", () => {
    expect(notes[0].body).toContain("A car is from Rs 1,899 a day and a scooter from Rs 799");
    expect(rsFigures(notes[0].bodyFr ?? "")).toEqual([1899, 799]);
  });

  it("says no number for a category with nothing to rent", () => {
    // fleetFromPrice() falls back to Rs 699 — a scooter price — for an empty
    // category. That must never reach a sentence about cars.
    const noCars = [{ price: "", category: "car" }, ...FLEET.filter((f) => f.category === "scooter")];
    expect(categoryFrom(noCars, "car", CATS)).toBeNull();
    const n = gettingAroundNotes({ carFrom: null, scooterFrom: null, airport: null });
    expect(rsFigures(n.map((x) => `${x.body} ${x.bodyFr}`).join(" "))).toEqual([]);
  });

  it("says no car price while the owner has cars switched off", () => {
    expect(categoryFrom(FLEET, "car", [{ id: "car", enabled: false }])).toBeNull();
  });

  it("gives the two-part taxi answer in the words /transfers uses", () => {
    const taxi = notes[1];
    expect(taxi.h2).toBe("Taking a taxi");
    // lib/transfers-faq.ts zoneFaresSentence(): one price list, one sentence.
    expect(taxi.body).toContain(
      "Rs 1,131 up to 6 km, Rs 1,464 over 6 and under 13 km, and Rs 1,797 for 13 km and over, one way for one passenger in the daytime",
    );
    expect(taxi.body).toContain("a driver quotes a fare and you accept it before anything is booked");
    // /legal/refunds §10 and /transfers: the fare is paid to the driver.
    expect(taxi.body).toContain("you pay the driver");
    expect(taxi.bodyFr).toContain("vous payez le chauffeur");
    // The contradiction with /transfers (C2): never "no fixed price".
    expect(`${taxi.body} ${taxi.bodyFr}`).not.toMatch(/no fixed price|pas de tarif fixe|grille/i);
  });

  it("does not assume the fare covers one passenger", () => {
    const two = gettingAroundNotes({ carFrom, scooterFrom, airport: { ...AIRPORT, includedPassengers: 2 } })[1];
    expect(two.body).toContain("one way for up to 2 passengers");
    expect(two.bodyFr).toContain("pour jusqu’à 2 passagers");
  });

  it("names no fare when the price list cannot be read", () => {
    // Local dev has no service-role key; transfers can be switched off.
    const taxi = gettingAroundNotes({ carFrom, scooterFrom, airport: null })[1];
    expect(rsFigures(`${taxi.body} ${taxi.bodyFr}`)).toEqual([]);
    expect(taxi.body).toContain("fixed fares by zone");
    expect(taxi.body).toContain("airport transfers page");
  });

  it("has a French heading and body for every note", () => {
    for (const n of notes) {
      expect(n.h2Fr).toBeTruthy();
      expect(n.bodyFr).toBeTruthy();
    }
  });
});

// ── MAY A PAGE CALL DELIVERY FREE? (C20) ───────────────────────────────────
describe("deliveryIsFree: one answer for every page that says 'free'", () => {
  // The live car rows, 30 Sept: the fee is 0, the Swift's note puts a
  // condition on free delivery, the others read "(Free delivery fee)".
  const SWIFT = "Rs 1899(Book for more than 2 days to get free delivery!!)";
  const cars = (swift: string) => [
    { price: swift, category: "car" },
    { price: "Rs 2,899(Free delivery fee)", category: "car" },
    { price: "Rs 2,499(Free delivery fee)", category: "car" },
    { price: "", category: "car" },
  ];
  const fee = (car: number | undefined) => [
    { id: "scooter", deliveryFee: 0 },
    { id: "car", deliveryFee: car },
  ];

  it("says no while the Swift's own note puts a condition on it, although the fee is 0", () => {
    expect(deliveryIsFree(cars(SWIFT), "car", fee(0))).toBe(false);
  });

  it("reads '(Free delivery fee)' as unconditional, so settling the Swift note turns it on", () => {
    expect(deliveryIsFree(cars("Rs 1899(Free delivery fee)"), "car", fee(0))).toBe(true);
    expect(deliveryIsFree(cars("Rs 1899"), "car", fee(0))).toBe(true);
  });

  it("reads the scooters' bare '(free delivery)' as unconditional", () => {
    expect(deliveryIsFree(FLEET, "scooter", fee(0))).toBe(true);
  });

  it("says no whenever checkout charges for delivery", () => {
    expect(deliveryIsFree(cars("Rs 1899"), "car", fee(600))).toBe(false);
    // No fee set for cars: checkout falls back to its default charge.
    expect(deliveryIsFree(cars("Rs 1899"), "car", fee(undefined))).toBe(false);
  });

  it("makes no claim for a category with nothing sellable, and ignores drafts", () => {
    expect(deliveryIsFree([{ price: "", category: "car" }], "car", fee(0))).toBe(false);
    // An unpriced draft whose text mentions delivery cannot veto the others.
    expect(
      deliveryIsFree([...cars("Rs 1899"), { price: "delivery tbc", category: "car" }], "car", fee(0)),
    ).toBe(true);
  });
});

// ── WHO RENTS, FROM WHERE, HOW TO PAY (C4) ─────────────────────────────────
describe("the who / where / how-to-pay sentence", () => {
  it("reads as one quotable sentence from live values", () => {
    expect(rentalWhoWherePay({ category: "scooter", location: "Baie Aux Huîtres,Rodrigues" })).toBe(
      "Roule Rodrigues rents scooters from Baie Aux Huîtres on Rodrigues: once we confirm your dates, you pay online by bank transfer, MCB Juice or PayPal, or in cash in person when we agree it.",
    );
  });

  it("does not repeat the delivery the intro has just stated", () => {
    // It sat after "delivered free to your guest house" and said "delivered
    // free to where you are staying" again (review of C4).
    for (const category of ["scooter", "car"]) {
      expect(rentalWhoWherePay({ category, location: null }) ?? "").not.toMatch(/deliver|free/i);
    }
  });

  it("presents cash as something agreed, not promised, and quotes no price", () => {
    // M220: the customer can ASK to pay in person; the owner decides.
    const s = rentalWhoWherePay({ category: "car", location: null }) ?? "";
    expect(s).toContain("in cash in person when we agree it");
    expect(s).not.toMatch(/Rs \d/);
  });

  it("claims no village the contact line does not name", () => {
    expect(villageOf("Baie Aux Huîtres,Rodrigues")).toBe("Baie Aux Huîtres");
    expect(villageOf("Rodrigues Island, Mauritius")).toBeNull();
    expect(villageOf("")).toBeNull();
    expect(rentalWhoWherePay({ category: "scooter", location: "Rodrigues Island, Mauritius" })).toMatch(
      /^Roule Rodrigues rents scooters on Rodrigues: /,
    );
  });

  it("says nothing for a category it has no noun for", () => {
    expect(rentalWhoWherePay({ category: "motorbike", location: null })).toBeNull();
  });
});

// ── /browse/car: THE AIRPORT PASSAGE (C18) ─────────────────────────────────
describe("collecting a car at Plaine Corail", () => {
  it("states the fee from the category, and included only when deliveryIsFree says so", () => {
    expect(carAirportPassage({ deliveryFee: 0, freeDelivery: true }).body).toContain("Delivery is included");
    expect(carAirportPassage({ deliveryFee: 600 }).body).toContain("Delivery is Rs 600");
    expect(carAirportPassage({}).body).not.toMatch(/Delivery is|free/);
  });

  it("says nothing about the charge when the fee is 0 but a note sets a condition (C20)", () => {
    // Live: car fee 0, the Swift's "free delivery" only beyond 2 days.
    const body = carAirportPassage({ deliveryFee: 0, freeDelivery: false }).body;
    expect(body).not.toMatch(/free|Delivery is/i);
    expect(body).toBe(
      "We bring the car to Plaine Corail airport when you land, the same way we deliver it to a guest house.",
    );
  });

  it("answers the mainland searcher without naming anybody else", () => {
    const { mainland } = carAirportPassage({ location: "Baie Aux Huîtres,Rodrigues" });
    expect(mainland).toBe(
      "Booking from Mauritius? Roule Rodrigues is on Rodrigues itself, in Baie Aux Huîtres, and delivers to Plaine Corail airport.",
    );
    expect(carAirportPassage({ location: null }).mainland).toBe(
      "Booking from Mauritius? Roule Rodrigues is on Rodrigues itself and delivers to Plaine Corail airport.",
    );
  });

  it("carries the words the page links to /transfers", () => {
    expect(carAirportPassage({}).transfer).toContain("airport transfer");
  });
});

// ── TITLES AND DESCRIPTIONS (T5, T7) ───────────────────────────────────────
describe("category titles and descriptions", () => {
  it("fits the price inside 155 characters rather than trailing past the cut", () => {
    const long = "Word ".repeat(40).trim() + ".";
    for (const from of [699, 1899, 12345]) {
      const out = categoryMetaDescription(long, from);
      expect(len(out), out).toBeLessThanOrEqual(155);
      expect(out.endsWith(`From Rs ${from.toLocaleString("en-US")}.`)).toBe(true);
    }
    expect(categoryMetaDescription("Short copy.", null)).toBe("Short copy.");
  });

  it("gives up the brand before the price", () => {
    expect(categoryTitle("Where to Stay in Rodrigues", 12345)).toBe(
      "Where to Stay in Rodrigues from Rs 12,345 | Roule Rodrigues",
    );
    expect(categoryTitle("A Long Category Heading About Rodrigues", 1999)).toBe(
      "A Long Category Heading About Rodrigues from Rs 1,999",
    );
  });

  it("inserts 'free' only on deliveryIsFree's answer", () => {
    expect(withFreeDelivery("Rent a car in Rodrigues, delivered to your guest house.", true)).toBe(
      "Rent a car in Rodrigues, delivered free to your guest house.",
    );
    expect(withFreeDelivery("Rent a car, delivered to your guest house.", false)).not.toContain("free");
  });
});

describe("vehicle page titles (T5)", () => {
  it("carries the model, the head term, a grouped price and the island", () => {
    expect(vehicleMetaTitle("BURGMAN 125cc", "scooter", 699)).toBe(
      "BURGMAN 125cc scooter rental — Rs 699/day, Rodrigues",
    );
    expect(vehicleMetaTitle("Toyota Hilux", "car", 2899)).toBe(
      "Toyota Hilux car rental — Rs 2,899/day, Rodrigues",
    );
  });

  it("drops the 'car' word before it trims the name", () => {
    // 62 characters with it, 58 without.
    expect(vehicleMetaTitle("Suzuki Swift (Latest Gen)", "car", 1899)).toBe(
      "Suzuki Swift (Latest Gen) rental — Rs 1,899/day, Rodrigues",
    );
  });

  it("trims a very long name but never the price or the island", () => {
    const t = vehicleMetaTitle("Toyota Rush 7 Seater Automatic Family Edition Extra Long", "car", 2399);
    expect(t.length).toBeLessThanOrEqual(60);
    expect(t.endsWith(" rental — Rs 2,399/day, Rodrigues")).toBe(true);
  });

  it("says rental in Rodrigues when there is no price", () => {
    expect(vehicleMetaTitle("Avenis 125cc", "scooter", null)).toBe("Avenis 125cc scooter rental in Rodrigues");
  });
});

// ── HOW A STAY IS PAID (C4: "/browse/stays has 0 'pay'") ───────────────────
describe("the stays pay sentence", () => {
  it("says how, cash as a request, and that nothing is charged on request", () => {
    expect(STAY_PAY.en).toContain("Nothing is charged when you send a request");
    expect(STAY_PAY.en).toContain("you pay online by bank transfer, MCB Juice or PayPal");
    expect(STAY_PAY.en).toContain(IN_PERSON_SENTENCE);
    expect(STAY_PAY.en).toContain("we reply with how to pay");
    expect(STAY_PAY.fr).toContain("par virement, MCB Juice ou PayPal");
    expect(STAY_PAY.fr).toContain(IN_PERSON_SENTENCE_FR);
  });

  it("never calls the online payment a deposit, and names no figure", () => {
    // A place booking is settled in full online (placeBooking.payChoiceOnline).
    for (const s of [STAY_PAY.en, STAY_PAY.fr]) {
      expect(s).not.toMatch(/deposit|acompte/i);
      expect(s).not.toMatch(/Rs\s?\d/);
    }
  });

  it("is the French cash sentence the experiences FAQ already uses, word for word", () => {
    const pay = experiencesFaq("fr").find((f) => f.question.startsWith("Faut-il payer"));
    expect(pay?.answer).toContain(IN_PERSON_SENTENCE_FR);
  });
});
