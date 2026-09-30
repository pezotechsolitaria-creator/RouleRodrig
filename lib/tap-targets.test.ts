import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

// ── THE FLOOR THIS REPO ALREADY SET, AND TEN PLACES THAT MISSED IT ──────────
//
// components/ui/button.tsx states it, above the `xl` variant: "every button in
// this app's money path (add to cart, checkout, place order) is a primary CTA
// on a phone, where 32px is below the 44px WCAG 2.5.5 / Apple minimum".
// components/orders/RateShopCard.tsx repeats it beside its stars: "p-2, not
// p-1: 28px icon + 8px each side = a 44px tap target, which is the floor for a
// control this is the primary action."
//
// A route sweep found ten controls under it, measured at 375px:
//
//   6 x 6    the photo gallery dots, eight of them on one listing
//   27 x 27  the product star ratings, 2px apart
//   28       the only control that opens a ticket package
//   25.4     the Map/Satellite switch, tapped over a map
//   32       "I have completed the transfer", and its guest twin
//   32       Book, on every experience card
//   32 x 36  the quick-add stepper, on a card that is itself a link
//   33.6     the booking calendar's day cells
//   34       the pickup-slot chips
//   36       place the order, on ticket checkout
//
// Each assertion below names the file and the class that lifts it. They are
// source assertions because the suite has no DOM; every one was also measured
// in a browser at 375px before it was written.

