import { describe, expect, it, vi } from "vitest";

vi.mock("@/context/LanguageContext", () => ({ useLanguage: () => ({ language: "en" }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

const { hidesResumeBar } = await import("./ResumeBar");
const { waText } = await import("@/lib/reservations/copy");
const { PENDING_COPY } = await import("@/lib/pending/copy");

// ── Where the "finish your booking" bar rides along (6 Oct 2026) ────────────

describe("hidesResumeBar", () => {
  it("shows on the pages a guest wanders to: home, browsing, more", () => {
    for (const p of ["/", "/order", "/more", "/explore", "/experiences", "/browse/scooter", "/stays"]) {
      expect(hidesResumeBar(p), p).toBe(false);
    }
  });

  it("stays off the booking itself, its lookups, and flows of their own", () => {
    for (const p of ["/booking/abc", "/manage-booking", "/track", "/pay", "/pay/RR-H01BK", "/checkout", "/admin/reservations"]) {
      expect(hidesResumeBar(p), p).toBe(true);
    }
  });

  it("never stacks on another bottom bar", () => {
    expect(hidesResumeBar("/food")).toBe(true);
    expect(hidesResumeBar("/food/chez-banane")).toBe(true);
    expect(hidesResumeBar("/browse/car/hyundai-venue")).toBe(true);
  });
});

describe("the WhatsApp message", () => {
  it("carries the page's link when given, in every language", () => {
    const link = "https://roulerodrig.com/booking/abc";
    for (const l of ["en", "fr", "cr"] as const) {
      expect(waText(l, "RR-H01BK", "Île aux Cocos", "Tue 7 Oct", link)).toContain(` ${link}`);
      expect(waText(l, "RR-H01BK", "Île aux Cocos", "Tue 7 Oct")).not.toContain("http");
    }
  });
});

describe("the bar's words", () => {
  it("say the amount and the time left, calmly, in three languages", () => {
    expect(PENDING_COPY.en.pay("Rs 1,999")).toBe("Finish paying Rs 1,999");
    expect(PENDING_COPY.en.left("11h 59m")).toBe("11h 59m left");
    for (const l of ["en", "fr", "cr"] as const) {
      const all = Object.values(PENDING_COPY[l]).map((v) => (typeof v === "function" ? v("X") : v)).join(" ");
      expect(all, l).not.toMatch(/!|urgent|hurry/i);
    }
  });
});
