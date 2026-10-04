import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  CONDITION_IDS,
  CONDITION_LABELS,
  conditionPreview,
  pickConditions,
  rentalKindOf,
} from "@/lib/rental-conditions";
import { DEFAULT_CONTENT } from "@/lib/defaults";

// The panel's two footer links, as plain anchors: next/link wants a router.
vi.mock("next/link", () => ({
  default: (p: { href: string; children?: ReactNode; className?: string }) =>
    createElement("a", { href: p.href, className: p.className }, p.children),
}));

// The invariant worth protecting: the visible "Before you book" panel and the
// FAQPage structured data on the same page are BOTH built from pickConditions.
// If it ever returns something the panel does not render — or renders something
// the markup omits — the page is claiming answers a visitor cannot read, which
// is exactly what Google's FAQ guideline forbids. These tests pin the contract.

const faq = (over: Partial<Record<string, string>> = {}) =>
  CONDITION_IDS.map((id) => ({
    id,
    question: `Q ${id}`,
    answer: over[id] ?? `A ${id}`,
  }));

// ── A CAR PAGE ANSWERED A SCOOTER QUESTION ─────────────────────────────────
//
// /browse/car rendered "Do scooters come with a helmet? Yes. For every scooter
// rental a helmet is included free for each rider…" in the BEFORE YOU BOOK
// panel directly above the car booking form — and shipped that same Question
// inside the page's FAQPage structured data. So the owner's weakest-selling
// product answered a question about his strongest one at the moment of
// deciding, and an assistant asked about car hire was handed a helmet policy.
describe("a car page does not answer scooter questions", () => {
  const all = faq({});
  it("drops the helmet row for cars", () => {
    expect(pickConditions(all, "car").map((c) => c.id)).not.toContain("helmet");
  });

  it("keeps it for scooters", () => {
    expect(pickConditions(all, "scooter").map((c) => c.id)).toContain("helmet");
  });

  it("keeps everything else, because the owner wrote it for both", () => {
    // Age, licence, insurance, fuel, delivery, breakdown and minimum duration
    // all read correctly for a car. Only the helmet is scooter-only, and this
    // must not quietly become two divergent lists.
    const car = pickConditions(all, "car").map((c) => c.id);
    const scooter = pickConditions(all, "scooter").map((c) => c.id);
    expect(scooter.filter((id) => !car.includes(id))).toEqual(["helmet"]);
  });

  it("still returns the full list when no category is given", () => {
    // Defaulted on purpose: every existing caller and test predates this.
    // The full list now means EVERY id — the scooter-only helmet and the
    // car-only deposit both — because an unqualified caller has not told us
    // which product it is showing.
    expect(pickConditions(all).map((c) => c.id)).toEqual([...CONDITION_IDS]);
  });

  // ── THE OWNER'S OWN FIGURE, ON THE RIGHT PRODUCT ─────────────────────────
  //
  // He gave Rs 5,000 for CARS. Nothing is known about a scooter deposit, so
  // quoting it on /browse/scooter would be the helmet mistake pointed the
  // other way — a number attached to a product it was never said about.
  it("shows the deposit on cars and not on scooters", () => {
    expect(pickConditions(all, "car").map((c) => c.id)).toContain("deposit");
    expect(pickConditions(all, "scooter").map((c) => c.id)).not.toContain(
      "deposit",
    );
  });

  it("shows mileage on both, because no limit was stated for either", () => {
    for (const cat of ["car", "scooter"]) {
      expect(pickConditions(all, cat).map((c) => c.id)).toContain("mileage");
    }
  });

  it("keeps the two exclusive lists genuinely exclusive", () => {
    // car gets everything except helmet; scooter everything except deposit.
    const car = pickConditions(all, "car").map((c) => c.id);
    const scooter = pickConditions(all, "scooter").map((c) => c.id);
    expect(scooter.filter((id) => !car.includes(id))).toEqual(["helmet"]);
    expect(car.filter((id) => !scooter.includes(id))).toEqual(["deposit"]);
  });

  it("does not confuse the security deposit with the booking part-payment", () => {
    // lib/booking-pricing.ts depositPct() computes a PERCENTAGE of the rental
    // (50% for cars) — the sum that confirms a booking online. Rs 5,000 is a
    // security deposit against the vehicle. One word, two sums, and a
    // customer reading "deposit Rs 5,000" beside a "deposit" line in the
    // price summary would reasonably think the booking costs Rs 5,000.
    // The real wording, not the synthetic fixture above.
    const real = (DEFAULT_CONTENT.faq?.items ?? []).find(
      (f) => f.id === "deposit",
    );
    expect(real?.answer ?? "").toMatch(/separate/i);
    expect(real?.answer ?? "").toMatch(/Rs 5,000/);
  });

  it("does not offer a car renter an extra helmet", () => {
    // The free-text box above the CAR booking button read "Hotel name,
    // delivery address, extra helmet…" — the same wrong-product mistake the
    // FAQ row was making, in the last field before Submit.
    const read = (...p: string[]) =>
      readFileSync(join(process.cwd(), ...p), "utf8");
    const booking = read("components", "BookingSection.tsx");
    expect(booking).toContain("t.booking.messagePlaceholderCar");
    expect(booking).toMatch(/category && category !== "scooter"/);
    // All three languages, or a French reader gets a blank placeholder.
    const i18n = read("lib", "i18n.ts");
    expect((i18n.match(/messagePlaceholderCar:/g) ?? []).length).toBe(3);
    // And the category has to actually reach the component.
    expect(read("app", "browse", "[category]", "page.tsx")).toContain(
      "category={category}",
    );
  });

  it("is wired into BOTH the listing and the vehicle detail page", () => {
    // The detail page is the one every earlier pass missed, and it is the
    // actual conversion page. Both still hand over the category; the optional
    // third argument (rentalKind, architecture review 2026-09-30) may follow
    // it, and what that argument DOES on the detail page is proven by
    // rendering it in app/browse/vehicle-page-category.test.ts, not by a grep.
    const read = (...p: string[]) =>
      readFileSync(join(process.cwd(), ...p), "utf8");
    const wired = /pickConditions\(content\.faq\?\.items, category[,)]/;
    expect(read("app", "browse", "[category]", "page.tsx")).toMatch(wired);
    expect(read("app", "browse", "[category]", "[vehicle]", "page.tsx")).toMatch(wired);
  });
});

