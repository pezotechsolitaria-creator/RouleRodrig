import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import HowItWorks from "./HowItWorks";

// ── THE CLOSED EXPLAINER HAS A 50px BUDGET (C14) ────────────────────────────
//
// SEO audit 2026-09-29 C14 allowed one closed row, ~48px, under a form whose
// every step was measured down to zero scroll on a phone (lib/nav-scope.ts).
// mt-6 + a 48px summary + a 2px border made it 74px; mt-2 + 48 + 2 was still
// 58px, and MEASURED on a production build at 375×812 that pushed /deliver to
// 818px — 6px of scroll on a page the live site keeps within 1px. Now
// mt-1 + a 44px summary (the tap-target floor, as everywhere else on the site)
// + 2px of border = 50px, which measured back inside the screen.

const px: Record<string, number> = { "mt-0": 0, "mt-1": 4, "mt-2": 8, "mt-3": 12, "mt-4": 16, "mt-5": 20, "mt-6": 24 };

describe("the closed row's height", () => {
  const html = renderToStaticMarkup(createElement(HowItWorks, { cashLimitCents: null }));
  const details = html.match(/^<details class="([^"]*)"/)?.[1].split(/\s+/) ?? [];
  const summary = html.match(/<summary class="([^"]*)"/)?.[1].split(/\s+/) ?? [];

  it("sits close under the form, not 24px away", () => {
    expect(details).toContain("mt-1");
    expect(details).not.toContain("mt-6");
  });

  it("adds up to 50px closed: margin, a 44px tap-target summary, a 1px border each side", () => {
    const margin = details.map((c) => px[c]).find((n) => n !== undefined) ?? NaN;
    expect(summary).toContain("min-h-11"); // 44px, the tap-target floor
    expect(summary.some((c) => /^p[ty]-/.test(c))).toBe(false); // no padding on top of it
    expect(details).toContain("border");
    expect(margin + 44 + 2).toBe(50);
  });
});
