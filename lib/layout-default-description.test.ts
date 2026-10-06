import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEFAULT_CONTENT, type SiteContent } from "@/lib/defaults";

// ── THE ROOT DESCRIPTION ON A FAILED READ (SEO audit 2026-09-29 C4) ─────────
//
// app/layout.tsx prices the default meta description — the homepage's snippet,
// since app/page.tsx writes none — from getContent(). getContent() never throws
// on a failed read: it answers DEFAULT_CONTENT, whose fleet says "From Rs 800"
// and "From Rs 600". The layout's catch therefore never ran, and a DB hiccup
// published "from Rs 600/day", under the real minimum, for the ISR window.
//
// Driven here through the layout's real generateMetadata(), with only the
// content read and the font loader replaced.

const db = vi.hoisted(() => ({ content: null as unknown }));

vi.mock("@/lib/content", async (orig) => ({
  ...(await orig<typeof import("@/lib/content")>()),
  getContent: async () => db.content,
}));
// next/font/google only works inside the Next compiler.
vi.mock("next/font/google", () => {
  const font = () => ({ variable: "", className: "", style: {} });
  return { Syne: font, Bebas_Neue: font, DM_Sans: font, IBM_Plex_Mono: font };
});

/** The owner's fleet as it reads live: its own ids and prices. */
const OWNER: SiteContent = {
  ...DEFAULT_CONTENT,
  fleet: [
    { ...DEFAULT_CONTENT.fleet[0], id: "own-scooter", category: "scooter", price: "From Rs 699" },
    { ...DEFAULT_CONTENT.fleet[0], id: "own-car", category: "car", price: "Rs 1,899/day" },
  ],
  vehicleCategories: DEFAULT_CONTENT.vehicleCategories.map((c) =>
    c.id === "car" ? { ...c, enabled: true } : c,
  ),
};

const description = async () => {
  const { generateMetadata } = await import("@/app/layout");
  return String((await generateMetadata()).description);
};

beforeEach(() => {
  db.content = OWNER;
});

describe("the root layout's default description", () => {
  it("prints the owner's cheapest daily rate when the row was read", async () => {
    // A scooter quotes the published scooter rate (SCOOTER_RATES.threePlus, 6 Oct 2026), whatever the price box says.
    expect(await description()).toContain("from Rs 799/day");
  });

  it("prints no figure when getContent() fell back to the seed", async () => {
    db.content = DEFAULT_CONTENT;
    const d = await description();
    expect(d).not.toMatch(/Rs\s?\d/);
    expect(d.startsWith("Scooter and car rental in Rodrigues, no minimum.")).toBe(true);
  });

  it("quotes no price from a category the hub does not show", async () => {
    db.content = {
      ...OWNER,
      fleet: [
        { ...OWNER.fleet[0], price: "From Rs 999" },
        { ...OWNER.fleet[1], price: "Rs 650/day" },
      ],
      vehicleCategories: DEFAULT_CONTENT.vehicleCategories, // cars off
    };
    const d = await description();
    expect(d).toContain("from Rs 799/day");
    expect(d).not.toContain("Rs 650");
  });
});