// ── A KAYAK IS NOT DRIVEN (architecture review 2026-09-30, rentalKind) ─────
//
// Every non-scooter category got the car's terms, so switching on the seeded
// Kayaks category would have published "Do I need a driving licence?", fuel,
// mileage and the Rs 5,000 CAR security deposit as the conditions of hiring a
// kayak — visibly, and again in the page's FAQPage.
describe("an equipment category gets only the terms that hold for equipment", () => {
  const all = faq({});

  it("keeps delivery and the minimum rental, and nothing else", () => {
    expect(pickConditions(all, "kayak", "equipment").map((c) => c.id)).toEqual([
      "delivery",
      "faq-min-duration",
    ]);
  });

  it("drops them whatever the category id is, because the kind decides", () => {
    for (const cat of ["kayak", "car", "scooter", "cat-1790000000000", undefined]) {
      expect(pickConditions(all, cat, "equipment").map((c) => c.id)).toEqual([
        "delivery",
        "faq-min-duration",
      ]);
    }
  });

  it("says nothing about driving in the owner's live answers", () => {
    // The live wording (site_content, 29 Sep 2026) for every condition id —
    // the words that would actually be published — not the synthetic "A x".
    const live = [
      { id: "license", question: "Do I need a driving licence?", answer: "Yes — a valid driving licence matching your vehicle (car or motorcycle) is required, and you must bring it at pickup. An international permit is recommended if your licence is not in the Latin alphabet." },
      { id: "age", question: "What is the minimum age to rent?", answer: "You must be at least 18 years old and hold a valid licence to rent and drive." },
      { id: "helmet", question: "Do scooters come with a helmet?", answer: "Yes. For every scooter rental a helmet is included free for each rider, plus a second for a passenger — wearing one is mandatory by law on Rodrigues. Cars are delivered fully road-ready." },
      { id: "insurance", question: "Is insurance included?", answer: "Basic third-party insurance is included with every rental. Please drive responsibly and follow local road rules — full terms are shared at pickup." },
      { id: "delivery", question: "Can you deliver the vehicle to my hotel?", answer: "Yes — we can deliver to and collect from your hotel or guesthouse anywhere on the island. Just let us know your location when you book." },
      { id: "fuel", question: "What about fuel?", answer: "Your vehicle is delivered ready to go. We simply ask that you return it with a similar fuel level, or we settle the small difference." },
      { id: "breakdown", question: "What happens if the vehicle breaks down?", answer: "Call or WhatsApp us any time — we offer support and, if needed, a replacement vehicle so your trip is never interrupted." },
      { id: "deposit", question: "Do you take a deposit?", answer: "A security deposit of Rs 5,000 applies to car rentals. It is separate from the part-payment that confirms your booking online, and full terms are shared at pickup." },
      { id: "mileage", question: "Is there a mileage limit?", answer: "No. There is no mileage limit on our rentals, so you can drive as much of the island as you like." },
      { id: "faq-min-duration", question: "Is there a minimum rental duration?", answer: "No. You can rent for a single day if that is all you need. There is no three-day minimum and no long-stay requirement, so you can book exactly the dates you want." },
    ];
    const picked = pickConditions(live, "kayak", "equipment");
    expect(picked).toHaveLength(2);
    const words = picked.map((c) => `${c.question} ${c.answer}`).join(" ");
    expect(words).not.toMatch(/licen[cs]e|fuel|mileage|5,000|helmet|road|drive|scooter|\bcar\b/i);
  });

  it("renders a panel with no driving terms in it", async () => {
    const { default: RentalConditions } = await import("@/components/RentalConditions");
    const items = pickConditions(DEFAULT_CONTENT.faq?.items, "kayak", "equipment");
    const html = renderToStaticMarkup(createElement(RentalConditions, { items }));
    expect(html).toContain("BEFORE YOU BOOK");
    expect(html).not.toMatch(/licen[cs]e|fuel|mileage|5,000|helmet|third-party/i);
  });
});

