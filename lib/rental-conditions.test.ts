import { describe, expect, it } from "vitest";
import {
  CONDITION_IDS,
  CONDITION_LABELS,
  conditionPreview,
  pickConditions,
} from "@/lib/rental-conditions";
import { DEFAULT_CONTENT } from "@/lib/defaults";

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
