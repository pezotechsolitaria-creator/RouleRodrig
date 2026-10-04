import { describe, expect, it } from "vitest";
import { contentSaveVerdict } from "./content-guard";
import { DEFAULT_CONTENT, type SiteContent } from "./defaults";

// The admin's "Save Changes" replaces the entire site in one write. These tests
// pin the difference between a real edit (always allowed) and the shape of a
// failure (refused) — a DB blip rendering seed defaults, or a truncated body.
//
// ── THE REAL SHAPES (architecture review 2026-09-30, item 4) ───────────────
// This fixture used to fake `faq` as an ARRAY. The real SiteContent.faq is an
// object whose list is faq.items, so the guard counted it as 0 before and after
// every save and never protected the FAQ — and the test passed, because it was
// testing a shape the site does not have. faq and recommended are now built the
// way lib/defaults.ts builds them.

const stored = {
  fleet: Array.from({ length: 12 }, (_, i) => ({ id: `v${i}` })),
  mapLocations: Array.from({ length: 40 }, (_, i) => ({ name: `p${i}` })),
  events: Array.from({ length: 6 }, (_, i) => ({ id: `e${i}` })),
  faq: {
    ...DEFAULT_CONTENT.faq,
    items: Array.from({ length: 10 }, (_, i) => ({ id: `q${i}`, question: `q${i}`, answer: "a" })),
  },
  recommended: {
    ...DEFAULT_CONTENT.recommended,
    items: Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, name: `Place ${i}` })),
  },
  quickAccess: Array.from({ length: 10 }, (_, i) => ({ id: `qa${i}` })),
  homeCards: Array.from({ length: 6 }, (_, i) => ({ id: `hc${i}` })),
} as unknown as SiteContent;

const clone = () => JSON.parse(JSON.stringify(stored)) as SiteContent;

describe("contentSaveVerdict — normal editing must never be blocked", () => {
  it("accepts an unchanged save", () => {
    expect(contentSaveVerdict(clone(), stored).ok).toBe(true);
  });

  it("accepts adding items", () => {
    const next = clone();
    (next.fleet as unknown[]).push({ id: "new" });
    expect(contentSaveVerdict(next, stored).ok).toBe(true);
  });

  it("accepts deleting a few items on purpose", () => {
    const next = clone();
    next.fleet = (next.fleet as unknown[]).slice(0, 9) as SiteContent["fleet"];
    expect(contentSaveVerdict(next, stored).ok).toBe(true);
  });

  it("accepts deleting a few FAQ questions and a few listings", () => {
    const next = clone();
    next.faq.items = next.faq.items.slice(0, 7);
    next.recommended.items = next.recommended.items.slice(0, 22);
    expect(contentSaveVerdict(next, stored).ok).toBe(true);
  });

  it("accepts emptying a SMALL collection — deleting your last 3 events is legitimate", () => {
    const small = { ...clone(), events: [{ id: "a" }, { id: "b" }, { id: "c" }] } as unknown as SiteContent;
    const next = { ...clone(), events: [] } as unknown as SiteContent;
    expect(contentSaveVerdict(next, small).ok).toBe(true);
  });

  it("ignores collections the payload does not mention", () => {
    const next = { fleet: clone().fleet } as unknown as SiteContent;
    expect(contentSaveVerdict(next, stored).ok).toBe(true);
  });

  it("accepts anything on first run, when nothing is stored yet", () => {
    expect(contentSaveVerdict({ fleet: [] }, null).ok).toBe(true);
  });
});

describe("contentSaveVerdict — the failure shapes that destroy a site", () => {
  it("REFUSES the catastrophic case: a full blob whose collections all collapsed to zero", () => {
    const wiped = {
      fleet: [], mapLocations: [], events: [], quickAccess: [], homeCards: [],
      faq: { ...DEFAULT_CONTENT.faq, items: [] },
      recommended: { ...DEFAULT_CONTENT.recommended, items: [] },
    } as unknown as SiteContent;
    const v = contentSaveVerdict(wiped, stored);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/fleet.*12 to 0/);
  });

  it("REFUSES a large collection more than halving in one save", () => {
    const next = clone();
    next.mapLocations = (next.mapLocations as unknown[]).slice(0, 10) as SiteContent["mapLocations"];
    expect(contentSaveVerdict(next, stored).ok).toBe(false);
  });

  it("allows exactly half to survive — the floor is inclusive, not punitive", () => {
    const next = clone();
    next.mapLocations = (next.mapLocations as unknown[]).slice(0, 20) as SiteContent["mapLocations"];
    expect(contentSaveVerdict(next, stored).ok).toBe(true);
  });

  it("REFUSES a payload with none of the expected sections — a truncated body", () => {
    const v = contentSaveVerdict({ branding: { logo: "x" } }, stored);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/truncated/);
  });

  it("REFUSES non-objects outright", () => {
    for (const bad of [null, undefined, "{}", 42, []]) {
      expect(contentSaveVerdict(bad, stored).ok).toBe(false);
    }
  });

  it("names the offending collection and both counts, so the owner can act", () => {
    const next = clone();
    next.faq = { ...next.faq, items: [] };
    const v = contentSaveVerdict(next, stored);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.reason).toContain("faq");
      expect(v.reason).toContain("10");
      expect(v.reason).toMatch(/smaller batches/);
    }
  });
});

describe("contentSaveVerdict — the two collections the old guard could not see", () => {
  it("REFUSES wiping the FAQ, now that faq is counted as the object it is", () => {
    const next = clone();
    next.faq = { ...next.faq, items: [] };
    const v = contentSaveVerdict(next, stored);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toContain('FAQ questions ("faq.items") would drop from 10 to 0');
  });

  it("REFUSES a faq section that arrives without its list — defaults would replace the owner's FAQ", () => {
    const next = clone();
    next.faq = { enabled: true, title: "FAQ", subtitle: "" } as SiteContent["faq"];
    const v = contentSaveVerdict(next, stored);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toContain("from 10 to 0");
  });

  it("REFUSES wiping every stay, activity and service in one save", () => {
    const next = clone();
    next.recommended = { ...next.recommended, items: [] };
    const v = contentSaveVerdict(next, stored);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.reason).toContain("stays, activities & services");
      expect(v.reason).toContain('("recommended.items") would drop from 30 to 0');
    }
  });

  it("REFUSES the catalogue more than halving, and allows exactly half", () => {
    const halved = clone();
    halved.recommended.items = halved.recommended.items.slice(0, 15);
    expect(contentSaveVerdict(halved, stored).ok).toBe(true);

    const gutted = clone();
    gutted.recommended.items = gutted.recommended.items.slice(0, 14);
    expect(contentSaveVerdict(gutted, stored).ok).toBe(false);
  });

  it("still leaves an omitted recommended section alone", () => {
    const next = clone() as Partial<SiteContent>;
    delete next.recommended;
    expect(contentSaveVerdict(next, stored).ok).toBe(true);
  });
});