// ── "motor" IS TODAY, EXACTLY ──────────────────────────────────────────────
//
// rentalKind is optional and no live category sets it, so the two-argument
// call every page made before must be indistinguishable from saying "motor".
describe("motor, or no kind at all, changes nothing", () => {
  const real = DEFAULT_CONTENT.faq?.items;

  it("returns the same list with and without 'motor', for every category", () => {
    for (const cat of ["scooter", "car", "motorbike", "kayak", undefined]) {
      expect(pickConditions(real, cat, "motor")).toEqual(pickConditions(real, cat));
    }
  });

  it("still gives a car the deposit and a scooter the helmet", () => {
    expect(pickConditions(real, "car", "motor").map((c) => c.id)).toContain("deposit");
    expect(pickConditions(real, "scooter", "motor").map((c) => c.id)).toContain("helmet");
    expect(pickConditions(real, "car", "motor").map((c) => c.id)).toContain("license");
  });
});

describe("rentalKindOf", () => {
  const cats = [
    { id: "scooter", label: "Scooters", enabled: true },
    { id: "kayak", label: "Kayaks", enabled: false, rentalKind: "equipment" as const },
    { id: "car", label: "Cars", enabled: true, rentalKind: "motor" as const },
  ];

  it("reads 'equipment' from the category", () => {
    expect(rentalKindOf(cats, "kayak")).toBe("equipment");
  });

  it("is 'motor' when the field is absent — every category live today", () => {
    expect(rentalKindOf(cats, "scooter")).toBe("motor");
    expect(rentalKindOf(cats, "car")).toBe("motor");
  });

  it("is 'motor' for a category that is not in the list, or no list at all", () => {
    expect(rentalKindOf(cats, "hovercraft")).toBe("motor");
    expect(rentalKindOf(undefined, "kayak")).toBe("motor");
    expect(rentalKindOf(cats, undefined)).toBe("motor");
  });

  it("does not guess from a value it does not know", () => {
    // site_content is hand-edited JSON. Only the exact word switches the
    // motor terms off; anything else keeps today's page.
    expect(rentalKindOf([{ id: "x", rentalKind: "Equipment" }], "x")).toBe("motor");
  });
});

