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

describe("the gallery dot still looks like a dot", () => {
  it("the painted pill moved into a span, so the button can be the target", () => {
    // Measured after: the button is 25 x 42 and the pill inside it is still
    // 6px tall, with the dots' centre 21px above the image edge where it was
    // 19. The first attempt put `-my-4` on the button to hold that position
    // and it computed to 0px — Tailwind v4 only emits the utilities it finds,
    // and that one appears nowhere else here.
    const src = tsx("components/PlaceDetailModal.tsx");
    expect(src).toContain('<span className={`block h-1.5 rounded-full');
    expect(src).not.toContain("-my-4");
    expect(src).toContain("absolute bottom-0 left-1/2 -translate-x-1/2 flex items-center");
  });
});