function tsx(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("the money path uses the funnel size", () => {
  it("reporting a bank transfer, signed in and as a guest", () => {
    // Both took the cva default — h-8, a 32px box — on the control that says
    // the money has been sent.
    expect(tsx("components/orders/ReceiptUploader.tsx")).toContain('size="xl"');
    expect(tsx("app/orders/track/page.tsx")).toContain('size="xl"');
  });

  it("placing a ticket order", () => {
    const src = tsx("components/events/EventCheckout.tsx");
    expect(src).toContain('<Button className="w-full" size="xl"');
    expect(src).not.toContain('<Button className="w-full" size="lg"');
  });
});

describe("controls that were under 44px", () => {
  const cases: [string, string, string][] = [
    ["the quick-add button on a product card", "components/shop/QuickAdd.tsx", "flex h-11 w-11 items-center"],
    ["its stepper, left half", "components/shop/QuickAdd.tsx", "flex h-11 w-10 items-center justify-center rounded-l-full"],
    ["its stepper, right half", "components/shop/QuickAdd.tsx", "flex h-11 w-10 items-center justify-center rounded-r-full"],
    ["Book, on an experience card", "components/experiences/ExperienceMarket.tsx", "inline-flex min-h-11 shrink-0 items-center"],
    ["the only way into a ticket package", "components/events/PackagePicker.tsx", 'size="sm" className="min-h-11"'],
    ["a pickup-slot chip", "components/food/WhenPicker.tsx", "inline-flex min-h-11 min-w-[68px] items-center"],
    ["a booking calendar day", "components/AvailabilityCalendar.tsx", "min-h-11 w-full rounded-lg text-xs"],
    ["a photo gallery dot", "components/PlaceDetailModal.tsx", 'className="flex h-11 items-center px-2.5"'],
    ["the gallery's previous arrow", "components/PlaceDetailModal.tsx", "absolute left-3 top-1/2 -translate-y-1/2 z-10 w-11 h-11"],
    ["the gallery's next arrow", "components/PlaceDetailModal.tsx", "absolute right-3 top-1/2 -translate-y-1/2 z-10 w-11 h-11"],
    ["a product star", "components/orders/RateProductsCard.tsx", 'className={`p-2 transition-colors'],
    ["posting the rating", "components/orders/RateProductsCard.tsx", "inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-yellow"],
  ];

  for (const [what, file, cls] of cases) {
    it(what, () => {
      expect(tsx(file), `${file} — ${cls}`).toContain(cls);
    });
  }

  it("the stars are 28px, as the sibling card documents", () => {
    const src = tsx("components/orders/RateProductsCard.tsx");
    expect(src).toContain("<Star size={28}");
    // p-2 on a 19px star would be 35px, not 44 — the icon has to grow too.
    expect(src).not.toContain("<Star size={19}");
  });

  it("the Map/Satellite switch has a height floor", () => {
    const css = readFileSync(join(ROOT, "app", "globals.css"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    const block = css.match(/\.rr-basemap-switch button\s*\{[^}]*\}/);
    expect(block).not.toBeNull();
    expect(block![0]).toContain("min-height: 44px");
    // Without the flex the min-height would grow the box but leave the label
    // sitting at the top of it.
    expect(block![0]).toContain("display: inline-flex");
  });
});

// ── AND THE FILTER RAILS ────────────────────────────────────────────────────
//
// Every one of these decides what the whole list below it shows, and each was
// a 30–34px box: `px-4 py-1.5` or `px-3.5 py-2` on text-xs, in a horizontal
// rail where the neighbouring chip is a different filter. They are the same
// control in five places, so they get the same floor.

describe("the filter chips", () => {
  const rails: [string, string, string][] = [
    ["/explore", "components/ExploreClient.tsx", "inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border px-4 py-1.5"],
    ["/experiences", "components/experiences/ExperiencesHub.tsx", "inline-flex min-h-11 shrink-0 items-center justify-center rounded-full px-3.5 py-2"],
    ["/experiences related types", "components/experiences/ExperiencesHub.tsx", "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 py-1.5"],
    ["/food", "app/food/page.tsx", "inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border px-3.5 py-2"],
    ["the guide pages", "components/PlaceDiscovery.tsx", "inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border px-3.5 py-2"],
    ["the island map", "components/MapSection.tsx", "flex min-h-11 items-center gap-2 rounded-full border px-3.5 py-1.5"],
  ];

  for (const [where, file, cls] of rails) {
    it(where, () => {
      expect(tsx(file), `${file} — ${cls}`).toContain(cls);
    });
  }

  it("none of them is left as a bare padded pill", () => {
    // The shapes they had. Catches a revert that keeps the file compiling.
    const olds: [string, string][] = [
      ["components/ExploreClient.tsx", '`shrink-0 rounded-full border px-4 py-1.5 font-dm text-xs'],
      ["app/food/page.tsx", '"shrink-0 rounded-full border px-3.5 py-2 font-dm text-xs'],
      ["components/PlaceDiscovery.tsx", '`shrink-0 rounded-full border px-3.5 py-2 font-dm text-xs'],
      ["components/experiences/ExperiencesHub.tsx", '"shrink-0 rounded-full px-3.5 py-2 font-dm text-xs'],
      ["components/MapSection.tsx", "`flex items-center gap-2 text-xs font-dm px-3.5 py-1.5 rounded-full border"],
    ];
    for (const [file, old] of olds) {
      expect(tsx(file), file).not.toContain(old);
    }
  });
});

// ── THE ONES THE FIRST SWEEP GOT WRONG, IN BOTH DIRECTIONS ──────────────────
//
// Measuring `getBoundingClientRect()` finds the painted box, not the target.
// This repo grows targets with `after:absolute after:-inset-*` — an invisible
// ring that hit-tests to the button — so the header's 36px icons were reported
// as defects when hit-testing outward from their centres reaches 41–44px and
// meets the neighbour's ring at the midline of the gap. Nothing to fix there.
//
// Re-scanned with elementFromPoint instead, these were genuinely small:
//
//   16 x 16  the X that dismisses the returning-visitor banner: a bare glyph
//   21 x 21  the X on the world-switch hint
//   30 x 30  the booking calendar's month arrows — smaller than the days
//   32 x 32  the header logo link
//   32 / 36  Save for later, on every vehicle and place card
//   36       the modal close buttons and both photo carousels
//   36       the dish quantity stepper
//   40       the footer's social buttons

describe("targets grown with the after:-inset ring", () => {
  const ringed: [string, string, string][] = [
    ["the header logo", "components/AppPageHeader.tsx", "relative flex items-center after:absolute after:-inset-2"],
    ["save for later", "components/SaveButton.tsx", "after:absolute after:-inset-1 after:content-['']"],
    ["the smallest save button", "components/RecommendedPlaces.tsx", "after:absolute after:-inset-1.5 after:content-['']"],
    ["the returning-visitor banner's X", "components/ReturnWelcome.tsx", "relative -m-2 shrink-0 p-2"],
    ["the world-switch hint's X", "components/world/WorldSwitchHint.tsx", "relative -mr-2 -mt-2 shrink-0 rounded-full p-2.5"],
  ];
  for (const [what, file, cls] of ringed) {
    it(what, () => {
      expect(tsx(file), `${file} — ${cls}`).toContain(cls);
    });
  }

  it("the logo mark itself is untouched", () => {
    // The ring is the point: growing the painted logo would be a brand change.
    expect(tsx("components/AppPageHeader.tsx")).toContain('className="rr-logo-anim inline-flex"');
  });
});

describe("targets grown by their own box", () => {
  const grown: [string, string, string][] = [
    ["the calendar's month arrows", "components/AvailabilityCalendar.tsx", "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg p-1.5"],
    ["the place modal's close", "components/PlaceDetailModal.tsx", "absolute top-4 right-4 z-20 w-11 h-11"],
    ["the scooter modal's close", "components/ScooterDetailModal.tsx", "absolute top-4 right-4 z-20 w-11 h-11"],
    ["the fleet carousel's arrows", "components/Fleet.tsx", "absolute left-3 top-1/2 -translate-y-1/2 z-10 w-11 h-11"],
    ["the dish quantity stepper", "components/food/DishOrderPanel.tsx", "flex h-11 w-11 items-center justify-center rounded-full text-offwhite"],
    ["the footer's social buttons", "components/Footer.tsx", "w-11 h-11 rounded-full border border-dark-border"],
  ];
  for (const [what, file, cls] of grown) {
    it(what, () => {
      expect(tsx(file), `${file} — ${cls}`).toContain(cls);
    });
  }

  it("no 36px icon button is left in the modals or carousels", () => {
    for (const f of [
      "components/PlaceDetailModal.tsx",
      "components/ScooterDetailModal.tsx",
      "components/food/DishOrderPanel.tsx",
    ]) {
      expect(tsx(f), f).not.toContain("w-9 h-9");
      expect(tsx(f), f).not.toContain("h-9 w-9");
    }
  });
});

// ── AND THE HOME PAGE'S OWN CONTROLS ────────────────────────────────────────
//
// Found by the same elementFromPoint sweep, on the page every visitor lands on.

describe("the home page", () => {
  it("gives the travel-tool chips a 44px box, in both rows", () => {
    // Map, Planner, Guide and Emergency, at px-3/py-1.5 on text-xs = 30px.
    const src = tsx("components/AppHome.tsx");
    expect(src).toContain("flex min-h-11 items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5");
    expect(src).toContain("flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03]");
  });

  it("gives every section's see-all link one too", () => {
    // text-xs with no box of its own: a 16px-tall target beside each heading.
    // py-3.5 with a matching negative margin, rather than the after: ring —
    // measured, the ring did not register where this link sits.
    expect(tsx("components/AppHome.tsx")).toContain(
      "-my-3.5 inline-flex shrink-0 items-center gap-1 py-3.5",
    );
  });

  it("and the link that opens the reviews", () => {
    expect(tsx("components/ReviewsContact.tsx")).toContain("relative -my-2.5 inline-flex shrink-0 items-center gap-1 py-2.5");
  });
});

describe("reaching a taxi driver", () => {
  // The driver cards moved into TaxiDirectory.tsx when /taxi became a server
  // page that renders the list for crawlers (SEO audit 2026-09-29 C23).
  const src = tsx("app/taxi/TaxiDirectory.tsx");

  it("WhatsApp, Call and Rate all clear the floor", () => {
    // Measured at 375px: 222x36, 71x38 and 301x34. The first two are how a
    // customer actually reaches a driver.
    expect(src).toContain("flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-green-500/15");
    expect(src).toContain("flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-white/10 bg-dark");
    expect(src).toContain("flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-white/10 px-3 py-2");
  });
});

describe("the trip planner's day picker", () => {
  it("is 44 tall, and honest about its width", () => {
    // Seven buttons in one row are 32px wide whatever the padding — the same
    // ceiling the booking calendar's seven columns hit.
    expect(tsx("components/TripPlanner.tsx")).toContain("h-11 flex-1 rounded-lg font-syne text-sm font-bold");
  });
});

describe("the gallery dot still looks like a dot", () => {
  it("the painted pill moved into a span, so the button can be the target", () => {
    // Measured after: the button is 25 x 42 and the pill inside it is still
    // 6px tall, with the dots' centre 21px above the image edge where it was
    // 19. The first attempt held that position with `-my-4` on the button and
    // it computed to 0px in the browser; the strip moving to bottom-0 does
    // the same job without depending on a margin that has to cancel the
    // height exactly.
    const src = tsx("components/PlaceDetailModal.tsx");
    expect(src).toContain('<span className={`block h-1.5 rounded-full');
    expect(src).not.toContain("-my-4");
    expect(src).toContain("absolute bottom-0 left-1/2 -translate-x-1/2 flex items-center");
  });
});