describe("pickConditions", () => {
  it("returns the conditions in CONDITION_IDS order, not FAQ order", () => {
    const shuffled = [...faq()].reverse();
    expect(pickConditions(shuffled).map((c) => c.id)).toEqual([...CONDITION_IDS]);
  });

  it("skips a condition the owner blanked out rather than rendering an empty row", () => {
    const ids = pickConditions(faq({ fuel: "" })).map((c) => c.id);
    expect(ids).not.toContain("fuel");
    expect(ids).toHaveLength(CONDITION_IDS.length - 1);
  });

  it("treats a whitespace-only answer as blank", () => {
    expect(pickConditions(faq({ helmet: "   " })).map((c) => c.id)).not.toContain("helmet");
  });

  it("skips a condition the owner deleted from the FAQ entirely", () => {
    const without = faq().filter((f) => f.id !== "insurance");
    expect(pickConditions(without).map((c) => c.id)).not.toContain("insurance");
  });

  it("ignores FAQ entries that are not rental conditions", () => {
    const mixed = [...faq(), { id: "refunds", question: "Q refunds", answer: "A refunds" }];
    expect(pickConditions(mixed).map((c) => c.id)).toEqual([...CONDITION_IDS]);
  });

  it("returns an empty list rather than throwing when there is no FAQ", () => {
    expect(pickConditions(undefined)).toEqual([]);
    expect(pickConditions([])).toEqual([]);
  });

  it("carries the question and answer through unchanged", () => {
    const picked = pickConditions(faq({ age: "You must be 18." }));
    expect(picked.find((c) => c.id === "age")).toEqual({
      id: "age",
      question: "Q age",
      answer: "You must be 18.",
    });
  });
});

describe("the condition list itself", () => {
  it("has a label for every id, in all three languages", () => {
    for (const id of CONDITION_IDS) {
      const label = CONDITION_LABELS[id];
      expect(label, `missing label for "${id}"`).toBeDefined();
      expect(label.en && label.fr && label.cr, `blank label for "${id}"`).toBeTruthy();
    }
  });

  it("lists no id twice", () => {
    expect(new Set(CONDITION_IDS).size).toBe(CONDITION_IDS.length);
  });

  // If the owner renames an FAQ id in the admin panel, the condition silently
  // vanishes from both the panel and the markup. This test is the alarm.
  it("every id still exists in the shipped default FAQ", () => {
    const shipped = new Set((DEFAULT_CONTENT.faq?.items ?? []).map((f) => f.id));
    const missing = CONDITION_IDS.filter((id) => !shipped.has(id));
    expect(missing, `no longer in DEFAULT_CONTENT.faq.items: ${missing.join(", ")}`).toEqual([]);
  });
});

describe("conditionPreview", () => {
  const minDuration =
    "No. You can rent for a single day if that is all you need. There is no three-day minimum and no long-stay requirement, so you can book exactly the dates you want.";

  it('does not collapse the live answer to a bare "No."', () => {
    expect(conditionPreview(minDuration)).toBe(
      "No. You can rent for a single day if that is all you need.",
    );
  });

  it("stops at one sentence when one sentence already says something", () => {
    expect(conditionPreview("You must be 18 or older. Bring your licence.")).toBe(
      "You must be 18 or older.",
    );
  });

  it("keeps a short answer that has nothing more to add", () => {
    expect(conditionPreview("Yes.")).toBe("Yes.");
  });

  it("returns an answer with no sentence punctuation unchanged", () => {
    expect(conditionPreview("Rs 400 to your guest house")).toBe("Rs 400 to your guest house");
  });

  it("handles a question mark or exclamation as a sentence end", () => {
    expect(conditionPreview("Broken down? Call us on WhatsApp and we come to you.")).toBe(
      "Broken down? Call us on WhatsApp and we come to you.",
    );
  });

  it("trims surrounding whitespace", () => {
    expect(conditionPreview("   Helmets are included with every scooter.  ")).toBe(
      "Helmets are included with every scooter.",
    );
  });

  it("is never longer than the answer it previews", () => {
    for (const a of [minDuration, "Yes.", "No.", "A. B. C. D. E."]) {
      expect(conditionPreview(a).length).toBeLessThanOrEqual(a.trim().length);
    }
  });

  it("returns nothing for an empty answer instead of throwing", () => {
    expect(conditionPreview("")).toBe("");
    expect(conditionPreview("   ")).toBe("");
  });
});

// ── THE WHOLE ANSWER, IN THE HTML (SEO audit 2026-09-29 T18) ───────────────
//
// The panel expanded with useState, so the server rendered the preview only:
// "Basic third-party insurance is included with every rental." while the
// FAQPage markup, from the same item, carried the full answer. Three or four
// answers per page were longer in JSON-LD than on the page, on /browse/car,
// /browse/scooter and all six vehicle pages.
// The pages' FAQPage-against-visible-text check, on /browse/car, /browse/scooter
// and a vehicle page, is in app/browse/browse-pages-render.test.ts. This
// renders the panel alone.
describe("the panel shows the same answer the FAQPage markup claims", async () => {
  const { default: RentalConditions } = await import("@/components/RentalConditions");
  const items = pickConditions(DEFAULT_CONTENT.faq?.items, "car");
  const html = renderToStaticMarkup(createElement(RentalConditions, { items }));
  const text = (s: string) =>
    s.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

  it("serves every whole answer in the HTML, with no script needed to reveal it", () => {
    expect(items.length).toBeGreaterThanOrEqual(5);
    for (const i of items) expect(text(html)).toContain(i.answer.replace(/\s+/g, " ").trim());
    // A native disclosure, not a button whose state lives in React.
    expect(html).not.toContain("<button");
  });

  it("puts each long answer, whole, inside a row that is served collapsed", () => {
    const rows = [...html.matchAll(/<details[\s\S]*?<\/details>/g)].map((m) => m[0]);
    const long = items.filter((i) => conditionPreview(i.answer).length < i.answer.trim().length);
    expect(rows.length).toBe(long.length);
    for (const i of long) expect(rows.some((r) => text(r).includes(i.answer.trim()))).toBe(true);
    expect(html).not.toMatch(/<details[^>]* open/);
  });

  it("only collapses answers that have more than their preview", () => {
    // The live insurance answer is exactly the case the audit measured.
    const insurance = (DEFAULT_CONTENT.faq?.items ?? []).find((f) => f.id === "insurance");
    const a = insurance?.answer ?? "";
    expect(conditionPreview(a).length).toBeLessThan(a.trim().length);
    expect(a.startsWith(conditionPreview(a))).toBe(true);
  });
});

// ── AN ID WITH NO FALLBACK ANSWER IS AN INVISIBLE ROW ──────────────────────
//
// DEFAULT_CONTENT is what renders when Supabase cannot be read. Adding an id
// to CONDITION_IDS without adding the answer there means the row is fine in
// production and silently missing in exactly the situation where the customer
// most needs to read the terms.
describe("every condition has a fallback answer", () => {
  it("covers all of CONDITION_IDS in DEFAULT_CONTENT", () => {
    const have = new Set((DEFAULT_CONTENT.faq?.items ?? []).map((f) => f.id));
    const missing = CONDITION_IDS.filter((id) => !have.has(id));
    expect(missing).toEqual([]);
  });
});
